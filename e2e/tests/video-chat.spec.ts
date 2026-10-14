import { expect, test } from '@playwright/test';
import { openUser, send, start, status } from './helpers.js';

test.describe('video chat', () => {
  test('two strangers exchange live video over WebRTC', async ({ browser }) => {
    const a = await openUser(browser);
    const b = await openUser(browser);

    await start(a.page, 'video');
    await expect(a.page.getByTestId('local-video')).toBeVisible();
    await expect(
      a.page
        .getByRole('status')
        .filter({ hasText: /looking for someone/i })
        .first(),
    ).toBeVisible();

    await start(b.page, 'video');
    await expect(status(a.page)).toHaveText(/connected to a stranger/i);
    await expect(status(b.page)).toHaveText(/connected to a stranger/i);

    for (const p of [a.page, b.page]) {
      await expect(p.locator('.pill', { hasText: 'Video connected' })).toBeVisible({
        timeout: 30_000,
      });
      // wait until real frames are decoded from the remote track
      await expect
        .poll(
          () =>
            p
              .getByTestId('remote-video')
              .evaluate((v: HTMLVideoElement) => v.videoWidth * v.videoHeight),
          { timeout: 30_000, message: 'remote video should decode frames' },
        )
        .toBeGreaterThan(0);
      const remoteTracks = await p.getByTestId('remote-video').evaluate((v: HTMLVideoElement) =>
        (v.srcObject as MediaStream)
          .getTracks()
          .map((t) => `${t.kind}:${t.readyState}`)
          .sort(),
      );
      expect(remoteTracks).toEqual(['audio:live', 'video:live']);
    }

    // text still works alongside video
    await send(a.page, 'can you see me?');
    await expect(b.page.locator('.msg-partner')).toHaveText(/can you see me\?/);

    // media controls are real toggles on the local tracks
    const mute = a.page.getByRole('button', { name: /mute microphone/i });
    await mute.click();
    await expect(a.page.getByRole('button', { name: /unmute microphone/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const audioEnabled = await a.page
      .getByTestId('local-video')
      .evaluate((v: HTMLVideoElement) =>
        (v.srcObject as MediaStream).getAudioTracks().map((t) => t.enabled),
      );
    expect(audioEnabled).toEqual([false]);

    // Next tears the peer connection down and re-queues
    await a.page.getByTestId('primary-action').click();
    await expect(status(b.page)).toHaveText(/chat ended/i);
    await expect(
      b.page
        .getByRole('status')
        .filter({ hasText: /stranger left/i })
        .first(),
    ).toBeVisible();
    await expect(status(a.page)).toHaveText(/looking for someone/i);

    await a.context.close();
    await b.context.close();
  });

  test('camera is released when leaving', async ({ browser }) => {
    const a = await openUser(browser);
    await start(a.page, 'video');
    const before = await a.page
      .getByTestId('local-video')
      .evaluate((v: HTMLVideoElement) =>
        (v.srcObject as MediaStream).getTracks().map((t) => t.readyState),
      );
    expect(before).toEqual(['live', 'live']);
    const handle = await a.page.evaluateHandle(
      () =>
        (document.querySelector('[data-testid=local-video]') as HTMLVideoElement)
          .srcObject as MediaStream,
    );
    await a.page.getByRole('button', { name: 'Leave' }).click();
    await expect(a.page).toHaveURL(/\/$/);
    const after = await handle.evaluate((s: MediaStream) => s.getTracks().map((t) => t.readyState));
    expect(after).toEqual(['ended', 'ended']);
    await a.context.close();
  });
});
