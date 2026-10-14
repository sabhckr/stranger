// Renders apps/web/public/og.png (1200x630) and apple-touch-icon.png (180x180) with Chrome.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, '../../apps/web/scripts');
const out = path.resolve(here, '../../apps/web/public');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
try {
  const og = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await og.goto(pathToFileURL(path.join(scripts, 'og.html')).href);
  await og.screenshot({ path: path.join(out, 'og.png'), type: 'png' });
  const icon = await browser.newPage({
    viewport: { width: 180, height: 180 },
    deviceScaleFactor: 1,
  });
  await icon.goto(pathToFileURL(path.join(scripts, 'icon.html')).href);
  await icon.screenshot({ path: path.join(out, 'apple-touch-icon.png'), type: 'png' });
  console.log('wrote og.png and apple-touch-icon.png');
} finally {
  await browser.close();
}
