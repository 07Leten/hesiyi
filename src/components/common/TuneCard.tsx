import { Link } from 'react-router-dom';
import { useRepo } from '../../data/DataContext';
import type { TunePattern } from '../../data/types';

export function TuneCard({ tune }: { tune: TunePattern }) {
  const repo = useRepo();
  const st = repo.tuneStats(tune.id);
  return (
    <Link to={`/tune/${tune.id}`} className="tune-card">
      <div className="tune-card-body">
        <div className="tune-card-meta">
          {tune.formType && <span>{tune.formType}</span>}
          {tune.wordCount && <span>{tune.wordCount} 字</span>}
          {tune.stanzaType && <span>{tune.stanzaType}</span>}
        </div>
        {tune.aliases.length > 0 && <p className="tune-card-alias">又名 {tune.aliases.join('、')}</p>}
        <p className="tune-card-summary">{tune.summary}</p>
        <p className="tune-card-authors">
          {st.authors.length ? `代表作者　${st.authors.map((a) => a.name).join('、')}` : '暂未收录词作'}
        </p>
        <div className="tune-card-foot">
          <span className={st.scoreCount ? 'has-score' : 'no-score'}>
            {st.scoreCount ? `曲谱 ${st.scoreCount}` : '暂无曲谱'}
            {st.scoreCount > 0 && st.literatureScoreCount === 0 && <em>（演示）</em>}
          </span>
          <span className={st.playableLiterature ? 'playable lit' : st.playable ? 'playable' : 'unplayable'}>
            {st.playableLiterature ? '可播放历史曲谱' : st.playable ? '可播放演示曲谱' : '无可播放历史曲谱'}
          </span>
        </div>
      </div>
      <h3 className="tune-card-name">{tune.name}</h3>
    </Link>
  );
}
