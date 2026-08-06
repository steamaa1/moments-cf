import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const worker = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d1 = process.env.MOMENTS_D1_NAME || 'moments-db';
function run(args) { return new Promise((ok, fail) => { const p = spawn('npx', ['--yes', 'wrangler@latest', ...args], { cwd: worker, stdio: 'inherit', shell: process.platform === 'win32' }); p.on('error', fail); p.on('exit', code => code === 0 ? ok() : fail(new Error(`wrangler exited with ${code}`))); }); }
await run(['d1', 'migrations', 'apply', d1, '--remote', '--config', 'wrangler.build.toml']);
await run(['deploy', '--config', 'wrangler.build.toml']);
