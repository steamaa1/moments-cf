#!/usr/bin/env node
/** Syntax-check the migration and release tools through Phase 7. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || result.error?.message || 'tool check failed');
    process.exit(result.status || 1);
  }
}
const python = spawnSync('python3', ['--version'], { encoding: 'utf8' });
if (!python.error && python.status === 0) {
  run('python3', ['-m', 'py_compile',
    'scripts/migrate/export-sqlite.py',
    'scripts/migrate/build-media-manifest.py',
    'scripts/migrate/verify-migration.py',
    'tests/phase5-tools.test.py',
  ]);
  run('python3', ['tests/phase5-tools.test.py']);
} else {
  console.warn('SKIP Python migration syntax checks: python3 not available');
}
run(process.execPath, ['--check', 'scripts/release/preflight.mjs']);
run(process.execPath, ['--check', 'scripts/release/smoke-test.mjs']);
console.log('Phase 7 tooling syntax checks: PASS');
