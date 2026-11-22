import { midiToFreq } from '../data/notation/pitch';
import type { InstrumentPreset } from '../data/types';
import { buildMaster, type MasterBus } from './master';
import { playEventOnLayers, type NoteEvent, type ResolvedLayer } from './sequence';
import type { Voice } from './synth/common';
import { preloadPresets } from './samples';
import { clapper, startVoice } from './voices';

export interface EngineState {
  playing: boolean;
  rate: number;
  volume: number;
  loop: boolean;
}

const TICK_MS = 25;

/**
 * 播放引擎：前瞻式调度（look-ahead scheduling）。
 * 每 25ms 把即将到来的音符排进 AudioContext 时间线；
 * 播放位置由 AudioContext 时钟换算为拍位，供界面逐音高亮。
 */
export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private bus: MasterBus | null = null;
  private layerNodes = new Map<string, GainNode>();

  private events: NoteEvent[] = [];
  private totalBeats = 0;
  private bpm = 60;
  private layers: ResolvedLayer[] = [];

  private anchorTime = 0;
  private anchorBeat = 0;
  private pausedBeat = 0;
  private nextIdx = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private playGen = 0;
  private layerGen = 0;

  private voices = new Map<string, Set<Voice>>();
  private lastVoice = new Map<string, Voice>();
  private listeners = new Set<() => void>();

  private state: EngineState = { playing: false, rate: 1, volume: 0.8, loop: false };
  onEnded: (() => void) | null = null;

  /* ---------- 状态订阅 ---------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private setState(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  /* ---------- AudioContext ---------- */

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'playback' });
      this.bus = buildMaster(this.ctx, this.state.volume);
    }
    return this.ctx;
  }

  private layerNode(id: string): GainNode {
    const ctx = this.ensureContext();
    let n = this.layerNodes.get(id);
    if (!n) {
      n = ctx.createGain();
      n.connect(this.bus!.input);
      this.layerNodes.set(id, n);
    }
    return n;
  }

  get audioReady() {
    return this.ctx?.state === 'running';
  }

  /* ---------- 载入 ---------- */

  setSequence(events: NoteEvent[], totalBeats: number, bpm: number) {
    this.haltVoices();
    this.clearTimer();
    this.events = events;
    this.totalBeats = totalBeats;
    this.bpm = bpm;
    this.pausedBeat = 0;
    this.setState({ playing: false });
  }

  setLayers(layers: ResolvedLayer[]) {
    const token = ++this.layerGen;
    const fresh = layers.filter((l) => {
      if (!l.enabled) return false;
      const prev = this.layers.find((p) => p.instrumentId === l.instrumentId);
      return !prev?.enabled || prev.preset.id !== l.preset.id || prev.octaveShift !== l.octaveShift;
    });
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const [id, set] of this.voices) {
        const next = layers.find((l) => l.instrumentId === id);
        const prev = this.layers.find((l) => l.instrumentId === id);
        const dropped = !next?.enabled || (prev && next && (prev.preset.id !== next.preset.id || prev.octaveShift !== next.octaveShift));
        if (dropped) {
          set.forEach((v) => v.stop(now));
          set.clear();
          this.lastVoice.delete(id);
        }
      }
      for (const l of layers) if (l.enabled) this.layerNode(l.instrumentId).gain.setTargetAtTime(l.gain, now, 0.03);
    }
    this.layers = layers;
    if (this.state.playing && fresh.length) void this.joinLayers(fresh, token);
  }

  /** 播放中新加入的乐器，补上正在响的音和已经排进前瞻窗口的音 */
  private async joinLayers(fresh: ResolvedLayer[], token: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    await preloadPresets(ctx, fresh.map((l) => l.preset));
    if (token !== this.layerGen || !this.state.playing || this.ctx !== ctx) return;
    const active = fresh.filter((l) => this.layers.some((p) => p.instrumentId === l.instrumentId && p.enabled && p.preset.id === l.preset.id && p.octaveShift === l.octaveShift));
    if (!active.length) return;
    const now = ctx.currentTime;
    const beat = this.getBeat();
    const bps = this.bps;
    const horizon = now + (document.hidden ? 1.6 : 0.25);
    for (const ev of this.events) {
      const endBeat = ev.startBeat + ev.durBeats;
      if (endBeat <= beat + 0.02) continue;
      const startTime = this.anchorTime + (ev.startBeat - this.anchorBeat) / bps;
      if (startTime > horizon) break;
      const when = Math.max(startTime, now + 0.015);
      const beatAtWhen = this.anchorBeat + (when - this.anchorTime) * bps;
      const remaining = endBeat - beatAtWhen;
      if (remaining < 0.03) continue;
      playEventOnLayers(ctx, ev, when, remaining / bps, active, (id) => this.layerNode(id), this.lastVoice, (id, v) => {
        let set = this.voices.get(id);
        if (!set) this.voices.set(id, (set = new Set()));
        set.add(v);
      });
    }
  }

  /* ---------- 走带 ---------- */

  private get bps() {
    return (this.bpm * this.state.rate) / 60;
  }

  getBeat(): number {
    if (!this.state.playing || !this.ctx) return this.pausedBeat;
    const b = this.anchorBeat + (this.ctx.currentTime - this.anchorTime) * this.bps;
    // 开播前的几十毫秒里时钟还没走到锚点，停在起点，不要卷到曲子末尾
    return Math.max(this.anchorBeat, Math.min(b, this.totalBeats));
  }

  getTotalBeats() {
    return this.totalBeats;
  }

  getBpm() {
    return this.bpm;
  }

  private indexFrom(beat: number) {
    const i = this.events.findIndex((e) => e.startBeat + e.durBeats > beat + 1e-6);
    return i < 0 ? this.events.length : i;
  }

  async play() {
    if (!this.events.length) return;
    const gen = ++this.playGen;
    const ctx = this.ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    if (gen !== this.playGen) return;
    await preloadPresets(ctx, this.layers.map((l) => l.preset));
    if (gen !== this.playGen) return;
    for (const l of this.layers) this.layerNode(l.instrumentId).gain.value = l.gain;
    if (this.pausedBeat >= this.totalBeats - 1e-6) this.pausedBeat = 0;
    this.anchorBeat = this.pausedBeat;
    this.anchorTime = ctx.currentTime + 0.06;
    this.nextIdx = this.indexFrom(this.anchorBeat);
    this.lastVoice.clear();
    this.setState({ playing: true });
    this.clearTimer();
    this.timer = setInterval(this.tick, TICK_MS);
    this.tick();
  }

  pause() {
    this.playGen += 1;
    if (!this.state.playing) return;
    this.pausedBeat = this.getBeat();
    this.clearTimer();
    this.haltVoices();
    this.setState({ playing: false });
  }

  seek(beat: number) {
    const b = Math.max(0, Math.min(beat, this.totalBeats));
    if (this.state.playing && this.ctx) {
      this.haltVoices();
      this.anchorBeat = b;
      this.anchorTime = this.ctx.currentTime + 0.04;
      this.nextIdx = this.indexFrom(b);
      this.lastVoice.clear();
    } else {
      this.pausedBeat = b;
    }
    this.listeners.forEach((fn) => fn());
  }

  setRate(rate: number) {
    if (this.state.playing && this.ctx) {
      const b = this.getBeat();
      this.anchorBeat = b;
      this.anchorTime = this.ctx.currentTime;
    }
    this.setState({ rate });
  }

  setVolume(volume: number) {
    if (this.ctx && this.bus) this.bus.volume.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
    this.setState({ volume });
  }

  setLoop(loop: boolean) {
    this.setState({ loop });
  }

  private tick = () => {
    const ctx = this.ctx;
    if (!ctx || !this.state.playing) return;
    const now = ctx.currentTime;
    const horizon = now + (document.hidden ? 1.6 : 0.25);
    const bps = this.bps;

    for (;;) {
      if (this.nextIdx >= this.events.length) {
        const endTime = this.anchorTime + (this.totalBeats - this.anchorBeat) / bps;
        if (this.state.loop) {
          if (endTime <= horizon) {
            this.anchorTime = endTime;
            this.anchorBeat = 0;
            this.nextIdx = 0;
            this.lastVoice.clear();
            continue;
          }
        } else if (now >= endTime + 0.05) {
          this.finish();
        }
        break;
      }
      const ev = this.events[this.nextIdx];
      const sb = Math.max(ev.startBeat, this.anchorBeat);
      const t = this.anchorTime + (sb - this.anchorBeat) / bps;
      if (t > horizon) break;
      const remaining = ev.startBeat + ev.durBeats - sb;
      if (remaining > 1e-6) {
        playEventOnLayers(ctx, ev, Math.max(t, now), remaining / bps, this.layers, (id) => this.layerNode(id), this.lastVoice, (id, v) => {
          let set = this.voices.get(id);
          if (!set) this.voices.set(id, (set = new Set()));
          set.add(v);
        });
      }
      this.nextIdx += 1;
    }

    for (const set of this.voices.values()) {
      for (const v of set) {
        if (v.end < now) {
          v.stop(now);
          set.delete(v);
        }
      }
    }
  };

  private finish() {
    this.clearTimer();
    this.pausedBeat = 0;
    this.setState({ playing: false });
    this.onEnded?.();
  }

  private clearTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private haltVoices() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const set of this.voices.values()) {
      set.forEach((v) => v.stop(now));
      set.clear();
    }
    this.lastVoice.clear();
  }

  /* ---------- 试音 ---------- */

  async previewNote(preset: InstrumentPreset, instrumentId: string, midi: number, seconds = 1.2) {
    const ctx = this.ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    await preloadPresets(ctx, [preset]);
    startVoice(ctx, this.layerNode(`preview:${instrumentId}`), preset, `${instrumentId}:${preset.id}`, {
      freq: midiToFreq(midi),
      when: ctx.currentTime + 0.02,
      dur: seconds,
      velocity: 0.9,
    });
  }

  /** 板眼示范：pattern 中 true 为板（重击），false 为眼 */
  async playClapper(pattern: boolean[], bpm: number) {
    const ctx = this.ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    const t0 = ctx.currentTime + 0.05;
    pattern.forEach((accent, i) => clapper(ctx, this.bus!.input, t0 + (i * 60) / bpm, accent));
    return (pattern.length * 60) / bpm;
  }
}

export const engine = new PlaybackEngine();
