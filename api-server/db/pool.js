import pg from 'pg';
import { cognitoConfig } from '../cognitoConfig.js';

const { Pool } = pg;

function buildPoolConfig() {
  const host = process.env.RDS_HOST || process.env.PGHOST;
  const port = Number(process.env.RDS_PORT || process.env.PGPORT || 5432);
  const database = process.env.RDS_DATABASE || process.env.PGDATABASE || 'interviewxpert';
  const user = process.env.RDS_USER || process.env.PGUSER || 'ixpadmin';
  const password = process.env.RDS_PASSWORD || process.env.PGPASSWORD;

  // Prefer discrete fields — DATABASE_URL breaks when passwords contain URL-reserved chars.
  if (host && password) {
    return {
      host,
      port,
      database,
      user,
      password,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 15000,
    };
  }

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 15000,
    };
  }

  return null;
}

const poolConfig = buildPoolConfig();

export const pool = poolConfig ? new Pool(poolConfig) : null;

if (pool) {
  pool.on('error', (err) => {
    console.error('⚠️ Unexpected error on idle PostgreSQL client in pool:', err.message || err);
  });
}

export function dbReady() {
  return Boolean(pool);
}

export async function query(text, params = []) {
  if (!pool) {
    throw new Error('PostgreSQL pool is not configured. Set RDS_HOST/RDS_PASSWORD or DATABASE_URL.');
  }
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  if (!pool) throw new Error('PostgreSQL pool is not configured.');
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

export async function pingDb() {
  if (!pool) return { ok: false, reason: 'not_configured' };
  try {
    const res = await pool.query('SELECT NOW() AS now, current_database() AS db');
    return { ok: true, now: res.rows[0].now, database: res.rows[0].db, region: cognitoConfig.region };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
