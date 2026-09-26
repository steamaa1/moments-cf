<template>
  <Header :user="currentUser"/>
  <!-- 字段 label 样式集中在本容器上声明（[&_label]:font-bold），
       取代原先散落在 29 个 UFormGroup 上的逐字段 label 覆盖写法，保证所有字段视觉一致 -->
  <div class="space-y-4 flex flex-col p-4 my-4 dark:bg-neutral-800 [&_label]:font-bold">

    <!-- 分区导航：UTabs 承载六个分区，面板默认不卸载，切换分区不会丢表单状态。
         深链 ?tab=site|seo|content|attachment|security|storage 可直达对应分区。 -->
    <UTabs :items="sectionTabs" :model-value="activeTabIndex"
           :ui="{list: {height: 'h-9', tab: {size: 'text-xs', padding: 'px-1.5'}}}"
           @update:model-value="selectTab">

      <!-- ============ 站点 ============ -->
      <template #site>
        <section data-section="site" class="mt-4 space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 class="font-semibold text-gray-800 dark:text-gray-100">站点</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">站点标题、域名、图标、备案与自定义代码等基础信息。</p>
          </div>
          <UFormGroup label="网站标题" name="title">
            <UInput v-model="state.title"/>
          </UFormGroup>
          <UFormGroup label="管理员账号" name="adminUserName">
            <UInput v-model="state.adminUserName"/>
          </UFormGroup>
          <UFormGroup label="站点规范域名" name="siteUrl" help="用于生成 canonical/og:url、sitemap、robots 与 RSS 链接；请填写唯一正式域名，例如 https://wb.me-i.top">
            <UInput v-model="state.siteUrl" placeholder="https://wb.me-i.top" type="url"/>
          </UFormGroup>
          <UFormGroup label="Favicon" name="favicon" help="站点图标，可上传图片或直接填写在线地址">
            <UInput type="file" size="sm" icon="i-heroicons-folder" accept="image/*" @change="uploadFavicon"/>
            <div class="text-gray-500 text-sm my-2">或者输入在线地址</div>
            <UInput v-model="state.favicon" class="mb-2"/>
            <UAvatar :src="state.favicon"/>
          </UFormGroup>
          <UFormGroup label="备案信息" name="beiAnNo" help="显示在页脚的备案号，支持直接填写 HTML 链接">
            <UTextarea v-model="state.beiAnNo" :rows="3" placeholder='<a href="https://beian.miit.gov.cn/" target="_blank">京ICP备...</a>'/>
          </UFormGroup>
          <UFormGroup label="自定义CSS" name="css" help="内容会作为样式表注入所有页面，可用于微调外观">
            <UTextarea v-model="state.css" :rows="5"/>
          </UFormGroup>
          <UFormGroup label="自定义JS" name="js" help="在所有页面执行的自定义脚本，可用于统计、挂件等">
            <UTextarea v-model="state.js" :rows="5"/>
          </UFormGroup>
          <UFormGroup label="自定义RSS" name="rss" help="订阅链接地址，留空则使用本站默认订阅">
            <UTextarea v-model="state.rss" :rows="1" placeholder="留空使用默认配置"/>
          </UFormGroup>
          <UFormGroup label="日期格式" name="timeFormat" help="动态与评论中时间的显示方式：相对时间或具体日期">
            <USelectMenu v-model="state.timeFormat"
                         :options="[{label:'几分钟前',value:'timeAgo'},{label:$dayjs().format('YYYY-MM-DD HH:mm'),value:'time'}]"
                         value-attribute="value" option-attribute="label"></USelectMenu>
          </UFormGroup>
          <UFormGroup label="首页是否自动加载下一页" name="enableAutoLoadNextPage" help="开启后首页列表底部的加载入口进入可视区即自动加载下一页">
            <UToggle v-model="state.enableAutoLoadNextPage"/>
          </UFormGroup>
          <UFormGroup label="发言最大高度" name="memoMaxHeight" help="单位 px；填 0 不限制高度">
            <UInput v-model.number="state.memoMaxHeight" type="number" min="0"/>
          </UFormGroup>
          <!-- 版本信息：从页面顶部移入本分区卡片底部的小字 -->
          <div class="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-gray-700">
            <span v-if="version">版本号: {{ version }}</span>
            <span v-if="commitId">commitId: {{ commitId }}</span>
          </div>
        </section>
      </template>

      <!-- ============ SEO ============ -->
      <template #seo>
        <section data-section="seo" class="mt-4 space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 class="font-semibold text-gray-800 dark:text-gray-100">SEO</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">搜索引擎与 AI 抓取相关的总开关、站点描述与关键词。</p>
          </div>
          <UFormGroup label="启用 SEO 优化" name="enableSeo" help="关闭后所有页面注入 noindex、robots.txt 禁止抓取、sitemap.xml 与 llms.txt 不再提供">
            <UToggle v-model="state.enableSeo"/>
          </UFormGroup>
          <UFormGroup label="SEO 描述" name="seoDescription" help="搜索引擎结果中展示的站点描述，留空则使用签名或默认文案">
            <UInput v-model="state.seoDescription" placeholder="例如：记录生活的每个瞬间…"/>
          </UFormGroup>
          <UFormGroup label="SEO 关键词" name="seoKeywords" help="逗号分隔的关键词列表，留空使用默认关键词">
            <UInput v-model="state.seoKeywords" placeholder="朋友圈, 动态, 博客"/>
          </UFormGroup>
        </section>
      </template>

      <!-- ============ 内容与互动 ============ -->
      <template #content>
        <section data-section="content" class="mt-4 space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 class="font-semibold text-gray-800 dark:text-gray-100">内容与互动</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">评论、注册、关于页面与友情链接申请。</p>
          </div>
          <UFormGroup label="是否启用评论" name="enableComment" help="关闭后动态下方不再显示评论入口">
            <UToggle v-model="state.enableComment"/>
          </UFormGroup>
          <UFormGroup label="评论最大字数" name="maxCommentLength" help="单条评论允许的最大字数，超出会被拒绝">
            <UInput v-model.number="state.maxCommentLength" type="number" min="1"/>
          </UFormGroup>
          <UFormGroup label="评论排序方式" name="commentOrder" help="按评论时间排序：倒序越晚发布越靠前，正序相反">
            <USelectMenu v-model="state.commentOrder"
                         :options="[{label:'倒序,越晚发布越靠前',value:'desc'},{label:'正序,越早发布越靠前',value:'asc'}]"
                         value-attribute="value" option-attribute="label"></USelectMenu>
          </UFormGroup>
          <UFormGroup label="是否开启注册用户" name="enableRegister" help="关闭后不再显示注册入口，已注册用户仍可登录">
            <UToggle v-model="state.enableRegister"/>
          </UFormGroup>
          <UFormGroup label="注册需管理员批准" name="enableRegisterApproval" help="开启后新用户注册需填写理由，待管理员批准后方可登录">
            <div class="flex items-center justify-between gap-4">
              <UToggle v-model="state.enableRegisterApproval"/>
              <UButton color="gray" variant="soft" to="/sys/approve">注册审批</UButton>
            </div>
          </UFormGroup>
          <div class="rounded-xl border border-gray-200 p-4 space-y-3 dark:border-gray-700">
            <div class="flex items-center justify-between gap-4"><div><p class="font-semibold">关于页面</p><p class="text-xs text-gray-500">开启后导航中显示“关于”，内容支持 Markdown 与 HTML。</p></div><UToggle v-model="state.enableAbout"/></div>
            <UFormGroup v-if="state.enableAbout" label="关于内容" name="aboutContent">
              <UTextarea v-model="state.aboutContent" :rows="12" placeholder="# 关于我&#10;&#10;支持 Markdown，也可直接使用 HTML。"/>
            </UFormGroup>
          </div>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div class="flex items-start gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><UIcon name="i-carbon-link" class="h-5 w-5"/></span>
              <div><p class="font-semibold text-gray-800 dark:text-gray-100">友情链接申请与须知</p><p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">配置友情链接页展示的申请须知与接收申请的邮箱。</p></div>
            </div>
            <UFormGroup label="申请须知" help="展示在友情链接页的申请说明，支持 Markdown 与 HTML">
              <UTextarea v-model="state.friendNotice" :rows="7"/>
            </UFormGroup>
            <UFormGroup label="申请邮箱" help="接收友情链接申请的邮箱地址">
              <UInput v-model="state.friendEmail" type="email" placeholder="admin@example.com"/>
            </UFormGroup>
          </div>
        </section>
      </template>

      <!-- ============ 附件 ============ -->
      <template #attachment>
        <section data-section="attachment" class="mt-4 space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 class="font-semibold text-gray-800 dark:text-gray-100">附件</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">动态附件的体积与数量限制。</p>
          </div>
          <p class="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-neutral-900/40 dark:text-gray-400">
            当前：单个不超过 {{ state.attachmentMaxSize }}MB，一次最多 {{ state.attachmentMaxCount }} 个
          </p>
          <UFormGroup label="附件大小上限" name="attachmentMaxSize" help="单位 MB，可选 1–25；超出会被服务端拒绝">
            <UInput v-model.number="state.attachmentMaxSize" type="number" min="1" max="25"/>
          </UFormGroup>
          <UFormGroup label="单次上传附件数量上限" name="attachmentMaxCount" help="一次上传请求最多可提交的个数，可选 1–20">
            <UInput v-model.number="state.attachmentMaxCount" type="number" min="1" max="20"/>
          </UFormGroup>
        </section>
      </template>

      <!-- ============ 安全与通知 ============ -->
      <template #security>
        <section data-section="security" class="mt-4 space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 class="font-semibold text-gray-800 dark:text-gray-100">安全与通知</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">人机验证、评论邮件通知与 Telegram 提醒。</p>
          </div>
          <UFormGroup label="是否启用Google Recaptcha" name="enableGoogleRecaptcha" help="启用后发评论、点赞会先通过 Google reCAPTCHA 校验">
            <UToggle v-model="state.enableGoogleRecaptcha"/>
          </UFormGroup>
          <template v-if="state.enableGoogleRecaptcha">
            <UFormGroup label="SiteKey" name="googleSiteKey" help="Google reCAPTCHA 的站点密钥">
              <UInput v-model="state.googleSiteKey"/>
            </UFormGroup>
            <UFormGroup label="SecretKey" name="googleSecretKey" help="服务端校验用密钥，加密保存">
              <UInput v-model="state.googleSecretKey" type="password" autocomplete="new-password" :placeholder="state.googleSecretKeyConfigured ? '已配置，留空保持不变' : ''"/>
            </UFormGroup>
          </template>
          <UFormGroup label="是否启用 Cloudflare 人机验证" name="enableTurnstile" help="启用后发评论、点赞会先通过 Cloudflare Turnstile 校验">
            <UToggle v-model="state.enableTurnstile"/>
          </UFormGroup>
          <template v-if="state.enableTurnstile">
            <UFormGroup label="Turnstile Site Key" name="turnstileSiteKey" help="Turnstile 小部件的站点密钥">
              <UInput v-model="state.turnstileSiteKey"/>
            </UFormGroup>
            <UFormGroup label="Turnstile Secret Key" name="turnstileSecretKey" help="服务端校验用密钥，加密保存">
              <UInput v-model="state.turnstileSecretKey" type="password" autocomplete="new-password" :placeholder="state.turnstileSecretKeyConfigured ? '已配置，留空保持不变' : ''"/>
            </UFormGroup>
            <p class="text-xs text-gray-500">启用后评论和点赞优先使用 Cloudflare Turnstile。</p>
          </template>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div class="flex items-center justify-between"><div><p class="font-semibold">评论邮件通知</p><p class="text-xs text-gray-500">支持 SMTP（SSL 465 或 TLS 587）与 Resend（re_ 开头的 API Key）。</p></div><UToggle v-model="state.enableEmail"/></div>
            <div v-if="state.enableEmail" class="space-y-3">
              <UFormGroup label="加密方式" help="SSL 使用隐式 TLS（端口 465）；TLS 使用 STARTTLS（端口 587）。">
                <USelectMenu v-model="state.smtpEncryption" :options="[{label:'SSL（端口 465）',value:'ssl'},{label:'TLS（端口 587）',value:'tls'}]" value-attribute="value" option-attribute="label"/>
              </UFormGroup>
              <UFormGroup label="服务器" help="SMTP 服务器地址"><UInput v-model="state.smtpHost" placeholder="smtp.example.com"/></UFormGroup>
              <UFormGroup label="发件人名称" help="收件人看到的发件人显示名"><UInput v-model="state.smtpFromName" maxlength="80" placeholder="可选，如：极简朋友圈"/></UFormGroup>
              <UFormGroup label="发件邮箱（SMTP 用户名）" help="登录 SMTP 服务器使用的账号"><UInput v-model="state.smtpUsername" type="email" placeholder="noreply@example.com"/></UFormGroup>
              <UFormGroup label="密码 / 授权码" help="SMTP 授权码，或 re_ 开头的 Resend API Key"><UInput v-model="state.smtpPassword" type="password" autocomplete="new-password" :placeholder="state.smtpPasswordConfigured ? '已配置，留空保持不变' : 'SMTP 授权码或 re_ 开头的 Resend API Key'"/></UFormGroup>
              <UFormGroup label="发送测试邮件" help="使用当前填写的 SMTP / Resend 配置（密码留空时用已保存的）向该邮箱发送验证邮件。">
                <div class="flex gap-2">
                  <UInput v-model="mailTestTo" class="min-w-0 flex-1" type="email" placeholder="收件邮箱，如 admin@example.com"/>
                  <UButton :loading="mailTestLoading" :disabled="!mailTestTo" @click="sendMailTest">发送测试</UButton>
                </div>
              </UFormGroup>
            </div>
          </div>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div class="flex items-center justify-between"><div><p class="font-semibold">Telegram 评论通知</p><p class="text-xs text-gray-500">配置 Bot Token；用户在自己的“用户中心”填写 Telegram User ID 后，评论时通过 Bot 发送提醒（模板与邮件一致）。</p></div><UToggle v-model="state.enableTelegram"/></div>
            <template v-if="state.enableTelegram">
              <UFormGroup label="Bot Token" help="Telegram Bot 的访问令牌，加密保存"><UInput v-model="state.telegramBotToken" type="password" autocomplete="new-password" placeholder="123456:ABC-DEF..."/></UFormGroup>
              <UFormGroup label="Bot 用户名（可选）" help="用于在个人设置中提醒用户关注该 Bot"><UInput v-model="state.telegramBotUsername" placeholder="meimeicomment_bot"/></UFormGroup>
            </template>
          </div>
        </section>
      </template>

      <!-- ============ 存储与数据 ============ -->
      <template #storage>
        <section data-section="storage" class="mt-4 space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h2 class="font-semibold text-gray-800 dark:text-gray-100">存储与数据</h2>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">媒体存储后端、回收站、备份与旧站导入。</p>
          </div>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div class="flex items-start gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"><UIcon name="i-carbon-data-1" class="h-5 w-5"/></span>
              <div><p class="font-semibold text-gray-800 dark:text-gray-100">媒体存储</p><p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">上传文件写入所选后端；切换后旧 R2 媒体仍可访问（读旧写新）。S3/WebDAV 凭据加密存储。</p></div>
            </div>
            <URadioGroup v-model="state.storageType" :options="[{value:'r2',label:'Cloudflare R2（默认）'},{value:'s3',label:'S3 兼容存储'},{value:'webdav',label:'WebDAV'}]" value-attribute="value"/>
            <template v-if="state.storageType === 's3'">
              <UFormGroup label="Endpoint" help="S3 兼容服务的访问地址"><UInput v-model="state.s3Storage.endpoint" placeholder="https://s3.example.com"/></UFormGroup>
              <div class="grid grid-cols-2 gap-3">
                <UFormGroup label="Region" help="区域名，不支持时填写 auto"><UInput v-model="state.s3Storage.region" placeholder="auto"/></UFormGroup>
                <UFormGroup label="Bucket" help="存放媒体的存储桶名称"><UInput v-model="state.s3Storage.bucket"/></UFormGroup>
              </div>
              <UFormGroup label="Access Key" help="访问密钥 ID"><UInput v-model="state.s3Storage.accessKeyId"/></UFormGroup>
              <UFormGroup label="Secret Key" help="访问密钥，加密保存"><UInput v-model="state.s3Storage.secretAccessKey" type="password" autocomplete="new-password" :placeholder="state.s3Storage.secretAccessKeyConfigured ? '已配置，留空保持不变' : ''"/></UFormGroup>
            </template>
            <template v-else-if="state.storageType === 'webdav'">
              <UFormGroup label="WebDAV URL" help="WebDAV 目录地址"><UInput v-model="state.webdavStorage.url" placeholder="https://dav.example.com/remote.php/dav/files/user"/></UFormGroup>
              <div class="grid grid-cols-2 gap-3">
                <UFormGroup label="用户名" help="WebDAV 登录账号"><UInput v-model="state.webdavStorage.username"/></UFormGroup>
                <UFormGroup label="密码" help="WebDAV 登录密码，加密保存"><UInput v-model="state.webdavStorage.password" type="password" autocomplete="new-password" :placeholder="state.webdavStorage.passwordConfigured ? '已配置，留空保持不变' : ''"/></UFormGroup>
              </div>
              <p class="text-xs text-gray-500">WebDAV 无预签名直传，单文件上限 25MB；大视频请使用 R2 或 S3。</p>
            </template>
          </div>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-neutral-900/40 p-4 space-y-3">
            <div class="flex items-start gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                <UIcon name="i-carbon-cloud" class="h-5 w-5"/>
              </span>
              <div>
                <p class="font-semibold text-gray-800 dark:text-gray-100">媒体回收站</p>
                <p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">未引用文件会先进入回收站并保留 7 天，期间可恢复；到期文件会在下次清理时永久删除。当前存储为 S3/WebDAV 时，回收站同样作用于所选后端。</p>
              </div>
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <UButton block color="red" variant="soft" icon="i-carbon-clean" @click="showCleanFileModal = true">扫描未引用文件</UButton>
              <UButton block color="gray" variant="soft" icon="i-carbon-trash-can" @click="openTrash">查看回收站</UButton>
            </div>
          </div>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div><p class="font-semibold">本地备份</p><p class="mt-1 text-xs text-gray-500">将数据库导出为 SQL 文件，下载到本地保存。</p></div>
              <UButton size="sm" icon="i-carbon-download" :loading="localBackupLoading" @click="exportLocalBackup">导出文件</UButton>
            </div>
          </div>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div><p class="font-semibold">D1 生产备份</p><p class="mt-1 text-xs text-gray-500">按配置的间隔自动备份到所选目标，恢复前会自动再创建一份安全备份。</p></div>
              <UToggle v-model="state.enableD1Backup"/>
            </div>
            <template v-if="state.enableD1Backup">
              <div class="flex items-start justify-between gap-3"><UButton size="sm" icon="i-carbon-renew" :loading="backupLoading" @click="createBackup">立即备份</UButton></div>
              <div class="grid grid-cols-2 gap-3">
                <UFormGroup label="自动备份间隔" help="单位：天，可选 1–365"><UInput v-model.number="state.backupIntervalDays" type="number" min="1" max="365"/></UFormGroup>
                <UFormGroup label="保留天数" help="备份文件保留的天数，可选 1–3650"><UInput v-model.number="state.backupRetentionDays" type="number" min="1" max="3650"/></UFormGroup>
              </div>
              <UFormGroup label="备份目标" help="仅显示已配置的存储"><USelectMenu v-model="state.backupTarget" :options="backupTargetOptions" value-attribute="value" option-attribute="label"/></UFormGroup>
              <UButton block color="gray" variant="soft" icon="i-carbon-data-backup" @click="openBackups">管理备份</UButton>
            </template>
          </div>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div class="flex items-start justify-between gap-3"><div><p class="font-semibold">一键导入</p><p class="mt-1 text-xs text-gray-500">上传本地转换器生成的迁移包（旧 Docker 站），预检后导入 D1 与所选存储。</p></div></div>
            <UButton block color="gray" variant="soft" icon="i-carbon-import-export" to="/sys/migration">打开一键导入器</UButton>
          </div>
        </section>
      </template>
    </UTabs>

    <!-- 常驻保存条：sticky 吸底，脏标记提示未保存更改，保存后重新拉取配置而不整页刷新 -->
    <div :data-dirty="dirty ? 'true' : 'false'"
         class="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-neutral-900/95">
      <div class="flex items-center gap-2 text-xs">
        <template v-if="dirty">
          <span class="h-2 w-2 rounded-full bg-amber-500"></span>
          <span class="text-amber-600 dark:text-amber-400">有未保存更改</span>
        </template>
        <span v-else class="text-gray-400">所有更改已保存</span>
      </div>
      <UButton :loading="saving" @click="save">保存设置</UButton>
    </div>
  </div>

  <UModal
    v-model="showCleanFileModal"
    :ui="{
      container:
        'flex justify-center items-center backdrop-blur',
    }"
  >
    <div class="p-4 bg-white dark:bg-neutral-800 rounded-lg shadow-md">
      <p class="text-lg font-bold mb-2">谨慎操作</p>
      <p class="text-gray-600 dark:text-gray-300 mb-4 leading-6">确认扫描未使用的图片和视频吗？未引用文件会进入回收站并保留 7 天，不会立即从 R2 删除。</p>
      <div class="flex justify-end gap-2 mt-4">
        <UButton color="white" @click="showCleanFileModal = false">取消</UButton>
        <UButton @click="cleanFile">确认清理</UButton>
      </div>
        </div>
  </UModal>

  <UModal v-model="showBackupModal" :ui="{container:'flex justify-center items-center backdrop-blur'}">
    <div class="max-h-[85vh] overflow-auto rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
      <div class="mb-4 flex items-start justify-between"><div><h2 class="text-lg font-semibold">D1 备份</h2><p class="text-sm text-gray-500">恢复会覆盖当前数据库，需管理员密码和完整备份名称。</p></div><UButton color="gray" variant="ghost" icon="i-carbon-close" @click="showBackupModal=false"/></div>
      <div v-if="backupLoading" class="py-10 text-center text-sm text-gray-500">正在处理备份…</div>
      <div v-else-if="backups.length===0" class="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">暂无备份</div>
      <div v-else class="space-y-3"><div v-for="backup in backups" :key="backup.key" class="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><div class="flex items-center justify-between gap-3"><div class="min-w-0"><p class="truncate text-sm font-medium">{{ backup.name }}</p><p class="mt-1 text-xs text-gray-500">{{ formatBytes(backup.size) }} · {{ $dayjs(backup.uploaded).format('YYYY-MM-DD HH:mm') }}</p></div><div class="flex gap-1"><UButton size="xs" color="gray" variant="soft" @click="downloadBackup(backup.key)">下载</UButton><UButton size="xs" color="red" variant="soft" @click="selectRestore(backup)">恢复</UButton></div></div></div></div>
      <div v-if="restoreBackup" class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20"><p class="font-semibold text-red-700 dark:text-red-300">恢复 {{ restoreBackup.name }}</p><UInput v-model="restoreConfirmName" class="mt-3" placeholder="输入完整备份名称"/><UInput v-model="restorePassword" class="mt-2" type="password" placeholder="当前管理员密码"/><div class="mt-3 flex justify-end gap-2"><UButton color="gray" variant="soft" @click="restoreBackup=null">取消</UButton><UButton color="red" :loading="backupLoading" @click="confirmRestore">确认覆盖恢复</UButton></div></div>
    </div>
  </UModal>

  <UModal v-model="showTrashModal" :ui="{container:'flex justify-center items-center backdrop-blur'}">
    <div class="max-h-[80vh] overflow-auto rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800">
      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">媒体回收站</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">文件保留 {{ trashRetentionDays }} 天，可恢复或立即永久删除。</p>
        </div>
        <UButton color="gray" variant="ghost" icon="i-carbon-close" aria-label="关闭回收站" @click="showTrashModal = false"/>
      </div>
      <div v-if="trashLoading" class="py-10 text-center text-sm text-gray-500">正在加载回收站…</div>
      <div v-else-if="trashFiles.length === 0" class="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600">回收站是空的</div>
      <div v-else class="space-y-3">
        <div v-for="file in trashFiles" :key="file.id" class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-neutral-700">
            <img v-if="file.thumbPath" :src="file.thumbPath" :alt="file.filename" class="h-full w-full object-cover" loading="lazy" @error="file.thumbPath = ''"/>
            <UIcon v-else :name="file.contentType.startsWith('image/') ? 'i-carbon-image' : 'i-carbon-video'" class="h-5 w-5 text-gray-600 dark:text-gray-300"/>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{{ file.filename }}</p>
            <p class="mt-1 text-xs text-gray-500">{{ formatBytes(file.size) }} · {{ $dayjs.utc(file.trashedAt).local().format('YYYY-MM-DD HH:mm') }}</p>
          </div>
          <div class="flex shrink-0 gap-1">
            <UButton size="xs" color="green" variant="soft" @click="restoreTrashFile(file.id)">恢复</UButton>
            <Confirm @ok="purgeTrashFile(file.id)">
              <UButton size="xs" color="red" variant="soft">永久删除</UButton>
            </Confirm>
          </div>
        </div>
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
import type {SysConfigVO, UserVO} from "~/types";
import {toast} from "vue-sonner";
import {useUpload} from "~/utils";
import {useGlobalState} from "~/store";

