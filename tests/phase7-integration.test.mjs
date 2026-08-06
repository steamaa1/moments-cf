import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker/src/index.js';
import { openApiDocument } from '../worker/src/openapi.js';

const health = await worker.fetch(new Request('https://moments.example/api/health'), {});
const healthBody = await health.json();
assert.equal(healthBody.data.phase, 7);
const specResponse = await worker.fetch(new Request('https://moments.example/openapi.json'), {});
assert.equal(specResponse.status, 200);
const spec = await specResponse.json();
assert.equal(spec.openapi, '3.1.0');
for (const path of ['/api/file/direct/init', '/api/admin/backup/restore', '/api/comment/add']) assert.ok(spec.paths[path], `OpenAPI missing ${path}`);
const docs = await worker.fetch(new Request('https://moments.example/docs'), {});
assert.match(await docs.text(), /Moments CF API/);
assert.ok(openApiDocument().components.securitySchemes.ApiToken);

const footer = await readFile(new URL('../front/components/Footer.vue', import.meta.url), 'utf8');
assert.match(footer, /v-html="sysConfig\.beiAnNo"/);
const settings = await readFile(new URL('../front/pages/sys/settings.vue', import.meta.url), 'utf8');
assert.match(settings, /安全 HTML/);
assert.match(settings, /SMTP 失败后自动回退 Resend/);
const upload = await readFile(new URL('../front/utils/upload.ts', import.meta.url), 'utf8');
assert.match(upload, /500 \* 1024 \* 1024/);
assert.match(upload, /imageThumbnail/);
assert.match(upload, /\/file\/direct\/init/);
assert.match(upload, /\/file\/exist\?sha256=/);

const source = await readFile(new URL('../worker/src/index.js', import.meta.url), 'utf8');
for (const route of ['/api/file/direct/init', '/api/file/direct/complete', '/api/admin/backup/create', '/api/admin/backup/list', '/api/admin/backup/download', '/api/admin/backup/restore']) assert.ok(source.includes(route));
assert.match(source, /async scheduled/);
assert.match(source, /renderRssDescription/);
assert.match(source, /sendNotification/);

const template = await readFile(new URL('../worker/wrangler.toml.template', import.meta.url), 'utf8');
assert.match(template, /crons = \["0 3 \* \* 0"\]/);
assert.match(template, /R2_BUCKET_NAME/);
console.log('Phase 7 integration tests: PASS');
