import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * FocusTrap 回归：Nuxt UI 的 UModal/UPopover/UContextMenu 打开时内部必须
 * 有可聚焦元素，否则控制台报
 * "There are no focusable elements inside the <FocusTrap />"。
 * - Memo.vue 更多操作弹窗：增加始终可聚焦的关闭按钮，操作项支持键盘。
 * - MemoEdit.vue 右键标签菜单：空标签时也有可聚焦的提示元素。
 */
const memo = await readFile(new URL('../front/components/Memo.vue', import.meta.url), 'utf8');
assert.match(memo, /aria-label="关闭"/, '更多操作弹窗应有关闭按钮');
assert.match(memo, /role="button"/, '操作项应声明 button 角色');
assert.match(memo, /tabindex="0"/, '操作项应可聚焦');
assert.match(memo, /@keydown\.enter\.prevent="setPinned\(item\.id\)"/, '置顶应支持键盘回车');
assert.match(memo, /@keydown\.enter\.prevent="go2Edit\(item\.id\)"/, '编辑应支持键盘回车');

const memoEdit = await readFile(new URL('../front/components/MemoEdit.vue', import.meta.url), 'utf8');
assert.match(memoEdit, /暂无标签/, '空标签右键菜单应有提示');
assert.match(memoEdit, /tabindex="0"/, '右键菜单应始终有可聚焦元素');

console.log('FocusTrap focusable-element regression tests: PASS');
