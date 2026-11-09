import { Fragment } from 'react';
import { isHanChar } from '../../data/notation/lyrics';
import type { LyricSyllable } from '../../data/types';
import { ToneMark } from './ToneMark';

interface Props {
  text: string;
  /** 正在演唱的字序号（仅汉字计数），-1 表示无 */
  activeSyllable?: number;
  syllables?: LyricSyllable[];
  showTones?: boolean;
  onCharClick?: (syllableIndex: number) => void;
  size?: 'md' | 'lg';
}

/** 一句一列时最多容纳的列数，超出则改为连续直排 */
const MAX_PHRASE_COLUMNS = 8;

const splitPhrases = (stanza: string) => stanza.match(/[^，。？！；]+[，。？！；]?/g) ?? [stanza];

/**
 * 竖排正文，配乌丝栏。句数少时一句一列；句数多时如古籍连续直排、满列换行。
 * 段落之间空一列。播放时当前字加朱圈，已唱过的字墨色加深。
 */
export function VerticalPoem({ text, activeSyllable = -1, syllables, showTones, onCharClick, size = 'md' }: Props) {
  const stanzas = text.split('\n');
  const phraseColumns = stanzas.reduce((n, s) => n + splitPhrases(s).length, stanzas.length - 1);
  const flow = phraseColumns > MAX_PHRASE_COLUMNS;
  let hanIndex = 0;
  return (
    <div className={`vpoem vpoem-${size}${flow ? ' is-flow' : ''}${activeSyllable >= 0 ? ' is-following' : ''}`}>
      {stanzas.map((stanza, si) => {
        const lines = flow ? [stanza] : splitPhrases(stanza);
        return (
          <Fragment key={si}>
            {si > 0 && <div className="vpoem-gap" aria-hidden="true" />}
            {lines.map((line, li) => (
              <p className="vpoem-line" key={li}>
                {[...line].map((c, ci) => {
                  if (!isHanChar(c)) return <span key={ci} className="vpoem-punct">{c}</span>;
                  const idx = hanIndex++;
                  const syl = syllables?.[idx];
                  const cls = ['vpoem-char'];
                  if (idx === activeSyllable) cls.push('is-active');
                  else if (activeSyllable >= 0 && idx < activeSyllable) cls.push('is-past');
                  return onCharClick && syl?.noteIds.length ? (
                    <button key={ci} type="button" className={cls.join(' ')} onClick={() => onCharClick(idx)} title="从此字开始播放">
                      {c}
                      {showTones && <ToneMark tone={syl.tone} />}
                    </button>
                  ) : (
                    <span key={ci} className={cls.join(' ')}>
                      {c}
                      {showTones && <ToneMark tone={syl?.tone} />}
                    </span>
                  );
                })}
              </p>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
