import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderConfig } from '../../scripts/cloudflare-bootstrap.mjs';
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.D1_DATABASE_ID) throw new Error('Missing Build Variable: D1_DATABASE_ID');
const config = renderConfig(await readFile(resolve(dir, 'wrangler.toml.template'), 'utf8'), {
  workerName: process.env.MOMENTS_WORKER_NAME || 'moments-cf',
  d1Name: process.env.MOMENTS_D1_NAME || 'moments-db',
  d1Id: process.env.D1_DATABASE_ID,
  r2Name: process.env.MOMENTS_R2_BUCKET || 'moments-media',
});
await writeFile(resolve(dir, 'wrangler.build.toml'), config);
console.log('Generated deployment-only wrangler.build.toml');
