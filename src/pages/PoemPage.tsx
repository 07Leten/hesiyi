import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AiPrompt } from '../components/common/AiPrompt';
import { OriginBadge, RevisionBadge } from '../components/common/Badges';
import { IconHeart } from '../components/common/Icons';
import { VerticalPoem } from '../components/common/VerticalPoem';
import { PlayerPanel } from '../components/player/PlayerPanel';
import { ScoreView, type ScoreMode } from '../components/score/ScoreView';
import { useRepo } from '../data/DataContext';
import { hanChars } from '../data/notation/lyrics';
import { useStoredState } from '../hooks/useStoredState';
import { usePlayer } from '../player/PlayerContext';
import { useActiveNote } from '../player/usePlayback';
import { useUser, userStore } from '../services/user/useUser';
import { NotFound } from './NotFound';

const MODES: { id: ScoreMode; label: string }[] = [
  { id: 'jianpu', label: '简谱' },
  { id: 'gongche', label: '工尺谱' },
  { id: 'dual', label: '双谱对照' },
];

export function PoemPage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const repo = useRepo();
  const player = usePlayer();
  const user = useUser();

  const [mode, setMode] = useStoredState<ScoreMode>('mode', 'jianpu');
  const [showLyrics, setShowLyrics] = useStoredState('lyrics', true);
  const [showTones, setShowTones] = useStoredState('tones', false);
  const [showNotes, setShowNotes] = useStoredState('notes', false);

  const poem = repo.poem(id);
  const scores = poem ? repo.scoresByPoem(poem.id) : [];
  const score = scores.find((s) => s.id === sp.get('score')) ?? scores[0] ?? null;
  const isCurrent = Boolean(score && player.score?.id === score.id);
  const active = useActiveNote(score, isCurrent);

  useEffect(() => {
    // 只在切换曲谱时载入；正在播放其他曲目时不打断
    if (score && player.score?.id !== score.id && !player.state.playing) player.loadScore(score);
  }, [score?.id]);

  const lyricMatches = useMemo(
    () => Boolean(poem && score && hanChars(poem.text).join('') === score.syllables.map((s) => s.char).join('')),
    [poem, score],
  );

  if (!poem) return <NotFound what="词作" />;

  const tune = repo.tune(poem.tunePatternId);
  const author = repo.author(poem.authorId);
  const fav = user.favorites.includes(poem.id);
  const activeSyl = active >= 0 && score ? (() => {
    for (let i = active; i >= 0; i--) {
      const s = score.notes[i].syllableIndex;
      if (s != null) return s;
    }
    return -1;
  })() : -1;

  const seekNote = (i: number) => {
    const n = score?.notes[i];
    if (!score || !n) return;
    if (!isCurrent) return player.loadScore(score, { autoplay: true, startBeat: n.startBeat });
    player.seekBeat(n.startBeat);
    if (!player.state.playing) player.play();
  };

  const seekSyllable = (syl: number) => {
    const noteId = score?.syllables[syl]?.noteIds[0];
    const n = score?.notes.find((x) => x.id === noteId);
    if (n) seekNote(n.index);
  };

  return (
    <div className="page work">
      <nav className="crumbs" aria-label="位置">
        <Link to="/library">词牌曲库</Link>
        <span>/</span>
        {tune && <Link to={`/tune/${tune.id}`}>{tune.name}</Link>}
        <span>/</span>
        <span>{poem.title}</span>
      </nav>

      <header className="work-head">
        <div className="work-titles">
          {tune && (
            <Link to={`/tune/${tune.id}`} className="work-tune">
              {tune.name}
            </Link>
          )}
          <h1>{poem.title}</h1>
          <p className="work-author">
            {author?.name}
            <span>{author?.period ?? poem.dynasty}</span>
          </p>
        </div>
        <div className="work-actions">
          <button type="button" className={`btn btn-ghost${fav ? ' is-on' : ''}`} onClick={() => userStore.toggleFavorite(poem.id)} aria-pressed={fav}>
            <IconHeart filled={fav} />
            {fav ? '已收藏' : '收藏'}
          </button>
          <Link className="btn btn-ghost" to={`/create?poem=${poem.id}`}>
            以此词创作
          </Link>
        </div>
      </header>

      <div className={`work-grid${score ? '' : ' no-score'}`}>
        <aside className="work-aside">
          <div className="paper-sheet">
            <VerticalPoem
              text={poem.text}
              syllables={lyricMatches ? score?.syllables : undefined}
              activeSyllable={lyricMatches && isCurrent ? activeSyl : -1}
              showTones={showTones && lyricMatches}
              onCharClick={lyricMatches ? seekSyllable : undefined}
              size="lg"
            />
          </div>
          {poem.preface && (
            <p className="work-preface">
              <span>序</span>
              {poem.preface}
            </p>
          )}
          {poem.note && <p className="small muted">{poem.note}</p>}
          <p className="small muted">
            正文：<RevisionBadge status={poem.provenance.revisionStatus} /> {poem.provenance.note}
          </p>

          {score && (
            <dl className="source-card">
              <div>
                <dt>曲谱来源</dt>
                <dd>
                  <OriginBadge origin={score.provenance.origin} />
                  {score.provenance.sourceTitle ?? (score.provenance.origin === 'demo' ? '本项目演示旋律' : '—')}
                  {score.provenance.sourceDetail && ` · ${score.provenance.sourceDetail}`}
                </dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>
                  {score.provenance.edition ?? '—'}
                  {score.provenance.editor && ` · 整理：${score.provenance.editor}`}
                </dd>
              </div>
              <div>
                <dt>校订</dt>
                <dd>
                  <RevisionBadge status={score.provenance.revisionStatus} />
                </dd>
              </div>
              <div>
                <dt>记谱</dt>
                <dd>
                  原谱为{score.notation.primary === 'gongche' ? '工尺谱' : '简谱'}；
                  {score.notation.gongcheAvailable ? (score.notation.gongcheDerived ? '工尺字由简谱推导' : '工尺字据原谱') : '无工尺谱'}
                </dd>
              </div>
              {score.toneSystem && (
                <div>
                  <dt>字声</dt>
                  <dd>{score.toneSystem}</dd>
                </div>
              )}
              {score.provenance.note && <p className="source-note">{score.provenance.note}</p>}
            </dl>
          )}
        </aside>

        <section className="work-score" aria-label="曲谱">
          {score ? (
            <>
              {scores.length > 1 && (
                <label className="score-select">
                  <span>曲谱版本</span>
                  <select value={score.id} onChange={(e) => setSp({ score: e.target.value })}>
                    {scores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="score-toolbar">
                <div className="seg" role="radiogroup" aria-label="曲谱显示方式">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'is-on' : ''} onClick={() => setMode(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="toggles">
                  <label className="switch">
                    <input type="checkbox" checked={showLyrics} onChange={(e) => setShowLyrics(e.target.checked)} />
                    <span>歌词</span>
                  </label>
                  <label className="switch">
                    <input type="checkbox" checked={showTones} onChange={(e) => setShowTones(e.target.checked)} disabled={!score.toneSystem} />
                    <span>声调</span>
                  </label>
                  <label className="switch">
                    <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
                    <span>注释</span>
                  </label>
                </div>
              </div>

              <p className="score-meta">
                <span>1 = {score.key.tonic}</span>
                <span>
                  {score.meter.beatsPerBar}/{score.meter.beatUnit}
                </span>
                {score.meter.banyan && <span>{score.meter.banyan}</span>}
                <span>♩ = {score.tempo}</span>
                {score.tempoNote && <span>{score.tempoNote}</span>}
                {score.key.gongcheKey && <span>{score.key.gongcheKey}</span>}
              </p>

              {mode !== 'jianpu' && score.notation.gongcheDerived && (
                <p className="score-caveat">
                  {score.key.gongcheKey
                    ? `工尺字按${score.key.gongcheKey}由简谱推导，板眼只标在出音处；工尺谱与简谱并非一一对应。`
                    : '工尺字由简谱级数推导，没有改写成传统工尺调名；板眼只标在出音处。'}
                </p>
              )}
              {showTones && score.toneSystem && (
                <p className="score-caveat">字角小圈为「四声圈发」：平声在左下，上声在左上，去声在右上，入声在右下。依据：{score.toneSystem}。</p>
              )}

              <div className="score-paper">
                <ScoreView
                  score={score}
                  mode={mode}
                  showLyrics={showLyrics}
                  showTones={showTones && Boolean(score.toneSystem)}
                  showNotes={showNotes}
                  activeNote={active}
                  following={isCurrent && player.state.playing}
                  onSeekNote={seekNote}
                />
              </div>
              <p className="score-hint">点按任意音符或歌词，从该处开始播放。</p>
            </>
          ) : (
            <div className="empty-block">
              <p className="empty-glyph" aria-hidden="true">
                谱
              </p>
              <p>这首词暂无已录入的曲谱。</p>
              <AiPrompt tuneId={tune?.id} poemId={poem.id} />
            </div>
          )}
        </section>
      </div>

      {score && (
        <div className="work-player">
          <PlayerPanel score={score} />
        </div>
      )}
    </div>
  );
}
