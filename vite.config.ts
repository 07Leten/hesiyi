import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 相对路径 + Hash 路由，便于部署到 GitHub Pages 等任意子路径
export default defineConfig({
  base: './',
  plugins: [react()],
});
