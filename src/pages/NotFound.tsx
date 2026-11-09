import { Link } from 'react-router-dom';

export function NotFound({ what = '页面' }: { what?: string }) {
  return (
    <div className="page empty-page">
      <p className="empty-glyph" aria-hidden="true">阙</p>
      <h1>这个{what}不存在</h1>
      <p>链接可能有误，或数据尚未导入。</p>
      <Link className="btn btn-ghost" to="/library">
        回到词牌曲库
      </Link>
    </div>
  );
}