const currentUser = useState<UserVO>('userinfo')
const global = useGlobalState()
// 仅管理员可访问系统设置（含注册审批、备份、存储凭据等敏感功能）
if (global.value.userinfo.id !== 1) await navigateTo('/', { replace: true })
const version = ref('')
const commitId = ref('')
const state = reactive({
  enableGoogleRecaptcha: false,
  googleSiteKey:"",
  googleSecretKey:"",
  googleSecretKeyConfigured: false,
  enableTurnstile: false,
  turnstileSiteKey: "",
  turnstileSecretKey: "",
  turnstileSecretKeyConfigured: false,
  enableAutoLoadNextPage: true,
  enableComment: true,
  enableRegister: true,
  enableRegisterApproval: false,
  backupIntervalDays: 7,
  backupRetentionDays: 90,
  enableD1Backup: true,
  storageType: 'r2',
  backupTarget: 'r2',
  s3Storage: { endpoint: '', region: 'auto', bucket: '', accessKeyId: '', secretAccessKey: '', secretAccessKeyConfigured: false },
  webdavStorage: { url: '', username: '', password: '', passwordConfigured: false },
  enableAbout: false,
  aboutContent: "",
  friendNotice: "",
  friendEmail: "",
  maxCommentLength: 120,
  memoMaxHeight: 300,
  attachmentMaxSize: 10,
  attachmentMaxCount: 5,
  commentOrder: 'desc',
  timeFormat: 'timeAgo',
  adminUserName: "admin",
  title: "极简朋友圈",
  enableSeo: true,
  seoDescription: "",
  seoKeywords: "",
  siteUrl: "https://wb.me-i.top",
  favicon: "/favicon.ico",
  beiAnNo: "",
  css: "",
  js: "",
  rss: "",
  enableEmail: false,
  enableTelegram: false,
  telegramBotUsername: "",
  telegramBotToken: "",
  smtpHost: "",
  smtpPort: "465" as '465' | '587',
  smtpEncryption: "ssl" as 'ssl' | 'tls',
  smtpUsername: "",
  smtpFromName: "",
  smtpPassword: "",
  smtpPasswordConfigured: false,
})

