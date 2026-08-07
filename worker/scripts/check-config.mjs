import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
const schema = await readFile(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const memoSchema = await readFile(new URL('../migrations/0002_memos.sql', import.meta.url), 'utf8');
const phase4Schema = await readFile(new URL('../migrations/0003_comments_friends.sql', import.meta.url), 'utf8');
const phase5Schema = await readFile(new URL('../migrations/0004_like_counters.sql', import.meta.url), 'utf8');
const phase6Schema = await readFile(new URL('../migrations/0005_phase6_consistency_trash.sql', import.meta.url), 'utf8');
const phase7Schema = await readFile(new URL('../migrations/0006_phase7_media.sql', import.meta.url), 'utf8');
const phase8Schema = await readFile(new URL('../migrations/0007_migration_runs.sql', import.meta.url), 'utf8');
const phase9Schema = await readFile(new URL('../migrations/0008_user_status.sql', import.meta.url), 'utf8');
const template = await readFile(new URL('../wrangler.toml.template', import.meta.url), 'utf8');
const required = [
  'name = "moments-cf"',
  'main = "src/index.js"',
  'compatibility_date = "2026-08-06"',
  '[assets]',
  'directory = "../front/.output/public"',
  'not_found_handling = "single-page-application"',

];
const missing = required.filter(value => !config.includes(value));
if (missing.length) throw new Error(`wrangler.toml is missing: ${missing.join(', ')}`);
if (/database_id\s*=/.test(config) || /\[\[d1_databases\]\]/.test(config) || /\[\[r2_buckets\]\]/.test(config)) throw new Error('Repository wrangler.toml must not contain account-specific bindings.');
for (const value of ['binding = "DB"', 'database_id = "__D1_DATABASE_ID__"', 'binding = "MEDIA"']) if (!template.includes(value)) throw new Error(`Wrangler template is missing: ${value}`);

for (const table of ['CREATE TABLE IF NOT EXISTS users', 'CREATE TABLE IF NOT EXISTS sys_config', 'CREATE TABLE IF NOT EXISTS media']) {
  if (!schema.includes(table)) throw new Error(`schema is missing required table: ${table}`);
}

for (const secret of ['JWT_SECRET', 'INIT_SECRET']) {
  if (new RegExp(`^${secret}\\s*=`, 'm').test(config)) {
    throw new Error(`${secret} must be a Cloudflare secret, not a committed wrangler.toml value.`);
  }
}

for (const table of ['CREATE TABLE IF NOT EXISTS memos', 'CREATE TABLE IF NOT EXISTS memo_likes']) {
  if (!memoSchema.includes(table)) throw new Error(`Phase 3 schema is missing: ${table}`);
}
for (const table of ['CREATE TABLE IF NOT EXISTS comments', 'CREATE TABLE IF NOT EXISTS friends']) if (!phase4Schema.includes(table)) throw new Error(`Phase 4 schema is missing: ${table}`);
for (const statement of ['UPDATE memos', 'CREATE TRIGGER IF NOT EXISTS trg_memo_likes_insert', 'CREATE TRIGGER IF NOT EXISTS trg_memo_likes_delete']) {
  if (!phase5Schema.includes(statement)) throw new Error(`Phase 5 schema is missing: ${statement}`);
}
for (const statement of ['CREATE TRIGGER IF NOT EXISTS trg_comments_insert', 'CREATE TRIGGER IF NOT EXISTS trg_comments_delete', 'ALTER TABLE media ADD COLUMN trashed_at']) {
  if (!phase6Schema.includes(statement)) throw new Error(`Phase 6 schema is missing: ${statement}`);
}
for (const statement of ['ALTER TABLE media ADD COLUMN sha256', 'ALTER TABLE media ADD COLUMN thumbnail_key', 'ALTER TABLE media ADD COLUMN upload_state']) {
  if (!phase7Schema.includes(statement)) throw new Error(`Phase 7 schema is missing: ${statement}`);
}
for (const statement of ['CREATE TABLE IF NOT EXISTS migration_runs', "status TEXT NOT NULL", 'package_id TEXT PRIMARY KEY']) {
  if (!phase8Schema.includes(statement)) throw new Error(`Phase 8 schema is missing: ${statement}`);
}
for (const table of ['CREATE TABLE IF NOT EXISTS user_status']) {
  if (!phase9Schema.includes(table)) throw new Error(`Phase 9 schema is missing: ${table}`);
}
for (const value of ['binding = "ASSETS"', 'crons = ["0 3 * * SUN"]', 'CLOUDFLARE_ACCOUNT_ID = "__CLOUDFLARE_ACCOUNT_ID__"', 'R2_BUCKET_NAME = "__R2_BUCKET_NAME__"']) {
  if (!template.includes(value)) throw new Error(`Phase 7 Wrangler template is missing: ${value}`);
}
console.log('Phase 7 Worker configuration guard: PASS');
