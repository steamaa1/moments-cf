#!/usr/bin/env node
/**
 * Cloudflare resource bootstrap for Moments-CF.
 *
 * Default / --resources-only:
 *   - creates or reuses one D1 database and one private R2 bucket
 *   - writes worker/wrangler.local.toml and .moments-cf-bootstrap.json
 *
 * --deploy additionally applies D1 migrations and deploys with the generated config.
 * It deliberately never creates or uploads JWT_SECRET / INIT_SECRET.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(rootDir, 'worker');
const templatePath = resolve(workerDir, 'wrangler.toml.template');
const localConfigPath = resolve(workerDir, 'wrangler.local.toml');
const statePath = resolve(rootDir, '.moments-cf-bootstrap.json');
const defaultOptions = {
  workerName: 'moments-cf',
  d1Name: 'moments-db',
  r2Name: 'moments-media',
  location: 'apac',
  deploy: false,
  dryRun: false,
};

function usage() {
  return `
Moments-CF Cloudflare Bootstrap

Usage:
  CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \\
  node scripts/cloudflare-bootstrap.mjs [options]

Options:
  --resources-only        Create/reuse D1 + R2 and render local config (default)
  --deploy                Also apply D1 migrations and deploy through Wrangler
  --dry-run               Print the plan without creating resources or files
  --worker-name <name>    Default: moments-cf
  --d1-name <name>        Default: moments-db
  --r2-name <name>        Default: moments-media
  --location <hint>       Default: apac
  --help                  Show this help

Required environment variables:
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN

Security:
  This script never writes JWT_SECRET or INIT_SECRET. Configure them as encrypted
  Worker secrets after bootstrap. Generated local config/state files are gitignored.
`.trim();
}

export function parseArgs(argv) {
  const options = { ...defaultOptions };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--resources-only') options.deploy = false;
    else if (arg === '--deploy') options.deploy = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (['--worker-name', '--d1-name', '--r2-name', '--location'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      const field = { '--worker-name': 'workerName', '--d1-name': 'd1Name', '--r2-name': 'r2Name', '--location': 'location' }[arg];
      options[field] = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function assertName(name, label, maxLength = 64) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(name) || name.length > maxLength) {
    throw new Error(`${label} must use lowercase letters, numbers and hyphens (3-${maxLength} characters).`);
  }
}

async function request(apiBase, accountId, token, path, init = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase}/accounts/${accountId}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const detail = data.errors?.map(error => error.message).join('; ') || data.messages?.join('; ') || response.statusText;
    const error = new Error(`Cloudflare API ${init.method || 'GET'} ${path} failed: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return data.result;
}

function listResult(result, key) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.[key]) ? result[key] : [];
}

export async function ensureD1({ apiBase, accountId, token, name, location, fetchImpl }) {
  const databases = listResult(await request(apiBase, accountId, token, '/d1/database', {}, fetchImpl), 'results');
  const existing = databases.find(database => database.name === name);
  if (existing) return { database: existing, created: false };
  const database = await request(apiBase, accountId, token, '/d1/database', {
    method: 'POST', body: JSON.stringify({ name, primary_location_hint: location }),
  }, fetchImpl);
  return { database, created: true };
}

export async function ensureR2({ apiBase, accountId, token, name, location, fetchImpl }) {
  const buckets = listResult(await request(apiBase, accountId, token, '/r2/buckets', {}, fetchImpl), 'buckets');
  const existing = buckets.find(bucket => bucket.name === name);
  if (existing) return { bucket: existing, created: false };
  const bucket = await request(apiBase, accountId, token, '/r2/buckets', {
    method: 'POST', body: JSON.stringify({ name, location, storage_class: 'Standard' }),
  }, fetchImpl);
  return { bucket, created: true };
}

export function renderConfig(template, values) {
  const replacements = {
    '__WORKER_NAME__': values.workerName,
    '__D1_DATABASE_NAME__': values.d1Name,
    '__D1_DATABASE_ID__': values.d1Id,
    '__R2_BUCKET_NAME__': values.r2Name,
    '__CLOUDFLARE_ACCOUNT_ID__': values.accountId || 'set-as-worker-variable',
  };
  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) result = result.replaceAll(placeholder, value);
  if (/__[A-Z0-9_]+__/.test(result)) throw new Error('Unresolved placeholder in Wrangler template');
  return result;
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', rejectPromise);
    child.on('exit', code => code === 0 ? resolvePromise() : rejectPromise(new Error(`${command} exited with code ${code}`)));
  });
}

export async function bootstrap({ options, env = process.env, fetchImpl = fetch, paths = {} }) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
  assertName(options.workerName, 'Worker name');
  assertName(options.d1Name, 'D1 database name', 32);
  assertName(options.r2Name, 'R2 bucket name');
  const apiBase = env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4';
  const targetTemplate = paths.templatePath || templatePath;
  const targetConfig = paths.localConfigPath || localConfigPath;
  const targetState = paths.statePath || statePath;
  const targetWorkerDir = paths.workerDir || workerDir;

  if (options.dryRun) {
    return { dryRun: true, plan: { d1: options.d1Name, r2: options.r2Name, config: targetConfig, deploy: options.deploy } };
  }

  const [d1, r2, template] = await Promise.all([
    ensureD1({ apiBase, accountId, token, name: options.d1Name, location: options.location, fetchImpl }),
    ensureR2({ apiBase, accountId, token, name: options.r2Name, location: options.location, fetchImpl }),
    readFile(targetTemplate, 'utf8'),
  ]);
  const d1Id = d1.database.uuid || d1.database.id;
  if (!d1Id) throw new Error('Cloudflare did not return a D1 database ID.');
  const config = renderConfig(template, { workerName: options.workerName, d1Name: options.d1Name, d1Id, r2Name: options.r2Name, accountId });
  await mkdir(dirname(targetConfig), { recursive: true });
  await writeFile(targetConfig, config, 'utf8');
  await writeFile(targetState, JSON.stringify({ version: 1, workerName: options.workerName, d1: { name: options.d1Name, id: d1Id, created: d1.created }, r2: { name: options.r2Name, created: r2.created }, createdAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');

  if (options.deploy) {
    await run('npx', ['--yes', 'wrangler@latest', 'd1', 'migrations', 'apply', options.d1Name, '--remote', '--config', 'wrangler.local.toml'], targetWorkerDir);
    await run('npx', ['--yes', 'wrangler@latest', 'deploy', '--config', 'wrangler.local.toml'], targetWorkerDir);
  }
  return { dryRun: false, d1: { ...d1, id: d1Id }, r2, localConfigPath: targetConfig, statePath: targetState, deployed: options.deploy };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }
  const result = await bootstrap({ options });
  if (result.dryRun) {
    console.log('Dry run: no Cloudflare resources or local files were created.');
    console.log(JSON.stringify(result.plan, null, 2));
    return;
  }
  console.log(`✓ D1 ${result.d1.created ? 'created' : 'reused'}: ${result.d1.database.name} (${result.d1.id})`);
  console.log(`✓ R2 ${result.r2.created ? 'created' : 'reused'}: ${result.r2.bucket.name}`);
  console.log(`✓ Local config: ${result.localConfigPath}`);
  console.log(`✓ Local state: ${result.statePath}`);
  if (!result.deployed) {
    console.log('\nNext: configure JWT_SECRET and INIT_SECRET as Worker secrets, then run with --deploy when ready.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Bootstrap failed: ${error.message}`); process.exitCode = 1; });
}
