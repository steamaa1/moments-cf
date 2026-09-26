import assert from 'node:assert/strict';
import worker, { signJwt } from '../../worker/src/index.js';

const JWT_SECRET = 'attachment-upload-test-secret-at-least-32';
const user = { id: 1, username: 'admin', nickname: 'Admin', token_version: 0, password_hash: 'x' };

// 系统配置由每个用例按需覆写：默认单文件 1MB、单次最多 2 个
let config = { storageType: 'r2', attachmentMaxSize: 1, attachmentMaxCount: 2 };
const inserted = [];
const objects = new Map();
const rows = new Map();
let duplicate = null;

class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const sql = this.sql.toLowerCase();
    if (sql.includes('select * from users where id')) return user;
    if (sql.includes('select content from sys_config')) return { content: JSON.stringify(config) };
    // serveMedia 的媒体行查询（含 original_filename / content_type）
    if (sql.includes('thumbnail_key=?') && sql.includes('upload_state=')) return rows.get(this.args[0]) || null;
    // 附件去重查询（duplicate 非空时模拟已存在同内容对象）
    if (sql.includes('from media') && sql.includes('sha256')) return duplicate;
    return null;
  }
  async run() {
    const sql = this.sql.toLowerCase();
    if (sql.startsWith('insert into media')) {
      inserted.push({
        owner_id: Number(this.args[0]), r2_key: this.args[1], original_filename: this.args[2],
        content_type: this.args[3], size_bytes: Number(this.args[4]), sha256: this.args[5], upload_state: 'ready',
      });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run SQL: ${this.sql}`);
  }
}

const env = {
  JWT_SECRET,
  DB: { prepare(sql) { return new Statement(sql); } },
  MEDIA: {
    async put(key, body, metadata = {}) { objects.set(key, { body, metadata }); },
    async head(key) {
      const item = objects.get(key);
      if (!item) return null;
      const contentType = item.metadata?.httpMetadata?.contentType || '';
      return {
        size: item.body?.byteLength ?? item.body?.length ?? 0,
        httpEtag: 'etag-test',
        httpMetadata: { contentType },
        writeHttpMetadata(headers) { if (contentType) headers.set('content-type', contentType); },
      };
    },
    async get(key) { const item = objects.get(key); return item ? { body: item.body } : null; },
  },
};
const token = await signJwt({ sub: '1', tv: 0, exp: Math.floor(Date.now() / 1000) + 60 }, JWT_SECRET);

const upload = async (files) => {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return worker.fetch(new Request('https://example.com/api/file/attachment', { method: 'POST', headers: { 'x-api-token': token }, body: form }), env);
};
const body = async (response) => await response.json();
const makeFile = (name, type, bytes) => new File([new Uint8Array(bytes)], name, { type });

// 未登录必须拒绝
const anonymous = await worker.fetch(new Request('https://example.com/api/file/attachment', { method: 'POST', body: new FormData() }), env);
assert.equal(anonymous.status, 401, '未登录必须返回 401');
assert.equal((await body(anonymous)).code, 3);

// 单次数量上限：配置为 2，提交 3 个即整体拒绝
config = { storageType: 'r2', attachmentMaxSize: 1, attachmentMaxCount: 2 };
const tooMany = await upload([makeFile('a.txt', 'text/plain', 10), makeFile('b.txt', 'text/plain', 10), makeFile('c.txt', 'text/plain', 10)]);
assert.equal(tooMany.status, 400, '超出单次数量上限必须拒绝');
assert.match((await body(tooMany)).message, /一次最多上传 2 个附件/);
assert.equal(inserted.length, 0, '被拒绝的请求不得写入任何媒体记录');

// 单文件大小上限：配置 1MB，提交 2MB
const oversize = await upload([makeFile('big.pdf', 'application/pdf', 2 * 1024 * 1024)]);
assert.equal(oversize.status, 413, '超出单文件上限必须拒绝');
assert.match((await body(oversize)).message, /单个附件不能超过 1MB/);
assert.equal(inserted.length, 0);

// 类型白名单：html 一律拒绝
const html = await upload([makeFile('evil.html', 'text/html', 32)]);
assert.equal(html.status, 415, '非白名单类型必须拒绝');
assert.match((await body(html)).message, /不支持的附件类型/);
assert.equal(inserted.length, 0);

// 正常上传：pdf 直采声明类型，md 声明为空时按扩展名归一
config = { storageType: 'r2', attachmentMaxSize: 1, attachmentMaxCount: 5 };
const ok = await upload([makeFile('报告 v2.pdf', 'application/pdf', 1024), makeFile('note.md', '', 64)]);
assert.equal(ok.status, 200);
const payload = await body(ok);
assert.equal(payload.code, 0);
assert.equal(payload.data.files.length, 2);
assert.equal(payload.data.files[0].name, '报告 v2.pdf');
assert.equal(payload.data.files[0].size, 1024);
assert.equal(payload.data.files[0].type, 'application/pdf');
assert.match(payload.data.files[0].path, /^\/upload\/media\/\d{4}\/\d{2}\/\d{2}\/[A-Za-z0-9_-]+\.pdf$/);
assert.equal(payload.data.files[1].type, 'text/markdown', '空声明类型必须按扩展名归一');
assert.equal(inserted.length, 2, '两个附件必须写入两条 ready 媒体记录');
assert.ok(inserted.every(row => row.upload_state === 'ready' && row.owner_id === 1));
assert.equal(inserted[1].content_type, 'text/markdown');

// 同内容去重：命中已存在对象时复用其路径与库中原始文件名（保证卡片名与下载头一致）
config = { storageType: 'r2', attachmentMaxSize: 1, attachmentMaxCount: 5 };
duplicate = { r2_key: 'media/2026/09/26/existing.pdf', original_filename: 'first.pdf' };
const before = inserted.length;
const deduped = await upload([makeFile('renamed.pdf', 'application/pdf', 2048)]);
assert.equal(deduped.status, 200);
const dedupedFile = (await body(deduped)).data.files[0];
assert.equal(dedupedFile.path, '/upload/media/2026/09/26/existing.pdf', '必须复用已存在对象的路径');
assert.equal(dedupedFile.name, 'first.pdf', '必须回读库中原始文件名');
assert.equal(dedupedFile.size, 2048);
assert.equal(inserted.length, before, '去重命中不得重复写入媒体记录');
duplicate = null;

// 纯文本/代码/电子书类必须可上传（浏览器对 .log/.yml 等常报空声明类型，依赖扩展名归一）
config = { storageType: 'r2', attachmentMaxSize: 1, attachmentMaxCount: 5 };
const plain = await upload([makeFile('server.log', '', 128), makeFile('config.yml', 'text/yaml', 64), makeFile('run.sh', 'application/octet-stream', 32)]);
assert.equal(plain.status, 200, '纯文本/配置类附件必须被接受');
const plainFiles = (await body(plain)).data.files;
assert.deepEqual(plainFiles.map(f => f.type), ['text/plain', 'text/yaml', 'text/plain']);

// 同源可执行/可解释类型必须继续拒绝
for (const [name, type] of [['page.html', 'text/html'], ['icon.svg', 'image/svg+xml'], ['app.js', 'text/javascript'], ['data.xml', 'application/xml']]) {
  const rejected = await upload([makeFile(name, type, 64)]);
  assert.equal(rejected.status, 415, `${name} 必须被拒绝`);
}

// 下载头：显式 download=1 必须带原始文件名（含中文走 RFC 5987），并保持 nosniff
const pdfKey = payload.data.files[0].path.slice('/upload/'.length);
rows.set(pdfKey, { id: 1, storage_backend: 'r2', r2_key: pdfKey, thumbnail_key: null, trashed_at: null, original_filename: '报告 v2.pdf', content_type: 'application/pdf' });
const download = await worker.fetch(new Request(`https://example.com/upload/${pdfKey}?download=1`), env);
assert.equal(download.status, 200);
const disposition = download.headers.get('content-disposition') || '';
assert.match(disposition, /^attachment;/, '必须以下载方式下发');
assert.match(disposition, /filename\*=UTF-8''%E6%8A%A5%E5%91%8A/, '中文文件名必须走 RFC 5987 编码');
assert.match(disposition, /filename="__ v2\.pdf"/, '必须提供 ASCII 回退名（非 ASCII 字符逐个替换为 _）');
assert.equal(download.headers.get('x-content-type-options'), 'nosniff');

// 附件类型即便不带 download 参数也强制下载（纵深防御，防同源误渲染）
const implicit = await worker.fetch(new Request(`https://example.com/upload/${pdfKey}`), env);
assert.match(implicit.headers.get('content-disposition') || '', /^attachment;/, '附件类型必须默认强制下载');

// 普通图片不受影响：不得出现 content-disposition
const imgKey = 'media/2026/09/26/plain.png';
objects.set(imgKey, { body: new Uint8Array(8), metadata: { httpMetadata: { contentType: 'image/png' } } });
rows.set(imgKey, { id: 2, storage_backend: 'r2', r2_key: imgKey, thumbnail_key: null, trashed_at: null, original_filename: 'plain.png', content_type: 'image/png' });
const image = await worker.fetch(new Request(`https://example.com/upload/${imgKey}`), env);
assert.equal(image.headers.get('content-disposition'), null, '图片不得被强制下载');
assert.equal(image.headers.get('content-type'), 'image/png');
const imageDownload = await worker.fetch(new Request(`https://example.com/upload/${imgKey}?download=1`), env);
assert.match(imageDownload.headers.get('content-disposition') || '', /^attachment;/, '显式 download=1 时图片也按下载处理');

console.log('attachment-upload: PASS');
