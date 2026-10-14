import { ensureDatabase } from '../src/db/create-database.js';
import { createPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { TEST_DATABASE_URL } from './env.js';

export async function setup(): Promise<void> {
  await ensureDatabase(TEST_DATABASE_URL);
  const pool = createPool(TEST_DATABASE_URL);
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
