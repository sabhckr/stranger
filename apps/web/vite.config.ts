/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { jsonLdForHome } from './src/seo/head.ts';

const serverTarget = process.env.VITE_DEV_SERVER_TARGET ?? 'http://localhost:8080';
const base = process.env.VITE_BASE ?? '/';
const siteUrl = (process.env.VITE_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
/**
 * Canonical URL of the landing page, always ending with "/". VITE_CANONICAL_ROOT lets a secondary
 * deployment (e.g. the full app on Render) point search engines at the primary copy of the site.
 */
const canonical = (process.env.VITE_CANONICAL_ROOT ?? '').trim()
  ? `${process.env.VITE_CANONICAL_ROOT!.trim().replace(/\/$/, '')}/`
  : `${siteUrl}${base.endsWith('/') ? base : `${base}/`}`;

/** Fills canonical/OG URLs and injects structured data into index.html (dev and build). */
function seoHtml(): Plugin {
  const jsonLd = jsonLdForHome(canonical);
  return {
    name: 'stranger-seo-html',
    transformIndexHtml(html) {
      return html
        .replaceAll('__CANONICAL__', canonical)
        .replace(
          '<!--JSONLD-->',
          `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
        );
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), seoHtml()],
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
