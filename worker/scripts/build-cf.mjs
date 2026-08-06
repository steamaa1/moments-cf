import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const worker = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const front = resolve(worker, '../front');
function run(command, args, cwd) { return new Promise((ok, fail) => { const p = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' }); p.on('error', fail); p.on('exit', code => code === 0 ? ok() : fail(new Error(`${command} exited with ${code}`))); }); }
await run('pnpm', ['install', '--frozen-lockfile'], front);
await run('pnpm', ['run', 'generate'], front);
console.log('Frontend assets generated. Deployment config will be resolved during npm run deploy:cf.');
