import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
const required = [
  'name = "moments-cf"',
  'main = "src/index.ts"',
  'compatibility_date = "2026-08-06"',
  '[assets]',
  'directory = "../front/.output/public"',
  'not_found_handling = "single-page-application"',
];

const missing = required.filter(value => !config.includes(value));
if (missing.length) {
  throw new Error(`wrangler.toml is missing: ${missing.join(', ')}`);
}

if (/^\[\[d1_databases\]\]/m.test(config) || /^\[\[r2_buckets\]\]/m.test(config)) {
  throw new Error('Phase 1 must not contain real D1/R2 bindings before Cloudflare resources are created.');
}

console.log('Worker configuration guard: PASS');