// 分区导航：UTabs 以索引为 v-model，这里把索引与 ?tab= 的 key 互转，实现深链
const route = useRoute()
const router = useRouter()
const sectionTabs = [
  { key: 'site', label: '站点', slot: 'site' },
  { key: 'seo', label: 'SEO', slot: 'seo' },
  { key: 'content', label: '内容与互动', slot: 'content' },
  { key: 'attachment', label: '附件', slot: 'attachment' },
  { key: 'security', label: '安全与通知', slot: 'security' },
  { key: 'storage', label: '存储与数据', slot: 'storage' },
]
const activeTabIndex = ref(0)
const selectTab = (index: number) => {
  activeTabIndex.value = index
  const key = sectionTabs[index]?.key
  if (!key || route.query.tab === key) return
  // 同步写回 query，刷新或分享链接后仍停留在同一分区
  router.replace({ query: { ...route.query, tab: key } })
}
// ?tab=storage 这类深链（含浏览器前进/后退）→ 切到对应分区
const syncTabFromQuery = () => {
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
  const index = sectionTabs.findIndex(item => item.key === tab)
  if (index > -1) activeTabIndex.value = index
}
watch(() => route.query.tab, syncTabFromQuery)

// 脏标记：把配置快照与当前表单比对，任何字段改动都会点亮保存条
const snapshot = () => JSON.stringify(state)
const savedSnapshot = ref(snapshot())
const dirty = computed(() => snapshot() !== savedSnapshot.value)

