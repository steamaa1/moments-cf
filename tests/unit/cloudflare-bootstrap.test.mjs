import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrap, parseArgs, renderConfig } from '../../scripts/cloudflare-bootstrap.mjs';

assert.equal(parseArgs([]).deploy, false);
assert.equal(parseArgs(['--deploy', '--d1-name', 'demo-db']).d1Name, 'demo-db');
assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
assert.match(renderConfig('id=__D1_DATABASE_ID__ account=__CLOUDFLARE_ACCOUNT_ID__', { workerName: 'x', d1Name: 'x', d1Id: 'abc', r2Name: 'x', accountId: 'account' }), /abc account=account/);

const calls = [];
const fetchImpl = async (url, init = {}) => {
  calls.push({ url, method: init.method || 'GET' });
  const path = new URL(url).pathname;
  let result;
  if (path.endsWith('/d1/database') && !init.method) result = [];
  else if (path.endsWith('/r2/buckets') && !init.method) result = { buckets: [] };
  else if (path.endsWith('/d1/database')) result = { uuid: 'db-123', name: 'test-db' };
  else if (path.endsWith('/r2/buckets')) result = { name: 'test-media' };
  else throw new Error(`unexpected URL ${url}`);
  return new Response(JSON.stringify({ success: true, result }), { status: 200 });
};
const directory = await mkdtemp(join(tmpdir(), 'moments-bootstrap-'));
const templatePath = join(directory, 'wrangler.toml.template');
const localConfigPath = join(directory, 'wrangler.local.toml');
const statePath = join(directory, 'state.json');
await (await import('node:fs/promises')).writeFile(templatePath, 'name="__WORKER_NAME__"\ndb="__D1_DATABASE_ID__"\nr2="__R2_BUCKET_NAME__"\n');
const result = await bootstrap({
  options: { workerName: 'test-worker', d1Name: 'test-db', r2Name: 'test-media', location: 'apac', deploy: false, dryRun: false },
  env: { CLOUDFLARE_ACCOUNT_ID: 'account-1', CLOUDFLARE_API_TOKEN: 'token-1', CLOUDFLARE_API_BASE: 'https://mock.cloudflare.test/client/v4' },
  fetchImpl,
  paths: { templatePath, localConfigPath, statePath, workerDir: directory },
});
assert.equal(result.d1.id, 'db-123');
assert.equal(result.r2.bucket.name, 'test-media');
assert.equal(calls.length, 4);
assert.match(await readFile(localConfigPath, 'utf8'), /db-123/);
assert.match(await readFile(statePath, 'utf8'), /test-media/);

const reusedFetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  if (init.method === 'POST') throw new Error('existing resources must not be created again');
  const result = path.endsWith('/d1/database') ? [{ uuid: 'db-existing', name: 'test-db' }] : { buckets: [{ name: 'test-media' }] };
  return new Response(JSON.stringify({ success: true, result }), { status: 200 });
};
const reused = await bootstrap({
  options: { workerName: 'test-worker', d1Name: 'test-db', r2Name: 'test-media', location: 'apac', deploy: false, dryRun: false },
  env: { CLOUDFLARE_ACCOUNT_ID: 'account-1', CLOUDFLARE_API_TOKEN: 'token-1', CLOUDFLARE_API_BASE: 'https://mock.cloudflare.test/client/v4' },
  fetchImpl: reusedFetch,
  paths: { templatePath, localConfigPath, statePath, workerDir: directory },
});
assert.equal(reused.d1.created, false);
assert.equal(reused.r2.created, false);

const dry = await bootstrap({
  options: { workerName: 'test-worker', d1Name: 'test-db', r2Name: 'test-media', location: 'apac', deploy: false, dryRun: true },
  env: { CLOUDFLARE_ACCOUNT_ID: 'account-1', CLOUDFLARE_API_TOKEN: 'token-1' },
});
assert.equal(dry.dryRun, true);
console.log('Cloudflare bootstrap tests: PASS');
