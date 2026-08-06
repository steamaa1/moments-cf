import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { parseDouban, parseDoubanMovieJson, sanitizeMemoExt, signJwt } from '../worker/src/index.js';

const userPage = await readFile(new URL('../front/pages/user/[id].vue', import.meta.url), 'utf8');
assert.match(userPage, /userId:\s*parseInt\(userId\)/);
assert.match(userPage, /"\/memo\/list", state/);

const settings = await readFile(new URL('../front/pages/sys/settings.vue', import.meta.url), 'utf8');
assert.doesNotMatch(settings, /是否启用S3存储|smtp服务器|smtp密码/);
assert.match(settings, /回收站/);

assert.throws(() => sanitizeMemoExt({ video: { type: 'online', value: 'javascript:bad' } }), /视频地址/);
assert.equal(sanitizeMemoExt({ video: { type: 'online', value: 'https://media.example/video.mp4' } }).video.value, 'https://media.example/video.mp4');
assert.throws(() => sanitizeMemoExt({ music: { id: '1', server: 'unknown', type: 'song' } }), /音乐平台/);

const movieHtml = `<!doctype html><html><head>
<meta property="og:title" content="测试电影"/><meta property="og:description" content="电影简介"/>
<meta property="og:image" content="https://img.example/movie.jpg"/>
<meta property="video:director" content="导演甲"/><meta property="video:actor" content="演员甲"/>
</head><body><span property="v:initialReleaseDate" content="2026-01-02"></span>
<span property="v:runtime" content="123"></span><strong class="rating_num">8.8</strong></body></html>`;
const movie = parseDouban(movieHtml, 'movie', '123');
assert.equal(movie.title, '测试电影');
assert.equal(movie.director, '导演甲');
assert.equal(movie.rating, '8.8');
assert.match(movie.image, /^\/douban-cover\?url=/);
const jsonLdMovie = parseDouban(`<script type="application/ld+json">{"name":"JSON电影","description":"简介","image":"https://img.example/json.jpg","director":{"name":"导演乙"},"actor":[{"name":"演员乙"}],"datePublished":"2026-02-03","duration":"PT125M","aggregateRating":{"ratingValue":"8.6"}}</script>`, 'movie', '789');
assert.equal(jsonLdMovie.title, 'JSON电影');
assert.equal(jsonLdMovie.director, '导演乙');
assert.equal(jsonLdMovie.actors, '演员乙');
assert.equal(jsonLdMovie.rating, '8.6');
const kungFu = parseDoubanMovieJson({
  id: '1291543', title: '功夫', intro: '1940年代的上海',
  cover_url: 'https://img1.doubanio.com/view/photo/m_ratio_poster/public/p2219011938.jpg',
  rating: { value: 8.9 }, directors: [{ name: '周星驰' }],
  actors: [{ name: '周星驰' }, { name: '元秋' }, { name: '元华' }],
  pubdate: ['2004-12-23(中国大陆)'], durations: ['100分钟(3D重映)', '95分钟(中国大陆)'],
  url: 'https://movie.douban.com/subject/1291543/',
}, '1291543');
assert.equal(kungFu.title, '功夫');
assert.equal(kungFu.rating, '8.9');
assert.equal(kungFu.director, '周星驰');
assert.equal(kungFu.actors, '周星驰/元秋/元华');
assert.equal(kungFu.runtime, '100');
assert.equal(kungFu.releaseDate, '2004-12-23(中国大陆)');
assert.match(kungFu.image, /douban-cover/);

