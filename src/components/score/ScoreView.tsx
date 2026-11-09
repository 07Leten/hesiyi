import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Score, ScoreNote } from '../../data/types';
import { ToneMark } from '../common/ToneMark';

export type ScoreMode = 'jianpu' | 'gongche' | 'dual';

interface Props {
  score: Score;
  mode: ScoreMode;
  showLyrics: boolean;
  showTones: boolean;
  showNotes: boolean;
  activeNote: number;
  following?: boolean;
  onSeekNote?: (noteIndex: number) => void;
  /** 只显示部分音符 [起, 止)，用于摘录 */
  range?: [number, number];
  compact?: boolean;
}

interface Unit {
  syllable: number | null;
  notes: ScoreNote[];
}

const ACC: Record<number, string> = { 1: '♯', [-1]: '♭' };

function useLayout(score: Score, range?: [number, number]) {
  return useMemo(() => {
    const notes = range ? score.notes.slice(range[0], range[1]) : score.notes;
    const syl = score.syllables;
    const sylFirst = new Map<number, number>();
    const sylLast = new Map<number, number>();
    for (const n of notes) {
      if (n.syllableIndex == null) continue;
      if (!sylFirst.has(n.syllableIndex)) sylFirst.set(n.syllableIndex, n.index);
      sylLast.set(n.syllableIndex, n.index);
    }
    const lineStart = (s: number) => s === 0 || Boolean(syl[s - 1]?.lineEnd);

    // 简谱：按小节分组，句首所在小节另起一行
    const rows: ScoreNote[][][] = [];
    let currentBar = -1;
    let row: ScoreNote[][] = [];
    for (const n of notes) {
      if (n.bar !== currentBar) {
        currentBar = n.bar;
        const firstPitched = notes.find((x) => x.bar === n.bar && !x.isRest);
        const startsLine =
          firstPitched && !firstPitched.isMelisma && firstPitched.syllableIndex != null && lineStart(firstPitched.syllableIndex);
        if (row.length && startsLine) {
          rows.push(row);
          row = [];
        }
        row.push([]);
      }
      row[row.length - 1].push(n);
    }
    if (row.length) rows.push(row);

    // 工尺谱：一字一单元（含其后的腔音与休止），每句一列
    const columns: Unit[][] = [];
    let col: Unit[] = [];
    for (const n of notes) {
      const startsUnit = n.syllableIndex != null && !n.isMelisma;
      if (startsUnit) {
        if (col.length && lineStart(n.syllableIndex!)) {
          columns.push(col);
          col = [];
        }
        col.push({ syllable: n.syllableIndex, notes: [n] });
      } else if (col.length) {
        col[col.length - 1].notes.push(n);
      } else {
        col.push({ syllable: null, notes: [n] });
      }
    }
    if (col.length) columns.push(col);

    const marks = new Map<number, number>();
    for (const n of notes) if (n.annotation || n.uncertaintyNote) marks.set(n.index, marks.size + 1);

    return { notes, rows, columns, sylFirst, sylLast, marks };
  }, [score, range]);
}

