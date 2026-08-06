import worker from '../src/index.ts';

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const assets = {
  async fetch(request) {
    return new Response(`asset:${new URL(request.url).pathname}`);
  },
};

const baseEnv = {
  ASSETS: assets,
  CORS_ORIGIN: 'https://moments.example.com',
};

const health = await worker.fetch(
  new Request('https://moments.example.com/api/health', {
    headers: { Origin: 'https://moments.example.com' },
  }),
  baseEnv,
);
expect(health.status === 200, 'health endpoint must return 200');
const healthData = await health.json();
expect(healthData.ok === true, 'health endpoint must report ok');
expect(healthData.service === 'moments-cf', 'health service name mismatch');
expect(healthData.phase === 1, 'health phase mismatch');
expect(
  health.headers.get('access-control-allow-origin') === 'https://moments.example.com',
  'health CORS origin mismatch',
);

const options = await worker.fetch(
  new Request('https://moments.example.com/api/health', { method: 'OPTIONS' }),
  baseEnv,
);
expect(options.status === 204, 'CORS preflight must return 204');

const unknownApi = await worker.fetch(
  new Request('https://moments.example.com/api/memo/list'),
  baseEnv,
);
expect(unknownApi.status === 404, 'unimplemented API must return 404');

const appAsset = await worker.fetch(
  new Request('https://moments.example.com/memo/123'),
  baseEnv,
);
expect(appAsset.status === 200, 'SPA asset fallback must return 200');
expect((await appAsset.text()) === 'asset:/memo/123', 'SPA fallback did not reach ASSETS');

const missingR2 = await worker.fetch(
  new Request('https://moments.example.com/upload/2026/cover.webp'),
  baseEnv,
);
expect(missingR2.status === 503, 'unbound R2 must return 503');

const mediaEnv = {
  ...baseEnv,
  MEDIA: {
    async get(key) {
      expect(key === '2026/cover.webp', 'unexpected R2 key');
      return {
        body: new TextEncoder().encode('r2-media'),
        httpEtag: '"etag-1"',
        writeHttpMetadata(headers) {
          headers.set('content-type', 'image/webp');
        },
      };
    },
  },
};

const media = await worker.fetch(
  new Request('https://moments.example.com/upload/2026/cover.webp'),
  mediaEnv,
);
expect(media.status === 200, 'bound R2 object must return 200');
expect((await media.text()) === 'r2-media', 'R2 body mismatch');
expect(media.headers.get('content-type') === 'image/webp', 'R2 content type mismatch');
expect(
  media.headers.get('cache-control') === 'public, max-age=31536000, immutable',
  'R2 cache header mismatch',
);

const rss = await worker.fetch(
  new Request('https://moments.example.com/rss'),
  baseEnv,
);
expect(rss.status === 501, 'RSS placeholder must return 501');

console.log('Phase 1 Worker behavior tests: PASS');
