import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SiteFooter } from './components/layout/SiteFooter';
import { SiteHeader } from './components/layout/SiteHeader';
import { MiniPlayer } from './components/player/MiniPlayer';
import { DataProvider, useDataState } from './data/DataContext';
import { AboutPage } from './pages/AboutPage';
import { CreatePage } from './pages/CreatePage';
import { HomePage } from './pages/HomePage';
import { LearnPage } from './pages/LearnPage';
import { LibraryPage } from './pages/LibraryPage';
import { NotFound } from './pages/NotFound';
import { PoemPage } from './pages/PoemPage';
import { TunePage } from './pages/TunePage';
import { PlayerProvider } from './player/PlayerContext';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const data = useDataState();
  if (data.status === 'loading') {
    return (
      <div className="splash" role="status">
        <span className="splash-glyph">合</span>
        <span>正在展卷……</span>
      </div>
    );
  }
  if (data.status === 'error') {
    return (
      <div className="splash" role="alert">
        <span className="splash-glyph">阙</span>
        <span>曲库数据读取失败：{data.message}</span>
        <button type="button" className="btn btn-ghost" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    );
  }
  return (
    <PlayerProvider>
      <ScrollToTop />
      <SiteHeader />
      <main className="site-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/tune/:id" element={<TunePage />} />
          <Route path="/poem/:id" element={<PoemPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <SiteFooter />
      <MiniPlayer />
    </PlayerProvider>
  );
}

export function App() {
  return (
    <HashRouter>
      <DataProvider>
        <Shell />
      </DataProvider>
    </HashRouter>
  );
}