export function ScoreView(props: Props) {
  const { score, mode, showLyrics, showTones, showNotes, activeNote, following, onSeekNote, range, compact } = props;
  const L = useLayout(score, range);
  const root = useRef<HTMLDivElement>(null);

  const activeSyl = useMemo(() => {
    for (let i = activeNote; i >= 0; i--) {
      const s = score.notes[i]?.syllableIndex;
      if (s != null) return s;
    }
    return -1;
  }, [activeNote, score]);

  useEffect(() => {
    if (!following || activeNote < 0 || !root.current) return;
    const el = root.current.querySelector<HTMLElement>(`[data-note="${activeNote}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sheet = el.closest<HTMLElement>('.gc-sheet');
    if (sheet) {
      const s = sheet.getBoundingClientRect();
      if (r.left < s.left + 20 || r.right > s.right - 20) sheet.scrollBy({ left: r.left - s.left - s.width / 2, behavior: 'smooth' });
    }
    if (r.bottom > window.innerHeight - 150 || r.top < 70) {
      window.scrollBy({ top: r.top - window.innerHeight * 0.38, behavior: 'smooth' });
    }
  }, [activeNote, following]);

  const seek = (i: number) => onSeekNote?.(i);
  const lyricOf = (n: ScoreNote) => (n.syllableIndex != null && !n.isMelisma ? score.syllables[n.syllableIndex] : null);
  const noteState = (n: ScoreNote) => {
    const c: string[] = [];
    if (n.index === activeNote) c.push('is-active');
    if (n.uncertain) c.push('is-uncertain');
    if (activeSyl >= 0 && n.syllableIndex != null) {
      if (n.syllableIndex < activeSyl) c.push('is-past');
      else if (n.syllableIndex === activeSyl) c.push('is-current-syl');
    }
    return c;
  };

  const mark = (n: ScoreNote) =>
    showNotes && L.marks.has(n.index) ? (
      <sup className={`nc-mark${n.uncertain ? ' is-q' : ''}`}>{L.marks.get(n.index)}</sup>
    ) : null;

  const gongcheText = (n: ScoreNote) => {
    const g = n.gongche;
    if (!g || !g.char) return n.isRest ? '' : '□';
    return g.char;
  };

  const octaveTag = (n: ScoreNote) =>
    n.gongche?.octaveMark ? <sup className="gc-oct">{n.gongche.octaveMark === 'high' ? '高' : '低'}</sup> : null;

  /* ---------- 简谱 / 双谱 ---------- */

  const slurClass = (n: ScoreNote, position: 'note' | 'after') => {
    if (n.syllableIndex == null) return '';
    const first = L.sylFirst.get(n.syllableIndex);
    const last = L.sylLast.get(n.syllableIndex);
    if (first == null || last == null || first === last) return '';
    if (position === 'after') return n.index === last ? '' : 'slur-mid';
    if (n.index === first) return 'slur-start';
    if (n.index === last) return 'slur-end';
    return 'slur-mid';
  };

  const renderBar = (bar: ScoreNote[], bi: number, isLastBar: boolean) => {
    const cells: ReactNode[] = [];
    bar.forEach((n, i) => {
      const prev = bar[i - 1];
      const next = bar[i + 1];
      const sameBeam = (a: ScoreNote | undefined, b: ScoreNote | undefined) =>
        Boolean(a && b && a.underlines > 0 && b.underlines > 0 && a.extensionBeats === 0 && Math.floor(b.startBeat + 1e-6) === Math.floor(a.startBeat + 1e-6));
      const joinPrev = sameBeam(prev, n);
      const joinNext = sameBeam(n, next);
      const syl = lyricOf(n);
      const cls = [
        'nc',
        ...noteState(n),
        slurClass(n, 'note'),
        n.underlines ? `ul-${n.underlines}` : '',
        n.underlines && !joinPrev ? 'ul-start' : '',
        n.underlines && !joinNext ? 'ul-end' : '',
        joinNext ? 'tight' : '',
      ];
      if (n.isRest) cls.push('is-rest');
      cells.push(
        <button
          key={n.id}
          type="button"
          className={cls.filter(Boolean).join(' ')}
          data-note={n.index}
          onClick={() => seek(n.index)}
          title={n.uncertaintyNote ?? n.annotation ?? (n.isRest ? '休止' : undefined)}
          aria-label={`${n.isRest ? '休止' : `音 ${n.pitch.degree}`}${syl ? `，字「${syl.char}」` : ''}`}
        >
          {mode === 'dual' && (
            <span className="nc-gc">
              {gongcheText(n)}
              {octaveTag(n)}
              {n.gongche?.banyan && <i className="nc-by">{n.gongche.banyan === '板' ? '、' : '。'}</i>}
            </span>
          )}
          <span className="nc-hi">{n.pitch.octave > 0 && <i>{'•'.repeat(n.pitch.octave)}</i>}</span>
          <span className="nc-digit">
            {ACC[n.pitch.accidental] && <sup className="nc-acc">{ACC[n.pitch.accidental]}</sup>}
            <span className="nc-num">{n.pitch.degree}</span>
            {n.dotted && <i className="nc-dot">·</i>}
            {mark(n)}
          </span>
          <span className="nc-lo">{n.pitch.octave < 0 && <i>{'•'.repeat(-n.pitch.octave)}</i>}</span>
          {showLyrics && (
            <span className="nc-lyric">
              {syl ? (
                <>
                  {syl.char}
                  {showTones && <ToneMark tone={syl.tone} />}
                </>
              ) : null}
            </span>
          )}
          {showTones && <span className="nc-tone">{syl?.tone?.category ?? ''}</span>}
        </button>,
      );
      for (let k = 0; k < n.extensionBeats; k++) {
        cells.push(
          <span key={`${n.id}-x${k}`} className={`nc nc-dash ${slurClass(n, 'after')} ${n.index === activeNote ? 'is-held' : ''}`} aria-hidden="true">
            {mode === 'dual' && <span className="nc-gc" />}
            <span className="nc-hi" />
            <span className="nc-digit">
              <span className="nc-num">–</span>
            </span>
            <span className="nc-lo" />
            {showLyrics && <span className="nc-lyric" />}
            {showTones && <span className="nc-tone" />}
          </span>,
        );
      }
    });
    const lastNote = bar[bar.length - 1];
    const barSlur = lastNote && lastNote.syllableIndex != null && L.sylLast.get(lastNote.syllableIndex) !== lastNote.index ? 'slur-mid' : '';
    return (
      <div className="jp-bar" key={bi}>
        {cells}
        <span className={`jp-barline ${isLastBar ? 'is-final' : ''} ${barSlur}`} aria-hidden="true">
          <i />
        </span>
      </div>
    );
  };

  const jianpu = (
    <div className={`jp-sheet ${mode === 'dual' ? 'is-dual' : ''}`}>
      {L.rows.map((row, ri) => (
        <div className="jp-row" key={ri}>
          {row.map((bar, bi) => renderBar(bar, bi, ri === L.rows.length - 1 && bi === row.length - 1 && !range))}
        </div>
      ))}
    </div>
  );

  /* ---------- 工尺谱（竖排） ---------- */

  const gongche = (
    <div className="gc-sheet">
      {L.columns.map((col, ci) => (
        <div className="gc-col" key={ci}>
          {col.map((u, ui) => {
            const syl = u.syllable != null ? score.syllables[u.syllable] : null;
            const first = u.notes.find((n) => !n.isRest) ?? u.notes[0];
            const charCls = ['gc-char'];
            if (u.syllable != null && u.syllable === activeSyl) charCls.push('is-active');
            else if (u.syllable != null && activeSyl >= 0 && u.syllable < activeSyl) charCls.push('is-past');
            return (
              <div className="gc-unit" key={ui}>
                {showLyrics && (
                  <button type="button" className={charCls.join(' ')} onClick={() => seek(first.index)} disabled={!syl}>
                    {syl?.char ?? ''}
                    {syl && showTones && <ToneMark tone={syl.tone} />}
                    {syl?.punctuation && <span className="gc-punct">{syl.punctuation.replace(/[，,]/g, '、').slice(0, 1)}</span>}
                  </button>
                )}
                <div className="gc-notes">
                  {u.notes.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      data-note={n.index}
                      className={['gc-note', ...noteState(n), n.isRest ? 'is-rest' : '', n.gongche && !n.gongche.derived ? 'is-original' : ''].join(' ')}
                      onClick={() => seek(n.index)}
                      title={[n.isRest ? '休止' : '', n.gongche?.note, n.uncertaintyNote, n.annotation].filter(Boolean).join('；') || undefined}
                    >
                      <span className="gc-glyph">
                        {gongcheText(n)}
                        {octaveTag(n)}
                      </span>
                      <span className="gc-by">{n.gongche?.banyan === '板' ? '、' : n.gongche?.banyan === '眼' ? '。' : ''}</span>
                      {mark(n)}
                    </button>
                  ))}
                </div>
                {showTones && syl?.tone && <span className="gc-tone">{syl.tone.category}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const annotated = L.notes.filter((n) => L.marks.has(n.index));

  return (
    <div ref={root} className={`score-view mode-${mode}${activeSyl >= 0 ? ' is-following' : ''}${compact ? ' is-compact' : ''}`}>
      {mode === 'gongche' ? gongche : jianpu}
      {showNotes && !range && (annotated.length > 0 || score.annotations.length > 0) && (
        <div className="score-notes">
          <h4>注释</h4>
          <ol>
            {annotated.map((n) => {
              const s = n.syllableIndex != null ? score.syllables[n.syllableIndex] : null;
              return (
                <li key={n.id} className={n.uncertain ? 'is-q' : ''}>
                  <button type="button" className="linklike" onClick={() => seek(n.index)}>
                    <b>{L.marks.get(n.index)}</b> 第 {n.bar} 小节{s ? `「${s.char}」` : ''}
                  </button>
                  {n.uncertain && <span className="badge badge-q">存疑</span>}
                  <span>{n.uncertaintyNote ?? n.annotation}</span>
                </li>
              );
            })}
          </ol>
          {score.annotations.map((a, i) => (
            <p key={i} className="score-notes-general">{a.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}
