import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const photos = await readFile(new URL('../../front/pages/photos.vue', import.meta.url), 'utf8');
const header = await readFile(new URL('../../front/components/Header.vue', import.meta.url), 'utf8');
const layout = await readFile(new URL('../../front/layouts/default.vue', import.meta.url), 'utf8');
const fancybox = await readFile(new URL('../../front/components/MyFancyBox.vue', import.meta.url), 'utf8');

assert.match(photos, /global\?\.value\?\.userinfo \?\? \{\}/, '照片墙必须安全读取全局登录状态');
assert.match(photos, />照片管理</, '管理员必须有明确的照片管理按钮');
assert.match(photos, /Number\(authUser\.value\.id \?\? currentUser\.value\?\.id\) === 1/, '照片管理按钮必须只对管理员显示');
assert.match(header, /defineProps<\{ user\?: UserVO \| null \}>/, 'Header 用户信息必须允许尚未加载');
assert.match(header, /props\.user\?\.nickname/, 'Header 必须安全读取用户昵称');
assert.match(layout, /const authUser = computed\(\(\) => global\?\.value\?\.userinfo \?\? \{\}\)/, '布局必须安全读取全局登录状态');
assert.doesNotMatch(layout, /global\.userinfo\./, '布局模板不得直接读取可能为空的 userinfo');
assert.match(photos, /<MyFancyBox class="album-grid"/, '图集图片必须复用既有 Fancybox 点击预览逻辑');
assert.match(photos, /while \(state\.hasNext && guard < 100\)/, '查看全部必须在当前页面拉取完整图集且有安全上限');
assert.doesNotMatch(photos, /navigateTo\(`\/photos\/album\//, '查看全部不得只跳转到图集链接');
assert.match(photos, /v-model="showAdmin"/, '照片管理必须合并为一个弹窗');
assert.match(photos, /fixed top-0 left-0 right-0 bottom-0 flex justify-center items-center backdrop-blur/, '移动端弹窗必须复用原有居中容器逻辑');
assert.match(photos, />保存照片</, '添加照片区必须有独立保存按钮');
assert.match(photos, />保存图集</, '图集设置区必须有独立保存按钮');
assert.match(photos, />保存精选设置</, '精选设置区必须有独立保存按钮');
assert.match(photos, /albumEditorId/, '图库必须支持选择现有图集改名');
assert.match(photos, /loadFeaturedCandidates/, '精选图片必须手动触发加载');
assert.match(photos, /尚未加载图片，请点击/, '精选图片加载前必须显示手动加载提醒');
assert.match(photos, /正在加载全部图片，请稍候/, '精选图片加载中必须显示提醒');
assert.doesNotMatch(photos, /@open="loadFeaturedCandidates"/, '打开照片管理时不得自动加载全部图片');
assert.match(photos, /toggleFeatured/, '精选必须从全部图片中选择并支持切换');
assert.doesNotMatch(photos, /featuredMemoId/, '精选不得要求手填动态 ID');
assert.match(photos, /\/photo\/all/, '精选选择器必须从全部图片接口加载');
assert.match(fancybox, /onUpdated\(\(\) => nextTick\(bindGallery\)\)/, 'Fancybox 必须在图集展开后绑定新增图片');

const albumPage = await readFile(new URL('../../front/pages/photos/album/[id].vue', import.meta.url), 'utf8');
assert.match(photos, /guard < 100/, '查看全部必须有分页安全上限，防止接口异常导致死循环');
assert.match(photos, /fresh\.length > 0/, '查看全部必须在无新数据时停止，防止重复数据死循环');
assert.match(albumPage, /requestGeneration/, '图集详情必须有请求代际保护，防止路由切换竞态');
assert.match(albumPage, /watch\(albumId/, '图集详情必须监听路由参数变化重新加载');
assert.match(albumPage, /errorMessage/, '图集详情必须显示加载失败状态而非空白');
assert.match(albumPage, /<MyFancyBox/, '图集详情必须复用 Fancybox 预览而非新窗口打开');
assert.doesNotMatch(albumPage, /target="_blank"/, '图集详情不得新窗口打开图片');

console.log('Photo wall frontend regression tests: PASS');
