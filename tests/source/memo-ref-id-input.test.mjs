import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const embed = await readFile(new URL('../../front/components/MemoRefEmbed.vue', import.meta.url), 'utf8');

// 引用站内动态：/memo/ 前缀省略，纯数字 ID 直接可用（同时兼容旧格式与完整 URL）
assert.match(embed, /\/\^\\d\+\$\/\.test\(text\)/, '解析必须支持纯数字动态 ID');
assert.match(embed, /inputmode="numeric"/, '输入框必须提示数字键盘');
assert.match(embed, /动态 ID，如 123/, '占位符必须示例纯数字用法');
assert.match(embed, /无需 \/memo\/ 前缀/, '错误提示必须说明前缀可省略');

// 发给后端前必须补全前缀：parseMemoRefUrl 只认 /memo/{id} 或完整 URL
assert.match(embed, /\/\^\\d\+\$\/\.test\(url\) \? `\/memo\/\$\{url\}` : url/, '纯数字必须规范化为 /memo/{id} 再调预览接口');
assert.match(embed, /kind: 'memo', url: normalized/, '预览请求必须使用规范化后的值');

// 旧兼容不回退：/memo/{id} 路径与完整 URL 解析仍在
assert.match(embed, /\^\\\/memo\\\/\(\\d\+\)\\\/\?\$/, '必须保留 /memo/{id} 路径格式解析');
assert.match(embed, /new URL\(text\)/, '必须保留完整 URL 解析');

console.log('memo-ref-id-input: PASS');