type TrashFile = { id: number; path: string; thumbPath: string; filename: string; contentType: string; size: number; trashedAt: string }
type BackupFile = { key: string; name: string; size: number; uploaded: string }
const showBackupModal = ref(false)
const backupLoading = ref(false)
const backups = ref<BackupFile[]>([])
const restoreBackup = ref<BackupFile | null>(null)
const backupTargetOptions = computed(() => {
  const options: Array<{value:string;label:string}> = [{value:'r2',label:'Cloudflare R2'}]
  if (state.s3Storage.endpoint && state.s3Storage.bucket && state.s3Storage.accessKeyId) options.push({value:'s3',label:'S3 兼容存储'})
  if (state.webdavStorage.url) options.push({value:'webdav',label:'WebDAV'})
  return options
})
const restoreConfirmName = ref('')
const restorePassword = ref('')
const showCleanFileModal = ref(false)
const showTrashModal = ref(false)
const trashLoading = ref(false)
const trashFiles = ref<TrashFile[]>([])
const trashRetentionDays = ref(7)

const reload = async () => {
  const res = await useMyFetch<SysConfigVO>('/sysConfig/getFull')
  if (res) {
    Object.assign(state, res)
    if (state.smtpEncryption !== 'ssl' && state.smtpEncryption !== 'tls') state.smtpEncryption = state.smtpPort === '587' ? 'tls' : 'ssl'
    version.value = res.version
    commitId.value = res.commitId
    // 等服务端值派生出的联动（如加密方式→端口）落定后再取快照，避免刚加载就显示脏
    await nextTick()
    savedSnapshot.value = snapshot()
  }
}

