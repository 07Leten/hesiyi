import type { DataOrigin, RevisionStatus } from '../../data/types';

const ORIGIN: Record<DataOrigin, { label: string; title: string }> = {
  literature: { label: '文献曲谱', title: '来源于历史文献的译谱' },
  demo: { label: '演示', title: '演示数据：仅用于展示功能，不是历史文献' },
  ai: { label: 'AI 创作', title: '由音乐生成模型创作的现代作品，不是历史文献' },
  rule: { label: '规则生成 · 非 AI', title: '浏览器内按规则排布的旋律，既非 AI 也非文献' },
};

export function OriginBadge({ origin, short }: { origin: DataOrigin; short?: boolean }) {
  const o = ORIGIN[origin];
  return (
    <span className={`badge badge-${origin}`} title={o.title}>
      {short && origin === 'rule' ? '规则生成' : o.label}
    </span>
  );
}

const REVISION: Record<RevisionStatus, string> = {
  unverified: '未校订',
  draft: '初稿',
  proofread: '已校对',
  verified: '已审定',
};

export function RevisionBadge({ status }: { status: RevisionStatus }) {
  return <span className={`badge badge-rev badge-rev-${status}`}>{REVISION[status]}</span>;
}

export function revisionLabel(status: RevisionStatus) {
  return REVISION[status];
}
