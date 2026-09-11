import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Express server serves static files from <project>/public and proxies
// nothing in production. In dev, Vite serves the app and proxies /api to the
// Express server (default port 8090 — matches the project's .env).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Emit the production bundle where the Express server already serves from.
    outDir: '../public',
    emptyOutDir: true,
  },
});
