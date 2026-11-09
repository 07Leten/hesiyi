import type { ToneInfo } from '../../data/types';

const POS: Record<string, string> = { 平: 'll', 上: 'ul', 去: 'ur', 入: 'lr' };

/**
 * 四声圈发：在字的四角加小圈标示声调——
 * 平声左下、上声左上、去声右上、入声右下。
 */
export function ToneMark({ tone }: { tone: ToneInfo | null | undefined }) {
  if (!tone) return null;
  return (
    <span
      className={`tone-mark tone-${POS[tone.category]}`}
      title={`${tone.category}声 · ${tone.system}${tone.confidence === 'demo' ? '（演示标注，待校）' : ''}`}
      aria-label={`${tone.category}声`}
    />
  );
}
