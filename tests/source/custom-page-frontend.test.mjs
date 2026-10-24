import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PAGE_BLOCK_REGISTRY } from '../../front/utils/pageBlockSchema.js';

/**
 * 自定义页面前端源码契约（模式同 memo-block-order.test.mjs）：
 * - pages/[slug].vue 必须经 parsePageBlocks 拆块、交给 PageRenderer 渲染、404 分支 noindex
 * - sys/pages/[id].vue 编辑器必须含 Emoji 插入、selected 事件、解析预览、光标插入
 * - RESERVED_PAGE_SLUGS：front/utils/pageBlocks.js 与 worker/src/index.js 两侧数组字面量
 *   逐字一致（正则提取后 JSON.parse 比对，顺序也必须一致）
 * - SUPPORTED_UI_KINDS 与 PageRenderer 的 KIND_COMPONENTS 分发集合一致
 * - 三方 kind 一致（P1 块编辑器）：pageBlockSchema 注册表（纯 JS 直接 import 取键）、
 *   pageBlocks.js 的 SUPPORTED_UI_KINDS、PageRenderer 的 KIND_COMPONENTS 键，排序后 deepEqual
 * - 编辑器双模式（P1 块编辑器）：块编辑模式接线 PageBlockList + PageBlockForm、
 *   源码模式保留（「源码模式」字样）、块变化经 serializePageBlocks 写回 form.content
 * - Header.vue / MobileNav.vue / layouts/default.vue 都必须接 pageNav 导航
 * - PageRenderer 与全部 page-ui 组件源码不得出现 :global(.dark)（编译会丢后代选择器）
 */
