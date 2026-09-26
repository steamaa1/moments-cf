import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [memoEdit, memo, util, worker] = await Promise.all([
  read('front/components/MemoEdit.vue'),
  read('front/components/Memo.vue'),
  read('front/utils/memoBlocks.js'),
  read('worker/src/index.js'),
]);

// 共享工具：编辑态与展示态必须用同一份排序实现，否则两边顺序会各自漂移
assert.match(memoEdit, /from '~\/utils\/memoBlocks'/, 'MemoEdit 必须使用共享排序工具');
assert.match(memo, /from "~\/utils\/memoBlocks"/, 'Memo.vue 必须使用共享排序工具');
assert.match(util, /export function orderMemoBlocks/, '工具必须导出 orderMemoBlocks');
assert.match(util, /export function moveMemoBlock/, '工具必须导出 moveMemoBlock');

// 默认顺序契约：两侧 blocks.push 的 kind 序列必须逐字一致
const pushKinds = source => [...source.matchAll(/blocks\.push\(\{ kind: '([a-zA-Z]+)'/g)].map(match => match[1]);
const editOrder = pushKinds(memoEdit);
const viewOrder = pushKinds(memo);
const EXPECTED_DEFAULT = ['external', 'images', 'music', 'x', 'git', 'memoRef', 'attachment', 'doubanBook', 'doubanMovie', 'video'];
assert.deepEqual(editOrder, EXPECTED_DEFAULT, '编辑态默认顺序必须与契约一致');
assert.deepEqual(viewOrder, EXPECTED_DEFAULT, '展示态默认顺序必须与契约一致');

// 编辑态：可排序列表 + 手柄 + 上移/下移按钮 + order 持久化
assert.match(memoEdit, /ref="blocksEl"/, '编辑态预览区必须有容器引用供 SortableJS 接管');
assert.match(memoEdit, /:data-block-key="block\.key"/, '每个块必须带可读取的 key 标记');
assert.match(memoEdit, /class="block-handle/, '必须有拖拽手柄');
assert.match(memoEdit, /handle: '\.block-handle'/, '外层拖拽只能由手柄发起（避免与图片组内部排序冲突）');
assert.match(memoEdit, /v-for="block in sortableBlocks"/, '模板必须渲染交给 SortableJS 的数组，拖拽后 Vue 才能同步');
// 新建动态一开始没有任何内容块：若那时不初始化，等添加内容后就再也拖不动了
assert.match(memoEdit, /await nextTick\(\)\s*\n\s*if \(blocksEl\.value\) \{/, '拖拽实例必须在挂载时就初始化，不得以「当前块数」为前提');
assert.doesNotMatch(memoEdit, /sortableBlocks\.value\.length > 1/, '不得用块数作为初始化条件（空动态会失效）');
// 排序入口：左侧圆点（与仓库既有圆形元素同款底色），拖拽为主、方向键为辅
// 先取出圆点按钮整块再断言，避免用字符窗口猜属性间距
const handleButton = (memoEdit.match(/<button[\s\S]*?class="block-handle[\s\S]*?<\/button>/) || [''])[0];
assert.ok(handleButton, '必须存在排序圆点按钮');
assert.match(handleButton, /rounded-full/, '排序控件必须是圆形（圆点）而非按钮列');
assert.match(handleButton, /bg-gray-200\/75/, '圆点底色必须与仓库既有圆形元素一致');
assert.match(handleButton, /dark:bg-gray-800\/75/, '圆点必须同时适配深色模式底色');
assert.match(handleButton, /<span class="h-1\.5 w-1\.5 rounded-full bg-gray-500/, '圆点内部必须是一枚小圆点');
assert.match(memoEdit, /@keydown\.up\.prevent="moveBlock\(block\.key, -1\)"/, '圆点聚焦后必须支持上移方向键');
assert.match(memoEdit, /@keydown\.down\.prevent="moveBlock\(block\.key, 1\)"/, '圆点聚焦后必须支持下移方向键');
assert.match(memoEdit, /v-if="sortableBlocks\.length > 1"/, '只有单个块时不得显示排序圆点（无可排序）');
assert.doesNotMatch(memoEdit, /aria-label="上移"|aria-label="下移"/, '不再使用上下移按钮列');
assert.match(memoEdit, /touch-none/, '圆点必须阻止触摸默认行为，避免拖拽时页面跟着滚');
assert.match(memoEdit, /motion-reduce:transition-none/, '圆点动效必须尊重减少动态效果偏好');
// 触屏拖拽：原生 HTML5 拖放在触摸屏无效，必须启用 fallback；容差避免「轻扫页面」被误判为拖拽
assert.match(memoEdit, /forceFallback: true/, '必须启用 fallback 才能支持触屏拖拽');
assert.match(memoEdit, /fallbackOnBody: true/, 'fallback 必须挂到 body，避免被容器裁剪');
assert.match(memoEdit, /fallbackTolerance: \d+/, '必须有拖拽容差');
assert.match(memoEdit, /ghostClass: 'block-ghost'/, '必须有拖拽占位反馈类');
assert.match(memoEdit, /:deep\(\.block-ghost\)/, '占位块必须有可见样式');
assert.match(memoEdit, /order: Array<string>\(\)/, 'state 必须有 order 字段');
assert.match(memoEdit, /state\.order = Array\.isArray\(ext\.order\) \? ext\.order : \[\]/, '编辑已有动态必须回填 order');
assert.match(memoEdit, /order: state\.order\.filter\(key => availableBlocks\.value\.some\(block => block\.key === key\)\)/, '保存时必须写入 order 并剔除已不存在的块（避免陈旧条目堆积）');

// 展示态：按 ext.order 渲染，且保留两种视频形态
assert.match(memo, /v-for="block in orderedBlocks"/, '展示态必须按顺序渲染');
assert.match(memo, /orderMemoBlocks\(availableBlocks\.value, extJSON\.value\.order\)/, '展示态必须把 ext.order 交给共享工具');
assert.match(memo, /video-preview-iframe[\s\S]{0,200}video-preview/, '视频两种形态都必须保留');

// 图片组：两侧都只在确有图片时才占位（否则会多出一个空块）
assert.match(memoEdit, /state\.imgs\.split\(','\)\.filter\(Boolean\)\.length/, '编辑态必须在有图片时才算一个块');
assert.match(memo, /String\(item\.value\.imgs \|\| ''\)\.split\(','\)\.filter\(Boolean\)\.length/, '展示态必须在有图片时才算一个块');

// worker：order 校验（格式/去重/封顶）
assert.match(worker, /const MEMO_BLOCK_KEY_PATTERN = /, 'worker 必须定义 order key 格式');
assert.match(worker, /const MEMO_BLOCK_ORDER_MAX = \d+;/, 'worker 必须定义 order 上限');
assert.match(worker, /order\?\.\.\.,\[\]|Array\.isArray\(ext\.order\)/, 'worker 必须清洗 ext.order');
assert.match(worker, /output\.order = order;/, '清洗结果必须写回 output.order');
assert.match(worker, /MEMO_BLOCK_KEY_PATTERN\.test\(key\)/, '必须按格式校验每个 key');
assert.match(worker, /order\.includes\(key\)/, '必须去重');

console.log('memo-block-order: PASS');
