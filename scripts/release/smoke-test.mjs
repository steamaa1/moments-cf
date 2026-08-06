#!/usr/bin/env node
/** Read-only smoke test for a deployed Moments-CF Worker. */
const base = String(process.env.MOMENTS_BASE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('Set MOMENTS_BASE_URL, for example https://moments-cf.example.workers.dev');
const jsonHeaders = { 'content-type': 'application/json' };
const checks = [
  ['GET /api/health', '/api/health', { method: 'GET' }, 'json'],
  ['POST /api/user/profile', '/api/user/profile', { method: 'POST', headers: jsonHeaders, body: '{}' }, 'json'],
  ['POST /api/sysConfig/get', '/api/sysConfig/get', { method: 'POST', headers: jsonHeaders, body: '{}' }, 'json'],
  ['POST /api/memo/list', '/api/memo/list', { method: 'POST', headers: jsonHeaders, body: '{"page":1,"size":5}' }, 'json'],
  ['POST /api/friend/list', '/api/friend/list', { method: 'POST', headers: jsonHeaders, body: '{}' }, 'json'],
  ['GET /rss', '/rss', { method: 'GET' }, 'rss'],
];
let failed = false;
for (const [name, path, init, type] of checks) {
  try {
    const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    let valid = response.ok;
    if (type === 'json') valid = valid && JSON.parse(text).code === 0;
    if (type === 'rss') valid = valid && text.includes('<rss');
    console.log(`${valid ? 'PASS' : 'FAIL'} ${name} (${response.status})`);
    if (!valid) failed = true;
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name} - ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
