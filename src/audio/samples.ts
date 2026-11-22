import type { InstrumentPreset } from '../data/types';
import { fadeOut, num, safeStop, type NoteSpec, type Voice } from './synth/common';

/** banks.json 里的一套录音 */
interface SampleBank {
  base: string;
  loop: boolean;
  notes: Record<string, string>;
}

const rawCache = new Map<string, Promise<ArrayBuffer>>();
const decoded = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
let banks: Record<string, SampleBank> | null = null;
let banksPromise: Promise<Record<string, SampleBank>> | null = null;

function banksUrl() {
  return `${import.meta.env.BASE_URL}samples/banks.json`;
}

function sampleUrl(bank: SampleBank, file: string) {
  return `${import.meta.env.BASE_URL}${bank.base}${file}`;
}

function loadBanks() {
  if (!banksPromise) {
    banksPromise = fetch(banksUrl()).then((res) => {
      if (!res.ok) throw new Error(`无法读取采样目录（${res.status}）`);
      return res.json() as Promise<Record<string, SampleBank>>;
    });
  }
  return banksPromise;
}

function bufferOf(ctx: BaseAudioContext, url: string) {
  return decoded.get(ctx)?.get(url) ?? null;
}

async function decode(ctx: BaseAudioContext, url: string) {
  let map = decoded.get(ctx);
  if (!map) decoded.set(ctx, (map = new Map()));
  const hit = map.get(url);
  if (hit) return hit;
  let raw = rawCache.get(url);
  if (!raw) {
    raw = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`采样缺失：${url}`);
      return res.arrayBuffer();
    });
    rawCache.set(url, raw);
  }
  const audio = await ctx.decodeAudioData((await raw).slice(0));
  map.set(url, audio);
  return audio;
}

function freqToMidi(freq: number) {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

function nearest(bank: SampleBank, midi: number) {
  let best: { midi: number; file: string } | null = null;
  for (const [key, file] of Object.entries(bank.notes)) {
    const m = Number(key);
    if (!best || Math.abs(m - midi) < Math.abs(best.midi - midi)) best = { midi: m, file };
  }
  return best;
}

/** 把这些音色要用的录音解码好。实时播放与离线导出都先走这一步 */
export async function preloadPresets(ctx: BaseAudioContext, presets: InstrumentPreset[]) {
  banks = await loadBanks();
  const urls: string[] = [];
  for (const preset of presets) {
    const bank = banks[preset.bank];
    if (!bank) continue;
    for (const file of Object.values(bank.notes)) urls.push(sampleUrl(bank, file));
  }
  await Promise.all([...new Set(urls)].map((url) => decode(ctx, url)));
}

function silent(when: number, freq: number): Voice {
  return { freq, end: when, glideTo() {}, extend() {}, stop() {} };
}

/** 上升过零点，循环缝合在这里比较不容易出咔嗒声 */
function risingZero(buffer: AudioBuffer, ratio: number) {
  const data = buffer.getChannelData(0);
  const target = Math.floor(data.length * ratio);
  const end = Math.min(data.length - 2, target + 1400);
  for (let i = Math.max(1, target); i < end; i++) {
    if (data[i - 1] <= 0 && data[i] > 0) return i / buffer.sampleRate;
  }
  return target / buffer.sampleRate;
}

function playOne(
  ctx: BaseAudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  root: number,
  midi: number,
  when: number,
  dur: number,
  velocity: number,
  preset: InstrumentPreset,
  loop: boolean,
): Voice {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  let rate = Math.pow(2, (midi - root) / 12);
  src.playbackRate.setValueAtTime(rate, when);

  if (loop && buffer.duration > 0.7) {
    const start = risingZero(buffer, 0.42);
    const end = risingZero(buffer, 0.8);
    if (end > start + 0.08) {
      src.loop = true;
      src.loopStart = start;
      src.loopEnd = end;
    }
  }

  const cutoff = num(preset.params, 'cutoff', 0);
  let node: AudioNode = src;
  if (cutoff > 0) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;
    src.connect(filter);
    node = filter;
  }

  const attack = num(preset.params, 'attack', 0.01);
  const release = num(preset.params, 'release', 0.18);
  const amp = ctx.createGain();
  const peak = num(preset.params, 'level', 0.9) * velocity;
  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(peak, when + attack);
  let relAt = when + Math.max(dur, attack + 0.03);
  amp.gain.setTargetAtTime(0, relAt, release);
  node.connect(amp).connect(out);
  src.start(when);
  // stop() 只能调用一次，所以留到真正结束或被打断时再停，避免提前约好的停止时间改不掉
  let stopped = false;

  const voice: Voice = {
    freq: 440 * Math.pow(2, (midi - 69) / 12),
    get end() {
      return relAt + release;
    },
    glideTo(freq, at, time) {
      const next = Math.pow(2, (freqToMidi(freq) - root) / 12);
      src.playbackRate.setValueAtTime(rate, at);
      src.playbackRate.linearRampToValueAtTime(next, at + Math.max(0.02, time));
      rate = next;
      voice.freq = freq;
    },
    extend(newEnd) {
      amp.gain.cancelScheduledValues(relAt);
      relAt = Math.max(newEnd, relAt);
      amp.gain.setTargetAtTime(0, relAt, release);
    },
    stop(at) {
      if (stopped) return;
      stopped = true;
      fadeOut(amp.gain, at, 0.03);
      safeStop(src, at + 0.08);
    },
  };
  return voice;
}

export function sampleVoice(ctx: BaseAudioContext, out: AudioNode, preset: InstrumentPreset, spec: NoteSpec): Voice {
  const bank = banks?.[preset.bank];
  const midi = freqToMidi(spec.freq);
  const zone = bank ? nearest(bank, midi) : null;
  const buffer = zone ? bufferOf(ctx, sampleUrl(bank!, zone.file)) : null;
  if (!bank || !zone || !buffer) return silent(spec.when, spec.freq);

  const tremolo = num(preset.params, 'tremoloRate', 0);
  if (tremolo > 0 && spec.dur >= num(preset.params, 'tremoloMin', 0.45)) {
    const step = 1 / tremolo;
    const parts: Voice[] = [];
    for (let t = 0; t < spec.dur - step * 0.4; t += step) {
      const vel = spec.velocity * (t === 0 ? 1 : 0.72);
      parts.push(playOne(ctx, out, buffer, zone.midi, midi, spec.when + t, step * 0.85, vel, preset, false));
    }
    const last = parts[parts.length - 1] ?? silent(spec.when, spec.freq);
    return {
      freq: spec.freq,
      get end() {
        return last.end;
      },
      glideTo() {},
      extend() {},
      stop: (at) => parts.forEach((v) => v.stop(at)),
    };
  }

  return playOne(ctx, out, buffer, zone.midi, midi, spec.when, spec.dur, spec.velocity, preset, bank.loop);
}