const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [displayPage, editorPage, util, renderer, worker, header, mobileNav, layout, fieldComponent, assetComposable, pageBlockList] = await Promise.all([
  read('front/pages/[slug].vue'),
  read('front/pages/sys/pages/[id].vue'),
  read('front/utils/pageBlocks.js'),
  read('front/components/PageRenderer.vue'),
  read('worker/src/index.js'),
  read('front/components/Header.vue'),
  read('front/components/MobileNav.vue'),
  read('front/layouts/default.vue'),
  read('front/components/PageBlockField.vue'),
  read('front/composables/useCustomPageAssets.ts'),
  read('front/components/PageBlockList.vue'),
]);
// 读全部 page-ui 组件：文件缺失时 readFile 直接抛错，测试立刻失败
const uiComponents = await Promise.all(
  ['Button', 'Card', 'Countdown', 'Timeline', 'Gallery', 'Music', 'Icons', 'Callout', 'Accordion', 'Video', 'Links', 'Stats', 'Columns', 'Embed']
    .map(name => read(`front/components/page-ui/PageUi${name}.vue`)),
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
assert.ok(Array.isArray(kinds) && kinds.length >= 14, 'SUPPORTED_UI_KINDS 必须覆盖全部组件（P1 七种 + P2 七种）');
assert.deepEqual([...rendererKinds].sort(), [...kinds].sort(), 'PageRenderer 分发的 kind 集合必须与 SUPPORTED_UI_KINDS 一致');
assert.equal(renderer.includes('KIND_COMPONENTS'), true, 'PageRenderer 必须用显式 KIND_COMPONENTS map 分发');
for (const name of ['Button', 'Card', 'Countdown', 'Timeline', 'Gallery', 'Music', 'Icons', 'Callout', 'Accordion', 'Video', 'Links', 'Stats', 'Columns', 'Embed']) {
  assert.match(renderer, new RegExp(`import PageUi${name} from '\\./page-ui/PageUi${name}\\.vue'`), `PageRenderer 必须显式 import PageUi${name}（字符串名 :is 运行时解析不到）`);
}
assert.doesNotMatch(renderer, /: PageUi[A-Za-z]*.*'PageUi/, 'KIND_COMPONENTS 不得再使用字符串组件名');

// 4a) markdown 渲染器单源：PageRenderer 只用 utils/pageMarkdown.js 的共享实例；
//     columns/accordion/callout 的正文渲染也必须来自同一处，避免各自 new markdown-it 后规则漂移
assert.match(renderer, /import \{ renderPageMarkdown \} from '~\/utils\/pageMarkdown'/, 'PageRenderer 必须使用共享 markdown 渲染器');
assert.doesNotMatch(renderer, /from 'markdown-it'/, 'PageRenderer 不得再直接 import markdown-it（渲染器已收敛到 utils/pageMarkdown.js）');
for (const name of ['Callout', 'Accordion', 'Columns']) {
  const source = uiComponents[['Button', 'Card', 'Countdown', 'Timeline', 'Gallery', 'Music', 'Icons', 'Callout', 'Accordion', 'Video', 'Links', 'Stats', 'Columns', 'Embed'].indexOf(name)];
  assert.match(source, /renderPageMarkdown/, `PageUi${name}.vue 的正文必须走共享 markdown 渲染器`);
}

// 4b) 三方 kind 一致（P1 块编辑器）：schema 注册表 / 解析器支持集合 / 渲染器分发键。
//     pageBlockSchema.js 是纯 JS（.js + JSDoc），直接真实 import 取键比正则提取更稳；
//     三方排序后 deepEqual，任何一侧增删 kind（新块类型须三处同步）都会被立刻钉住
const schemaKinds = Object.keys(PAGE_BLOCK_REGISTRY).sort();
assert.ok(schemaKinds.length >= 7, 'pageBlockSchema 注册表 kind 不得少于七种');
assert.deepEqual(schemaKinds, [...kinds].sort(), 'pageBlockSchema 注册表 kind 集合必须与 SUPPORTED_UI_KINDS 完全一致');
assert.deepEqual([...rendererKinds].sort(), schemaKinds, 'PageRenderer KIND_COMPONENTS 键必须与 pageBlockSchema 注册表 kind 集合完全一致');

// 4c) 字段控件（P2-B）：PageBlockForm 统一走 PageBlockField；选图/选图标/日期三类控件接线
assert.match(editorPage, /<PageBlockForm/, '编辑器必须接线 PageBlockForm');
assert.match(fieldComponent, /useMyFetch\('\/photo\/all'/, '选图字段必须复用管理员照片墙接口 /photo/all');
assert.match(fieldComponent, /ICON_PRESETS/, '选图标字段必须复用 utils/pageIcons.js 的常用图标清单');
for (const type of ['image', 'icon', 'datetime']) {
  assert.match(fieldComponent, new RegExp(`field\\.type === '${type}'`), `PageBlockField 必须处理 ${type} 字段类型`);
}
const blockForm = await read('front/components/PageBlockForm.vue');
assert.match(blockForm, /<PageBlockField/, 'PageBlockForm 的字段渲染必须统一走 PageBlockField');

// 4c2) 编辑器横向溢出回归：两个网格项必须 min-w-0。
//      块列表摘要用 truncate（nowrap），网格项默认 min-width:auto 会被 min-content 撑宽；
//      main 的 overflow-x: clip 又会把溢出静默裁掉，线上表现为手机右侧内容被切。
assert.match(editorPage, /<div class="grid min-w-0 items-start gap-6 lg:grid-cols-2">/, '编辑器网格必须 min-w-0');
assert.match(editorPage, /<section class="min-w-0 space-y-4 rounded-2xl/, '表单列必须 min-w-0（防止长块摘要撑宽卡片）');
assert.match(editorPage, /<section class="min-w-0 rounded-2xl/, '预览列必须 min-w-0');
assert.ok((editorPage.match(/<section class="min-w-0/g) || []).length >= 2, '两列都必须带 min-w-0');

// 4d) 逐页 CSS/JS（P2-C）：页面接线 composable，注入标签与清理语义钉死
assert.match(displayPage, /useCustomPageAssets\(page\)/, 'pages/[slug].vue 必须调用 useCustomPageAssets(page) 注入逐页资产');
assert.match(assetComposable, /document\.head\.appendChild/, '逐页 CSS 必须注入 style 到 head');
assert.match(assetComposable, /document\.body\.appendChild/, '逐页 JS 必须注入 script 到 body（内联脚本才会执行）');
assert.match(assetComposable, /cleanup/, '资产切换/卸载必须清理旧标签');
assert.match(assetComposable, /onBeforeUnmount\(cleanup\)/, '页面卸载时必须清理注入的标签');
assert.match(editorPage, /customCss/, '编辑器必须回显/提交逐页 CSS');
assert.match(editorPage, /customJs/, '编辑器必须回显/提交逐页 JS');
assert.match(editorPage, /20000/, '编辑器必须按服务端上限（20000 字）本地拦截');

// 4e) 拖拽无位移分支也必须先复位 DOM：Sortable 取消/原地拖拽可能已物理挪过节点，
//     若 oldIndex === newIndex 直接 return，DOM 会停在移动后的位置，行号 1,3,2 直到刷新。
const insertAt = pageBlockList.indexOf('from.insertBefore(item')
const noopAt = pageBlockList.indexOf('if (oldIndex === newIndex) return')
assert.ok(insertAt >= 0, 'PageBlockList.onEnd 必须复位 DOM');
assert.ok(noopAt > insertAt, 'onEnd 必须先复位 DOM，再判断 oldIndex === newIndex 早退');

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

// 9) 编辑器双模式（P1 块编辑器）：块编辑模式接线两块积木 + 源码模式保留 + 序列化回写。
//    断言用「组件标签形态」（<PageBlockList / <PageBlockForm）而非裸字符串，防止只在
//    注释里提组件名而模板未真正接线；serializePageBlocks 是 blocks → form.content 的唯一写回通道
assert.match(editorPage, /<PageBlockList/, '块编辑模式必须以组件标签接线 PageBlockList（增删选 + 拖拽排序面板）');
assert.match(editorPage, /<PageBlockForm/, '选中 ui 块必须以组件标签接线 PageBlockForm（schema 通用表单）');
assert.match(editorPage, /源码模式/, '双模式编辑器必须保留源码模式（须有「源码模式」字样）');
assert.match(editorPage, /serializePageBlocks/, '块编辑的任何变化必须经 serializePageBlocks 序列化写回 form.content');

console.log('custom-page-frontend: PASS');
