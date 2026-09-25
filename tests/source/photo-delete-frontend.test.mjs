import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const photos = await readFile(new URL('../../front/pages/photos.vue', import.meta.url), 'utf8');
const albumPage = await readFile(new URL('../../front/pages/photos/album/[id].vue', import.meta.url), 'utf8');

for (const [pageName, source] of [['照片墙', photos], ['图集详情', albumPage]]) {
  assert.match(source, /(?:v-if="isAdmin"|isAdmin\s*&&)[\s\S]*?(?:管理照片|管理模式|管理删除)/, `${pageName}必须仅向管理员提供显式管理入口`);
  assert.match(source, /(?:managing|manageMode)/, `${pageName}必须单独记录管理模式`);
  const photoLink = source.match(/<a\b(?=[^>]*:href="photo\.url")[^>]*>/);
  assert.ok(photoLink && /class="[^"]*photo-tile/.test(photoLink[0]), `${pageName}点击照片必须保留 Fancybox 图片链接`);
  assert.doesNotMatch(photoLink[0], /@click(?:\.\w+)?=/, `${pageName}点击图片不得切换管理态而拦截 Fancybox`);
  assert.doesNotMatch(source, /stopImmediatePropagation\(\)/, `${pageName}点击图片不得阻止 Fancybox`);
  assert.match(source, /class="photo-frame(?:\s|\")/, `${pageName}的图片链接与删除按钮必须由同一包装节点定位`);
  const deleteButton = source.match(/<\/a>\s*<button\b[^>]*>/);
  assert.ok(deleteButton && /class="photo-delete"/.test(deleteButton[0]), `${pageName}删除按钮必须是图片链接的合法兄弟节点，不得嵌在 a 内`);
  assert.match(deleteButton[0], /v-if="[^"]*isAdmin[^"\n]*![^"\n]*isDefault[^"\n]*(?:photo\.albumItemId|hasAlbumItemId\(photo\))/, `${pageName}删除按钮仅对管理员、非默认图集及有效图集项显示`);
  assert.match(source, /@click\.stop\.prevent="askDelete\(/, `${pageName}删除点击必须阻止预览和跳转`);
  assert.match(source, /aria-label="`从图集移除照片/, `${pageName}删除按钮必须具有可访问名称`);
  assert.match(source, /\/admin\/photo\/delete/, `${pageName}必须调用删除接口`);
  assert.match(source, />确认移除</, `${pageName}删除须经过确认弹窗`);
  assert.match(source, />取消</, `${pageName}确认弹窗须提供取消按钮`);
  assert.match(source, /mediaTrashed/, `${pageName}删除结果须区分回收站与仅移出图集`);
  assert.match(source, /未被动态引用的上传文件会移入媒体回收站/, `${pageName}确认弹窗须准确说明删除语义`);
  assert.match(source, /\.photo-delete:focus-visible/, `${pageName}删除按钮须提供键盘焦点反馈`);
  assert.match(source, /prefers-reduced-motion:\s*reduce/, `${pageName}必须尊重减少动态效果偏好`);
}

assert.match(photos, /askDelete\(album, photo\)/, '照片墙删除必须保留目标图集上下文');
assert.match(albumPage, /askDelete\(photo\)/, '详情页删除必须保留目标图片上下文');
assert.match(albumPage, /requestGeneration/, '图集详情请求代际保护不能因管理模式改变而丢失');

console.log('Photo delete frontend regression tests: PASS');
