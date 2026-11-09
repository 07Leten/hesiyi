import type { MeterScheme } from '../../data/types';

const GLYPH: Record<string, string> = { 平: '○', 仄: '●', 中: '◐' };

/** 词谱式格律图：○ 平　● 仄　◐ 可平可仄 */
export function MeterView({ meter }: { meter: MeterScheme }) {
  return (
    <div className="meter">
      <p className="meter-desc">
        {meter.description}
        {!meter.verified && <span className="badge badge-rev badge-rev-unverified">待校</span>}
      </p>
      {meter.stanzas.map((st, si) => (
        <ol className="meter-stanza" key={si}>
          {st.map((line, li) => (
            <li key={li} className="meter-line">
              <span className="meter-glyphs" aria-label={line.pattern}>
                {[...line.pattern].map((c, ci) => (
                  <span key={ci} className={`mg mg-${c}`} title={c === '中' ? '可平可仄' : `${c}声`}>
                    {GLYPH[c] ?? c}
                  </span>
                ))}
              </span>
              <span className={`meter-mark mark-${line.mark}`}>{line.mark === 'rhyme' ? '韵' : line.mark === 'repeat' ? '叠' : '句'}</span>
            </li>
          ))}
        </ol>
      ))}
      <p className="meter-legend">○ 平　● 仄　◐ 可平可仄　·　{meter.rhymeNote}</p>
      <p className="meter-source">资料：{meter.source}</p>
    </div>
  );
}
