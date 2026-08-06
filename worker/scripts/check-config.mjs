import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
const schema = await readFile(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const required = [
  'name = "moments-cf"',
  'main = "src/index.js"',
  'compatibility_date = "2026-08-06"',
  '[assets]',
  'directory = "../front/.output/public"',
  'not_found_handling = "single-page-application"',
  'binding = "DB"',
  'database_name = "moments-db"',
  'database_id = "b7fd8fd7-1095-412f-99ad-90efb0a3ce08"',
  'migrations_dir = "migrations"',
  'binding = "MEDIA"',
  'bucket_name = "moments-media"',
];
const missing = required.filter(value => !config.includes(value));
if (missing.length) throw new Error(`wrangler.toml is missing: ${missing.join(', ')}`);

for (const table of ['CREATE TABLE IF NOT EXISTS users', 'CREATE TABLE IF NOT EXISTS sys_config', 'CREATE TABLE IF NOT EXISTS media']) {
  if (!schema.includes(table)) throw new Error(`schema is missing required table: ${table}`);
}

for (const secret of ['JWT_SECRET', 'INIT_SECRET']) {
  if (new RegExp(`^${secret}\\s*=`, 'm').test(config)) {
    throw new Error(`${secret} must be a Cloudflare secret, not a committed wrangler.toml value.`);
  }
}

console.log('Phase 2 Worker configuration guard: PASS');
