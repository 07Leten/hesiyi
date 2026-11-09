import { fadeOut, num, safeStop, type NoteSpec, type SynthParams, type Voice } from './common';

/**
 * 击弦音色（钢琴）：逐音高离线合成并缓存。
 * - 泛音带弦的刚性失谐：f_n = n·f0·√(1 + B·n²)
 * - 每音两根弦微微失谐，产生钢琴特有的拍音
 * - 双段衰减：击弦后的「初音」衰减快，「余音」衰减慢；高音区与高次泛音衰减更快
 * - 击弦点约在弦长 1/8 处，并叠加极短的槌击噪声
 * 松键时由制音器在 release 内止音；sustain 模拟踏板的余响。
 */

interface PianoBuffer {
  buffer: AudioBuffer;
  baseFreq: number;
}

const cache = new Map<string, PianoBuffer>();

/** 就近的十二平均律音，同一半音共用一段波形，微调交给播放速率 */
function nearestMidi(freq: number) {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

function pianoBuffer(ctx: BaseAudioContext, freq: number, p: SynthParams, key: string): PianoBuffer {
  const sr = ctx.sampleRate;
  const midi = nearestMidi(freq);
  const k = `${sr}|${key}|${midi}`;
  const hit = cache.get(k);
  if (hit) return hit;

  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const ref = f0 / 261.63;
  const tau = num(p, 'decay', 3) / Math.pow(ref, 0.6);
  const bright = num(p, 'brightness', 0.5);
  const B = num(p, 'inharmonicity', 0.0004) * Math.pow(ref, 0.5);
  const strikePos = num(p, 'strikePos', 0.125);
  const hammer = num(p, 'hammer', 0.2);

  const length = Math.floor(sr * Math.min(5, Math.max(1.2, tau * 2.2)));
  const data = new Float32Array(length);
  const tilt = 1.7 - bright * 0.9;

  // 只合成一根弦；复弦的拍音在播放时用两个轻微失谐的声源叠加
  for (let n = 1; n <= 18; n++) {
    const fn = n * f0 * Math.sqrt(1 + B * n * n);
    if (fn > Math.min(sr * 0.45, 10000)) break;
    const amp = Math.abs(Math.sin(Math.PI * n * strikePos)) / Math.pow(n, tilt);
    if (amp < 1e-4) continue;
    const tn = tau / (1 + 0.45 * (n - 1) * (0.6 + 0.4 * ref));
    const fast = tn * 0.22;
    const kFast = Math.exp(-1 / (fast * sr));
    const kSlow = Math.exp(-1 / (tn * sr));
    const w = (2 * Math.PI * fn) / sr;
    const c = 2 * Math.cos(w);
    let y1 = Math.sin(-w);
    let y2 = Math.sin(-2 * w);
    let eFast = 0.62 * amp;
    let eSlow = 0.38 * amp;
    for (let i = 0; i < length; i++) {
      const y = c * y1 - y2;
      y2 = y1;
      y1 = y;
      data[i] += (eFast + eSlow) * y;
      eFast *= kFast;
      eSlow *= kSlow;
    }
  }

  if (hammer > 0) {
    const hl = Math.floor(sr * 0.018);
    let lp = 0;
    const a = Math.min(0.9, 0.15 + ref * 0.1);
    for (let i = 0; i < hl; i++) {
      lp += a * (Math.random() * 2 - 1 - lp);
      data[i] += hammer * 0.6 * lp * Math.exp(-i / (sr * 0.004));
    }
  }

  const atk = Math.floor(sr * 0.002);
  for (let i = 0; i < atk; i++) data[i] *= i / atk;
  let peak = 0;
  for (let i = 0; i < Math.min(length, sr * 0.1); i++) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < length; i++) data[i] *= scale;

  // 截断处淡出，避免波形在缓冲末尾突然归零
  const fade = Math.floor(sr * 0.03);
  for (let i = 0; i < fade; i++) data[length - 1 - i] *= i / fade;

  const buffer = ctx.createBuffer(1, length, sr);
  buffer.copyToChannel(data, 0);
  const out = { buffer, baseFreq: f0 };
  cache.set(k, out);
  return out;
}

/** 预先合成一组音高。已缓存的音立即返回，供开播前分批调用 */
export function warmPiano(ctx: BaseAudioContext, p: SynthParams, key: string, freq: number) {
  pianoBuffer(ctx, freq, p, key);
}

export function pianoVoice(ctx: BaseAudioContext, out: AudioNode, p: SynthParams, key: string, s: NoteSpec): Voice {
  const { buffer, baseFreq } = pianoBuffer(ctx, s.freq, p, key);
  const detune = Math.pow(2, num(p, 'unisonDetune', 1.2) / 1200);
  const rate = s.freq / baseFreq;

  // 两根弦朝相反方向微微失谐，拍音不需要写进波形
  const sources = [1 / detune, detune].map((mul, i) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * mul;
    src.start(s.when, i === 0 ? 0 : 0.0007);
    return src;
  });

  // 力度越大越明亮
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = num(p, 'cutoff', 6000) * (0.55 + 0.45 * s.velocity);
  tone.Q.value = 0.5;

  const amp = ctx.createGain();
  amp.gain.value = num(p, 'level', 0.85) * s.velocity;
  for (const src of sources) src.connect(tone);
  tone.connect(amp).connect(out);

  const release = num(p, 'release', 0.12);
  const sustain = num(p, 'sustain', 0.2);
  let end = s.when + s.dur + sustain;
  amp.gain.setTargetAtTime(0, end, release);
  const stopSources = (t: number) => sources.forEach((src) => safeStop(src, t));
  stopSources(end + release * 6);

  const voice: Voice = {
    freq: s.freq,
    get end() {
      return end;
    },
    // 钢琴无法滑音，连奏时由引擎重新击键
    glideTo() {},
    extend(newEnd) {
      amp.gain.cancelScheduledValues(end);
      end = newEnd + sustain;
      amp.gain.setTargetAtTime(0, end, release);
      stopSources(end + release * 6);
    },
    stop(at) {
      fadeOut(amp.gain, at);
      stopSources(at + 0.15);
    },
  };
  return voice;
}
