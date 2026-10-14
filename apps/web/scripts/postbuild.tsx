/**
 * Runs after `vite build`:
 *  - pre-renders the landing page markup into dist/index.html (SEO + link previews without JS)
 *  - writes robots.txt and sitemap.xml for the configured site URL
 *  - copies index.html to 404.html so GitHub Pages serves the SPA for client routes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticLanding } from '../src/seo/StaticLanding.js';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const base = process.env.VITE_BASE ?? '/';
const siteUrl = (process.env.VITE_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const root = `${siteUrl}${base.endsWith('/') ? base : `${base}/`}`;

const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const marker = '<div id="root"></div>';
if (!html.includes(marker)) throw new Error('postbuild: #root marker not found in dist/index.html');
html = html.replace(marker, `<div id="root">${renderToStaticMarkup(<StaticLanding />)}</div>`);
fs.writeFileSync(indexPath, html);
fs.writeFileSync(path.join(dist, '404.html'), html);

const today = new Date().toISOString().slice(0, 10);
const pages = ['', 'terms', 'privacy', 'safety'];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) =>
      `  <url><loc>${root}${p}</loc><lastmod>${today}</lastmod><changefreq>${p ? 'monthly' : 'weekly'}</changefreq><priority>${p ? '0.4' : '1.0'}</priority></url>`,
  )
  .join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap);
fs.writeFileSync(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: ${base.replace(/\/$/, '')}/chat\nDisallow: ${base.replace(/\/$/, '')}/admin\n\nSitemap: ${root}sitemap.xml\n`,
);
console.warn(`postbuild: prerendered landing, sitemap and robots for ${root}`);
