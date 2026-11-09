import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import type { Score } from '../data/types';

function noteAt(score: Score, beat: number): number {
  const notes = score.notes;
  let lo = 0;
  let hi = notes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].startBeat <= beat + 1e-6) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * 当前发声的音符序号（-1 表示未开始）。
 * 只在序号变化时触发重渲染，逐帧的进度条另行直接操作 DOM。
 */
export function useActiveNote(score: Score | null, isCurrent: boolean): number {
  const [idx, setIdx] = useState(-1);
  const last = useRef(-1);

  useEffect(() => {
    if (!score || !isCurrent) {
      last.current = -1;
      setIdx(-1);
      return;
    }
    let raf = 0;
    const update = () => {
      const st = engine.getState();
      const beat = engine.getBeat();
      const i = st.playing || beat > 0 ? noteAt(score, beat) : -1;
      if (i !== last.current) {
        last.current = i;
        setIdx(i);
      }
      if (st.playing) raf = requestAnimationFrame(update);
    };
    update();
    const unsub = engine.subscribe(() => {
      cancelAnimationFrame(raf);
      update();
    });
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [score, isCurrent]);

  return idx;
}

/** 逐帧回调播放位置（拍），用于进度条等需要平滑更新的元素 */
export function useBeatFrame(cb: (beat: number, total: number) => void, enabled: boolean) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const loop = () => {
      cbRef.current(engine.getBeat(), engine.getTotalBeats());
      if (engine.getState().playing) raf = requestAnimationFrame(loop);
    };
    loop();
    const unsub = engine.subscribe(() => {
      cancelAnimationFrame(raf);
      loop();
    });
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [enabled]);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
