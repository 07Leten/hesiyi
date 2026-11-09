import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { engine, type EngineState } from '../audio/engine';
import { resolveLayers, scoreToEvents, type LayerConfig } from '../audio/sequence';
import { useRepo } from '../data/DataContext';
import type { Instrument, Performance, Score } from '../data/types';
import { userStore } from '../services/user/UserStore';

export interface LoadOptions {
  performanceId?: string | null;
  layers?: LayerConfig[];
  autoplay?: boolean;
  /** 从指定拍位开始 */
  startBeat?: number;
  /** 临时曲谱（如创作结果）不写入「最近收听」 */
  transient?: boolean;
}

interface PlayerApi {
  score: Score | null;
  performanceId: string | null;
  layers: LayerConfig[];
  state: EngineState;
  transient: boolean;
  /** 本次载入后是否已开始播放过（决定是否显示迷你播放条） */
  started: boolean;
  loadScore(score: Score, opts?: LoadOptions): void;
  play(): void;
  pause(): void;
  toggle(): void;
  seekBeat(beat: number): void;
  seekNote(noteIndex: number): void;
  setRate(r: number): void;
  setVolume(v: number): void;
  setLoop(l: boolean): void;
  setLayers(layers: LayerConfig[]): void;
  applyPerformance(perf: Performance): void;
  step(dir: 1 | -1): Score | null;
}

const Ctx = createContext<PlayerApi | null>(null);

export function baseLayers(instruments: Instrument[]): LayerConfig[] {
  return instruments.map((i) => ({
    instrumentId: i.id,
    presetId: i.presets[0]?.id ?? '',
    gain: i.defaultGain,
    octaveShift: i.defaultOctaveShift,
    enabled: false,
  }));
}

export function layersForPerformance(instruments: Instrument[], perf: Performance | undefined): LayerConfig[] {
  const base = baseLayers(instruments);
  if (!perf) {
    const first = base[0];
    if (first) first.enabled = true;
    return base;
  }
  return base.map((l) => {
    const p = perf.layers.find((x) => x.instrumentId === l.instrumentId);
    return p ? { ...l, presetId: p.presetId, gain: p.gain, octaveShift: p.octaveShift, enabled: true } : l;
  });
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const repo = useRepo();
  const instruments = repo.data.instruments;
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const [score, setScore] = useState<Score | null>(null);
  const [performanceId, setPerformanceId] = useState<string | null>(null);
  const [layers, setLayersState] = useState<LayerConfig[]>(() => layersForPerformance(instruments, undefined));
  const [transient, setTransient] = useState(false);
  const [started, setStarted] = useState(false);
  const recorded = useRef<string | null>(null);

  const record = useCallback((s: Score, isTransient: boolean) => {
    if (isTransient || recorded.current === s.id) return;
    recorded.current = s.id;
    userStore.pushRecent({ scoreId: s.id, poemId: s.poemId, title: s.title });
  }, []);

  const setLayers = useCallback(
    (next: LayerConfig[]) => {
      setLayersState(next);
      engine.setLayers(resolveLayers(next, instruments));
    },
    [instruments],
  );

  const loadScore = useCallback(
    (s: Score, opts: LoadOptions = {}) => {
      const perfs = repo.performancesByScore(s.id);
      const perf = opts.performanceId ? perfs.find((p) => p.id === opts.performanceId) : perfs[0];
      const nextLayers = opts.layers ?? layersForPerformance(instruments, perf);
      engine.setSequence(scoreToEvents(s), s.totalBeats, s.tempo * (perf?.tempoScale ?? 1));
      if (opts.startBeat) engine.seek(opts.startBeat);
      setLayers(nextLayers);
      setScore(s);
      setPerformanceId(opts.layers ? null : perf?.id ?? null);
      setTransient(Boolean(opts.transient));
      recorded.current = null;
      setStarted(Boolean(opts.autoplay));
      if (opts.autoplay) {
        record(s, Boolean(opts.transient));
        void engine.play();
      }
    },
    [instruments, repo, record, setLayers],
  );

  const play = useCallback(() => {
    if (!score) return;
    record(score, transient);
    setStarted(true);
    void engine.play();
  }, [score, transient, record]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const list = repo.playableScores();
      if (!list.length) return null;
      const i = score ? list.findIndex((s) => s.id === score.id) : -1;
      const next = list[(i + dir + list.length) % list.length];
      loadScore(next, { autoplay: state.playing });
      return next;
    },
    [repo, score, loadScore, state.playing],
  );

  const api = useMemo<PlayerApi>(
    () => ({
      score,
      performanceId,
      layers,
      state,
      transient,
      started,
      loadScore,
      play,
      pause: () => engine.pause(),
      toggle: () => (engine.getState().playing ? engine.pause() : play()),
      seekBeat: (b) => engine.seek(b),
      seekNote: (i) => {
        const n = score?.notes[i];
        if (n) engine.seek(n.startBeat);
      },
      setRate: (r) => engine.setRate(r),
      setVolume: (v) => engine.setVolume(v),
      setLoop: (l) => engine.setLoop(l),
      setLayers: (l) => {
        setLayers(l);
        setPerformanceId(null);
      },
      applyPerformance: (perf) => {
        setLayers(layersForPerformance(instruments, perf));
        setPerformanceId(perf.id);
      },
      step,
    }),
    [score, performanceId, layers, state, transient, started, loadScore, play, setLayers, instruments, step],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePlayer(): PlayerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlayer 必须在 PlayerProvider 内使用');
  return v;
}
