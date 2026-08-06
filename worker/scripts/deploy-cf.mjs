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
await exec(process.execPath, ['scripts/render-build-config.mjs', database.uuid]);
await run(['d1', 'migrations', 'apply', d1Name, '--remote', '--config', 'wrangler.build.toml']);
await run(['deploy', '--config', 'wrangler.build.toml']);
