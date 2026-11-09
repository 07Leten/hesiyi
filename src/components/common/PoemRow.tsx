import { Link } from 'react-router-dom';
import { useRepo } from '../../data/DataContext';
import { isPlayable } from '../../data/repository';
import type { Poem } from '../../data/types';
import { OriginBadge } from './Badges';

/** 词作列表中的一行：首句 + 作者 + 曲谱状态 */
export function PoemRow({ poem, showTune = true }: { poem: Poem; showTune?: boolean }) {
  const repo = useRepo();
  const author = repo.author(poem.authorId);
  const tune = repo.tune(poem.tunePatternId);
  const scores = repo.scoresByPoem(poem.id);
  const first = poem.text.split(/[，。？！\n]/)[0];
  return (
    <Link to={`/poem/${poem.id}`} className="poem-row">
      <span className="poem-row-title">
        {showTune && tune && <b>{tune.name}</b>}
        {showTune && tune && <i>·</i>}
        {poem.title}
      </span>
      <span className="poem-row-first">{first}……</span>
      <span className="poem-row-author">
        {author?.name ?? '佚名'}
        <small>{author?.period ?? poem.dynasty}</small>
      </span>
      <span className="poem-row-status">
        {scores.length ? (
          <>
            <OriginBadge origin={scores[0].provenance.origin} short />
            {scores.some(isPlayable) && <span className="playable-dot" title="可播放">可听</span>}
          </>
        ) : (
          <span className="muted">暂无曲谱</span>
        )}
      </span>
    </Link>
  );
}
