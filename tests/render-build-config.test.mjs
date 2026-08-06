import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const workerDir = new URL('../worker/', import.meta.url);
const output = new URL('../worker/wrangler.build.toml', import.meta.url);
const env = { ...process.env, MOMENTS_WORKER_NAME: 'test-worker', MOMENTS_D1_NAME: 'test-db', MOMENTS_R2_BUCKET: 'test-media' };
const processResult = spawn(process.execPath, ['scripts/render-build-config.mjs', 'test-d1-id'], { cwd: workerDir, env });
let stderr = '';
processResult.stderr.on('data', value => { stderr += value; });
const code = await new Promise(resolve => processResult.on('exit', resolve));
assert.equal(code, 0, stderr);
const config = await readFile(output, 'utf8');
assert.match(config, /name = "test-worker"/);
assert.match(config, /database_id = "test-d1-id"/);
assert.match(config, /bucket_name = "test-media"/);
await rm(output);
console.log('Cloudflare Builds renderer tests: PASS');
