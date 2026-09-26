import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const photos = await readFile(new URL('../../front/pages/photos.vue', import.meta.url), 'utf8');
const header = await readFile(new URL('../../front/components/Header.vue', import.meta.url), 'utf8');
const layout = await readFile(new URL('../../front/layouts/default.vue', import.meta.url), 'utf8');
const fancybox = await readFile(new URL('../../front/components/MyFancyBox.vue', import.meta.url), 'utf8');
const albumPage = await readFile(new URL('../../front/pages/photos/album/[id].vue', import.meta.url), 'utf8');

assert.match(photos, /global\?\.value\?\.userinfo \?\? \{\}/, '照片墙必须安全读取全局登录状态');
assert.match(photos, />照片管理</, '管理员必须有明确的照片管理按钮');
assert.match(photos, /Number\(authUser\.value\.id \?\? currentUser\.value\?\.id\) === 1/, '照片管理按钮必须只对管理员显示');
assert.match(header, /defineProps<\{ user\?: UserVO \| null \}>/, 'Header 用户信息必须允许尚未加载');
assert.match(header, /props\.user\?\.nickname/, 'Header 必须安全读取用户昵称');
assert.match(layout, /const authUser = computed\(\(\) => global\?\.value\?\.userinfo \?\? \{\}\)/, '布局必须安全读取全局登录状态');
assert.doesNotMatch(layout, /global\.userinfo\./, '布局模板不得直接读取可能为空的 userinfo');

