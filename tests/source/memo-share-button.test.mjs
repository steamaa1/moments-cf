import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const memo = await readFile(new URL('../../front/components/Memo.vue', import.meta.url), 'utf8');

// 更多工具栏：分享按钮在「详情」左边，复制动态详情链接
assert.match(memo, /shareMemo/, '分享必须绑定 shareMemo 处理函数');
assert.match(memo, />分享</, '工具栏必须有「分享」入口');
assert.match(memo, /i-carbon-share/, '分享必须使用 share 图标');
assert.match(memo, /shareMemo\(item\.id\)/, '分享必须携带动态 id');
assert.match(memo, /window\.location\.origin\)\/memo\/\$\{id\}|`\$\{window\.location\.origin\}\/memo\/\$\{id\}`/, '复制内容必须是详情页绝对链接');

// 顺序契约：工具栏内分享必须位于详情左边（分享 | 详情）。
// 文件头部另有折叠摘要的 <span>详情</span>，因此取工具栏区间内（shareMemo 模板附近）比对
const toolbarStart = memo.indexOf('i-carbon-share');
const sharePos = memo.indexOf('>分享<', toolbarStart);
const viewPos = memo.indexOf('>详情<', toolbarStart);
assert.ok(sharePos > -1 && viewPos > -1 && sharePos < viewPos, '分享必须位于详情左边');

// 移动端防折行：窄屏下标签不得逐字竖排（截图 bug），工具栏不得右溢出屏幕
assert.match(memo, /max-w-\[calc\(100vw-2rem\)\]/, '工具栏必须限制最大宽度防止右溢出');
const nowrapCount = (memo.match(/whitespace-nowrap/g) || []).length;
assert.ok(nowrapCount >= 4, `四个工具项都必须 whitespace-nowrap（当前 ${nowrapCount} 处）`);

// 复制兼容性：非安全上下文（http 自托管）回退 execCommand，不能只依赖 clipboard API
assert.match(memo, /navigator\.clipboard/, '优先使用 clipboard API');
assert.match(memo, /window\.isSecureContext/, '必须区分安全上下文');
assert.match(memo, /execCommand\("copy"\)/, '非安全上下文必须回退 execCommand');
assert.match(memo, /removeChild\(textarea\)/, '回退用的 textarea 必须清理');

// 反馈与收尾
assert.match(memo, /链接已复制/, '复制成功必须有 toast 反馈');
assert.match(memo, /复制失败，请手动复制/, '复制失败必须给出手动兜底提示');
assert.match(memo, /showToolbar\.value = false;\s*\n\s*const url = `\$\{window\.location\.origin\}/, '点击分享后必须收起工具栏');

// 键盘可达
assert.match(memo, /@keydown\.enter\.prevent="shareMemo\(item\.id\)"/, '分享必须支持回车触发');

console.log('memo-share-button: PASS');
