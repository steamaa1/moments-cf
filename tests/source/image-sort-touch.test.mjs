import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preview = await readFile(new URL('../../front/components/UploadImagePreview.vue', import.meta.url), 'utf8');
const memoEdit = await readFile(new URL('../../front/components/MemoEdit.vue', import.meta.url), 'utf8');

/**
 * 图片组内部排序：两个真实缺陷的回归护栏
 * - 触摸屏上原生 HTML5 拖放无效 → 必须 forceFallback
 * - 容器是 v-if="images.length > 0" 渲染的，新建动态挂载时没有图片 → 一次性初始化会拿不到容器，
 *   实例建不起来，之后再加图片也拖不动 → 必须按容器出现/可编辑态 start/stop
 */

// 1) 触屏参数
assert.match(preview, /forceFallback: true/, '图片组排序必须启用 forceFallback 才支持触摸屏');
assert.match(preview, /fallbackOnBody: true/, 'fallback 必须挂到 body，避免被网格容器裁剪');
assert.match(preview, /fallbackTolerance: \d+/, '必须有拖拽容差，避免轻扫被误判为拖拽');
assert.match(preview, /ghostClass: ["']image-sortable-ghost["']/, '必须有占位反馈类');
assert.match(preview, /chosenClass: ["']image-sortable-chosen["']/, '必须有被拖反馈类');
assert.match(preview, /:deep\(\.image-sortable-ghost\)/, '占位反馈必须有可见样式');
assert.match(preview, /motion-reduce:transition-none|prefers-reduced-motion/, '拖拽动效必须尊重减少动态效果偏好');

// 2) 按容器出现来初始化（而不是挂载时一次性创建）
assert.match(preview, /watch\(\s*\[el, canSortImages\]/, '必须监听容器元素与可编辑态来启动/销毁实例');
assert.match(preview, /imageSortable\.start\(\)/, '容器出现且可编辑时必须启动拖拽');
assert.match(preview, /imageSortable\.stop\(\)/, '只读展示或容器消失时必须销毁拖拽实例');
assert.match(preview, /const el = ref<HTMLElement \| null>\(null\)/, 'el 必须是可判空的元素引用');

// 3) 不得退回旧的一次性初始化（拿不到 v-if 容器，新动态永远拖不动）
assert.doesNotMatch(preview, /setTimeout\(\(\) => \{\s*useSortable/, '不得再用 setTimeout 一次性初始化');
assert.doesNotMatch(preview, /\buseSortable\(el, images\)/, '不得再裸调 useSortable 而不处理容器后出现的情况');

// 4) 只读展示页不得开启拖拽
assert.match(preview, /route\.path\.startsWith\("\/new"\)/, '编辑态判定必须保留 /new');
assert.match(preview, /startsWith\("\/edit"\)/, '编辑态判定必须保留 /edit');

// 5) 顺序仍然要回到父组件（拖拽结果必须能持久化）
assert.match(preview, /emit\(\s*"dragImage"/, '图片顺序变化必须回传父组件');
assert.match(memoEdit, /@drag-image="handleDragImage"/, '编辑页必须接住图片顺序变化');
assert.match(memoEdit, /state\.imgs = imgs\.filter\(Boolean\)\.join\(["'],["']\)/, '图片顺序必须写回 state.imgs 才能随动态保存');

console.log('image-sort-touch: PASS');
