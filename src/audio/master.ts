/** 总线：干声 + 卷积混响（生成的厅堂脉冲）→ 压缩 → 音量 */

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const pre = Math.floor(ctx.sampleRate * 0.018);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      lp += 0.35 * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export interface MasterBus {
  input: GainNode;
  volume: GainNode;
}

export function buildMaster(ctx: BaseAudioContext, volume = 0.8): MasterBus {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.6, 2.4);
  const wet = ctx.createGain();
  wet.gain.value = 0.24;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const vol = ctx.createGain();
  vol.gain.value = volume;
  input.connect(dry).connect(comp);
  input.connect(conv).connect(wet).connect(comp);
  comp.connect(vol).connect(ctx.destination);
  return { input, volume: vol };
}
