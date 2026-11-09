import { midiToFreq, pitchToMidi } from '../data/notation/pitch';
import type { Instrument, InstrumentPreset, Score } from '../data/types';
import type { Voice } from './synth/common';
import { presetGlide, presetLegato, startVoice } from './voices';

export interface NoteEvent {
  noteIndex: number;
  startBeat: number;
  durBeats: number;
  midi: number;
  isMelisma: boolean;
  velocity: number;
}

/** 演奏层：一件乐器 + 一种音色 */
export interface LayerConfig {
  instrumentId: string;
  presetId: string;
  gain: number;
  octaveShift: number;
  enabled: boolean;
}

export interface ResolvedLayer extends LayerConfig {
  preset: InstrumentPreset;
}

export function resolveLayers(layers: LayerConfig[], instruments: Instrument[]): ResolvedLayer[] {
  const out: ResolvedLayer[] = [];
  for (const l of layers) {
    const inst = instruments.find((i) => i.id === l.instrumentId);
    const preset = inst?.presets.find((p) => p.id === l.presetId) ?? inst?.presets[0];
    if (inst && preset) out.push({ ...l, preset });
  }
  return out;
}

export function scoreToEvents(score: Score): NoteEvent[] {
  const events: NoteEvent[] = [];
  for (const n of score.notes) {
    if (n.isRest) continue;
    const midi = pitchToMidi(n.pitch, score.key.tonicMidi);
    if (midi == null) continue;
    events.push({
      noteIndex: n.index,
      startBeat: n.startBeat,
      durBeats: n.duration,
      midi,
      isMelisma: n.isMelisma,
      velocity: n.isMelisma ? 0.78 : 0.92,
    });
  }
  return events;
}

/**
 * 在各演奏层上排定一个音。实时播放与离线导出共用此函数，保证听感一致。
 * 一字多音且音色支持连奏时，不重新起音，而是从上一音滑到新音（走手音 / 连吹 / 连弓）。
 */
export function playEventOnLayers(
  ctx: BaseAudioContext,
  ev: NoteEvent,
  when: number,
  dur: number,
  layers: ResolvedLayer[],
  layerOut: (id: string) => AudioNode,
  lastVoice: Map<string, Voice>,
  onVoice?: (layerId: string, v: Voice) => void,
) {
  for (const layer of layers) {
    if (!layer.enabled) continue;
    const freq = midiToFreq(ev.midi + layer.octaveShift);
    const last = lastVoice.get(layer.instrumentId);
    const connected = last && last.end >= when - 0.02;
    if (ev.isMelisma && connected && presetLegato(layer.preset)) {
      last.glideTo(freq, when, Math.min(presetGlide(layer.preset), dur * 0.5));
      last.extend(when + dur);
      continue;
    }
    const v = startVoice(ctx, layerOut(layer.instrumentId), layer.preset, `${layer.instrumentId}:${layer.preset.id}`, {
      freq,
      when,
      dur,
      velocity: ev.velocity,
      prevFreq: last && last.end >= when - 0.12 ? last.freq : undefined,
    });
    lastVoice.set(layer.instrumentId, v);
    onVoice?.(layer.instrumentId, v);
  }
}
