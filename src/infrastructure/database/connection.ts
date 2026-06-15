// PostgreSQL connection pool

import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://shanti:shanti123@localhost:5432/shanti_food';

// Disable SSL for local/internal hosts; enable only for real production platforms
const isLocalOrDocker =
  !process.env.DATABASE_URL ||
  /localhost|127\.0\.0\.1|db|postgres/.test(process.env.DATABASE_URL ?? '');

export const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' && !isLocalOrDocker
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected PostgreSQL error', err);
  process.exit(-1);
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const { rows } = await pool.query(text, params);
  return rows as T[];
}

export async function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}
