import pkg from 'pg';
const { Pool } = pkg;
import { config } from '../config/index.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export function toPgSql(sql: string): string {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(toPgSql(sql), params);
  return res.rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const res = await pool.query(toPgSql(sql), params);
  return res.rows[0] as T | undefined;
}

export async function execute(sql: string, params: any[] = []): Promise<{ rowCount: number | null }> {
  const res = await pool.query(toPgSql(sql), params);
  return { rowCount: res.rowCount };
}

export async function transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
