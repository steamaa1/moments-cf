import assert from 'node:assert/strict';
import { sanitizeMemoExt, attachmentContentType, ALLOWED_ATTACHMENT_TYPES } from '../../worker/src/index.js';

// 类型白名单：必须是文档与压缩包，且绝不含可在同源内执行的类型
for (const type of ['text/html', 'image/svg+xml', 'application/javascript', 'text/javascript', 'application/x-msdownload', 'application/x-sh']) {
  assert.ok(!ALLOWED_ATTACHMENT_TYPES.has(type), `白名单不得包含可执行/可脚本类型：${type}`);
}
assert.ok(ALLOWED_ATTACHMENT_TYPES.has('application/pdf'), '白名单必须包含 pdf');

// 声明类型可信时直接用；声明类型不在白名单时按扩展名兜底；都不认返回空串
assert.equal(attachmentContentType('a.pdf', 'application/pdf'), 'application/pdf');
assert.equal(attachmentContentType('a.md', ''), 'text/markdown');
assert.equal(attachmentContentType('a.csv', 'application/octet-stream'), 'text/csv');
assert.equal(attachmentContentType('a.zip', 'application/x-zip-compressed'), 'application/zip');
assert.equal(attachmentContentType('a.html', 'text/html'), '', 'html 必须被拒绝');
assert.equal(attachmentContentType('a.exe', 'application/x-msdownload'), '', 'exe 必须被拒绝');
assert.equal(attachmentContentType('noext', ''), '', '无扩展名且无有效声明必须被拒绝');

// sanitizeMemoExt：附件清洗
const clean = sanitizeMemoExt({ attachments: [
  { path: '/upload/media/2026/09/26/abc.pdf', name: '报告 v2.pdf', size: 2048, type: 'application/pdf' },
  { path: '/upload/media/2026/09/26/def.md', name: 'note.md', size: 10, type: '' },
] });
assert.equal(clean.attachments.length, 2);
assert.equal(clean.attachments[0].path, '/upload/media/2026/09/26/abc.pdf');
assert.equal(clean.attachments[0].size, 2048);
assert.equal(clean.attachments[1].type, 'text/markdown', '空声明类型必须按扩展名归一');

// 路径必须限定在本站 /upload/ 且不得穿越
const bad = sanitizeMemoExt({ attachments: [
  { path: '/upload/../../etc/passwd', name: 'x.txt', size: 1, type: 'text/plain' },
  { path: 'https://evil.example.com/x.pdf', name: 'x.pdf', size: 1, type: 'application/pdf' },
  { path: '/etc/passwd', name: 'x.txt', size: 1, type: 'text/plain' },
] });
assert.equal(bad.attachments.length, 0, '站外路径、穿越路径与绝对系统路径都必须丢弃');

// 名称清洗：路径分隔符与控制字符替换，且不得丢失条目
const named = sanitizeMemoExt({ attachments: [{ path: '/upload/a/b.txt', name: '../../evil\n/x.txt', size: 1, type: 'text/plain' }] });
assert.equal(named.attachments.length, 1);
assert.doesNotMatch(named.attachments[0].name, /[\\/\n\r]/, '名称不得残留路径分隔符或换行');

// 类型不合法则丢弃；条数封顶 10
const mixed = sanitizeMemoExt({ attachments: [
  { path: '/upload/a/evil.html', name: 'evil.html', size: 1, type: 'text/html' },
  ...Array.from({ length: 15 }, (_, i) => ({ path: `/upload/a/f${i}.txt`, name: `f${i}.txt`, size: i, type: 'text/plain' })),
] });
assert.equal(mixed.attachments.length, 10, '附件条数必须封顶 10');
assert.ok(mixed.attachments.every(item => item.type === 'text/plain'), '被拒绝的类型不得进入结果');

// 无附件时输出空数组（前端 v-for 依赖该形状）
assert.deepEqual(sanitizeMemoExt({}).attachments, []);

console.log('attachment-ext: PASS');
