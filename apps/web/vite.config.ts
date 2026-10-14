/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverTarget = process.env.VITE_DEV_SERVER_TARGET ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: serverTarget, changeOrigin: false },
      '/ws': { target: serverTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: { sourcemap: true, target: 'es2022' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
