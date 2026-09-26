import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const picker = await readFile(new URL('../../front/components/UploadImage.vue', import.meta.url), 'utf8');

// 发表面板选图：仅管理员可见，数据源与管理端精选选择器同源（/photo/all）
assert.match(picker, /isAdmin/, '照片墙选图入口必须仅对管理员开放');
assert.match(picker, /Number\(authUser\.value\.id\) === 1/, '管理员判断必须与照片墙一致（id===1）');
assert.match(picker, /\/photo\/all/, '选图必须复用 /photo/all 数据源，不新增后端接口');
assert.match(picker, /v-if="isAdmin"/, '选图区必须以 isAdmin 控制可见性');

// 选取交互：折叠面板 + 搜索 + 分页 + 多选加入
assert.match(picker, /toggleLib/, '选图区必须可折叠展开');
assert.match(picker, /libKeyword/, '选图必须支持关键词搜索');
assert.match(picker, /keyword: libKeyword\.value\.trim\(\)/, '搜索词必须传给 /photo/all 的 keyword 参数');
assert.match(picker, /libHasNext[\s\S]{0,200}加载更多/, '选图列表必须支持分页加载');
assert.match(picker, /toggleLibItem/, '图块必须点击多选');
assert.match(picker, /confirmLibPick/, '必须有统一的加入操作');
assert.match(picker, /imgs\.value = \[imgs\.value, \.\.\.urls\]/, '所选图片必须并入 imgs 逗号串，与既有上传逻辑同构');
assert.match(picker, /libSelected\.value = new Set\(\)/, '加入后必须清空选中集');

// 已在面板里的图片不允许重复添加
assert.match(picker, /isLibAdded/, '已在动态图片列表中的图片必须标记且不可再选');
assert.match(picker, /已添加/, '已添加图片必须有明确标识');

// 列表去重：分页追加必须按 photo.id 过滤，避免翻页重复
assert.match(picker, /known\.has\(String\(photo\.id\)\)/, '分页追加必须按 id 去重');
// 同一张图发表后会以 memo 与 upload 两种来源并存，必须再按 URL 去重（第 1 页响应内部就会重复）
assert.match(picker, /knownUrls\.has\(photo\.url\)/, '同图多来源必须按 URL 去重');
assert.match(picker, /knownUrls\.add\(photo\.url\)/, 'URL 去重必须在本页内生效，而非只对已加载页');

// 布局：Firefox 系内核 grid 项 min-size:auto 会用大图固有尺寸撑破 aspect-ratio 轨道
assert.match(picker, /\.lib-tile\s*\{[^}]*min-width:\s*0/, '图块必须 min-width:0 防止溢出');
assert.match(picker, /\.lib-tile\s*\{[^}]*min-height:\s*0/, '图块必须 min-height:0 防止溢出');

// 无障碍与体验
assert.match(picker, /type="button"/, '图块必须是 button 而非默认提交行为');
assert.match(picker, /loading="lazy"/, '缩略图必须懒加载');
assert.match(picker, /prefers-reduced-motion:\s*reduce/, '必须尊重减少动态效果偏好');

// 不引入新的后端依赖：不得出现新增 admin 路由调用
assert.doesNotMatch(picker, /\/admin\//, '选图组件不得直接调用管理接口，统一走 /photo/all');

console.log('photo-picker-frontend: PASS');
