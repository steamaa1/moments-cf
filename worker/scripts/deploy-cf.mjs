import { execFile, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const worker = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d1Name = process.env.MOMENTS_D1_NAME || 'moments-db';
function exec(command, args) { return new Promise((ok, fail) => execFile(command, args, { cwd: worker, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? fail(new Error(stderr || error.message)) : ok(stdout))); }
function run(args) { return new Promise((ok, fail) => { const p = spawn('npx', ['--yes', 'wrangler@latest', ...args], { cwd: worker, stdio: 'inherit', shell: process.platform === 'win32' }); p.on('error', fail); p.on('exit', code => code === 0 ? ok() : fail(new Error(`wrangler exited with ${code}`))); }); }
const listText = await exec('npx', ['--yes', 'wrangler@latest', 'd1', 'list', '--json']);
let databases;
try { databases = JSON.parse(listText); } catch { throw new Error('Wrangler did not return valid D1 JSON. Verify the Workers Builds API token has D1 Read permission.'); }
const database = databases.find(item => item.name === d1Name);
if (!database?.uuid) throw new Error(`D1 database "${d1Name}" was not found. Create it or set MOMENTS_D1_NAME.`);
let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
if (!accountId) {
  try {
    const whoami = JSON.parse(await exec('npx', ['--yes', 'wrangler@latest', 'whoami', '--json']));
    accountId = whoami.accounts?.[0]?.id || whoami.account?.id || '';
  } catch { console.warn('Could not auto-detect Cloudflare account ID; set CLOUDFLARE_ACCOUNT_ID for backups/direct uploads.'); }
}
await exec(process.execPath, ['scripts/render-build-config.mjs', database.uuid, accountId]);
await run(['d1', 'migrations', 'apply', d1Name, '--remote', '--config', 'wrangler.build.toml']);
await run(['r2', 'bucket', 'cors', 'set', process.env.MOMENTS_R2_BUCKET || 'moments-media', '--file', 'r2-cors.json', '--force']);
await run(['deploy', '--config', 'wrangler.build.toml']);
