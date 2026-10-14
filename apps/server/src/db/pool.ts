import pg from 'pg';

export type DbPool = pg.Pool;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'stranger',
  });
}

/** Parse the database name out of a postgres:// URL. */
export function databaseNameFromUrl(connectionString: string): string {
  const url = new URL(connectionString);
  const name = url.pathname.replace(/^\//, '');
  if (!name) throw new Error(`DATABASE_URL has no database name: ${connectionString}`);
  return name;
}
