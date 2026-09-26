import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const settings = await readFile(new URL('../../front/pages/sys/settings.vue', import.meta.url), 'utf8');

// 字段 parity：重排只允许搬动位置，绝不允许丢字段、改错绑定或改名。
// 清单是硬编码的——这正是本测试的价值：静默丢掉一个配置项会立刻失败。
const EXPECTED_BINDINGS = [
  'state.aboutContent',
  'state.adminUserName',
  'state.attachmentMaxCount',
  'state.attachmentMaxSize',
  'state.backupIntervalDays',
  'state.backupRetentionDays',
  'state.backupTarget',
  'state.beiAnNo',
  'state.commentOrder',
  'state.css',
  'state.enableAbout',
  'state.enableAutoLoadNextPage',
  'state.enableComment',
  'state.enableD1Backup',
  'state.enableEmail',
  'state.enableGoogleRecaptcha',
  'state.enableRegister',
  'state.enableRegisterApproval',
  'state.enableSeo',
  'state.enableTelegram',
  'state.enableTurnstile',
  'state.favicon',
  'state.friendEmail',
  'state.friendNotice',
  'state.googleSecretKey',
  'state.googleSiteKey',
  'state.js',
  'state.maxCommentLength',
  'state.memoMaxHeight',
  'state.rss',
  'state.s3Storage.accessKeyId',
  'state.s3Storage.bucket',
  'state.s3Storage.endpoint',
  'state.s3Storage.region',
  'state.s3Storage.secretAccessKey',
  'state.seoDescription',
  'state.seoKeywords',
  'state.siteUrl',
  'state.smtpEncryption',
  'state.smtpFromName',
  'state.smtpHost',
  'state.smtpPassword',
  'state.smtpUsername',
  'state.storageType',
  'state.telegramBotToken',
  'state.telegramBotUsername',
  'state.timeFormat',
  'state.title',
  'state.turnstileSecretKey',
  'state.turnstileSiteKey',
  'state.webdavStorage.password',
  'state.webdavStorage.url',
  'state.webdavStorage.username',
];

const bindings = [...new Set([...settings.matchAll(/v-model[\w.:-]*="([^"]+)"/g)].map(match => match[1]))]
  .filter(value => value.startsWith('state.'))
  .sort();
assert.deepEqual(bindings, EXPECTED_BINDINGS, '系统设置的 state 绑定集合必须与清单完全一致（多一个少一个都是回归）');

// 每个开关都必须保留（10 个既有开关 + 新增的 SEO 总开关）
const toggles = [...settings.matchAll(/<UToggle[^>]*v-model="(state\.[^"]+)"/g)].map(match => match[1]);
assert.equal(toggles.length, 11, '开关数量必须为 11（含新增的 SEO 总开关）');
assert.ok(toggles.includes('state.enableSeo'), '必须有 SEO 总开关');

// 陈列：六个分区必须存在且带可测标记
for (const section of ['site', 'seo', 'content', 'attachment', 'security', 'storage']) {
  assert.match(settings, new RegExp(`data-section="${section}"`), `缺少分区标记 data-section="${section}"`);
}

// 标签页导航与分区标题（使用仓库既有先例组件 UTabs）
assert.match(settings, /<UTabs/, '必须用 UTabs 承载分区导航');
for (const label of ['站点', 'SEO', '内容与互动', '附件', '安全与通知', '存储与数据']) {
  assert.ok(settings.includes(label), `缺少分区标签：${label}`);
}

// 保存体验：常驻保存条 + 未保存标记；不再整页刷新（否则会丢掉当前分区与滚动位置）
assert.match(settings, /sticky/, '保存条必须常驻（sticky）');
assert.match(settings, /dirty/, '必须有未保存更改的脏标记');
assert.doesNotMatch(settings, /location\.reload\(\)/, '保存后不得整页刷新');

// 深链：支持 ?tab=storage 直接打开指定分区（供注册审批等入口直达）
assert.match(settings, /query\.tab/, '必须支持 ?tab= 深链');

// 危险操作不得与保存按钮混在同一分区卡片：清理入口必须留在「存储与数据」区
const storageStart = settings.indexOf('data-section="storage"');
assert.ok(storageStart > -1 && settings.indexOf('扫描未引用文件') > storageStart, '清理未引用文件必须归入存储与数据分区');

console.log('sys-settings-layout: PASS');
