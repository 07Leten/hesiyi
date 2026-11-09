import { Link } from 'react-router-dom';

interface Props {
  tuneId?: string;
  poemId?: string;
  title?: string;
  hasDemo?: boolean;
}

/** 无历史曲谱时的创作引导 */
export function AiPrompt({ tuneId, poemId, title, hasDemo }: Props) {
  const q = new URLSearchParams();
  if (tuneId) q.set('tune', tuneId);
  if (poemId) q.set('poem', poemId);
  if (title && !tuneId && !poemId) q.set('title', title);
  return (
    <div className="ai-prompt">
      <p>
        暂未收录该词牌的历史曲谱{hasDemo ? '（现有曲谱仅为演示旋律）' : ''}，是否尝试 AI 音乐创作？
      </p>
      <p className="ai-prompt-note">创作结果会明确标记为现代作品，不会与文献曲谱混同。</p>
      <Link className="btn btn-ghost" to={`/create${q.toString() ? `?${q}` : ''}`}>
        去音乐创作
      </Link>
    </div>
  );
}
