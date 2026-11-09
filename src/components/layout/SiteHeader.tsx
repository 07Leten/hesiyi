import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Seal } from '../common/Seal';

const NAV = [
  { to: '/', label: '首页', end: true },
  { to: '/library', label: '词牌曲库' },
  { to: '/learn', label: '曲谱学习' },
  { to: '/create', label: '音乐创作' },
  { to: '/about', label: '关于' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand" aria-label="合四一 首页">
          <Seal size={40} />
          <span className="brand-text">
            <b>合四一</b>
            <small>古典词乐</small>
          </span>
        </Link>
        <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '目录'}
        </button>
        <nav id="site-nav" className={`site-nav${open ? ' is-open' : ''}`} aria-label="主导航">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
