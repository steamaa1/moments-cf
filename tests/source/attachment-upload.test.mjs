import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [memoEdit, memo, uploadAttachment, preview, settings, worker] = await Promise.all([
  read('front/components/MemoEdit.vue'),
  read('front/components/Memo.vue'),
  read('front/components/UploadAttachment.vue'),
  read('front/components/AttachmentPreview.vue'),
  read('front/pages/sys/settings.vue'),
  read('worker/src/index.js'),
]);

// 发表面板：附件按钮必须夹在图片上传与音乐之间
const imagePos = memoEdit.indexOf('<upload-image v-model:imgs="state.imgs"/>');
const attachPos = memoEdit.indexOf('<upload-attachment v-model:attachments="state.attachments"/>');
const musicPos = memoEdit.indexOf('<music v-bind="state.music"');
assert.ok(imagePos > -1, '发表面板必须有图片上传入口');
assert.ok(attachPos > -1, '发表面板必须有附件上传入口');
assert.ok(musicPos > -1, '发表面板必须有音乐入口');
assert.ok(imagePos < attachPos && attachPos < musicPos, '附件按钮必须位于图片上传与音乐之间');

// 发表面板：编辑态保存与回填
assert.match(memoEdit, /attachments: state\.attachments\.filter\(attachment => attachment && attachment\.path\)/, '附件必须随 ext 一起保存');
assert.match(memoEdit, /state\.attachments = Array\.isArray\(ext\.attachments\) \? ext\.attachments : \[\]/, '编辑已有动态必须回填附件');
assert.match(memoEdit, /state\.attachments\.length/, '只有附件时也必须允许发表（非空校验）');
assert.match(memoEdit, /removeAttachment/, '编辑页必须能移除附件');
assert.match(memoEdit, /<attachment-preview[^>]*:attachment="attachment"/, '编辑页预览必须渲染附件卡片');

