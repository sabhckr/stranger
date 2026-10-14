import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the real server (Redis + Postgres) and the Vite dev server.
 * Chrome's fake media devices stand in for a camera and microphone.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://localhost:5432/stranger_e2e';
const E2E_REDIS = process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:6379/2';
export const E2E_ADMIN_TOKEN = 'e2e-admin-token';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'npm run build:protocol && npm run start:e2e -w apps/server',
      cwd: '..',
      url: 'http://localhost:8080/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        PORT: '8080',
        HOST: '127.0.0.1',
        LOG_LEVEL: 'warn',
        PUBLIC_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
        DATABASE_URL: E2E_DB,
        REDIS_URL: E2E_REDIS,
        IDENTITY_SECRET: 'e2e-identity-secret-0123456789abcdef',
        ADMIN_TOKEN: E2E_ADMIN_TOKEN,
        MATCH_FALLBACK_MS: '500',
        MATCH_SWEEP_INTERVAL_MS: '200',
        MATCH_REMATCH_GRACE_MS: '0',
        MAX_CONNECTIONS_PER_IP: '50',
        REPORT_AUTOBAN_THRESHOLD: '2',
      },
    },
    {
      command: 'npm run dev -w apps/web',
      cwd: '..',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