const movieApiSecret = 'movie-route-test-secret';
const movieApiToken = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, movieApiSecret);
const movieApiDb = { prepare(sql) { return { bind() { return this; }, async first() { return sql.startsWith('SELECT * FROM users WHERE id') ? { id: 1, token_version: 0 } : null; } }; } };
const movieRouteOriginalFetch = globalThis.fetch;
let desktopMovieRequested = false;
try {
  globalThis.fetch = async url => {
    const href = String(url);
    if (href === 'https://m.douban.com/rexxar/api/v2/movie/1291543') return new Response(JSON.stringify({
      id: '1291543', title: '功夫', intro: '1940年代的上海',
      cover_url: 'https://img1.doubanio.com/view/photo/m_ratio_poster/public/p2219011938.jpg',
      rating: { value: 8.9 }, directors: [{ name: '周星驰' }], actors: [{ name: '周星驰' }, { name: '元秋' }],
      pubdate: ['2004-12-23(中国大陆)'], durations: ['100分钟(3D重映)'],
      url: 'https://movie.douban.com/subject/1291543/',
    }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
    desktopMovieRequested = true;
    return new Response('', { status: 302, headers: { location: 'https://sec.douban.com/' } });
  };
  const movieRouteResponse = await worker.fetch(new Request('https://moments.example/api/memo/getDoubanMovieInfo?id=1291543', { method: 'POST', headers: { 'x-api-token': movieApiToken } }), { DB: movieApiDb, JWT_SECRET: movieApiSecret });
  const movieRouteBody = await movieRouteResponse.json();
  assert.equal(movieRouteResponse.status, 200);
  assert.equal(movieRouteBody.code, 0);
  assert.equal(movieRouteBody.data.title, '功夫');
  assert.equal(movieRouteBody.data.rating, '8.9');
  assert.equal(desktopMovieRequested, false, 'JSON success must not request the blocked desktop page');
} finally { globalThis.fetch = movieRouteOriginalFetch; }

const bookHtml = `<!doctype html><html><head>
<meta property="og:title" content="测试图书"/><meta property="og:description" content="图书简介"/>
<meta property="og:image" content="https://img.example/book.jpg"/><meta property="book:author" content="作者甲"/>
<meta property="book:isbn" content="123456"/><meta name="keywords" content="测试, 2025-08"/>
</head><body><strong class="rating_num">9.1</strong></body></html>`;
const book = parseDouban(bookHtml, 'book', '456');
assert.equal(book.title, '测试图书');
assert.equal(book.author, '作者甲');
assert.equal(book.pubDate, '2025-08');

const publicConfigDb = { prepare() { return { async first() { return { content: JSON.stringify({ title: '站点', smtpUsername: 'private@example.com', smtpHost: 'smtp.example.com', enableEmail: true }) }; } }; } };
const configResponse = await worker.fetch(new Request('https://moments.example/api/sysConfig/get', { method: 'POST' }), { DB: publicConfigDb });
const configBody = await configResponse.json();
assert.equal(configBody.data.title, '站点');
assert.equal(configBody.data.smtpUsername, undefined);
assert.equal(configBody.data.smtpHost, undefined);
assert.equal(configBody.data.enableEmail, undefined);

const bytes = new TextEncoder().encode('0123456789');
const r2Object = {
  body: bytes,
  size: bytes.length,
  httpEtag: '"etag-test"',
  range: { offset: 2, length: 4 },
  writeHttpMetadata(headers) { headers.set('content-type', 'video/mp4'); },
};
const mediaDb = { prepare() { return { bind() { return this; }, async first() { return { id: 1 }; } }; } };
const mediaEnv = { DB: mediaDb, MEDIA: {
  async head() { return r2Object; },
  async get(_key, options) { assert.deepEqual(options, { range: { offset: 2, length: 4 } }); return r2Object; },
} };
const ranged = await worker.fetch(new Request('https://moments.example/upload/media/video.mp4', { headers: { range: 'bytes=2-5' } }), mediaEnv);
assert.equal(ranged.status, 206);
assert.equal(ranged.headers.get('content-range'), 'bytes 2-5/10');
assert.equal(ranged.headers.get('accept-ranges'), 'bytes');
const invalidRange = await worker.fetch(new Request('https://moments.example/upload/media/video.mp4', { headers: { range: 'bytes=20-30' } }), mediaEnv);
assert.equal(invalidRange.status, 416);
assert.equal(invalidRange.headers.get('content-range'), 'bytes */10');
const notModified = await worker.fetch(new Request('https://moments.example/upload/media/video.mp4', { headers: { 'if-none-match': '"etag-test"' } }), mediaEnv);
assert.equal(notModified.status, 304);
const headed = await worker.fetch(new Request('https://moments.example/upload/media/video.mp4', { method: 'HEAD' }), { DB: mediaDb, MEDIA: { async head() { return r2Object; } } });
assert.equal(headed.status, 200);
assert.equal(await headed.text(), '');
const trashedDb = { prepare() { return { bind() { return this; }, async first() { return null; } }; } };
const trashed = await worker.fetch(new Request('https://moments.example/upload/media/video.mp4'), { DB: trashedDb, MEDIA: { async head() { throw new Error('trashed object must not be read'); } } });
assert.equal(trashed.status, 404);

console.log('Phase 6 regression tests: PASS');
