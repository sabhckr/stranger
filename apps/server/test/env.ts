export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1';
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/stranger_test';

export const baseTestEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '0',
  LOG_LEVEL: 'silent',
  PUBLIC_ORIGINS: 'http://localhost:5173',
  REDIS_URL: TEST_REDIS_URL,
  DATABASE_URL: TEST_DATABASE_URL,
  IDENTITY_SECRET: 'test-identity-secret-0123456789abcdef',
  ADMIN_TOKEN: 'test-admin-token',
  MATCH_FALLBACK_MS: '300',
  MATCH_SWEEP_INTERVAL_MS: '100',
  MATCH_REMATCH_GRACE_MS: '400',
  HANDSHAKE_TIMEOUT_MS: '2000',
};
