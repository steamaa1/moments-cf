import assert from 'node:assert/strict';
import { parsePageBlocks, serializePageBlocks, RESERVED_PAGE_SLUGS, SLUG_PATTERN, SUPPORTED_UI_KINDS } from '../../front/utils/pageBlocks.js';
import { PAGE_BLOCK_REGISTRY, getPageBlockSchema } from '../../front/utils/pageBlockSchema.js';

/**
 * 自定义页面正文块协议契约（两个工具文件均为纯 JS，这里真实执行而非正则断言）：
 * - 围栏 ```ui:kind 包一段 JSON → type:'ui' 块（kind + data），前后文本按原顺序保留为 markdown 块
 * - 未知 kind / 坏 JSON / 未闭合围栏 → 整块原文并入 markdown 流，绝不丢用户文字
 * - 空片段不输出；任何输入不抛错
 * - serializePageBlocks 与 parsePageBlocks 互逆：parse(serialize(blocks)) 与 blocks deepEqual，
 *   且 parse(serialize(parse(x))) 幂等；markdown 原样写回使回退内容天然保真
 * - PAGE_BLOCK_REGISTRY 七种 kind 与 SUPPORTED_UI_KINDS 双向一致，schema 字段与七个 page-ui 组件协议对齐
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

// 11) serializePageBlocks：与 parse 互逆。roundTrip 同时断言往返 deepEqual，返回中间产物便于进一步检查
const roundTrip = content => {
  const blocks = parsePageBlocks(content)
  const text = serializePageBlocks(blocks)
  assert.deepEqual(parsePageBlocks(text), blocks, `parse(serialize(blocks)) 必须与原块 deepEqual：${JSON.stringify(content)}`)
  return { blocks, text }
}

// 12) 混排往返：markdown 与围栏交替，序列化文本应与原文逐字一致（块间单换行，不引入空行）
{
  const content = [
    '开头文字',
    '```ui:countdown',
    '{"target":"2027-01-01 00:00:00","label":"倒计时"}',
    '```',
    '中间文字',
    '```ui:button',
    '{"items":[{"label":"首页","href":"/","icon":"i-carbon-home"}]}',
    '```',
    '结尾文字',
  ].join('\n');
  const { blocks, text } = roundTrip(content);
  assert.deepEqual(blocks.map(b => b.type), ['markdown', 'ui', 'markdown', 'ui', 'markdown']);
  assert.equal(text, content, '标准混排的序列化文本应与原文一致');
}

// 13) 相邻多围栏：ui 块之间无 markdown，往返仍逐字一致
{
  const content = [
    '```ui:button',
    '{"items":[]}',
    '```',
    '```ui:card',
    '{"columns":3,"items":[{"icon":"i-carbon-star","title":"收藏","desc":"我的书签","href":"/tags"}]}',
    '```',
    '```ui:music',
    '{"url":"/a.mp3","name":"晴天","artist":"周杰伦","cover":"/c.jpg"}',
    '```',
  ].join('\n');
  const { blocks, text } = roundTrip(content);
  assert.deepEqual(blocks.map(b => b.type), ['ui', 'ui', 'ui'], '相邻围栏各自成块、互不吞并');
  assert.equal(text, content);
}

// 14) markdown 内普通代码围栏（如 js 代码块）必须原样保留、不破坏往返
{
  const content = ['# 说明', '', '```js', 'console.log("hi")', '```', '', '结尾文字'].join('\n');
  const { blocks, text } = roundTrip(content);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'markdown');
  assert.equal(blocks[0].value, content, '普通代码围栏整体留在 markdown 块里');
  assert.equal(text, content);
}

// 15) 未知 kind / 坏 JSON：parse 已回退为 markdown 原文，serialize 按原文写回即天然保真
{
  const unknown = '```ui:video\n{"src":"x.mp4"}\n```';
  const { blocks, text } = roundTrip(unknown);
  assert.deepEqual(blocks, [{ type: 'markdown', value: unknown }], '未知 kind 回退块必须保留围栏原文');
  assert.equal(text, unknown, '未知 kind 围栏按回退原文写回');
}
{
  const badJson = '前文\n```ui:card\n{ items: [未加引号] }\n```\n后文';
  const { blocks, text } = roundTrip(badJson);
  assert.deepEqual(blocks, [{ type: 'markdown', value: badJson }], '坏 JSON 回退块必须逐字保留原文');
  assert.equal(text, badJson, '坏 JSON 围栏按回退原文写回');
}

// 16) 幂等：parse(serialize(parse(x))) ≡ parse(x)，覆盖空串、混排、回退、标量 data 等样本
{
  const samples = [
    '',
    '\n\n',
    '# 标题\n\n第一段。\n\n第二段。',
    '开头文字\n```ui:countdown\n{"target":"2027-01-01 00:00:00"}\n```\n中间文字\n```ui:button\n{"items":[{"label":"首页","href":"/"}]}\n```\n结尾文字',
    '```ui:gallery\n{"items":[{"src":"/upload/media/2026/10/01/a.jpg","caption":"日出"}]}\n```',
    '```ui:icons\n{"items":[{"icon":"i-carbon-home","label":"首页","href":"/"},{"icon":"🌱","label":"绿植"}]}\n```',
    '```ui:timeline\n{"items":[{"time":"2026-10-01","title":"项目启动","desc":"第一版上线"}]}\n```',
    '文字\n\n```ui:video\n{"x":1}\n```\n\n回退文字',
    '文字\n\n```ui:card\n{oops}\n```\n\n坏JSON文字',
    '文字\n```ui:video\n{"x":1}\n```\n```ui:button\n{"items":[]}\n```\n尾文',
    '```js\ncode()\n```\n```ui:button\n{"items":[]}\n```',
    '```ui:gallery\n{"items":[]}',
    '```ui:card\nnull\n```',
    '```ui:card\n"str"\n```',
    '```ui:card\n123\n```',
  ];
  for (const content of samples) {
    const once = parsePageBlocks(content);
    const twice = parsePageBlocks(serializePageBlocks(once));
    assert.deepEqual(twice, once, `parse(serialize(parse(x))) 必须幂等：${JSON.stringify(content)}`);
  }
}

// 17) data 为 null / 标量的 ui 块（parse 契约：合法 JSON 一律产出 ui 块）往返不变形
{
  const nullBlocks = parsePageBlocks('```ui:card\nnull\n```');
  assert.deepEqual(nullBlocks, [{ type: 'ui', kind: 'card', data: null }]);
  assert.equal(serializePageBlocks(nullBlocks), '```ui:card\nnull\n```');
  for (const inner of ['null', '"str"', '123']) {
    const blocks = parsePageBlocks('```ui:card\n' + inner + '\n```');
    assert.deepEqual(parsePageBlocks(serializePageBlocks(blocks)), blocks, `标量 data（${inner}）往返不得变形`);
  }
}

// 18) 序列化输出格式：ui 块固定三行围栏，markdown 块原样、块间单换行
{
  const blocks = [
    { type: 'markdown', value: '前文' },
    { type: 'ui', kind: 'countdown', data: { target: '2027-01-01 00:00:00' } },
    { type: 'markdown', value: '后文' },
  ];
  assert.equal(
    serializePageBlocks(blocks),
    '前文\n```ui:countdown\n{"target":"2027-01-01 00:00:00"}\n```\n后文',
    'ui 块输出三行：首行 ```ui:kind，中间一行 JSON.stringify(data)，末行 ```',
  );
  // markdown 块的首尾空行与分隔换行自然合并，不得被 trim 破坏
  assert.equal(
    serializePageBlocks([{ type: 'markdown', value: '文字\n' }, { type: 'markdown', value: '\n文字2' }]),
    '文字\n\n\n文字2',
    'markdown value 必须逐字原样输出（含首尾空行）',
  );
}

// 19) serialize 容错：任何输入不抛错
assert.equal(serializePageBlocks(null), '');
assert.equal(serializePageBlocks(undefined), '');
assert.equal(serializePageBlocks('not-array'), '');
assert.equal(serializePageBlocks([]), '');
assert.equal(serializePageBlocks([null, 42, { type: 'markdown', value: '   ' }]), '', '空块与纯空白 markdown 片段不产出文本');
{
  // data 不可序列化（undefined / 循环引用）时收敛为 'null'，输出永远可被 parse 收回
  assert.equal(serializePageBlocks([{ type: 'ui', kind: 'button', data: undefined }]), '```ui:button\nnull\n```');
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(serializePageBlocks([{ type: 'ui', kind: 'button', data: cyclic }]), '```ui:button\nnull\n```');
  // kind 含换行等非法字符时剔除，防止注入额外行破坏围栏结构
  assert.equal(serializePageBlocks([{ type: 'ui', kind: 'x\n{"evil":1}', data: {} }]), '```ui:xevil1\n{}\n```');
}

/* ============ PAGE_BLOCK_REGISTRY：注册表完备性（front/utils/pageBlockSchema.js） ============ */

