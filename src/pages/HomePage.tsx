import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { engine } from '../audio/engine';
import { OriginBadge } from '../components/common/Badges';
import { IconPause, IconPlay } from '../components/common/Icons';
import { SearchBox } from '../components/common/SearchBox';
import { VerticalPoem } from '../components/common/VerticalPoem';
import { ScoreView } from '../components/score/ScoreView';
import { useRepo } from '../data/DataContext';
import { isPlayable } from '../data/repository';
import type { FormType, Score } from '../data/types';
import { usePlayer } from '../player/PlayerContext';
import { useActiveNote } from '../player/usePlayback';
import { useUser, userStore } from '../services/user/useUser';

const OPENING = [
  { char: '合', jp: '5', midi: 57 },
  { char: '四', jp: '6', midi: 59 },
  { char: '一', jp: '7', midi: 61 },
];

const FORMS: { form: FormType; range: string }[] = [
  { form: '小令', range: '五十八字以内' },
  { form: '中调', range: '五十九至九十字' },
  { form: '长调', range: '九十一字以上' },
];

function firstPhraseEnd(score: Score) {
  const i = score.syllables.findIndex((s) => s.lineEnd);
  const next = score.syllables[i + 1];
  const n = next ? score.notes.find((x) => x.id === next.noteIds[0]) : undefined;
  return n ? n.index : score.notes.length;
}

