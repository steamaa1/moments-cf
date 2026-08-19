import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const photos = await readFile(new URL('../front/pages/photos.vue', import.meta.url), 'utf8');
const header = await readFile(new URL('../front/components/Header.vue', import.meta.url), 'utf8');
const layout = await readFile(new URL('../front/layouts/default.vue', import.meta.url), 'utf8');
const fancybox = await readFile(new URL('../front/components/MyFancyBox.vue', import.meta.url), 'utf8');

assert.match(photos, /global\?\.value\?\.userinfo \?\? \{\}/, '照片墙必须安全读取全局登录状态');
assert.match(photos, /添加照片/, '管理员必须有明确的添加照片按钮');
assert.match(photos, /Number\(authUser\.value\.id \?\? currentUser\.value\?\.id\) === 1/, '添加按钮必须只对管理员显示');
assert.match(header, /defineProps<\{ user\?: UserVO \| null \}>/, 'Header 用户信息必须允许尚未加载');
assert.match(header, /props\.user\?\.nickname/, 'Header 必须安全读取用户昵称');
assert.match(layout, /const authUser = computed\(\(\) => global\?\.value\?\.userinfo \?\? \{\}\)/, '布局必须安全读取全局登录状态');
assert.doesNotMatch(layout, /global\.userinfo\./, '布局模板不得直接读取可能为空的 userinfo');
assert.match(photos, /<MyFancyBox class="album-grid"/, '图集图片必须复用既有 Fancybox 点击预览逻辑');
assert.match(photos, /while \(state\.hasNext\)/, '查看全部必须在当前页面拉取完整图集');
assert.doesNotMatch(photos, /navigateTo\(`\/photos\/album\//, '查看全部不得只跳转到图集链接');
assert.match(photos, /showAddPhoto/, '添加照片必须使用独立弹窗');
assert.match(photos, /showCreateAlbum/, '新建图集必须使用独立弹窗');
assert.match(photos, /showFeatured/, '设置精选必须使用独立弹窗');
assert.match(photos, />保存照片</, '添加照片必须有独立保存按钮');
assert.match(photos, />保存图集</, '新建图集必须有独立保存按钮');
assert.match(photos, /toggleFeatured/, '精选必须从全部图片中选择并支持切换');
assert.doesNotMatch(photos, /featuredMemoId/, '精选不得要求手填动态 ID');
assert.match(photos, /\/photo\/all/, '精选选择器必须从全部图片接口加载');
assert.match(fancybox, /onUpdated\(\(\) => nextTick\(bindGallery\)\)/, 'Fancybox 必须在图集展开后绑定新增图片');

console.log('Photo wall frontend regression tests: PASS');
