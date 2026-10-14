import { describe, expect, it } from 'vitest';
import { SEO_PAGES, seoPageFor } from './pages.js';
import { headFor, canonicalFor, jsonLdForPage } from './head.js';
import { routeFor } from '../router.js';

describe('SEO pages', () => {
  it('have unique slugs, sane title/description lengths and real content', () => {
    const slugs = new Set(SEO_PAGES.map((p) => p.slug));
    expect(slugs.size).toBe(SEO_PAGES.length);
    for (const p of SEO_PAGES) {
      expect(p.path).toBe(`/${p.slug}`);
      expect(p.title.length).toBeLessThanOrEqual(65);
      expect(p.description.length).toBeGreaterThanOrEqual(80);
      expect(p.description.length).toBeLessThanOrEqual(170);
      expect(p.sections.length).toBeGreaterThanOrEqual(3);
      const words = [p.intro, ...p.sections.flatMap((s) => [...s.paragraphs, ...(s.bullets ?? [])])]
        .join(' ')
        .split(/\s+/).length;
      expect(words).toBeGreaterThan(200);
    }
    expect(SEO_PAGES.map((p) => p.slug)).toEqual([
      'stranger-chat',
      'stranger-talk',
      'talk-to-strangers',
      'random-video-chat',
      'omegle-alternative',
    ]);
  });

  it('resolve from paths and routes', () => {
    expect(seoPageFor('/stranger-talk/')?.slug).toBe('stranger-talk');
    expect(seoPageFor('/nope')).toBeUndefined();
    expect(routeFor('/omegle-alternative', '')).toBe('landing:omegle-alternative');
    expect(routeFor('/stranger/stranger-chat', '/stranger')).toBe('landing:stranger-chat');
    const head = headFor('landing:stranger-chat');
    expect(head.title).toMatch(/Stranger Chat/);
    expect(head.robots).toMatch(/^index/);
    expect(headFor('chat').robots).toMatch(/noindex/);
  });

  it('builds canonical URLs and structured data', () => {
    expect(canonicalFor('https://x.example/stranger/', '/')).toBe('https://x.example/stranger/');
    expect(canonicalFor('https://x.example/', '/stranger-talk')).toBe(
      'https://x.example/stranger-talk',
    );
    const ld = jsonLdForPage('https://x.example/', SEO_PAGES[4]!) as Array<{ '@type': string }>;
    expect(ld.map((x) => x['@type'])).toEqual(['WebPage', 'BreadcrumbList', 'FAQPage']);
  });
});
