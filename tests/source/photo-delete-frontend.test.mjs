import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const photos = await readFile(new URL('../../front/pages/photos.vue', import.meta.url), 'utf8');

// 照片墙是纯浏览页：点击图片永远走 Fancybox 预览，删除只在照片管理里发生
assert.doesNotMatch(photos, /(?:managing|manageMode)/, '照片墙不得再有独立的删除管理模式');
assert.doesNotMatch(photos, /stopImmediatePropagation\(\)/, '点击图片不得阻止 Fancybox');
const photoLink = photos.match(/<a\b(?=[^>]*:href="photo\.url")[^>]*>/);
assert.ok(photoLink && /class="photo-tile"/.test(photoLink[0]), '点击照片必须保留 Fancybox 图片链接');
assert.doesNotMatch(photoLink[0], /@click(?:\.\w+)?=/, '图片链接不得绑定点击处理而拦截预览');
assert.doesNotMatch(photos, /class="photo-frame|class="photo-delete/, '照片墙不再有内联删除按钮');

// 删除统一收进照片管理，并支持多选批量移除
assert.match(photos, /v-model="showAdmin"/, '照片管理必须由单个弹窗承载');
assert.match(photos, /askDeleteSelected/, '批量删除必须有独立触发');
assert.match(photos, /UCheckbox/, '批量删除必须用复选框多选');
assert.match(photos, /selectionCount/, '批量删除必须展示已选数量');
assert.match(photos, /toggleSelectAll/, '批量删除必须支持全选/取消全选');
assert.match(photos, /for \(const id of ids\)/, '批量删除必须逐个处理所选照片');
assert.match(photos, /UProgress/, '批量删除必须有进度反馈');
assert.match(photos, /failed\.push\(id\)/, '批量删除部分失败必须保留失败项');
// 重新拉取列表会重置选中集：恢复失败项必须发生在其后，否则"可重试"形同虚设
assert.match(photos, /await loadManagePhotos\(selectedAlbum\.value\)\s*\n\s*selectedItems\.value = new Set\(failed\)/, '失败项必须在列表重新加载之后再恢复选中');
assert.match(photos, /failed\.length[\s\S]{0,120}(?:失败|重试)/, '批量删除部分失败必须明确提示可重试');

// 危险操作仍受管理员、非默认图集与有效图集项约束，并需二次确认
assert.match(photos, /isAdmin/, '删除入口必须仅对管理员开放');
assert.match(photos, /album\.isDefault/, '默认图集不得提供删除');
assert.match(photos, /hasItemId/, '删除必须以有效图集项为前提');
assert.match(photos, /\/admin\/photo\/delete/, '删除必须调用既有删除接口');
assert.match(photos, />确认移除</, '删除必须经过确认弹窗');
assert.match(photos, />取消</, '确认弹窗必须提供取消按钮');
assert.match(photos, /mediaTrashed/, '删除结果须区分回收站与仅移出图集');
assert.match(photos, /未被动态引用的上传文件会移入媒体回收站/, '确认弹窗须准确说明删除语义');
assert.match(photos, /prefers-reduced-motion:\s*reduce/, '必须尊重减少动态效果偏好');

// 确认弹窗：外层与内容同宽，避免右侧空白
const deleteModal = [...photos.matchAll(/<UModal\b[\s\S]*?<\/UModal>/g)]
  .find(([modal]) => /class="delete-panel\b/.test(modal));
assert.ok(deleteModal, '必须保留独立的删除确认弹窗');
assert.match(deleteModal[0], /width:\s*'w-\[92vw\] max-w-\[22rem\]'/, '删除弹窗外层须限制为视口的 92% 且最大宽度为 22rem');
const deletePanelStyle = photos.match(/\.delete-panel\s*\{[^}]*\}/);
assert.ok(deletePanelStyle, '删除弹窗须有内层面板样式');
assert.match(deletePanelStyle[0], /(?:^|[;{])\s*width:\s*100%\s*;/, '删除面板必须填满外层宽度，避免右侧空白');
assert.match(deletePanelStyle[0], /(?:^|[;{])\s*min-width:\s*0\s*;/, '删除面板须允许在窄视口收缩');
assert.match(deletePanelStyle[0], /(?:^|[;{])\s*box-sizing:\s*border-box\s*;/, '删除面板的内边距必须计入宽度');

// 图集详情路由已删除：父页没有 NuxtPage，该子路由永远不会渲染
assert.doesNotMatch(photos, /photos\/album\//, '照片墙不得再链接到已删除的图集详情页');

console.log('Photo delete frontend regression tests: PASS');
