import assert from 'node:assert/strict';
import { parsePageBlocks, RESERVED_PAGE_SLUGS, SLUG_PATTERN, SUPPORTED_UI_KINDS } from '../../front/utils/pageBlocks.js';

/**
 * 自定义页面正文块解析契约（front/utils/pageBlocks.js 为纯 JS，这里真实执行而非正则断言）：
 * - 围栏 ```ui:kind 包一段 JSON → type:'ui' 块（kind + data），前后文本按原顺序保留为 markdown 块
 * - 未知 kind / 坏 JSON / 未闭合围栏 → 整块原文并入 markdown 流，绝不丢用户文字
 * - 空片段不输出；任何输入不抛错
 */

// 1) 纯 markdown：整体是一个块，原文保留
{
  const blocks = parsePageBlocks('# 标题\n\n第一段。\n\n第二段。');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'markdown');
  assert.equal(blocks[0].value, '# 标题\n\n第一段。\n\n第二段。');
}

// 2) 混排：块顺序严格保留（markdown → ui → markdown → ui）
{
  const content = [
    '开头文字',
    '```ui:countdown',
    '{"target":"2027-01-01 00:00:00","label":"倒计时"}',
    '```',
    '中间文字',
    '```ui:button',
    '{"items":[{"label":"首页","href":"/"}]}',
    '```',
    '结尾文字',
  ].join('\n');
  const blocks = parsePageBlocks(content);
  assert.deepEqual(blocks.map(b => b.type), ['markdown', 'ui', 'markdown', 'ui', 'markdown'], '混排顺序必须逐块保留');
  const [m1, ui1, m2, ui2, m3] = blocks;
  assert.equal(m1.value, '开头文字');
  assert.equal(ui1.kind, 'countdown');
  assert.deepEqual(ui1.data, { target: '2027-01-01 00:00:00', label: '倒计时' });
  assert.equal(m2.value, '中间文字');
  assert.equal(ui2.kind, 'button');
  assert.deepEqual(ui2.data, { items: [{ label: '首页', href: '/' }] });
  assert.equal(m3.value, '结尾文字');
  // data 必须是解析后的对象而非字符串（下游组件按对象取字段）
  assert.equal(typeof ui1.data, 'object');
}

// 3) 七种 kind 全部可解析，其余 kind 一律回退
for (const kind of SUPPORTED_UI_KINDS) {
  const blocks = parsePageBlocks('```ui:' + kind + '\n{"ok":true}\n```');
  assert.equal(blocks.length, 1, `kind ${kind} 必须产出 ui 块`);
  assert.equal(blocks[0].type, 'ui');
  assert.equal(blocks[0].kind, kind);
  assert.deepEqual(blocks[0].data, { ok: true });
}
{
  const fallback = parsePageBlocks('```ui:video\n{"src":"x.mp4"}\n```');
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].type, 'markdown', '未知 kind 必须整块原文并入 markdown 流');
  assert.equal(fallback[0].value, '```ui:video\n{"src":"x.mp4"}\n```', '回退块必须保留围栏行与内部 JSON 原文');
}

// 4) 坏 JSON：整块原文回退，前后文本不丢
{
  const content = ['前文', '```ui:card', '{ items: [未加引号] }', '```', '后文'].join('\n');
  const blocks = parsePageBlocks(content);
  assert.deepEqual(blocks.map(b => b.type), ['markdown'], '坏 JSON 时全部并入同一个 markdown 块');
  assert.equal(blocks[0].value, content, '坏 JSON 回退必须逐字保留原文');
}
{
  // 契约原文：JSON.parse 成功且 kind 合法即输出 ui 块——即使结果是 null / 标量，
  // 也交由下游组件按「空数据渲染空容器」容错（t4 组件协议），解析器不额外回退
  for (const inner of ['null', '"str"', '123']) {
    const blocks = parsePageBlocks('```ui:card\n' + inner + '\n```');
    assert.equal(blocks.length, 1, `合法 JSON（${inner}）必须产出 ui 块`);
    assert.equal(blocks[0].type, 'ui');
    assert.equal(blocks[0].kind, 'card');
  }
  assert.deepEqual(parsePageBlocks('```ui:card\nnull\n```')[0].data, null);
}