// 加密方式联动端口：SSL→465，TLS→587
watch(() => state.smtpEncryption, value => { state.smtpPort = value === 'tls' ? '587' : '465' })

const saving = ref(false)
const save = async () => {
  saving.value = true
  try {
    await useMyFetch('/sysConfig/save', state)
    toast.success("保存成功")
    // 重新拉取配置而不是整页刷新：保留当前分区与滚动位置
    await reload()
  } finally {
    saving.value = false
  }
}

const uploadFavicon = async (files: FileList) => {
  for (let i = 0; i < files.length; i++) {
    if (files[i].type.indexOf("image") < 0){
      toast.error("只能上传图片");
      return
    }
  }
  const result = await useUpload(files)
  if (result.length) {
    toast.success("上传成功")
    state.favicon = result[0]
  }
}

const loadBackups = async () => {
  backupLoading.value = true
  try { backups.value = (await useMyFetch<{list: BackupFile[]}>('/admin/backup/list')).list || [] }
  finally { backupLoading.value = false }
}
const openBackups = async () => { showBackupModal.value = true; await loadBackups() }
const createBackup = async () => { backupLoading.value = true; try { await useMyFetch('/admin/backup/create'); toast.success('备份已创建'); if(showBackupModal.value) await loadBackups() } finally { backupLoading.value = false } }
const mailTestTo = ref('')
const mailTestLoading = ref(false)
const sendMailTest = async () => {
  const to = mailTestTo.value.trim()
  if (!to) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return toast.error('收件邮箱格式不正确')
  mailTestLoading.value = true
  try {
    await useMyFetch('/admin/mail/test', { to, smtpHost: state.smtpHost, smtpPort: state.smtpPort, smtpEncryption: state.smtpEncryption, smtpUsername: state.smtpUsername, smtpFromName: state.smtpFromName, smtpPassword: state.smtpPassword })
    toast.success('测试邮件已发送，请检查收件箱')
  } catch (error: any) {
    toast.error(error?.message || '测试邮件发送失败')
  } finally {
    mailTestLoading.value = false
  }
}
const localBackupLoading = ref(false)
const exportLocalBackup = async () => {
  localBackupLoading.value = true
  try {
    const token = useGlobalState().value.userinfo.token
    const response = await fetch('/api/admin/backup/export', { method:'POST', headers:{'x-api-token':token} })
    if (!response.ok) { let message = '备份导出失败'; try { const body = await response.json(); message = body.message || message } catch { /* ignore */ } toast.error(message); return }
    const blob = await response.blob()
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `moments-backup-${new Date().toISOString().slice(0,10)}.sql`; link.click(); URL.revokeObjectURL(link.href)
    toast.success('备份已下载到本地')
  } finally { localBackupLoading.value = false }
}
const downloadBackup = async (key: string) => {
  const token = useGlobalState().value.userinfo.token
  const response = await fetch(`/api/admin/backup/download?key=${encodeURIComponent(key)}`, {method:'POST',headers:{'x-api-token':token}})
  if(!response.ok) { toast.error('备份下载失败'); return }
  const blob = await response.blob(); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=key.split('/').pop() || 'backup.sql'; link.click(); URL.revokeObjectURL(link.href)
}
const selectRestore = (backup: BackupFile) => { restoreBackup.value=backup; restoreConfirmName.value=''; restorePassword.value='' }
const confirmRestore = async () => {
  if(!restoreBackup.value) return
  backupLoading.value=true
  try { await useMyFetch('/admin/backup/restore',{key:restoreBackup.value.key,confirmName:restoreConfirmName.value,password:restorePassword.value}); toast.success('数据库恢复完成，请重新登录'); location.href='/' }
  finally { backupLoading.value=false }
}

