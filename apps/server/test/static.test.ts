import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { startTestApp } from './helpers.js';
import { loadConfig } from '../src/config.js';
import { baseTestEnv } from './env.js';

describe('static web app serving (STATIC_DIR)', () => {
  let app: App;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stranger-static-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      '<!doctype html><title>STRANGER</title><div id="root"></div>',
    );
    fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
    fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\n');
    fs.mkdirSync(path.join(dir, 'stranger-talk'));
    fs.writeFileSync(
      path.join(dir, 'stranger-talk', 'index.html'),
      '<!doctype html><title>Stranger Talk</title><div id="root">prerendered</div>',
    );
    app = await startTestApp({ STATIC_DIR: dir, NODE_ID: 'static-node' });
    base = `http://127.0.0.1:${app.port}`;
  });
  afterAll(async () => {
    await app.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves the SPA for / and client routes, with a CSP', async () => {
    for (const p of ['/', '/chat', '/terms', '/admin']) {
      const res = await fetch(`${base}${p}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('<div id="root">');
    }
    const csp = (await fetch(`${base}/`)).headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('mediastream:');
  });

  it('serves pre-rendered nested pages and picks up rebuilt files without a restart', async () => {
    const res = await fetch(`${base}/stranger-talk`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Stranger Talk</title>');
    expect(await (await fetch(`${base}/stranger-talk/`)).text()).toContain('prerendered');
    expect(await (await fetch(`${base}/unknown-route`)).text()).toContain(
      '<title>STRANGER</title>',
    );
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      '<!doctype html><title>STRANGER v2</title><div id="root"></div>',
    );
    const future = Date.now() / 1000 + 5;
    fs.utimesSync(path.join(dir, 'index.html'), future, future);
    expect(await (await fetch(`${base}/unknown-route`)).text()).toContain('STRANGER v2');
  });

  it('serves hashed assets as immutable and plain files normally', async () => {
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await js.text()).toBe('console.log(1)');
    const robots = await fetch(`${base}/robots.txt`);
    expect(robots.status).toBe(200);
    expect(robots.headers.get('cache-control')).toBe('no-cache');
  });

  it('keeps API and missing-file 404s as JSON', async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    expect((await (await fetch(`${base}/api/nope`)).json()) as unknown).toEqual({
      error: 'not_found',
    });
    expect((await fetch(`${base}/missing.png`)).status).toBe(404);
    expect((await fetch(`${base}/chat`, { method: 'POST' })).status).toBe(404);
    expect(((await (await fetch(`${base}/healthz`)).json()) as { ok: boolean }).ok).toBe(true);
  });

  it('derives public origins from SITE_URL and RENDER_EXTERNAL_URL', () => {
    const c = loadConfig({
      ...baseTestEnv,
      PUBLIC_ORIGINS: '',
      SITE_URL: 'https://stranger.example/',
      RENDER_EXTERNAL_URL: 'https://stranger.onrender.com',
    });
    expect(c.PUBLIC_ORIGINS).toEqual(['https://stranger.example', 'https://stranger.onrender.com']);
    const prod = loadConfig({
      ...baseTestEnv,
      NODE_ENV: 'production',
      IDENTITY_SECRET: 'x'.repeat(40),
      PUBLIC_ORIGINS: '',
      RENDER_EXTERNAL_URL: 'https://stranger.onrender.com',
    });
    expect(prod.PUBLIC_ORIGINS).toEqual(['https://stranger.onrender.com']);
  });
});