assert.match(photos, /<MyFancyBox class="album-grid"/, '图集图片必须复用 Fancybox 预览');
assert.match(photos, /\/photo\/album/, '照片墙必须按图集请求后续页');
assert.match(photos, /(?:加载更多|查看更多)/, '图集尚有后续页时必须提供手动加载入口');
assert.match(photos, /(?:hasNext|albumHasMore)/, '图集必须根据后续页标志决定是否继续加载');
assert.doesNotMatch(photos, /while\s*\(\s*state\.hasNext/, '单次点击不能通过循环拉取完整图集');
assert.match(photos, /new Set\(state\.photos\.map\(/, '翻页时须按已有照片去重');
assert.match(photos, /fresh\.length > 0/, '重复数据页须停止继续分页');
assert.match(photos, /state\.page\s*=\s*nextPage/, '仅成功加载后推进图集页码，失败可重试当前页');
assert.match(photos, /catch\s*\(error[^)]*\)[\s\S]*?图集加载失败/, '图集分页失败必须提示并允许再次点击');
assert.doesNotMatch(photos, /navigateTo\(`\/photos\/album\//, '照片墙展开后续页不得仅跳转详情');

const managementModal = photos.match(/<UModal\b(?=[^>]*v-model="showAdmin")[\s\S]*?<\/UModal>/)?.[0];
assert.ok(managementModal, '照片管理必须由 showAdmin 控制一个弹窗');
assert.equal((photos.match(/v-model="showAdmin"/g) || []).length, 1, '照片管理不得拆成多个独立弹窗');
assert.match(photos, /managementView/, '管理弹窗必须有分层视图状态');
for (const view of ['home', 'create', 'album', 'add', 'edit', 'featured']) {
  assert.match(managementModal, new RegExp(`managementView\\s*===?\\s*['"]${view}['"]`), `管理弹窗必须有 ${view} 独立视图`);
}
assert.match(photos, /selectedAlbumId/, '图集详情及其操作必须共享所选图集 ID');
assert.match(managementModal, /v-for="album in [^"]+"[\s\S]*?@click[^>]*album/, '管理首页必须以可点击的图集卡片进入图集详情');
const homeView = managementModal.split(/<div\b[^>]*managementView\s*===?\s*['"]home['"][^>]*>/)[1]?.split(/<div\b[^>]*managementView\s*===?\s*['"]album['"]/)[0];
assert.ok(homeView, '管理首页必须是独立视图');
assert.match(homeView, /@click="[^"]+"[^>]*>[\s\S]*?新建图集/, '首页必须有独立的新建图集入口');
assert.match(homeView, /@click="[^"]+"[^>]*>[\s\S]*?精选图片/, '首页必须有独立的精选图片入口');
assert.match(homeView, /v-for="album in [^"]+"[^>]*@click="[^"]*album[^>]*"/, '首页的图集卡片必须可点击进入详情');
const albumView = managementModal.split(/<div\b[^>]*managementView\s*===?\s*['"]album['"][^>]*>/)[1]?.split(/<form\b[^>]*managementView\s*===?\s*['"]add['"]/)[0];
assert.ok(albumView, '所选图集必须有独立详情视图');
assert.match(albumView, /@click="[^"]*selectedAlbum[^>]*"[^>]*>[\s\S]*?添加照片/, '所选图集详情必须提供添加照片入口');
assert.match(albumView, /@click="[^"]*selectedAlbum[^>]*"[^>]*>[\s\S]*?编辑图集/, '所选图集详情必须提供编辑图集入口');
assert.match(managementModal, /<form\b[^>]*managementView\s*===?\s*['"]add['"][^>]*@submit\.prevent="savePhoto"/, '添加视图必须提交照片到当前图集');
assert.match(photos, /const savePhoto\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?const albumId\s*=\s*selectedAlbumId\.value/, '添加照片请求必须取所选图集 ID 而不是任意下拉选项');
assert.match(managementModal, /(?:selectedAlbum\.name|selectedAlbum\?\.name|selectedAlbum\.value\?\.name|selectedAlbum\.value\.name|selectedAlbumName)/, '添加视图必须展示所选图集名称');
assert.doesNotMatch(photos, /albumEditorId|albumEditorOptions|uploadAlbumOptions/, '新建和编辑应由对象上下文区分，不得恢复操作/目标图集下拉契约');
assert.match(managementModal, />\s*保存照片\s*</, '添加照片视图必须有独立保存按钮');
assert.match(managementModal, />\s*保存图集\s*</, '图集新建/编辑视图必须有独立保存按钮');
assert.match(photos, /uploadFiles\.value\s*=\s*failed/, '部分上传失败必须保留失败文件以便重试');
assert.match(photos, /uploadPendingUrls\.value\.(?:push|shift)\(/, '待加入图集的 URL 必须保留到逐项加入完成');
assert.match(photos, /uploadPendingAlbumId\.value/, '待加入 URL 必须绑定其原图集，避免切换图集后误加入');
assert.match(homeView, /featuredChanges[\s\S]{0,120}(?:待保存|未保存)|(?:待保存|未保存)[\s\S]{0,120}featuredChanges/, '回到管理首页仍须提示精选图片未保存状态');
assert.match(managementModal, />\s*保存精选设置\s*</, '精选视图必须有独立保存按钮');
assert.match(photos, /loadFeaturedCandidates/, '精选候选必须由用户手动触发加载');
assert.match(photos, /尚未加载图片，请点击/, '精选候选加载前必须显示手动加载提醒');
assert.doesNotMatch(photos, /@open="loadFeaturedCandidates"/, '打开照片管理时不得自动加载候选');
assert.match(photos, /toggleFeatured/, '精选必须支持逐张切换');
assert.doesNotMatch(photos, /featuredMemoId/, '精选不得要求手填动态 ID');
assert.match(photos, /\/photo\/all/, '精选候选必须从全部图片接口获取');
assert.match(photos, /(?:featuredPage|featuredCandidatePage)/, '精选候选必须记录当前页以支持分页');
assert.match(photos, /(?:featuredHasNext|featuredCandidatesHasNext)/, '精选候选必须记录还有下一页');
assert.match(photos, /@click="loadMoreFeaturedCandidates"/, '精选候选下一页必须由用户手动触发');
assert.doesNotMatch(photos, /while\s*\([^)]*(?:featuredHasNext|featuredCandidatesHasNext)/, '精选候选单次点击不得全量循环拉取');
assert.match(photos, /originalFeatured\.value\.(?:set|delete)\(/, '保存成功的精选条目须更新基线，失败项保持待保存');
assert.doesNotMatch(photos, /catch\s*\([^)]*\)\s*\{[^}]*featuredCandidates\.value\s*=\s*\[\]/, '保存失败不得清空精选候选输入');

assert.match(fancybox, /querySelectorAll\([^\n]*a(?:\[|['"`])/, 'Fancybox 必须递归找到包装节点内的图片链接');
assert.doesNotMatch(fancybox, /Array\.from\(container\.value\.children\)/, '不得把含按钮的包装节点直接作为 Fancybox 触发器');
assert.match(fancybox, /onUpdated\(\(\) => nextTick\(bindGallery\)\)/, '新增图集图片后须重新绑定预览');
assert.match(fancybox, /Fancybox\.unbind\(selector\)/, '重新绑定前须清理旧绑定');

assert.match(albumPage, /requestGeneration/, '图集详情必须有请求代际保护，防止路由切换竞态');
assert.match(albumPage, /generation !== requestGeneration/, '图集详情不得应用旧请求结果');
assert.match(albumPage, /watch\(albumId/, '图集详情必须监听路由参数变化重新加载');
assert.match(albumPage, /errorMessage/, '图集详情必须显示加载失败状态而非空白');
assert.match(albumPage, /<MyFancyBox/, '图集详情必须复用 Fancybox 预览');
assert.doesNotMatch(albumPage, /target="_blank"/, '图集详情不得新窗口打开图片');

console.log('Photo wall frontend regression tests: PASS');
