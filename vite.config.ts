import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/web' },
  server: {
    port: 5175,
    strictPort: true,
    proxy: { '/api': process.env.API_URL ?? 'http://127.0.0.1:3002' },
  },
});
