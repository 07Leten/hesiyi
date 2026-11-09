export type SynthParams = Record<string, number | number[]>;

export interface NoteSpec {
  freq: number;
  /** 开始时间（AudioContext 时间） */
  when: number;
  /** 持续秒数 */
  dur: number;
  velocity: number;
  /** 前一音频率，用于滑音 */
  prevFreq?: number;
}

/** 正在发声的一个音，可被延长、滑到新音高或提前止音 */
export interface Voice {
  freq: number;
  readonly end: number;
  glideTo(freq: number, at: number, time: number): void;
  extend(end: number): void;
  stop(at: number): void;
}

export const num = (p: SynthParams, key: string, fallback: number): number => {
  const v = p[key];
  return typeof v === 'number' ? v : fallback;
};

export const arr = (p: SynthParams, key: string, fallback: number[]): number[] => {
  const v = p[key];
  return Array.isArray(v) ? v : fallback;
};

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

export function harmonicWave(ctx: BaseAudioContext, harmonics: number[]): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) waveCache.set(ctx, (m = new Map()));
  const key = harmonics.join(',');
  let w = m.get(key);
  if (!w) {
    const real = new Float32Array(harmonics.length + 1);
    const imag = new Float32Array(harmonics.length + 1);
    harmonics.forEach((h, i) => (imag[i + 1] = h));
    w = ctx.createPeriodicWave(real, imag);
    m.set(key, w);
  }
  return w;
}

/** 立即止音：保持当前值后快速衰减 */
export function fadeOut(param: AudioParam, at: number, tau = 0.02) {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(at);
  else param.cancelScheduledValues(at);
  param.setTargetAtTime(0, at, tau);
}

export function safeStop(node: AudioScheduledSourceNode, at: number) {
  try {
    node.stop(at);
  } catch {
    /* 已停止的节点再次 stop 会抛错，忽略即可 */
  }
}

/** 颤音（揉弦、吟猱、气颤）：延迟后渐入 */
export function vibrato(ctx: BaseAudioContext, target: AudioParam, when: number, rate: number, depthCents: number, delay: number) {
  if (depthCents <= 0) return null;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.setValueAtTime(0, when + delay);
  g.gain.linearRampToValueAtTime(depthCents, when + delay + 0.4);
  lfo.connect(g).connect(target);
  lfo.start(when);
  return lfo;
}
