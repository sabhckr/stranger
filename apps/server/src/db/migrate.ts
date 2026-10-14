import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool } from './pool.js';
import { loadDotEnv } from '../config.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);
const LOCK_KEY = 7_432_111;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/** Apply every `migrations/*.sql` file in lexical order, once, inside a transaction each. */
export async function runMigrations(
  pool: pg.Pool,
  dir: string = MIGRATIONS_DIR,
): Promise<MigrationResult> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const client = await pool.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );
    for (const file of files) {
      if (done.has(file)) {
        result.skipped.push(file);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        result.applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  return result;
}

/** Names of migration files not yet recorded in schema_migrations (empty when up to date). */
export async function pendingMigrations(
  pool: pg.Pool,
  dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const exists = await pool.query<{ ok: boolean }>(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`,
  );
  if (!exists.rows[0]?.ok) return files;
  const done = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
      (r) => r.name,
    ),
  );
  return files.filter((f) => !done.has(f));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  loadDotEnv();
  const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/stranger';
  const pool = createPool(url);
  runMigrations(pool)
    .then((r) => {
      console.warn(
        `migrations applied: ${r.applied.length ? r.applied.join(', ') : 'none'}; already present: ${r.skipped.length}`,
      );
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
      return pool.end();
    });
}
