import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/700.css';
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/score.css';
import './styles/player.css';
import './styles/pages.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
