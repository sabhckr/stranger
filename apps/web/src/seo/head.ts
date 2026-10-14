import { BASE } from '../lib/base.js';
import { FAQ } from './faq.js';
import { SEO_PAGES, type SeoPage } from './pages.js';

export interface HeadData {
  title: string;
  description: string;
  /** App path without base, always starting with "/" */
  path: string;
  robots: string;
}

export const HOME_TITLE = 'Stranger Chat – Talk to Strangers Online Free | STRANGER';
export const HOME_DESCRIPTION =
  'STRANGER is a free anonymous stranger chat. Talk to strangers by text or video, match by shared interests and skip anytime. No sign-up, nothing stored, 18+.';
const INDEX = 'index, follow, max-image-preview:large';
const NOINDEX = 'noindex, nofollow';

const STATIC_HEADS: Record<string, HeadData> = {
  home: { title: HOME_TITLE, description: HOME_DESCRIPTION, path: '/', robots: INDEX },
  chat: {
    title: 'Chat – STRANGER',
    description: 'Live stranger chat session.',
    path: '/chat',
    robots: NOINDEX,
  },
  admin: {
    title: 'Moderation – STRANGER',
    description: 'Moderation console.',
    path: '/admin',
    robots: NOINDEX,
  },
  terms: {
    title: 'Terms of Service – STRANGER',
    description: 'Rules for using STRANGER, the free anonymous stranger chat.',
    path: '/terms',
    robots: INDEX,
  },
  privacy: {
    title: 'Privacy Policy – STRANGER',
    description:
      'What STRANGER does and does not store: no messages, no media, hashed identifiers only.',
    path: '/privacy',
    robots: INDEX,
  },
  safety: {
    title: 'Safety – STRANGER',
    description:
      'How to stay safe while talking to strangers online, and how reports and blocks work on STRANGER.',
    path: '/safety',
    robots: INDEX,
  },
  'not-found': {
    title: 'Page not found – STRANGER',
    description: 'This page does not exist.',
    path: '/',
    robots: NOINDEX,
  },
};

export function headFor(route: string): HeadData {
  if (route.startsWith('landing:')) {
    const slug = route.slice('landing:'.length);
    const page = SEO_PAGES.find((p) => p.slug === slug);
    if (page)
      return {
        title: `${page.title} | STRANGER`,
        description: page.description,
        path: page.path,
        robots: INDEX,
      };
  }
  return STATIC_HEADS[route] ?? STATIC_HEADS.home!;
}

/** Canonical absolute URL for an app path, given the site root (origin + base). */
export function canonicalFor(siteRoot: string, path: string): string {
  const root = siteRoot.replace(/\/$/, '');
  return path === '/' ? `${root}/` : `${root}${path}`;
}

function setMeta(selector: string, attr: 'content' | 'href', value: string): void {
  const el = document.head.querySelector<HTMLElement>(selector);
  if (el) el.setAttribute(attr, value);
}

/** Runtime head updates for client-side navigation. Pre-rendered pages ship the same values. */
export function applyHead(route: string): void {
  const head = headFor(route);
  const origin = window.location.origin;
  const canonical = canonicalFor(`${origin}${BASE}`, head.path);
  document.title = head.title;
  setMeta('meta[name="description"]', 'content', head.description);
  setMeta('link[rel="canonical"]', 'href', canonical);
  setMeta('meta[property="og:url"]', 'content', canonical);
  setMeta('meta[property="og:title"]', 'content', head.title.replace(/ \| STRANGER$/, ''));
  setMeta('meta[property="og:description"]', 'content', head.description);
  setMeta('meta[name="twitter:title"]', 'content', head.title.replace(/ \| STRANGER$/, ''));
  setMeta('meta[name="twitter:description"]', 'content', head.description);
  let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement('meta');
    robots.name = 'robots';
    document.head.appendChild(robots);
  }
  robots.content = head.robots;
}

/** Structured data for a keyword landing page (used at build time). */
export function jsonLdForPage(siteRoot: string, page: SeoPage): unknown[] {
  const url = canonicalFor(siteRoot, page.path);
  const home = canonicalFor(siteRoot, '/');
  const out: unknown[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      url,
      inLanguage: 'en',
      isPartOf: { '@type': 'WebSite', name: 'STRANGER', url: home },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'STRANGER', item: home },
        { '@type': 'ListItem', position: 2, name: page.h1, item: url },
      ],
    },
  ];
  if (page.faq?.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  return out;
}

/** Structured data for the home page (used by the Vite plugin and at build time). */
export function jsonLdForHome(siteRoot: string): unknown[] {
  const home = canonicalFor(siteRoot, '/');
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'STRANGER',
      url: home,
      inLanguage: 'en',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'STRANGER – stranger chat',
      url: home,
      applicationCategory: 'CommunicationApplication',
      operatingSystem: 'Web',
      browserRequirements: 'Requires JavaScript. Video chat requires a camera and WebRTC.',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description: HOME_DESCRIPTION,
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
}
