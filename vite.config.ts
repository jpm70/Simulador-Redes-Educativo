import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // GitHub Pages serves the app under /<repo>/ (project page)
    base: process.env.GITHUB_PAGES ? '/Simulador-Redes-Educativo/' : '/',
    plugins: [react(), tailwindcss()],
    build: {
      // recharts alone is ~400 kB; one bundle is fine for a static page
      chunkSizeWarningLimit: 1200,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
  };
});