// 5) 未闭合围栏：整体按普通文本保留
{
  const content = '```ui:gallery\n{"items":[]}';
  const blocks = parsePageBlocks(content);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'markdown');
  assert.equal(blocks[0].value, content);
}
{
  // 前文 + 未闭合围栏：两段都在，围栏开头行不丢
  const content = '前文\n```ui:music\n{"url":"a.mp3"}';
  const blocks = parsePageBlocks(content);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].value, content);
}

// 6) 围栏前后文本保留；空片段不输出
{
  const content = [
    '```ui:icons',
    '{"items":[{"icon":"i-carbon-home","label":"首页"}]}',
    '```',
  ].join('\n');
  const blocks = parsePageBlocks(content);
  assert.equal(blocks.length, 1, '页面只有组件块时不产生空 markdown 块');
  assert.equal(blocks[0].type, 'ui');
}
{
  // 纯空白片段（空行 / 空格行）不输出
  const blocks = parsePageBlocks('```ui:button\n{"items":[]}\n```\n\n   \n');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'ui');
}

// 7) 普通三反引号代码块不是组件围栏，必须原样保留
{
  const content = '```js\nconsole.log("hi")\n```';
  const blocks = parsePageBlocks(content);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'markdown', '非 ui: 围栏不得被当作组件块');
  assert.equal(blocks[0].value, content);
}

// 8) 任何输入都不抛错
assert.deepEqual(parsePageBlocks(null), []);
assert.deepEqual(parsePageBlocks(undefined), []);
assert.deepEqual(parsePageBlocks(42), []);
assert.deepEqual(parsePageBlocks(''), []);
assert.deepEqual(parsePageBlocks('\n\n'), [], '全空白输入输出空数组');

// 9) SLUG_PATTERN：小写字母数字连字符，1 到 40 位
for (const good of ['a', 'about', 'my-page', 'page-2', 'a'.repeat(40), '0', '---', 'x9-y']) {
  assert.equal(SLUG_PATTERN.test(good), true, `合法 slug ${good} 必须通过`);
}
assert.equal(SLUG_PATTERN.test('a'.repeat(41)), false, '41 位必须拒绝');
assert.equal(SLUG_PATTERN.test('My-Page'), false, '大写必须拒绝');
assert.equal(SLUG_PATTERN.test('页'), false, '非 ASCII 必须拒绝');
assert.equal(SLUG_PATTERN.test('a_b'), false, '下划线必须拒绝');
assert.equal(SLUG_PATTERN.test('a.b'), false, '点号必须拒绝（sitemap.xml 这类保留路径靠它排除）');
assert.equal(SLUG_PATTERN.test('a b'), false, '空格必须拒绝');
assert.equal(SLUG_PATTERN.test(''), false, '空串必须拒绝');
// 不带 g 标志：同一正则实例反复 test 结果稳定（lastIndex 陷阱回归）
assert.equal(SLUG_PATTERN.test('ok'), true);
assert.equal(SLUG_PATTERN.test('ok'), true, '同一正则重复 test 结果不得漂移（禁 g 标志）');
assert.equal(SLUG_PATTERN.global, false, 'SLUG_PATTERN 不得带 g 标志');

// 10) 保留字与 kind 清单契约：与 worker 侧 / PageRenderer 分发集合逐字一致同序
assert.deepEqual(RESERVED_PAGE_SLUGS, ['about', 'friend', 'photos', 'new', 'edit', 'user', 'sys', 'memo', 'tags', 'api', 'upload', 'rss', 'x-media', 'douban-cover', 'page']);
assert.deepEqual(SUPPORTED_UI_KINDS, ['button', 'card', 'countdown', 'timeline', 'gallery', 'music', 'icons']);
assert.equal(new Set(SUPPORTED_UI_KINDS).size, SUPPORTED_UI_KINDS.length, 'kind 清单不得重复');

console.log('page-blocks: PASS');