// 上传组件
assert.match(uploadAttachment, /defineModel<AttachmentVO\[\]>\('attachments'/, '附件必须用 attachments 模型双向绑定');
assert.match(uploadAttachment, /uploadAttachments/, '必须使用统一的附件上传原语');
assert.match(uploadAttachment, /attachmentMaxSize/, '必须读取系统配置的大小上限');
assert.match(uploadAttachment, /attachmentMaxCount/, '必须读取系统配置的单次数量上限');
assert.match(uploadAttachment, /i-carbon-attachment/, '附件入口图标必须与其它工具图标风格一致');
assert.match(uploadAttachment, /UProgress/, '上传必须有进度反馈');
assert.match(uploadAttachment, /known\.has\(item\.path\)/, '重复上传的同一文件必须按 path 去重');
assert.match(uploadAttachment, /toast\.error/, '上传失败必须有明确提示');

// 展示卡片：样式参考「链接」卡片（ExternalUrlPreview），并提供下载按钮
assert.match(preview, /flex flex-row gap-2 my-2 bg-\[#f7f7f7\] dark:bg-\[#212121\] items-center dark:border-gray-700\/50 p-2 border rounded/, '附件卡片必须沿用链接卡片的元素样式');
assert.match(preview, /\?download=1/, '下载必须走 download=1 约定');
assert.match(preview, /i-carbon-download/, '必须提供下载按钮图标');
assert.match(preview, /aria-label="下载附件"/, '下载按钮必须有可访问名称');
assert.match(preview, /content-type|type \|\| ''/, '必须按类型映射图标');
assert.match(preview, /motion-reduce:/, '必须尊重减少动态效果偏好');

// 格式图案：不得再用「字母字形」图标（carbon 的 zip/ppt/txt 等本身就是字母，视觉上等同文字），
// 必须使用纯几何实心图案 + 同色浮块，且按文件族着色
// 兼容 i-carbon-zip 与 i-carbon:zip 两种写法，否则这条守卫形同虚设
assert.doesNotMatch(preview, /i-carbon[-:](zip|ppt|txt|document-pdf|document-word-processor|table)\b/, '不得再用字母字形的图标表示格式');
assert.match(preview, /format\.tone/, '格式浮块必须绑定色相类');
assert.match(preview, /:name="format\.icon"/, '格式浮块必须渲染几何图案');
assert.match(preview, /rounded-lg ring-1 ring-inset/, '格式浮块必须有圆角与内描边');
for (const name of ['document-text-solid', 'table-cells-solid', 'presentation-chart-bar-solid', 'archive-box-solid', 'code-bracket-solid', 'photo-solid', 'musical-note-solid', 'video-camera-solid', 'book-open-solid', 'document-solid']) {
  assert.ok(preview.includes(`i-heroicons:${name}`), `缺少实心几何图案：${name}`);
}
assert.match(preview, /MARKS\.(pdf|word|sheet|slide|archive|text|code|book|image|audio|video|file)/, '必须有按文件族划分的图案表');
assert.match(preview, /EXTENSION_MARKS\[/, '必须先按扩展名匹配图案');
assert.match(preview, /MIME_MARKS\.find/, '扩展名缺失时必须回退 MIME 匹配');
// 色相：pdf 红 / 表格绿 / 压缩包琥珀，且用 10% 透明底承载
assert.match(preview, /#d94a4a/, 'pdf 必须有独立色相');
assert.match(preview, /#2e9e63/, '表格类必须有独立色相');
assert.match(preview, /#c08a2e/, '压缩包类必须有独立色相');
assert.match(preview, /bg-\[#d94a4a\]\/10/, '浮块必须用同色低透明度底');
assert.match(preview, /dark:bg-\[#d94a4a\]\/20/, '深色模式必须有对应底色');
assert.doesNotMatch(preview, /useMyFetch|\$fetch|fetch\(/, '展示卡片不得发请求');

// 只读展示页
assert.match(memo, /extJSON\.attachments \|\| \[\]/, '动态正文必须渲染附件卡片');

// 系统设置：两项可配置
assert.match(settings, /name="attachmentMaxSize"/, '系统设置必须有附件大小上限');
assert.match(settings, /name="attachmentMaxCount"/, '系统设置必须有单次附件数量上限');
assert.match(settings, /attachmentMaxSize: 10/, '设置页默认大小必须为 10MB');
assert.match(settings, /attachmentMaxCount: 5/, '设置页默认数量必须为 5');

// worker：路由、白名单、限额、下载头、ext 清洗
assert.match(worker, /url\.pathname === '\/api\/file\/attachment'\) return await attachmentUpload/, '必须注册附件上传路由');
assert.match(worker, /const ALLOWED_ATTACHMENT_TYPES = new Set\(\[/, '必须有附件类型白名单');
assert.doesNotMatch(worker.match(/const ALLOWED_ATTACHMENT_TYPES = new Set\(\[[\s\S]*?\]\);/)[0], /text\/html|svg|javascript/, '白名单不得包含可执行/脚本类型');
assert.match(worker, /一次最多上传 \$\{maxCount\} 个附件/, '必须按配置校验单次数量');
assert.match(worker, /单个附件不能超过 \$\{maxSizeMb\}MB/, '必须按配置校验单文件大小');
assert.match(worker, /config\.attachmentMaxSize = clampInt\(body\.attachmentMaxSize, 1, 25, 10\)/, '配置写入必须夹在 1–25MB');
assert.match(worker, /config\.attachmentMaxCount = clampInt\(body\.attachmentMaxCount, 1, ATTACHMENT_HARD_MAX_COUNT, 5\)/, '配置写入必须夹在合法数量范围');
assert.match(worker, /'attachmentMaxSize', 'attachmentMaxCount',/, '两项配置必须进入公开配置，前端才能显示限额');
assert.match(worker, /content-disposition', contentDisposition\('attachment'/, '附件必须以下载方式下发');
assert.match(worker, /ALLOWED_ATTACHMENT_TYPES\.has\(String\(media\.content_type/, '附件类型即便不带参数也必须强制下载');
assert.match(worker, /filename\*=UTF-8''/, '下载头必须兼容非 ASCII 文件名');
assert.match(worker, /output\.attachments = attachments;/, 'ext 清洗必须输出附件数组');
assert.match(worker, /Array\.isArray\(safeExt\.attachments\) && safeExt\.attachments\.length > 0/, 'hasExt 必须计入附件');

console.log('attachment-upload: PASS');
