import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../../front/pages/memo/[id].vue', import.meta.url), 'utf8');

// 私密/被删动态：详情页必须呈现 404 提醒而非空白，404 与 403 统一文案避免泄露存在性
assert.match(page, /loadError/, '加载失败状态必须存在');
assert.match(page, /你无权访问该动态，该动态可能删除或设为隐私/, '必须显示无权访问提醒文案');
assert.match(page, /text-7xl[^>]*>404</, '提醒页必须有 404 视觉标识');
assert.match(page, /返回首页/, '必须提供返回首页按钮');
assert.match(page, /to="\/"/, '返回按钮必须指向首页');

// 失败处理：memo 清空 + 错误置位；成功时错误复位
assert.match(page, /memo\.value = undefined/, '失败必须清空动态避免渲染半截内容');
assert.match(page, /loadError\.value = true/, '失败必须置位错误状态');
assert.match(page, /loadError\.value = false/, '成功必须复位错误状态');

// 失败时同步 noindex，与 worker pageSeo 私密动态 noindex 对齐
assert.match(page, /noindex, nofollow/, '失败必须注入 noindex');
assert.match(page, /动态不可访问/, '失败必须设置页面标题');

// worker 侧语义不变：不存在 404、无权限 403（本测试只锁定前端文案不区分二者）
const worker = await readFile(new URL('../../worker/src/index.js', import.meta.url), 'utf8');
assert.match(worker, /json\(fail\('动态不存在'\), 404/, 'worker 必须保持 404 语义');
assert.match(worker, /json\(fail\('暂无权限查看'\), 403/, 'worker 必须保持 403 语义');

console.log('memo-access-denied-notice: PASS');
