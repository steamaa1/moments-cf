import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { publicUser, commentView, verifyRecaptchaToken, verifyTurnstileToken, verifyHumanToken } from '../worker/src/index.js';

const user = {
  id: 1,
  username: 'admin',
  nickname: '管理员',
  avatar_url: '/avatar.webp',
  slogan: 'hello',
  cover_url: '/cover.webp',
  email: 'private@example.com',
};
assert.equal(publicUser(user).email, undefined, 'public profile must not expose email');
assert.equal(publicUser(user, true).email, 'private@example.com', 'own profile must include email');

const publicComment = commentView({
  id: 1,
  content: 'hello',
  reply_to: 'someone',
  reply_email: 'reply@example.com',
  username: 'guest',
  email: 'guest@example.com',
  website: '',
  created_at: '2026-08-06 00:00:00',
  updated_at: '2026-08-06 00:00:00',
  memo_id: 1,
  author: '',
});
assert.equal(publicComment.email, undefined, 'public comment must not expose email');
assert.equal(publicComment.replyEmail, undefined, 'public comment must not expose reply email');

const originalFetch = globalThis.fetch;
try {
  const disabled = await verifyRecaptchaToken('', { enableGoogleRecaptcha: false });
  assert.equal(disabled.ok, true);

  const missingSecret = await verifyRecaptchaToken('token', { enableGoogleRecaptcha: true, googleSecretKey: '' });
  assert.equal(missingSecret.ok, false);

  globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const rejected = await verifyRecaptchaToken('token', { enableGoogleRecaptcha: true, googleSecretKey: 'test-secret' });
  assert.equal(rejected.ok, false);

  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, score: 0.9, action: 'newComment', hostname: 'moments.example' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const accepted = await verifyRecaptchaToken('token', { enableGoogleRecaptcha: true, googleSecretKey: 'test-secret' }, 'newComment', 'moments.example');
  assert.equal(accepted.ok, true);
  const wrongAction = await verifyRecaptchaToken('token', { enableGoogleRecaptcha: true, googleSecretKey: 'test-secret' }, 'likeMemo', 'moments.example');
  assert.equal(wrongAction.ok, false);
} finally {
  globalThis.fetch = originalFetch;
}


const turnstileOriginalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, action: 'newComment', hostname: 'moments.example' }), { status: 200 });
  assert.deepEqual(await verifyTurnstileToken('token', { enableTurnstile: true, turnstileSecretKey: 'secret' }, 'newComment', 'moments.example'), { ok: true });
  assert.deepEqual(await verifyHumanToken('token', { enableTurnstile: true, turnstileSecretKey: 'secret', enableGoogleRecaptcha: true }, 'newComment', 'moments.example'), { ok: true });
  assert.equal((await verifyTurnstileToken('token', { enableTurnstile: true, turnstileSecretKey: 'secret' }, 'likeMemo', 'moments.example')).ok, false);
  assert.equal((await verifyTurnstileToken('token', { enableTurnstile: true, turnstileSecretKey: 'secret' }, 'newComment', 'other.example')).ok, false);
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), { status: 200 });
  assert.equal((await verifyTurnstileToken('bad', { enableTurnstile: true, turnstileSecretKey: 'secret' })).ok, false);
} finally {
  globalThis.fetch = turnstileOriginalFetch;
}

const internalFailure = await worker.fetch(new Request('https://moments.example/api/memo/list', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
}), { ASSETS: { fetch: async () => new Response('asset') } });
const internalFailureBody = await internalFailure.json();
assert.equal(internalFailure.status, 503);
assert.equal(internalFailureBody.message, '服务暂时不可用，请稍后再试');
assert.doesNotMatch(internalFailureBody.message, /prepare|binding|undefined/i);

const markdown = await readFile(new URL('../front/utils/index.ts', import.meta.url), 'utf8');
assert.match(markdown, /markdownit\(\{[\s\S]*?html:\s*false/);
assert.doesNotMatch(markdown, /markdownit\(\{[\s\S]*?html:\s*true/);
const settings = await readFile(new URL('../front/pages/sys/settings.vue', import.meta.url), 'utf8');
assert.match(settings, /v-model="state\.googleSecretKey"[^>]*type="password"/);

const workerSource = await readFile(new URL('../worker/src/index.js', import.meta.url), 'utf8');
assert.match(workerSource, /service: 'moments-cf', phase: 7/);
assert.match(workerSource, /memo_id IN \(\$\{placeholders\}\)/);
assert.match(workerSource, /config\.commentOrder === 'asc' \? 'ASC' : 'DESC'/);
assert.match(workerSource, /env\.MEDIA\.delete\(key\)\.catch/);
console.log('Phase 5 security and consistency tests: PASS');
