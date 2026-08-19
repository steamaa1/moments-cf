import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const photos = await readFile(new URL('../front/pages/photos.vue', import.meta.url), 'utf8');
const header = await readFile(new URL('../front/components/Header.vue', import.meta.url), 'utf8');
const layout = await readFile(new URL('../front/layouts/default.vue', import.meta.url), 'utf8');

assert.match(photos, /global\?\.value\?\.userinfo \?\? \{\}/, '照片墙必须安全读取全局登录状态');
assert.match(photos, /添加照片/, '管理员必须有明确的添加照片按钮');
assert.match(photos, /Number\(authUser\.value\.id \?\? currentUser\.value\?\.id\) === 1/, '添加按钮必须只对管理员显示');
assert.match(header, /defineProps<\{ user\?: UserVO \| null \}>/, 'Header 用户信息必须允许尚未加载');
assert.match(header, /props\.user\?\.nickname/, 'Header 必须安全读取用户昵称');
assert.match(layout, /const authUser = computed\(\(\) => global\?\.value\?\.userinfo \?\? \{\}\)/, '布局必须安全读取全局登录状态');
assert.doesNotMatch(layout, /global\.userinfo\./, '布局模板不得直接读取可能为空的 userinfo');

console.log('Photo wall frontend regression tests: PASS');
