/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { FAQ } from './src/seo/faq';

const serverTarget = process.env.VITE_DEV_SERVER_TARGET ?? 'http://localhost:8080';
const base = process.env.VITE_BASE ?? '/';
const siteUrl = (process.env.VITE_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
/** Canonical URL of the landing page, always ending with "/". */
const canonical = `${siteUrl}${base.endsWith('/') ? base : `${base}/`}`;

/** Fills canonical/OG URLs and injects structured data into index.html (dev and build). */
function seoHtml(): Plugin {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'STRANGER',
      url: canonical,
      inLanguage: 'en',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'STRANGER – stranger chat',
      url: canonical,
      applicationCategory: 'CommunicationApplication',
      operatingSystem: 'Web',
      browserRequirements: 'Requires JavaScript. Video chat requires a camera and WebRTC.',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description:
        'Free anonymous stranger chat: talk to strangers by text or video, match by shared interests, skip anytime. No sign-up, nothing stored, adults only.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];
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
