import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import '../cognitoConfig.js';
import { pool, pingDb } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!pool) {
    console.error('Missing DB config. Set RDS_HOST + RDS_PASSWORD (or DATABASE_URL) in .env');
    process.exit(1);
  }

  const ping = await pingDb();
  if (!ping.ok) {
    console.error('Cannot connect to Postgres:', ping.reason);
    process.exit(1);
  }
  console.log(`Connected to ${ping.database} @ ${ping.now}`);

  const schemaPath = resolve(__dirname, 'schema.sql');
  if (!existsSync(schemaPath)) {
    console.error('schema.sql missing');
    process.exit(1);
  }

  const sql = readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('Schema applied successfully.');
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try { await pool?.end(); } catch {}
  process.exit(1);
});