// 20) kind 集合与 SUPPORTED_UI_KINDS 双向一致
{
  const registryKinds = Object.keys(PAGE_BLOCK_REGISTRY);
  assert.equal(new Set(registryKinds).size, registryKinds.length, '注册表 kind 不得重复');
  assert.deepEqual([...registryKinds].sort(), [...SUPPORTED_UI_KINDS].sort(), '注册表 kind 集合必须与 SUPPORTED_UI_KINDS 完全一致');
  for (const kind of SUPPORTED_UI_KINDS) {
    assert.ok(PAGE_BLOCK_REGISTRY[kind], `注册表必须包含 ${kind}`);
    assert.equal(PAGE_BLOCK_REGISTRY[kind].kind, kind, `schema.kind 必须与其键一致：${kind}`);
  }
}

// 21) 每项 schema 齐全：label（中文）/ category / icon（carbon 名）/ fields（+可选 lists）逐字段校验
{
  const assertFieldShape = (kind, where, field) => {
    assert.equal(typeof field.key, 'string', `${kind}.${where}.${field.key}.key 必须是字符串`);
    assert.ok(field.key, `${kind}.${where} 字段 key 不得为空`);
    assert.equal(typeof field.label, 'string', `${kind}.${where}.${field.key}.label 必须是字符串`);
    assert.ok(field.label, `${kind}.${where}.${field.key} 的 label 不得为空`);
    assert.ok(field.type === 'string' || field.type === 'number', `${kind}.${where}.${field.key} 的 type 必须是 string|number`);
    if (field.placeholder !== undefined) assert.equal(typeof field.placeholder, 'string', `${kind}.${where}.${field.key} 的 placeholder 必须是字符串`);
    if (field.optional !== undefined) assert.equal(typeof field.optional, 'boolean', `${kind}.${where}.${field.key} 的 optional 必须是布尔`);
  };
  for (const kind of SUPPORTED_UI_KINDS) {
    const schema = PAGE_BLOCK_REGISTRY[kind];
    assert.equal(typeof schema.label, 'string', `${kind} 的 label 必须是字符串`);
    assert.ok(schema.label.length >= 2, `${kind} 的 label 必须是非空中文`);
    assert.equal(typeof schema.category, 'string', `${kind} 的 category 必须是字符串`);
    assert.ok(schema.category, `${kind} 的 category 不得为空`);
    assert.ok(/^i-carbon-[a-z0-9-]+$/.test(schema.icon), `${kind} 的 icon 必须是 carbon 图标名（存在性由 tests/source/icon-names.test.mjs 校验）`);
    assert.ok(Array.isArray(schema.fields), `${kind} 的 fields 必须是数组`);
    for (const field of schema.fields) assertFieldShape(kind, 'fields', field);
    if (schema.lists !== undefined) {
      assert.ok(Array.isArray(schema.lists), `${kind} 的 lists 要么缺省要么是数组`);
      for (const list of schema.lists) {
        assert.equal(typeof list.key, 'string', `${kind} 的列表 key 必须是字符串`);
        assert.ok(list.key, `${kind} 的列表 key 不得为空`);
        assert.equal(typeof list.label, 'string', `${kind} 列表 ${list.key} 的 label 必须是字符串`);
        assert.ok(list.label, `${kind} 列表 ${list.key} 的 label 不得为空`);
        assert.ok(Array.isArray(list.itemFields) && list.itemFields.length > 0, `${kind} 列表 ${list.key} 必须有非空 itemFields`);
        for (const field of list.itemFields) assertFieldShape(kind, `${list.key}.itemFields`, field);
      }
    }
  }
}

