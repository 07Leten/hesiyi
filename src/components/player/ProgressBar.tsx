import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { engine } from '../../audio/engine';
import type { Score } from '../../data/types';
import { formatTime, useBeatFrame } from '../../player/usePlayback';

interface Props {
  score: Score;
  isCurrent: boolean;
  onSeek: (beat: number) => void;
  showTimes?: boolean;
  thin?: boolean;
}

/** 进度条：刻度标出每句的起点（句读），朱点为当前位置 */
export function ProgressBar({ score, isCurrent, onSeek, showTimes = true, thin }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLSpanElement>(null);
  const total = score.totalBeats;

  const phrases = useMemo(() => {
    const out: number[] = [];
    score.syllables.forEach((s, i) => {
      if (i === 0 || !score.syllables[i - 1].lineEnd) return;
      const first = score.notes.find((n) => n.id === s.noteIds[0]);
      if (first) out.push(first.startBeat / total);
    });
    return out;
  }, [score, total]);

  const secs = (beats: number) => beats / ((score.tempo * engine.getState().rate) / 60);

  useBeatFrame((beat) => {
    const p = isCurrent && total ? beat / total : 0;
    track.current?.style.setProperty('--p', String(Math.min(1, p)));
    track.current?.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    if (cur.current) cur.current.textContent = formatTime(isCurrent ? secs(beat) : 0);
  }, true);

  const seekFromEvent = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onSeek(ratio * total);
  };

  const onKey = (e: KeyboardEvent) => {
    const step = score.meter.beatsPerBar;
    const b = isCurrent ? engine.getBeat() : 0;
    if (e.key === 'ArrowRight') onSeek(Math.min(total, b + step));
    else if (e.key === 'ArrowLeft') onSeek(Math.max(0, b - step));
    else return;
    e.preventDefault();
  };

  return (
    <div className={`progress${thin ? ' is-thin' : ''}`}>
      {showTimes && <span className="progress-time" ref={cur}>0:00</span>}
      <div
        className="progress-track"
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromEvent(e);
        }}
        onKeyDown={onKey}
      >
        <span className="progress-fill" />
        {phrases.map((p, i) => (
          <span key={i} className="progress-tick" style={{ left: `${p * 100}%` }} />
        ))}
        <span className="progress-dot" />
      </div>
      {showTimes && <span className="progress-time">{formatTime(secs(total))}</span>}
    </div>
  );
}
