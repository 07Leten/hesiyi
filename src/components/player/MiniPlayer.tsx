import { Link, useLocation } from 'react-router-dom';
import { useRepo } from '../../data/DataContext';
import { usePlayer } from '../../player/PlayerContext';
import { OriginBadge } from '../common/Badges';
import { IconNext, IconPause, IconPlay, IconPrev } from '../common/Icons';
import { ProgressBar } from './ProgressBar';

/** 跨页面的迷你播放条；在当前曲谱自己的页面上隐藏 */
export function MiniPlayer() {
  const player = usePlayer();
  const repo = useRepo();
  const loc = useLocation();
  const s = player.score;
  if (!s || !player.started) return null;
  if (loc.pathname === `/poem/${s.poemId}` || (player.transient && loc.pathname === '/create')) return null;

  const poem = repo.poem(s.poemId);
  const author = poem ? repo.author(poem.authorId) : undefined;
  const tune = repo.tune(s.tunePatternId);
  const many = repo.playableScores().length > 1 && !player.transient;

  return (
    <aside className="mini-player" aria-label="迷你播放器">
      <ProgressBar score={s} isCurrent onSeek={player.seekBeat} showTimes={false} thin />
      <div className="mini-row">
        {poem && !player.transient ? (
          <Link to={`/poem/${poem.id}?score=${s.id}`} className="mini-title">
            <b>{tune?.name ?? ''}</b>
            <span>{poem.title}</span>
            <small>{author?.name}</small>
          </Link>
        ) : (
          <Link to="/create" className="mini-title">
            <b>{s.title}</b>
          </Link>
        )}
        <OriginBadge origin={s.provenance.origin} short />
        <div className="mini-buttons">
          {many && (
            <button type="button" className="icon-btn" onClick={() => player.step(-1)} aria-label="上一曲">
              <IconPrev />
            </button>
          )}
          <button type="button" className="play-btn is-sm" onClick={player.toggle} aria-label={player.state.playing ? '暂停' : '播放'}>
            {player.state.playing ? <IconPause /> : <IconPlay />}
          </button>
          {many && (
            <button type="button" className="icon-btn" onClick={() => player.step(1)} aria-label="下一曲">
              <IconNext />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