function chineseDate(d: Date) {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function ago(t: number) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export function HomePage() {
  const repo = useRepo();
  const player = usePlayer();
  const user = useUser();
  const pick = useMemo(() => repo.dailyPick(), [repo]);
  const qin = repo.instrument('guqin');

  const isPickCurrent = Boolean(pick && player.score?.id === pick.score.id);
  const active = useActiveNote(pick?.score ?? null, isPickCurrent);
  const activeSyl = active >= 0 ? pick?.score.notes[active]?.syllableIndex ?? -1 : -1;

  const playScore = (s: Score) => {
    if (player.score?.id === s.id) player.toggle();
    else player.loadScore(s, { autoplay: true });
  };
  const isPlaying = (s: Score) => player.score?.id === s.id && player.state.playing;

  const hot = repo.data.tunePatterns.filter((t) => t.tags?.includes('常见')).slice(0, 4);
  const playable = repo.playableScores();

  return (
    <div className="home">
      <section className="cover">
        <div className="cover-inner">
          <div className="cover-slip" aria-hidden="true">
            <span className="cover-slip-title">合四一</span>
            <span className="cover-slip-sub">词乐谱</span>
          </div>

          <div className="cover-main">
            <h1 className="cover-lead">
              <span>依谱寻声，</span>
              <span>使旧词可听。</span>
            </h1>
            <p className="cover-sub">检索词牌与词作，对照工尺谱与简谱，在浏览器里按谱演奏一阕宋词。</p>
            <SearchBox size="lg" />
            <p className="cover-hot">
              常检
              {hot.map((t) => (
                <Link key={t.id} to={`/tune/${t.id}`}>
                  {t.name}
                </Link>
              ))}
              <Link to="/library?q=李清照&field=author">李清照</Link>
            </p>
          </div>

          <div className="cover-notes">
            <div className="cover-notes-row">
              {OPENING.map((o) => (
                <button
                  key={o.char}
                  type="button"
                  className="cover-note"
                  onClick={() => qin && void engine.previewNote(qin.presets[1] ?? qin.presets[0], 'guqin', o.midi, 2)}
                  aria-label={`试听工尺字「${o.char}」，相当于简谱低音 ${o.jp}`}
                >
                  <span className="cover-note-char">{o.char}</span>
                  <span className="cover-note-jp">
                    {o.jp}
                    <i>•</i>
                  </span>
                </button>
              ))}
            </div>
            <p className="cover-notes-cap">工尺谱以「合、四、一」起首，点按可听其音。</p>
          </div>
        </div>
      </section>

      {pick && (
        <section className="sec today">
          <header className="sec-head">
            <h2>今日一阕</h2>
            <span className="sec-aside">{chineseDate(new Date())}</span>
          </header>
          <div className="today-grid">
            <div className="paper-sheet today-text">
              <VerticalPoem text={pick.poem.text} activeSyllable={activeSyl ?? -1} syllables={pick.score.syllables} size="lg" />
            </div>
            <div className="today-side">
              <p className="today-tune">{repo.tune(pick.poem.tunePatternId)?.name}</p>
              <h3 className="today-title">{pick.poem.title}</h3>
              <p className="today-author">
                {repo.author(pick.poem.authorId)?.name} · {repo.author(pick.poem.authorId)?.period ?? pick.poem.dynasty}
              </p>
              <div className="today-excerpt">
                <p className="excerpt-label">首句曲谱</p>
                <ScoreView
                  score={pick.score}
                  mode="jianpu"
                  showLyrics
                  showTones={false}
                  showNotes={false}
                  activeNote={active}
                  range={[0, firstPhraseEnd(pick.score)]}
                  onSeekNote={(i) => {
                    const beat = pick.score.notes[i].startBeat;
                    if (!isPickCurrent) return player.loadScore(pick.score, { autoplay: true, startBeat: beat });
                    player.seekBeat(beat);
                    if (!player.state.playing) player.play();
                  }}
                  compact
                />
              </div>
              <div className="today-actions">
                <button type="button" className="btn btn-primary" onClick={() => playScore(pick.score)}>
                  {isPlaying(pick.score) ? <IconPause /> : <IconPlay />}
                  {isPlaying(pick.score) ? '暂停' : '按谱试听'}
                </button>
                <Link to={`/poem/${pick.poem.id}?score=${pick.score.id}`} className="btn btn-ghost">
                  展开全谱
                </Link>
              </div>
              <p className="today-prov">
                <OriginBadge origin={pick.score.provenance.origin} /> {pick.score.provenance.note}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="sec">
        <header className="sec-head">
          <h2>词牌分类</h2>
          <Link to="/library" className="sec-aside">
            全部词牌
          </Link>
        </header>
        <div className="forms-grid">
          {FORMS.map(({ form, range }) => {
            const tunes = repo.data.tunePatterns.filter((t) => t.formType === form);
            return (
              <div className="form-col" key={form}>
                <Link to={`/library?form=${form}`} className="form-head">
                  <h3>{form}</h3>
                  <span>{range}</span>
                  <em>{tunes.length}</em>
                </Link>
                <ul>
                  {tunes.map((t) => (
                    <li key={t.id}>
                      <Link to={`/tune/${t.id}`}>
                        {t.name}
                        <small>{t.wordCount}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="forms-note">以字数分小令、中调、长调，出自清人毛先舒之说，后人多有异议，此处仅作检索便利。</p>
      </section>

      <section className="sec">
        <header className="sec-head">
          <h2>推荐曲谱</h2>
          <Link to="/library?playable=1" className="sec-aside">
            只看可播放
          </Link>
        </header>
        <div className="rec-grid">
          {playable.map((s) => {
            const poem = repo.poem(s.poemId)!;
            const tune = repo.tune(s.tunePatternId);
            const author = repo.author(poem.authorId);
            const perfs = repo.performancesByScore(s.id);
            return (
              <article className="rec-card" key={s.id}>
                <button type="button" className={`rec-play${isPlaying(s) ? ' is-playing' : ''}`} onClick={() => playScore(s)} aria-label={isPlaying(s) ? '暂停' : `播放${tune?.name}`}>
                  {isPlaying(s) ? <IconPause /> : <IconPlay />}
                </button>
                <Link to={`/poem/${poem.id}?score=${s.id}`} className="rec-body">
                  <span className="rec-tune">{tune?.name}</span>
                  <span className="rec-title">{poem.title}</span>
                  <span className="rec-meta">
                    {author?.name} · {s.meter.banyan ?? `${s.meter.beatsPerBar}/${s.meter.beatUnit}`} · {perfs.map((p) => p.title).join(' / ')}
                  </span>
                </Link>
                <OriginBadge origin={s.provenance.origin} />
              </article>
            );
          })}
        </div>
        {repo.data.scores.filter(isPlayable).every((s) => s.provenance.origin !== 'literature') && (
          <p className="forms-note">文献曲谱尚未导入，目前展示的均为演示曲谱。</p>
        )}
      </section>

      <section className="sec">
        <header className="sec-head">
          <h2>最近收听</h2>
          {user.recent.length > 0 && (
            <button type="button" className="sec-aside linklike" onClick={() => userStore.clearRecent()}>
              清空记录
            </button>
          )}
        </header>
        {user.recent.length === 0 ? (
          <p className="empty-line">还没有收听记录。点上面任意一首的播放键，这里会记下来。</p>
        ) : (
          <ol className="recent-list">
            {user.recent.map((r) => {
              const s = repo.score(r.scoreId);
              const poem = repo.poem(r.poemId);
              if (!s || !poem) return null;
              return (
                <li key={r.scoreId}>
                  <button type="button" className="icon-btn" onClick={() => playScore(s)} aria-label={isPlaying(s) ? '暂停' : '播放'}>
                    {isPlaying(s) ? <IconPause /> : <IconPlay />}
                  </button>
                  <Link to={`/poem/${poem.id}?score=${s.id}`}>
                    <b>{repo.tune(poem.tunePatternId)?.name}</b> {poem.title}
                  </Link>
                  <span className="muted">{repo.author(poem.authorId)?.name}</span>
                  <time className="muted">{ago(r.at)}</time>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