const cleanFile = async () => {
  const res = await useMyFetch<{num: number; purged: number; retentionDays: number}>('/file/clean')
  if (res) {
    toast.success(`已将 ${res.num} 个未引用文件移入回收站${res.purged ? `，并清理 ${res.purged} 个到期文件` : ''}`)
    trashRetentionDays.value = res.retentionDays
    showCleanFileModal.value = false
  }
}

const loadTrash = async () => {
  trashLoading.value = true
  try {
    const res = await useMyFetch<{list: TrashFile[]; retentionDays: number}>('/file/trash/list')
    trashFiles.value = res.list || []
    trashRetentionDays.value = res.retentionDays || 7
  } finally {
    trashLoading.value = false
  }
}
const openTrash = async () => {
  showTrashModal.value = true
  await loadTrash()
}
const restoreTrashFile = async (id: number) => {
  await useMyFetch(`/file/trash/restore?id=${id}`)
  toast.success('文件已恢复')
  await loadTrash()
}
const purgeTrashFile = async (id: number) => {
  await useMyFetch(`/file/trash/purge?id=${id}`)
  toast.success('文件已永久删除')
  await loadTrash()
}
const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

onMounted(async () => {
  await reload()
  syncTabFromQuery()
})

</script>

<style scoped>

</style>