// 22) 数据协议与七个 page-ui 组件一致：逐 kind 断言字段 key 顺序与 optional 集合
{
  const keys = arr => arr.map(f => f.key);
  const optionalKeys = arr => arr.filter(f => f.optional).map(f => f.key);
  const assertItemFields = (kind, listKey, allKeys, optional) => {
    const list = PAGE_BLOCK_REGISTRY[kind].lists.find(l => l.key === listKey);
    assert.ok(list, `${kind} 必须有列表字段 ${listKey}`);
    assert.deepEqual(keys(list.itemFields), allKeys, `${kind}.${listKey} 字段集合与组件协议一致`);
    assert.deepEqual(optionalKeys(list.itemFields), optional, `${kind}.${listKey} 可选字段与组件协议一致`);
  };
  // button：items[label, href, icon 可选]
  assertItemFields('button', 'items', ['label', 'href', 'icon'], ['icon']);
  // card：columns 数字 + items[icon 可选, title, desc 可选, href 可选]
  assert.deepEqual(keys(PAGE_BLOCK_REGISTRY.card.fields), ['columns']);
  assert.equal(PAGE_BLOCK_REGISTRY.card.fields[0].type, 'number', 'card.columns 必须是 number 类型');
  assertItemFields('card', 'items', ['icon', 'title', 'desc', 'href'], ['icon', 'desc', 'href']);
  // countdown：target + label/doneText 可选，无列表
  assert.deepEqual(keys(PAGE_BLOCK_REGISTRY.countdown.fields), ['target', 'label', 'doneText']);
  assert.deepEqual(optionalKeys(PAGE_BLOCK_REGISTRY.countdown.fields), ['label', 'doneText']);
  assert.ok(!PAGE_BLOCK_REGISTRY.countdown.lists, 'countdown 无列表字段');
  // timeline：items[time 可选, title, desc 可选]
  assertItemFields('timeline', 'items', ['time', 'title', 'desc'], ['time', 'desc']);
  // gallery：items[src, caption 可选]
  assertItemFields('gallery', 'items', ['src', 'caption'], ['caption']);
  // music：url + name 必填，artist/cover 可选，无列表
  assert.deepEqual(keys(PAGE_BLOCK_REGISTRY.music.fields), ['url', 'name', 'artist', 'cover']);
  assert.deepEqual(optionalKeys(PAGE_BLOCK_REGISTRY.music.fields), ['artist', 'cover']);
  assert.ok(!PAGE_BLOCK_REGISTRY.music.lists, 'music 无列表字段');
  // icons：items[icon, label 可选, href 可选]
  assertItemFields('icons', 'items', ['icon', 'label', 'href'], ['label', 'href']);
}

// 23) getPageBlockSchema：按 kind 取 schema，未知 kind 一律返回 null
{
  for (const kind of SUPPORTED_UI_KINDS) {
    assert.equal(getPageBlockSchema(kind), PAGE_BLOCK_REGISTRY[kind], `getPageBlockSchema(${kind}) 必须返回对应 schema`);
  }
  assert.equal(getPageBlockSchema('video'), null, '未注册 kind 返回 null');
  assert.equal(getPageBlockSchema(''), null);
  assert.equal(getPageBlockSchema(null), null);
  assert.equal(getPageBlockSchema(undefined), null);
}

console.log('page-blocks: PASS');
