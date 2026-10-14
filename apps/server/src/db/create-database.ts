import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseNameFromUrl } from './pool.js';
import { loadDotEnv } from '../config.js';

/** Create the database named in `connectionString` if it does not exist (connects to `postgres`). */
export async function ensureDatabase(connectionString: string): Promise<boolean> {
  const name = databaseNameFromUrl(connectionString);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Unsafe database name: ${name}`);
  const admin = new URL(connectionString);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount) return false;
    await client.query(`CREATE DATABASE "${name}"`);
    return true;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  loadDotEnv();
  const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/stranger';
  ensureDatabase(url)
    .then((created) =>
      console.warn(
        created ? `created database ${databaseNameFromUrl(url)}` : 'database already exists',
      ),
    )
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
