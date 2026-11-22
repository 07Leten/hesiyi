import { Link, useParams } from 'react-router-dom';
import { AiPrompt } from '../components/common/AiPrompt';
import { OriginBadge, RevisionBadge } from '../components/common/Badges';
import { MeterView } from '../components/common/MeterView';
import { PoemRow } from '../components/common/PoemRow';
import { useRepo } from '../data/DataContext';
import { isPlayable, scoreOriginLabel } from '../data/repository';
import { NotFound } from './NotFound';

export function TunePage() {
  const { id = '' } = useParams();
  const repo = useRepo();
  const tune = repo.tune(id);
  if (!tune) return <NotFound what="词牌" />;

  const st = repo.tuneStats(tune.id);
  const poems = repo.poemsByTune(tune.id);
  const scores = repo.scoresByTune(tune.id);

  return (
    <div className="page tune-page">
      <nav className="crumbs" aria-label="位置">
        <Link to="/library">词牌曲库</Link>
        <span>/</span>
        <span>{tune.name}</span>
      </nav>

      <header className="tune-head">
        <h1 className="tune-name">{tune.name}</h1>
        <div className="tune-head-body">
          {tune.aliases.length > 0 && <p className="tune-alias">又名　{tune.aliases.join('　')}</p>}
          <dl className="facts">
            {tune.wordCount && (
              <div>
                <dt>字数</dt>
                <dd>{tune.wordCount} 字</dd>
              </div>
            )}
            {tune.stanzaType && (
              <div>
                <dt>分段</dt>
                <dd>{tune.stanzaType}</dd>
              </div>
            )}
            {tune.formType && (
              <div>
                <dt>体式</dt>
                <dd>{tune.formType}</dd>
              </div>
            )}
            <div>
              <dt>曲谱</dt>
              <dd>
                {st.scoreCount ? `${st.scoreCount} 份` : '暂无'}
                {scoreOriginLabel(st)}
              </dd>
            </div>
          </dl>
          {tune.wordCountNote && <p className="muted small">{tune.wordCountNote}</p>}
        </div>
      </header>

      <div className="tune-grid-2">
        <div className="tune-main">
          <section className="block">
            <h2>源流</h2>
            <p className="lead-text">{tune.summary}</p>
            {tune.history && <p>{tune.history}</p>}
            <p className="prov-line">
              <RevisionBadge status={tune.provenance.revisionStatus} /> {tune.provenance.note}
            </p>
          </section>

          <section className="block">
            <h2>格律</h2>
            {tune.meter ? <MeterView meter={tune.meter} /> : <p className="muted">此调的句式、平仄与押韵资料尚未录入。待有可靠词谱依据后补充，暂不臆测。</p>}
          </section>

          <section className="block">
            <h2>代表词作</h2>
            {poems.length ? (
              <div className="poem-list">
                {poems.map((p) => (
                  <PoemRow key={p.id} poem={p} showTune={false} />
                ))}
              </div>
            ) : (
              <p className="muted">暂未收录此调的词作。</p>
            )}
          </section>
        </div>

        <aside className="tune-side">
          <section className="block">
            <h2>曲谱</h2>
            {scores.length > 0 ? (
              <ul className="score-list">
                {scores.map((s) => (
                  <li key={s.id}>
                    <Link to={`/poem/${s.poemId}?score=${s.id}`}>{s.title}</Link>
                    <div className="score-list-meta">
                      <OriginBadge origin={s.provenance.origin} />
                      <RevisionBadge status={s.provenance.revisionStatus} />
                      {isPlayable(s) && <span className="playable-dot">可播放</span>}
                    </div>
                    {s.provenance.sourceTitle && <p className="small">出处：{s.provenance.sourceTitle} {s.provenance.sourceDetail}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">暂无曲谱。</p>
            )}
            {st.literatureScoreCount === 0 && st.modelScoreCount === 0 && st.restoreScoreCount === 0 && (
              <AiPrompt tuneId={tune.id} hasDemo={st.demoScoreCount > 0} />
            )}
          </section>

          <section className="block">
            <h2>作者</h2>
            {st.authors.length ? (
              <ul className="author-list">
                {st.authors.map((a) => (
                  <li key={a.id}>
                    <Link to={`/library?q=${encodeURIComponent(a.name)}&field=author`} className="author-name">
                      {a.name}
                    </Link>
                    <span className="muted">
                      {a.period ?? a.dynasty} · {a.lifespan}
                    </span>
                    <p>{a.bio}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">暂无。</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
