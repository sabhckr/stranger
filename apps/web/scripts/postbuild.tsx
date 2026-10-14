/**
 * Runs after `vite build`:
 *  - pre-renders the home page, every keyword landing page and the legal pages to static HTML with
 *    their own title, description, canonical, Open Graph and structured data (SEO without JS)
 *  - writes robots.txt and sitemap.xml for the configured site URL
 *  - copies the home page to 404.html so GitHub Pages serves the SPA for unknown routes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticLanding } from '../src/seo/StaticLanding.js';
import { SeoLanding } from '../src/components/SeoLanding.js';
import { PrivacyPage, SafetyPage, TermsPage } from '../src/components/LegalPages.js';
import { SEO_PAGES } from '../src/seo/pages.js';
import { canonicalFor, headFor, jsonLdForHome, jsonLdForPage } from '../src/seo/head.js';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const base = process.env.VITE_BASE ?? '/';
const siteUrl = (process.env.VITE_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const canonicalOverride = (process.env.VITE_CANONICAL_ROOT ?? '').trim();
const siteRoot = canonicalOverride
  ? `${canonicalOverride.replace(/\/$/, '')}/`
  : `${siteUrl}${base.endsWith('/') ? base : `${base}/`}`;

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const marker = '<div id="root"></div>';
if (!template.includes(marker))
  throw new Error('postbuild: #root marker not found in dist/index.html');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function renderPage(opts: {
  title: string;
  description: string;
  path: string;
  robots: string;
  jsonLd: unknown[];
  body: string;
}): string {
  const canonical = canonicalFor(siteRoot, opts.path);
  const short = opts.title.replace(/ \| STRANGER$/, '');
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(opts.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(opts.description)}$2`)
    .replace(/(<meta name="robots" content=")[^"]*(")/, `$1${opts.robots}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(short)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(opts.description)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(short)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(opts.description)}$2`)
    .replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>`,
    )
    .replace(marker, `<div id="root">${opts.body}</div>`);
}

function writePage(appPath: string, html: string): void {
  const dir = appPath === '/' ? dist : path.join(dist, appPath.replace(/^\//, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

// Home
const home = headFor('home');
const homeHtml = renderPage({
  ...home,
  jsonLd: jsonLdForHome(siteRoot),
  body: renderToStaticMarkup(<StaticLanding />),
});
writePage('/', homeHtml);
fs.writeFileSync(path.join(dist, '404.html'), homeHtml);

// Keyword landing pages
for (const page of SEO_PAGES) {
  const head = headFor(`landing:${page.slug}`);
  writePage(
    page.path,
    renderPage({
      ...head,
      jsonLd: jsonLdForPage(siteRoot, page),
      body: renderToStaticMarkup(<SeoLanding page={page} onlineCount={0} connection="idle" />),
    }),
  );
}

// Legal pages
const legal: Array<[string, () => React.JSX.Element]> = [
  ['terms', TermsPage],
  ['privacy', PrivacyPage],
  ['safety', SafetyPage],
];
for (const [route, Component] of legal) {
  const head = headFor(route);
  writePage(
    head.path,
    renderPage({
      ...head,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: head.title,
          url: canonicalFor(siteRoot, head.path),
          isPartOf: { '@type': 'WebSite', name: 'STRANGER', url: siteRoot },
        },
      ],
      body: renderToStaticMarkup(<Component />),
    }),
  );
}

// Sitemap + robots
const today = new Date().toISOString().slice(0, 10);
const entries: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  ...SEO_PAGES.map((p) => ({ path: p.path, priority: '0.8', changefreq: 'monthly' })),
  { path: '/safety', priority: '0.5', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${canonicalFor(siteRoot, e.path)}</loc><lastmod>${today}</lastmod><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap);
const basePath = base.replace(/\/$/, '');
fs.writeFileSync(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: ${basePath}/chat\nDisallow: ${basePath}/admin\n\nSitemap: ${canonicalFor(siteRoot, '/sitemap.xml')}\n`,
);
console.warn(
  `postbuild: prerendered ${1 + SEO_PAGES.length + legal.length} pages, sitemap and robots for ${siteRoot}`,
);
