import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeMediaUrls } from '../worker/src/index.js';

/**
 * 绑定新域名后的 CORB / 自动填充回归：
 * - 本站媒体（/upload/ 前缀）的绝对 URL 必须规范化为相对路径，
 *   避免跨域加载被浏览器 CORB 拦截（收到 HTML/JSON 响应时）。
 * - 用户表单必须带 autocomplete，避免 Chrome 提示缺属性。
 */
// normalizeMediaUrls 运行时行为
assert.equal(normalizeMediaUrls(''), '');
assert.equal(normalizeMediaUrls('/upload/abc.png'), '/upload/abc.png');
assert.equal(normalizeMediaUrls('https://moments.example/upload/abc.png'), '/upload/abc.png');
assert.equal(normalizeMediaUrls('http://moments.example/upload/abc.png'), '/upload/abc.png');
assert.equal(normalizeMediaUrls('https://wb.353536.xyz/upload/abc.png,/upload/def.jpg'), '/upload/abc.png,/upload/def.jpg');
// 非本站外链图片（非 /upload/ 路径）不得被改动；/upload/ 前缀视为本站媒体一律相对化
assert.equal(normalizeMediaUrls('https://img.example.com/photo.jpg'), 'https://img.example.com/photo.jpg');
assert.equal(normalizeMediaUrls('https://img.example.com/upload/photo.jpg'), '/upload/photo.jpg');

const source = await readFile(new URL('../worker/src/index.js', import.meta.url), 'utf8');
// 读取侧与保存侧都应用规范化
assert.match(source, /const imgs = normalizeMediaUrls\(row\.imgs\)/);
assert.match(source, /imgConfigs: imgConfigs\(imgs\)/);
assert.match(source, /const imgsValue = normalizeMediaUrls\(imgs\.join\(','\)\)/);
// serveMedia 响应头加固：nosniff + Content-Type 兜底
assert.match(source, /headers\.set\('x-content-type-options', 'nosniff'\)/);
assert.match(source, /const inferred = mediaContentType\(key\)/);

// 用户表单 autocomplete
const login = await readFile(new URL('../front/pages/user/login.vue', import.meta.url), 'utf8');
assert.match(login, /autocomplete="username"/);
assert.match(login, /autocomplete="current-password"/);
const reg = await readFile(new URL('../front/pages/user/reg.vue', import.meta.url), 'utf8');
assert.match(reg, /autocomplete="username"/);
assert.match(reg, /autocomplete="new-password"/);
const commentBox = await readFile(new URL('../front/components/CommentBox.vue', import.meta.url), 'utf8');
assert.match(commentBox, /autocomplete="name"/);
assert.match(commentBox, /autocomplete="url"/);
assert.match(commentBox, /autocomplete="email"/);
const userSettings = await readFile(new URL('../front/pages/user/settings.vue', import.meta.url), 'utf8');
assert.match(userSettings, /autocomplete="email"/);
assert.match(userSettings, /autocomplete="new-password"/);

// 正文 Markdown 图片的绝对 URL 也要相对化（动态正文 + 关于页）
const mdUtils = await readFile(new URL('../front/utils/index.ts', import.meta.url), 'utf8');
assert.match(mdUtils, /md\.renderer\.rules\.image/, '动态正文 Markdown 图片应规范化');
assert.match(mdUtils, /attrSet\('src'/, 'image 规则应重写 src 为相对路径');
assert.match(mdUtils, /error\?\.data\?\.message/, 'useMyFetch 必须提取服务端错误消息，避免用户只看到 FetchError');
const about = await readFile(new URL('../front/pages/about.vue', import.meta.url), 'utf8');
assert.match(about, /renderer\.renderer\.rules\.image/, '关于页 Markdown 图片应规范化');

console.log('Media CORB and autocomplete regression tests: PASS');
