import { fadeOut, num, safeStop, vibrato, type NoteSpec, type SynthParams, type Voice } from './common';

/**
 * 拨弦音色：Karplus–Strong 弦振动模型。
 * 每个音高预先算出一段衰减的弦振动波形并缓存，播放时按需变速微调音高。
 */

interface PluckBuffer {
  buffer: AudioBuffer;
  baseFreq: number;
}

const cache = new Map<string, PluckBuffer>();

function pluckBuffer(ctx: BaseAudioContext, freq: number, p: SynthParams, key: string): PluckBuffer {
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / freq));
  const k = `${sr}|${key}|${N}`;
  const hit = cache.get(k);
  if (hit) return hit;

  const decay = num(p, 'decay', 3);
  const s = num(p, 'damping', 0.5);
  const bright = num(p, 'brightness', 0.6);
  const length = Math.floor(sr * Math.min(decay, 6));
  const data = new Float32Array(length);

  const a = 0.08 + 0.88 * bright;
  const exc = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += a * (Math.random() * 2 - 1 - lp);
    exc[i] = lp;
  }
  const pos = Math.max(1, Math.round(N * num(p, 'pluckPos', 0.15)));
  let mean = 0;
  for (let i = 0; i < N; i++) {
    data[i] = exc[i] - (i >= pos ? 0.9 * exc[i - pos] : 0);
    mean += data[i];
  }
  mean /= N;
  for (let i = 0; i < N; i++) data[i] -= mean;

  const baseFreq = sr / (N + 1 - s);
  const g = Math.pow(0.001, 1 / (decay * baseFreq));
  for (let n = N; n < length; n++) {
    const prev = n - N - 1 >= 0 ? data[n - N - 1] : 0;
    data[n] = g * (s * data[n - N] + (1 - s) * prev);
  }
  let peak = 0;
  for (let i = 0; i < Math.min(length, N * 4); i++) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < length; i++) data[i] *= scale;

  const buffer = ctx.createBuffer(1, length, sr);
  buffer.copyToChannel(data, 0);
  const out = { buffer, baseFreq };
  cache.set(k, out);
  return out;
}

function singlePluck(ctx: BaseAudioContext, out: AudioNode, p: SynthParams, key: string, s: NoteSpec): Voice {
  const { buffer, baseFreq } = pluckBuffer(ctx, s.freq, p, key);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  let rate = s.freq / baseFreq;
  src.playbackRate.setValueAtTime(rate, s.when);

  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = num(p, 'bodyCutoff', 4000);
  body.Q.value = 0.6;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(num(p, 'level', 0.8) * s.velocity, s.when);
  src.connect(body).connect(amp).connect(out);

  const lfo = vibrato(ctx, src.detune, s.when, num(p, 'vibratoRate', 5), num(p, 'vibratoDepth', 0), num(p, 'vibratoDelay', 0.3));
  const release = num(p, 'release', 0.3);
  const ring = num(p, 'ring', 0.5);
  let end = s.when + s.dur + ring;
  amp.gain.setTargetAtTime(0, end, release);
  const stopAll = (t: number) => {
    safeStop(src, t);
    if (lfo) safeStop(lfo, t);
  };
  src.start(s.when);
  stopAll(end + release * 6);

  const voice: Voice = {
    freq: s.freq,
    get end() {
      return end;
    },
    glideTo(f, at, time) {
      const r = f / baseFreq;
      src.playbackRate.setValueAtTime(rate, at);
      src.playbackRate.linearRampToValueAtTime(r, at + time);
      rate = r;
      voice.freq = f;
    },
    extend(newEnd) {
      amp.gain.cancelScheduledValues(end);
      amp.gain.setTargetAtTime(0, newEnd + ring * 0.5, release);
      end = newEnd + ring * 0.5;
      stopAll(end + release * 6);
    },
    stop(at) {
      fadeOut(amp.gain, at);
      stopAll(at + 0.15);
    },
  };
  return voice;
}

export function pluckVoice(ctx: BaseAudioContext, out: AudioNode, p: SynthParams, key: string, s: NoteSpec): Voice {
  const tremRate = num(p, 'tremoloRate', 0);
  if (tremRate <= 0 || s.dur < num(p, 'tremoloMin', 99)) return singlePluck(ctx, out, p, key, s);

  // 轮指：长音拆成连续快速弹奏
  const step = 1 / tremRate;
  const parts: Voice[] = [];
  for (let t = 0; t < s.dur - step * 0.5; t += step) {
    const vel = s.velocity * (t === 0 ? 1 : 0.62 + 0.18 * Math.random());
    parts.push(singlePluck(ctx, out, p, key, { ...s, when: s.when + t, dur: step * 0.9, velocity: vel }));
  }
  const last = parts[parts.length - 1];
  return {
    freq: s.freq,
    get end() {
      return last.end;
    },
    glideTo: () => {},
    extend: () => {},
    stop: (at) => parts.forEach((v) => v.stop(at)),
  };
}
