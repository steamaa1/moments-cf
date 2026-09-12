import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const photos = await readFile(new URL('../../front/pages/photos.vue', import.meta.url), 'utf8');
const albumPage = await readFile(new URL('../../front/pages/photos/album/[id].vue', import.meta.url), 'utf8');

// 照片墙图集九宫格删除按钮
assert.match(photos, /isAdmin && !album\.isDefault && photo\.albumItemId/, '删除按钮必须仅对管理员、非默认图集且存在图集项时显示');
assert.match(photos, /@click\.stop\.prevent="askDelete\(album, photo\)"/, '删除点击必须阻止 Fancybox 预览与链接跳转');
assert.match(photos, /\/admin\/photo\/delete/, '照片墙必须调用照片删除接口');
assert.match(photos, />确认删除</, '删除必须经过确认弹窗');
assert.match(photos, />取消</, '确认弹窗必须提供取消按钮');
assert.match(photos, /aria-label="`删除照片/, '删除按钮必须有可访问名称');
assert.match(photos, /mediaTrashed/, '删除结果必须提示文件是否进入回收站');
assert.match(photos, /未被动态引用的上传文件会移入媒体回收站/, '确认弹窗必须说明删除语义');

// 点击照片进入管理态：显隐删除按钮 + 渐入渐出
assert.match(photos, /photo-tile--managing/, '点击照片必须切换管理态以显隐删除按钮');
assert.match(photos, /stopImmediatePropagation\(\)/, '管理员点击可管理照片必须阻止 Fancybox 预览并切换管理态');
assert.match(photos, /dismissReveal/, '点击照片以外区域必须收起删除按钮');
assert.match(photos, /\.photo-delete \{[^}]*pointer-events:\s*none/, '隐藏状态下删除按钮不得拦截照片点击');
assert.match(photos, /\.photo-delete \{[^}]*transition: opacity/, '删除按钮必须有短暂渐入渐出过渡');
assert.match(photos, /photo-delete:focus-visible/, '键盘聚焦时删除按钮必须可见可点');
assert.match(photos, /\.photo-delete \{ transition: none; \}/, '减少动态偏好时必须关闭删除按钮过渡');

// 图集详情页删除入口
assert.match(albumPage, /isAdmin && !album\?\.isDefault && photo\.albumItemId/, '图集详情页删除按钮必须同样受管理员与非默认图集限制');
assert.match(albumPage, /@click\.stop\.prevent="askDelete\(photo\)"/, '图集详情页删除点击必须阻止冒泡与跳转');
assert.match(albumPage, /\/admin\/photo\/delete/, '图集详情页必须调用照片删除接口');
assert.match(albumPage, />确认删除</, '图集详情页删除必须经过确认弹窗');
assert.match(albumPage, /未被动态引用的上传文件会移入媒体回收站/, '图集详情页确认弹窗必须说明删除语义');
assert.match(albumPage, /photo-tile--managing/, '图集详情页必须同样支持点击进入管理态');
assert.match(albumPage, /stopImmediatePropagation\(\)/, '图集详情页点击可管理照片必须阻止 Fancybox 预览');
assert.match(albumPage, /pointer-events:\s*none/, '图集详情页隐藏状态不得拦截照片点击');

console.log('Photo delete frontend regression tests: PASS');
