import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const ADMIN = 'e2e-admin-token';
export const API = 'http://localhost:8080';

export async function openUser(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await context.grantPermissions(['camera', 'microphone']);
  const page = await context.newPage();
  await page.goto('/');
  await acceptGate(page);
  return { context, page };
}

export async function acceptGate(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /before you start/i });
  await expect(dialog).toBeVisible();
  const enter = dialog.getByRole('button', { name: /enter stranger/i });
  await expect(enter).toBeDisabled();
  await dialog.getByLabel(/18 years of age/i).check();
  await dialog.getByLabel(/I agree to the/i).check();
  await enter.click();
  await expect(dialog).toBeHidden();
}

export async function addInterest(page: Page, interest: string): Promise<void> {
  const input = page.getByLabel(/interests/i);
  await input.fill(interest);
  await input.press('Enter');
  await expect(page.locator('.chip', { hasText: interest.toLowerCase() })).toBeVisible();
}

export async function start(page: Page, mode: 'text' | 'video'): Promise<void> {
  await expect(page.locator('.pill', { hasText: /online/ })).toBeVisible();
  if (mode === 'video') await page.getByRole('radio', { name: /video chat/i }).click();
  await page.getByTestId('start').click();
  await expect(page).toHaveURL(/\/chat$/);
}

export function status(page: Page) {
  return page.getByTestId('status-text');
}

export function composer(page: Page) {
  return page.getByRole('textbox', { name: 'Message' });
}

export async function send(page: Page, text: string): Promise<void> {
  const box = composer(page);
  await box.fill(text);
  await box.press('Enter');
}

export async function adminFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${ADMIN}`,
      'content-type': 'application/json',
    },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
