import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderConfig } from '../../scripts/cloudflare-bootstrap.mjs';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d1Id = process.argv[2];
const accountId = process.argv[3] || process.env.CLOUDFLARE_ACCOUNT_ID;
if (!d1Id) throw new Error('Usage: node scripts/render-build-config.mjs <D1_DATABASE_ID> [CLOUDFLARE_ACCOUNT_ID]');
const config = renderConfig(await readFile(resolve(dir, 'wrangler.toml.template'), 'utf8'), {
  workerName: process.env.MOMENTS_WORKER_NAME || 'moments-cf',
  d1Name: process.env.MOMENTS_D1_NAME || 'moments-db',
  d1Id,
  r2Name: process.env.MOMENTS_R2_BUCKET || 'moments-media',
  accountId: accountId || 'set-as-worker-variable',
});
await writeFile(resolve(dir, 'wrangler.build.toml'), config);
console.log('Generated deployment-only wrangler.build.toml');
