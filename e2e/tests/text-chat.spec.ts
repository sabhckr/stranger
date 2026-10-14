import { expect, test } from '@playwright/test';
import { addInterest, adminFetch, composer, openUser, send, start, status } from './helpers.js';

test.describe('text chat', () => {
  test('two strangers with a shared interest meet, chat, skip, and report', async ({ browser }) => {
    const a = await openUser(browser);
    const b = await openUser(browser);

    await addInterest(a.page, 'Music');
    await start(a.page, 'text');
    await expect(status(a.page)).toHaveText(/looking for someone/i);

    await addInterest(b.page, 'music');
    await addInterest(b.page, 'films');
    await start(b.page, 'text');

    await expect(status(a.page)).toHaveText(/connected to a stranger/i);
    await expect(status(b.page)).toHaveText(/connected to a stranger/i);
    await expect(a.page.locator('.pill-accent')).toHaveText('music');
    await expect(a.page.locator('.msg-system').first()).toContainText('You both like music');

    await send(a.page, 'hello from A');
    await expect(b.page.locator('.msg-partner')).toHaveText(/hello from A/);
    await expect(a.page.locator('.msg-me')).toHaveText(/hello from A/);

    const box = composer(b.page);
    await box.fill('typing…');
    await expect(a.page.locator('.typing')).toHaveText(/stranger is typing/i);
    await box.press('Enter');
    await expect(a.page.locator('.msg-partner')).toHaveText(/typing…/);
    await expect(a.page.locator('.typing')).toHaveText('');

    // A skips: B is told, A searches again
    await a.page.getByTestId('primary-action').click();
    await expect(b.page.locator('.msg-system').last()).toHaveText(/stranger has left/i);
    await expect(status(b.page)).toHaveText(/chat ended/i);
    await expect(status(a.page)).toHaveText(/looking for someone/i);
    await expect(composer(b.page)).toBeDisabled();

    // B starts a new chat and is paired with A again (nobody else online, grace = 0 in e2e)
    await b.page.getByTestId('primary-action').click();
    await expect(status(a.page)).toHaveText(/connected to a stranger/i);
    await expect(status(b.page)).toHaveText(/connected to a stranger/i);

    // a message in the new chat, so the report carries a transcript of *this* conversation
    await send(a.page, 'buy my crypto course');
    await expect(b.page.locator('.msg-partner')).toHaveText(/crypto course/);

    // B reports A (also blocks by default)
    await b.page.getByTestId('report').click();
    const dialog = b.page.getByRole('dialog', { name: /report this stranger/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/spam, scams/i).check();
    await dialog.getByRole('textbox', { name: /details/i }).fill('kept sending links');
    await dialog.getByTestId('report-submit').click();
    await expect(
      b.page.getByRole('status').filter({ hasText: /report has been received/i }),
    ).toBeVisible();
    await expect(status(b.page)).toHaveText(/chat ended/i);
    await expect(a.page.locator('.msg-system').last()).toHaveText(/stranger has disconnected/i);

    const reports = await adminFetch('/api/admin/reports?status=open');
    expect(reports.status).toBe(200);
    const list = reports.body.reports as Array<{
      reason: string;
      details: string;
      transcript: unknown[];
    }>;
    const ours = list.find((r) => r.details === 'kept sending links');
    expect(ours?.reason).toBe('spam');
    expect(ours?.transcript).toEqual([
      expect.objectContaining({ from: 'partner', text: 'buy my crypto course' }),
    ]);

    // Blocked: searching again never pairs them
    await a.page.getByTestId('primary-action').click();
    await b.page.getByTestId('primary-action').click();
    await expect(status(a.page)).toHaveText(/looking for someone/i);
    await b.page.waitForTimeout(2000);
    await expect(status(a.page)).toHaveText(/looking for someone/i);
    await expect(status(b.page)).toHaveText(/looking for someone/i);

    await a.context.close();
    await b.context.close();
  });

  test('Stop ends the chat for both sides and Leave returns home', async ({ browser }) => {
    const a = await openUser(browser);
    const b = await openUser(browser);
    await start(a.page, 'text');
    await start(b.page, 'text');
    await expect(status(a.page)).toHaveText(/connected/i);
    await a.page.getByTestId('stop').click();
    await expect(status(a.page)).toHaveText(/chat ended/i);
    await expect(status(b.page)).toHaveText(/chat ended/i);
    await a.page.getByRole('button', { name: 'Leave' }).click();
    await expect(a.page).toHaveURL(/\/$/);
    await expect(a.page.getByRole('heading', { level: 1 })).toContainText('Talk to');
    await a.context.close();
    await b.context.close();
  });

  test('is keyboard operable and labelled', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');
    // consent via keyboard only
    await page.keyboard.press('Space'); // first checkbox is auto-focused
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // past the three legal links
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('radiogroup', { name: /how do you want to chat/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /text chat/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('button', { name: /start text chat/i })).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await context.close();
  });
});
