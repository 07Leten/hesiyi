import type { InstrumentPreset } from '../data/types';
import { bowedVoice } from './synth/bowed';
import { num, type NoteSpec, type Voice } from './synth/common';
import { pluckVoice } from './synth/pluck';
import { windVoice } from './synth/wind';

export function startVoice(ctx: BaseAudioContext, out: AudioNode, preset: InstrumentPreset, cacheKey: string, s: NoteSpec): Voice {
  switch (preset.engine) {
    case 'pluck':
      return pluckVoice(ctx, out, preset.params, cacheKey, s);
    case 'wind':
      return windVoice(ctx, out, preset.params, s);
    case 'bowed':
      return bowedVoice(ctx, out, preset.params, s);
  }
}

export function presetLegato(preset: InstrumentPreset) {
  return num(preset.params, 'legato', 0) > 0;
}

export function presetGlide(preset: InstrumentPreset) {
  return num(preset.params, 'glideTime', 0.08);
}

/** 拍板：板眼示范用的击节声 */
export function clapper(ctx: BaseAudioContext, out: AudioNode, when: number, accent: boolean) {
  const len = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.012));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = accent ? 1500 : 2600;
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.value = accent ? 1.6 : 0.8;
  src.connect(bp).connect(g).connect(out);
  src.start(when);
}
