export function openApiDocument(origin = '') {
  const post = (summary, secured = false) => ({ summary, ...(secured ? { security: [{ ApiToken: [] }] } : {}), responses: { 200: { description: '成功' }, 400: { description: '参数错误' }, 401: { description: '未登录' }, 503: { description: '服务不可用' } } });
  return {
    openapi: '3.1.0', info: { title: 'Moments CF API', version: '7.0.0', description: 'Cloudflare Workers + D1 + R2 API' },
    servers: [{ url: origin || '/' }],
    components: { securitySchemes: { ApiToken: { type: 'apiKey', in: 'header', name: 'x-api-token' } }, schemas: { Envelope: { type: 'object', properties: { code: { type: 'integer' }, message: { type: 'string' }, data: {} }, required: ['code'] } } },
    paths: {
      '/api/health': { get: post('健康检查') }, '/api/user/login': { post: post('登录') }, '/api/user/reg': { post: post('注册') },
      '/api/user/profile': { post: post('当前/公开用户资料') }, '/api/user/saveProfile': { post: post('保存用户资料', true) },
      '/api/sysConfig/get': { post: post('公开设置') }, '/api/sysConfig/getFull': { post: post('管理员设置', true) }, '/api/sysConfig/save': { post: post('保存设置', true) },
      '/api/memo/list': { post: post('动态列表') }, '/api/memo/get': { post: post('动态详情') }, '/api/memo/save': { post: post('发布/编辑动态', true) }, '/api/memo/remove': { post: post('删除动态', true) }, '/api/memo/like': { post: post('点赞') },
      '/api/comment/add': { post: post('添加评论') }, '/api/comment/remove': { post: post('删除评论', true) },
      '/api/file/upload': { post: post('小文件上传', true) }, '/api/file/exist': { post: post('SHA-256 秒传检查', true) }, '/api/file/direct/init': { post: post('初始化最大500MB直传', true) }, '/api/file/direct/complete': { post: post('确认R2直传', true) },
      '/api/file/trash/list': { post: post('回收站', true) }, '/api/file/trash/restore': { post: post('恢复媒体', true) }, '/api/file/trash/purge': { post: post('永久删除媒体', true) },
      '/api/admin/backup/create': { post: post('创建D1备份', true) }, '/api/admin/backup/list': { post: post('备份列表', true) }, '/api/admin/backup/download': { post: post('下载备份', true) }, '/api/admin/backup/restore': { post: post('恢复备份', true) },
      '/rss': { get: { summary: 'RSS 2.0', responses: { 200: { description: 'RSS XML' } } } },
    },
  };
}
export function openApiHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Moments CF API</title><style>body{font:15px system-ui;max-width:900px;margin:auto;padding:32px;color:#27272a}pre{background:#18181b;color:#fafafa;padding:20px;border-radius:12px;overflow:auto}a{color:#087f5b}</style></head><body><h1>Moments CF API</h1><p>OpenAPI 3.1 文档：<a href="/openapi.json">/openapi.json</a></p><p>认证接口使用 <code>x-api-token</code> 请求头。</p><pre id="doc">加载中…</pre><script>fetch('/openapi.json').then(r=>r.json()).then(v=>doc.textContent=JSON.stringify(v,null,2)).catch(e=>doc.textContent=e.message)</script></body></html>`;
}
