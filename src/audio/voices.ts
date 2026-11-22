import type { InstrumentPreset } from '../data/types';
import { sampleVoice } from './samples';
import { num, noiseBuffer, type NoteSpec, type Voice } from './synth/common';

export function startVoice(ctx: BaseAudioContext, out: AudioNode, preset: InstrumentPreset, _cacheKey: string, spec: NoteSpec): Voice {
  return sampleVoice(ctx, out, preset, spec);
}

export function presetLegato(preset: InstrumentPreset) {
  return num(preset.params, 'legato', 0) > 0;
}

export function presetGlide(preset: InstrumentPreset) {
  return num(preset.params, 'glideTime', 0.08);
}

/**
 * 拍板。这是教学用的击节，不是旋律乐器；用一段极短的噪声，不占用乐器采样。
 */
export function clapper(ctx: BaseAudioContext, out: AudioNode, when: number, accent: boolean) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = accent ? 1500 : 2600;
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(accent ? 1.4 : 0.7, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  src.connect(bp).connect(g).connect(out);
  src.start(when);
  src.stop(when + 0.08);
}
