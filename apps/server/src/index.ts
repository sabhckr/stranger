import { loadConfig, loadDotEnv } from './config.js';
import { createLogger } from './logger.js';
import { buildApp } from './app.js';
import { pendingMigrations } from './db/migrate.js';

async function main(): Promise<void> {
  const envFile = loadDotEnv();
  const config = loadConfig();
  const log = createLogger(config);
  if (envFile) log.info({ envFile }, 'loaded environment file');

  const app = await buildApp(config, log);
  const pending = await pendingMigrations(app.pool);
  if (pending.length > 0) {
    log.fatal({ pending }, 'database migrations are pending — run `npm run db:migrate`');
    await app.stop();
    process.exit(1);
  }

  // Report retention job: once at boot, then daily.
  const purge = async (): Promise<void> => {
    const n = await app.reports
      .purgeOlderThan(config.REPORT_RETENTION_DAYS)
      .catch((err: unknown) => {
        log.warn({ err }, 'report purge failed');
        return 0;
      });
    if (n > 0) log.info({ deleted: n }, 'purged expired reports');
  };
  await purge();
  setInterval(() => void purge(), 24 * 3600 * 1000).unref();

  await app.start();

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    try {
      await app.stop();
      process.exit(0);
    } catch (err) {
      log.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
