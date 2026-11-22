import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AiPrompt } from '../components/common/AiPrompt';
import { PoemRow } from '../components/common/PoemRow';
import { SearchBox } from '../components/common/SearchBox';
import { TuneCard } from '../components/common/TuneCard';
import { useRepo } from '../data/DataContext';
import type { LibraryQuery, ScoreFilter, SearchField } from '../data/repository';
import type { Dynasty, FormType } from '../data/types';

const DYNASTIES: Dynasty[] = ['唐', '五代', '宋', '明', '近现代'];
const FORMS: FormType[] = ['小令', '中调', '长调'];
const SCORE_OPTS: { v: ScoreFilter; label: string }[] = [
  { v: 'any', label: '不限' },
  { v: 'has', label: '已录入曲谱' },
  { v: 'literature', label: '有文献曲谱' },
  { v: 'model', label: '有模型预测谱' },
  { v: 'restore', label: '有唱词清理谱' },
  { v: 'none', label: '暂无曲谱' },
];

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function LibraryPage() {
  const repo = useRepo();
  const [sp, setSp] = useSearchParams();

  const query: LibraryQuery = {
    text: sp.get('q') ?? '',
    field: (sp.get('field') as SearchField) || 'all',
    dynasties: list(sp.get('dyn')) as Dynasty[],
    forms: list(sp.get('form')) as FormType[],
    minWords: Number(sp.get('min')) || undefined,
    maxWords: Number(sp.get('max')) || undefined,
    score: (sp.get('score') as ScoreFilter) || 'any',
    playableOnly: sp.get('playable') === '1',
  };
  const tab = sp.get('tab') === 'poems' ? 'poems' : 'tunes';
  const result = useMemo(() => repo.search(query), [repo, sp]);

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };
  const toggleIn = (key: string, value: string, current: string[]) => {
    const set = new Set(current);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    patch({ [key]: [...set].join(',') || null });
  };

  const filtersActive = query.dynasties.length + query.forms.length > 0 || query.minWords || query.maxWords || query.score !== 'any' || query.playableOnly;
  const nothing = result.tunes.length === 0 && result.poems.length === 0;

  return (
    <div className="page library">
      <header className="page-head">
        <h1>词牌曲库</h1>
        <p>按词牌、作者或词作检索；左侧条件可以组合使用。</p>
      </header>

      <SearchBox
        key={`${query.text}|${query.field}`}
        initialText={query.text}
        initialField={query.field}
        onSearch={(text, field) => patch({ q: text || null, field: field === 'all' ? null : field })}
      />

      <div className="library-grid">
        <aside className="filters" aria-label="筛选条件">
          <fieldset>
            <legend>朝代</legend>
            <div className="chips">
              {DYNASTIES.map((d) => (
                <button key={d} type="button" className={`chip${query.dynasties.includes(d) ? ' is-on' : ''}`} aria-pressed={query.dynasties.includes(d)} onClick={() => toggleIn('dyn', d, query.dynasties)}>
                  {d}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>体式</legend>
            <div className="chips">
              {FORMS.map((f) => (
                <button key={f} type="button" className={`chip${query.forms.includes(f) ? ' is-on' : ''}`} aria-pressed={query.forms.includes(f)} onClick={() => toggleIn('form', f, query.forms)}>
                  {f}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>字数</legend>
            <div className="words-range">
              <input type="number" min={1} max={240} inputMode="numeric" placeholder="最少" value={sp.get('min') ?? ''} onChange={(e) => patch({ min: e.target.value || null })} aria-label="最少字数" />
              <span>至</span>
              <input type="number" min={1} max={240} inputMode="numeric" placeholder="最多" value={sp.get('max') ?? ''} onChange={(e) => patch({ max: e.target.value || null })} aria-label="最多字数" />
            </div>
          </fieldset>
          <fieldset>
            <legend>曲谱</legend>
            <div className="radios">
              {SCORE_OPTS.map((o) => (
                <label key={o.v}>
                  <input type="radio" name="score" checked={query.score === o.v} onChange={() => patch({ score: o.v === 'any' ? null : o.v })} />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>播放</legend>
            <label className="switch">
              <input type="checkbox" checked={query.playableOnly} onChange={(e) => patch({ playable: e.target.checked ? '1' : null })} />
              <span>只看可播放</span>
            </label>
          </fieldset>
          {filtersActive && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSp(query.text ? { q: query.text } : {}, { replace: true })}>
              清除筛选
            </button>
          )}
        </aside>

        <section className="results">
          <div className="tabs" role="tablist">
            <button role="tab" type="button" aria-selected={tab === 'tunes'} className={tab === 'tunes' ? 'is-on' : ''} onClick={() => patch({ tab: null })}>
              词牌 <em>{result.tunes.length}</em>
            </button>
            <button role="tab" type="button" aria-selected={tab === 'poems'} className={tab === 'poems' ? 'is-on' : ''} onClick={() => patch({ tab: 'poems' })}>
              词作 <em>{result.poems.length}</em>
            </button>
            <span className="tabs-note">
              演示、模型预测和唱词清理都会标明来源，都不是已审定的文献译谱 · <Link to="/about">说明</Link>
            </span>
          </div>

          {nothing ? (
            <div className="empty-block">
              <p>{query.text ? `没有找到与「${query.text}」相关的词牌或词作。` : '没有符合这些条件的词牌。'}</p>
              {filtersActive && <p className="muted">可以放宽左侧的筛选条件再试。</p>}
              {query.text && <AiPrompt title={query.text} />}
            </div>
          ) : tab === 'tunes' ? (
            result.tunes.length ? (
              <div className="tune-grid">
                {result.tunes.map((t) => (
                  <TuneCard key={t.id} tune={t} />
                ))}
              </div>
            ) : (
              <p className="empty-line">没有匹配的词牌，但有 {result.poems.length} 首词作符合条件，请切换到「词作」。</p>
            )
          ) : result.poems.length ? (
            <div className="poem-list">
              {result.poems.map((p) => (
                <PoemRow key={p.id} poem={p} />
              ))}
            </div>
          ) : (
            <p className="empty-line">没有匹配的词作。</p>
          )}
        </section>
      </div>
    </div>
  );
}
