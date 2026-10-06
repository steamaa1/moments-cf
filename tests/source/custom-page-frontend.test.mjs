import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * 自定义页面前端源码契约（模式同 memo-block-order.test.mjs）：
 * - pages/[slug].vue 必须经 parsePageBlocks 拆块、交给 PageRenderer 渲染、404 分支 noindex
 * - sys/pages/[id].vue 编辑器必须含 Emoji 插入、selected 事件、解析预览、光标插入
 * - RESERVED_PAGE_SLUGS：front/utils/pageBlocks.js 与 worker/src/index.js 两侧数组字面量
 *   逐字一致（正则提取后 JSON.parse 比对，顺序也必须一致）
 * - SUPPORTED_UI_KINDS 与 PageRenderer 的 KIND_COMPONENTS 分发集合一致
 * - Header.vue / MobileNav.vue / layouts/default.vue 都必须接 pageNav 导航
 * - PageRenderer 与七个 page-ui 组件源码不得出现 :global(.dark)（编译会丢后代选择器）
 */
const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [displayPage, editorPage, util, renderer, worker, header, mobileNav, layout] = await Promise.all([
  read('front/pages/[slug].vue'),
  read('front/pages/sys/pages/[id].vue'),
  read('front/utils/pageBlocks.js'),
  read('front/components/PageRenderer.vue'),
  read('worker/src/index.js'),
  read('front/components/Header.vue'),
  read('front/components/MobileNav.vue'),
  read('front/layouts/default.vue'),
]);
// 读七个 page-ui 组件：文件缺失时 readFile 直接抛错，测试立刻失败
const uiComponents = await Promise.all(
  ['Button', 'Card', 'Countdown', 'Timeline', 'Gallery', 'Music', 'Icons'].map(name => read(`front/components/page-ui/PageUi${name}.vue`)),
);

// 1) 根级展示页：解析器 + 渲染器 + 404 分支 noindex
assert.match(displayPage, /parsePageBlocks/, 'pages/[slug].vue 必须经 parsePageBlocks 拆块渲染');
assert.match(displayPage, /PageRenderer/, 'pages/[slug].vue 必须用 PageRenderer 渲染正文');
assert.match(displayPage, /noindex/, 'pages/[slug].vue 的 404 分支必须注入 noindex');

// 2) 编辑器：Emoji 图案、selected 事件、解析预览、光标插入
assert.match(editorPage, /Emoji/, 'sys/pages/[id].vue 必须内嵌 Emoji 组件供插入图案');
assert.match(editorPage, /selected/, 'sys/pages/[id].vue 必须监听 Emoji 的 selected 事件');
assert.match(editorPage, /parsePageBlocks/, 'sys/pages/[id].vue 实时预览必须经 parsePageBlocks');
assert.match(editorPage, /selectionStart/, 'sys/pages/[id].vue 光标插入必须走 selectionStart/selectionEnd');

// 3) 保留字清单：前端工具与 worker 两侧数组字面量逐字一致（含顺序）
// 数组字面量是单引号字符串，先归一成双引号再 JSON.parse（slug 只含小写字母/数字/连字符，替换安全）
const extractArray = (source, name) => {
  const literal = source.match(new RegExp(`${name} = (\\[[^\\]]*\\])`))?.[1];
  assert.ok(literal, `必须能从源码中提取 ${name} 数组字面量`);
  return JSON.parse(literal.replace(/'/g, '"'));
};
const frontSlugs = extractArray(util, 'RESERVED_PAGE_SLUGS');
const workerSlugs = extractArray(worker, 'RESERVED_PAGE_SLUGS');
assert.deepEqual(frontSlugs, workerSlugs, 'RESERVED_PAGE_SLUGS 前端与 worker 必须逐字一致（含顺序）');
assert.ok(Array.isArray(frontSlugs) && frontSlugs.length >= 15, '保留字清单不得缩水（当前 15 项）');
assert.equal(frontSlugs.includes('page'), true, 'page 本身是公开接口路径，必须保留');

// 4) 组件 kind：解析器支持集合与渲染器分发集合一致（每项都映射到 PageUi 子组件）
const kinds = extractArray(util, 'SUPPORTED_UI_KINDS');
// 分发映射必须是「kind → 显式 import 的组件对象」，不能是字符串名：
// Nuxt 3 组件自动导入不做全局注册，字符串 :is 在运行时解析不到（曾导致组件块完全不渲染）。
const rendererKinds = [...renderer.matchAll(/^ {2}([a-zA-Z]+): PageUi[A-Za-z]+,$/gm)].map(match => match[1]);
assert.ok(Array.isArray(kinds) && kinds.length >= 7, 'SUPPORTED_UI_KINDS 必须覆盖全部七种组件');
assert.deepEqual([...rendererKinds].sort(), [...kinds].sort(), 'PageRenderer 分发的 kind 集合必须与 SUPPORTED_UI_KINDS 一致');
assert.equal(renderer.includes('KIND_COMPONENTS'), true, 'PageRenderer 必须用显式 KIND_COMPONENTS map 分发');
for (const name of ['Button', 'Card', 'Countdown', 'Timeline', 'Gallery', 'Music', 'Icons']) {
  assert.match(renderer, new RegExp(`import PageUi${name} from '\\./page-ui/PageUi${name}\\.vue'`), `PageRenderer 必须显式 import PageUi${name}（字符串名 :is 运行时解析不到）`);
}
assert.doesNotMatch(renderer, /: PageUi[A-Za-z]*.*'PageUi/, 'KIND_COMPONENTS 不得再使用字符串组件名');

// 5) 导航接线：桌面下拉、移动端网格、布局数据加载三处都必须消费 pageNav
for (const [name, source] of [['Header.vue', header], ['MobileNav.vue', mobileNav], ['layouts/default.vue', layout]]) {
  assert.match(source, /\bpageNav\b/, `${name} 必须接自定义页面导航（pageNav）`);
}

// 6) 深色写法约束：:global(.dark) 会被 @vue/compiler-sfc 编译成裸 .dark（丢后代选择器），必须全部用 .dark 前缀
for (const [index, source] of [renderer, ...uiComponents].entries()) {
  assert.equal(source.includes(':global(.dark'), false, `page-ui 第 ${index + 1} 个组件源码不得使用 :global(.dark) 写法`);
}

// 8) 编辑器工具条：表情入口命名正确、图标选择器必须带预览；「图案」按钮不得回归
//    （历史上把 emoji 入口误标成「插入图案」并另加过独立「图案」按钮，均已按用户要求撤掉）
assert.match(editorPage, /插入表情/, 'emoji 入口必须命名为「插入表情」');
assert.doesNotMatch(editorPage, /插入图案/, '不应再出现「插入图案」字样');
assert.doesNotMatch(editorPage, /STATUS_PATTERN_GROUPS|onPatternSelected|showPatternModal/, '工具栏不得再回到独立「图案」按钮方案');
assert.match(editorPage, /effectiveIcon/, '图标选择器必须计算当前图标名供预览');
assert.match(editorPage, /<UIcon :name="name"/, '常用图标列表必须用 UIcon 渲染图标预览');

console.log('custom-page-frontend: PASS');
