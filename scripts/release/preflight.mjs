#!/usr/bin/env node
/** Read-only local deployment preflight for Moments-CF. */
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fromRoot = (path) => resolve(root, path);
const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({ name, ok: true }); }
  catch (error) { checks.push({ name, ok: false, error: error.message }); }
}

await check('generic wrangler.toml has no account D1 ID', async () => {
  const config = await readFile(fromRoot('worker/wrangler.toml'), 'utf8');
  if (/database_id\s*=/.test(config)) throw new Error('database_id must not be committed');
});
await check('Wrangler deployment template exists', async () => {
  const template = await readFile(fromRoot('worker/wrangler.toml.template'), 'utf8');
  if (!template.includes('__D1_DATABASE_ID__')) throw new Error('D1 placeholder missing');
});
await check('ordered SQL migrations exist', async () => {
  const migrations = (await readdir(fromRoot('worker/migrations'))).filter(name => name.endsWith('.sql')).sort();
  const expected = ['0001_schema.sql', '0002_memos.sql', '0003_comments_friends.sql', '0004_like_counters.sql', '0005_phase6_consistency_trash.sql', '0006_phase7_media.sql', '0007_migration_runs.sql', '0008_user_status.sql', '0009_telegram_notify.sql', '0010_media_storage_backend.sql', '0011_comment_network_rate.sql', '0012_like_network_dedup.sql', '0013_login_rate_limit.sql', '0014_registration_approval.sql', '0015_comment_rate_buckets.sql', '0016_photo_albums.sql'];
  if (migrations.length !== expected.length || expected.some((name, index) => migrations[index] !== name)) {
    throw new Error(`migration sequence incomplete: ${migrations.join(', ')}`);
  }
});
await check('generated deployment config is not present', async () => {
  try { await access(fromRoot('worker/wrangler.build.toml')); }
  catch { return; }
  throw new Error('delete generated worker/wrangler.build.toml before commit');
});
await check('frontend static output path matches Wrangler template', async () => {
  const template = await readFile(fromRoot('worker/wrangler.toml.template'), 'utf8');
  if (!template.includes('../front/.output/public')) throw new Error('asset directory mismatch');
});

for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.error ? ` - ${item.error}` : ''}`);
if (checks.some(item => !item.ok)) process.exitCode = 1;
