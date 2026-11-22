import { Link } from 'react-router-dom';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-motto">依谱寻声，使旧词可听。</p>
        <p>
          当前为前端演示版本。演示、模型预测和唱词清理都会标明来源，都不是已审定的文献译谱。
          <Link to="/about">数据说明</Link>
        </p>
        <p className="site-footer-small">
          字体：思源宋体、霞鹜文楷（SIL OFL）· 音色：开源乐器采样 ·{' '}
          <a href="https://github.com/07Leten/hesiyi" target="_blank" rel="noreferrer">
            源代码
          </a>
        </p>
      </div>
    </footer>
  );
}
