import { buildMaster } from './master';
import { preloadPresets } from './samples';
import { playEventOnLayers, type NoteEvent, type ResolvedLayer } from './sequence';
import type { Voice } from './synth/common';

/** 离线渲染整首曲子，结果与实时播放使用同一套音色与调度逻辑 */
export async function renderOffline(events: NoteEvent[], totalBeats: number, bpm: number, layers: ResolvedLayer[]): Promise<AudioBuffer> {
  const sr = 44100;
  const bps = bpm / 60;
  const seconds = totalBeats / bps + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  await preloadPresets(ctx, layers.map((l) => l.preset));
  const bus = buildMaster(ctx, 0.9);
  const nodes = new Map<string, GainNode>();
  for (const l of layers) {
    const g = ctx.createGain();
    g.gain.value = l.gain;
    g.connect(bus.input);
    nodes.set(l.instrumentId, g);
  }
  const last = new Map<string, Voice>();
  const t0 = 0.1;
  for (const ev of events) {
    playEventOnLayers(ctx, ev, t0 + ev.startBeat / bps, ev.durBeats / bps, layers, (id) => nodes.get(id)!, last);
  }
  return ctx.startRendering();
}

export function audioBufferToWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const bytes = 44 + len * ch * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
