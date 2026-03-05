/**
 * Run rbac_audit_log enhancement migration.
 * Requires: DATABASE_URL (Postgres connection string from Supabase Dashboard → Settings → Database).
 *
 * Usage from repo root:
 *   DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres' \
 *   npx ts-node --project scripts/tsconfig.json scripts/run-rbac-audit-migration.ts
 *
 * Or set DATABASE_URL in apps/web/.env.local and run:
 *   npx dotenv -e apps/web/.env.local -- npx ts-node --project scripts/tsconfig.json scripts/run-rbac-audit-migration.ts
 */

const { config } = require('dotenv');
const { resolve } = require('path');
const { readFileSync } = require('fs');

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), 'apps/web/.env.local') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in apps/web/.env.local or pass it when running.');
  console.error('Get it from Supabase Dashboard → Project Settings → Database → Connection string (URI).');
  process.exit(1);
}

async function main() {
  const pg = require('pg') as typeof import('pg');
  const sqlPath = resolve(process.cwd(), 'apps/web/app/lib/supabase/rbac-audit-log-enhance.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql);
    console.log('Migration rbac-audit-log-enhance.sql completed successfully.');
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
