const encoder = new TextEncoder();
const SAFE_TAGS = new Set(['a', 'span', 'br', 'strong', 'em', 'img', 'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr']);
const VOID_TAGS = new Set(['br', 'img', 'hr']);
import { storageBackend } from './storage.js';

const BACKUP_PREFIX = 'backups/d1/';
const BACKUP_RETENTION_DAYS = 90;
const MAX_DIRECT_UPLOAD_BYTES = 500 * 1024 * 1024;

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function decodeEntities(value) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}
function safeUrl(value, { image = false } = {}) {
  const text = decodeEntities(value).trim();
  if (/^\/(?:upload\/|favicon(?:\.|\/))/.test(text) && !text.includes('..')) return text;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (image && url.protocol !== 'https:') return '';
    return url.href;
  } catch { return ''; }
}
function parseAttrs(source) {
  const attrs = [];
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) attrs.push([match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '']);
  return attrs;
}
export function sanitizeSafeHtml(input) {
  let source = String(input || '').slice(0, 5000);
  source = source.replace(/<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  let output = '';
  let cursor = 0;
  const tagPattern = /<\/?[a-zA-Z][^>]*>/g;
  for (const match of source.matchAll(tagPattern)) {
    output += escapeHtml(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const closing = /^<\//.test(match[0]);
    const name = match[0].match(/^<\/?\s*([a-zA-Z0-9]+)/)?.[1]?.toLowerCase();
    if (!name || !SAFE_TAGS.has(name)) continue;
    if (closing) { if (!VOID_TAGS.has(name)) output += `</${name}>`; continue; }
    const attrSource = match[0].replace(/^<\s*[a-zA-Z0-9]+|\/?\s*>$/g, '');
    const allowed = [];
    for (const [key, value] of parseAttrs(attrSource)) {
      if (key.startsWith('on') || key === 'style' || key === 'srcdoc') continue;
      if (name === 'a' && key === 'href') { const href = safeUrl(value); if (href) allowed.push(`href="${escapeHtml(href)}"`); }
      else if (name === 'a' && key === 'target' && value === '_blank') allowed.push('target="_blank"');
      else if (name === 'a' && key === 'rel') allowed.push('rel="noopener noreferrer"');
      else if (name === 'img' && key === 'src') { const src = safeUrl(value, { image: true }); if (src) allowed.push(`src="${escapeHtml(src)}"`); }
      else if (name === 'img' && ['alt', 'width', 'height'].includes(key)) allowed.push(`${key}="${escapeHtml(String(value).slice(0, 200))}"`);
      else if (['span', 'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'].includes(name) && key === 'class' && /^[a-zA-Z0-9 _-]{1,120}$/.test(value)) allowed.push(`class="${escapeHtml(value)}"`);
    }
    if (name === 'a' && allowed.some(value => value.startsWith('target=')) && !allowed.some(value => value.startsWith('rel='))) allowed.push('rel="noopener noreferrer"');
    if (name === 'img' && !allowed.some(value => value.startsWith('src='))) continue;
    output += `<${name}${allowed.length ? ` ${allowed.join(' ')}` : ''}>`;
  }
  output += escapeHtml(source.slice(cursor));
  return output;
}

function bytesToHex(bytes) { return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join(''); }
function bytesToBase64url(bytes) {
  let binary = ''; for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function base64urlToBytes(value) {
  const padded = String(value).replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - String(value).length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}
async function sha256(value) { return crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value); }
async function configEncryptionKey(secret) {
  if (!secret || String(secret).length < 16) throw new Error('JWT_SECRET 未配置，无法加密邮件凭据');
  return crypto.subtle.importKey('raw', await sha256(`moments-cf:config:v1:${secret}`), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encryptConfigSecret(value, secret) {
  if (!value) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('moments-cf:mail:v1') }, await configEncryptionKey(secret), encoder.encode(String(value)));
  return `enc:v1:${bytesToBase64url(iv)}:${bytesToBase64url(cipher)}`;
}
export async function decryptConfigSecret(value, secret) {
  if (!value) return '';
  const parts = String(value).split(':');
  if (parts.length !== 4 || parts[0] !== 'enc' || parts[1] !== 'v1') throw new Error('邮件凭据密文格式错误');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64urlToBytes(parts[2]), additionalData: encoder.encode('moments-cf:mail:v1') }, await configEncryptionKey(secret), base64urlToBytes(parts[3]));
  return new TextDecoder().decode(plain);
}
async function hmac(key, value) {
  const material = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', material, typeof value === 'string' ? encoder.encode(value) : value);
}
function awsEncode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }
export async function createR2PresignedPut({ accountId, bucket, key, accessKeyId, secretAccessKey, contentType, checksumSha256, expires = 900, now = new Date() }) {
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) throw new Error('R2 直传凭据未配置');
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = date.slice(0, 8);
  const scope = `${shortDate}/auto/s3/aws4_request`;
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': date, 'X-Amz-Expires': String(Math.min(3600, Math.max(60, expires))),
    'X-Amz-SignedHeaders': checksumSha256 ? 'content-type;host;x-amz-checksum-sha256' : 'content-type;host',
  });
  const canonicalQuery = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`).join('&');
  const canonicalUri = `/${awsEncode(bucket)}/${key.split('/').map(awsEncode).join('/')}`;
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n${checksumSha256 ? `x-amz-checksum-sha256:${checksumSha256}\n` : ''}`;
  const signedHeaders = checksumSha256 ? 'content-type;host;x-amz-checksum-sha256' : 'content-type;host';
  const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${bytesToHex(await sha256(canonicalRequest))}`;
  const kDate = await hmac(`AWS4${secretAccessKey}`, shortDate);
  const kRegion = await hmac(kDate, 'auto');
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = bytesToHex(await hmac(kSigning, stringToSign));
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
export function hexToBase64(hex) {
  const value = String(hex || '');
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('SHA-256 格式错误');
  let binary = '';
  for (let index = 0; index < value.length; index += 2) binary += String.fromCharCode(parseInt(value.slice(index, index + 2), 16));
  return btoa(binary);
}
export function validateDirectUpload(input, allowedTypes) {
  const size = Number(input?.size);
  const sha = String(input?.sha256 || '').toLowerCase();
  const contentType = String(input?.contentType || '');
  if (!Number.isInteger(size) || size <= 0 || size > MAX_DIRECT_UPLOAD_BYTES) throw new Error('文件大小必须在 1B 到 500MB 之间');
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('SHA-256 格式错误');
  if (!allowedTypes.has(contentType)) throw new Error(`不支持的文件类型：${contentType || '未知'}`);
  return { size, sha256: sha, contentType, filename: String(input?.filename || 'file').slice(0, 255) };
}

function utf8Base64(value) {
  let binary = ''; for (const byte of encoder.encode(String(value))) binary += String.fromCharCode(byte); return btoa(binary);
}
function escapeEmail(value) { return escapeHtml(value).replace(/\r?\n/g, '<br>'); }
export function buildCommentEmail({ title, host, poster, commenter, content, memoId, createdAt }) {
  const link = `${String(host).replace(/\/$/, '')}/memo/${Number(memoId)}`;
  const subject = `${title}：新评论通知`;
  const html = `<div style="font-family:system-ui;max-width:600px;margin:auto;color:#27272a"><h2>${escapeEmail(title)}</h2><p>${escapeEmail(poster)}，您的动态有了新评论。</p><div style="background:#f4f4f5;padding:16px;border-radius:12px"><p><strong>评论者：</strong>${escapeEmail(commenter)}</p><p><strong>时间：</strong>${escapeEmail(createdAt)}</p><p><strong>内容：</strong>${escapeEmail(content)}</p></div><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#22a06b;color:white;text-decoration:none;border-radius:8px">查看动态</a></p></div>`;
  const text = `${poster}，您的动态有了新评论。\n评论者：${commenter}\n时间：${createdAt}\n内容：${content}\n查看：${link}`;
  return { subject, html, text };
}
async function readSmtpResponse(reader) {
  const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error('SMTP 连接提前关闭');
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\r\n').filter(Boolean);
    const last = lines.at(-1) || '';
    if (/^\d{3} /.test(last)) return { code: Number(last.slice(0, 3)), text: lines.join('\n') };
  }
}
async function smtpCommand(writer, reader, command, expected) {
  if (command != null) await writer.write(encoder.encode(`${command}\r\n`));
  const response = await readSmtpResponse(reader);
  if (!expected.includes(response.code)) throw new Error(`SMTP ${response.code}: ${response.text.slice(0, 300)}`);
  return response;
}
async function smtpSession(socket, config, message, startTls = false) {
  await socket.opened;
  let reader = socket.readable.getReader(); let writer = socket.writable.getWriter();
  await smtpCommand(writer, reader, null, [220]);
  await smtpCommand(writer, reader, `EHLO ${config.hello || 'moments-cf'}`, [250]);
  if (startTls) {
    await smtpCommand(writer, reader, 'STARTTLS', [220]);
    reader.releaseLock(); writer.releaseLock();
    socket = socket.startTls(); await socket.opened;
    reader = socket.readable.getReader(); writer = socket.writable.getWriter();
    await smtpCommand(writer, reader, `EHLO ${config.hello || 'moments-cf'}`, [250]);
  }
  await smtpCommand(writer, reader, 'AUTH LOGIN', [334]);
  await smtpCommand(writer, reader, utf8Base64(config.username), [334]);
  await smtpCommand(writer, reader, utf8Base64(config.password), [235]);
  const envelopeFrom = String(message.from).match(/<([^<>]+@[^<>]+)>/)?.[1] || String(message.from).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(envelopeFrom)) throw new Error('发件邮箱格式错误');
  await smtpCommand(writer, reader, `MAIL FROM:<${envelopeFrom}>`, [250]);
  await smtpCommand(writer, reader, `RCPT TO:<${message.to}>`, [250, 251]);
  await smtpCommand(writer, reader, 'DATA', [354]);
  const subject = `=?UTF-8?B?${utf8Base64(message.subject)}?=`;
  const mime = [`From: ${message.from}`, `To: ${message.to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', `Date: ${new Date().toUTCString()}`, '', message.html.replace(/^\./gm, '..'), '.'].join('\r\n');
  await smtpCommand(writer, reader, mime, [250]);
  await smtpCommand(writer, reader, 'QUIT', [221]);
  reader.releaseLock(); writer.releaseLock(); await socket.close();
}
export async function sendSmtp(config, message, connectImpl) {
  if (!connectImpl) ({ connect: connectImpl } = await import('cloudflare:sockets'));
  const port = Number(config.port);
  if (![465, 587].includes(port)) throw new Error('SMTP 仅允许 465 或 587 端口');
  const encryption = config.encryption || (port === 465 ? 'ssl' : 'tls');
  const socket = connectImpl({ hostname: config.host, port }, { secureTransport: encryption === 'ssl' ? 'on' : 'starttls', allowHalfOpen: false });
  return smtpSession(socket, config, message, encryption === 'tls');
}
export async function sendResend(apiKey, message, fetchImpl = fetch) {
  if (!apiKey) throw new Error('RESEND_API_KEY 未配置');
  const response = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }) });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json().catch(() => ({}));
}
export async function sendTelegram({ botToken, chatId, text, fetchImpl = fetch }) {
  if (!botToken || !chatId) throw new Error('Telegram Bot Token 或 Chat ID 未配置');
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: String(chatId), text: String(text).slice(0, 4000), disable_web_page_preview: true }),
  });
  if (!response.ok) throw new Error(`Telegram 发送失败（${response.status}）`);
  return response.json();
}
export async function sendNotification(env, config, message, dependencies = {}) {
  const errors = [];
  const credential = config.mailCredential || '';
  const resendKey = credential.startsWith('re_') ? credential : env.RESEND_API_KEY;
  const smtpPassword = credential && !credential.startsWith('re_') ? credential : env.SMTP_PASSWORD;
  if (config.smtpHost && config.smtpUsername && smtpPassword) {
    try { await sendSmtp({ host: config.smtpHost, port: config.smtpPort || '465', username: config.smtpUsername, password: smtpPassword, encryption: config.smtpEncryption }, message, dependencies.connect); return { provider: 'smtp' }; }
    catch (error) { errors.push(`SMTP: ${error.message}`); }
  }
  try { await sendResend(resendKey, message, dependencies.fetch || fetch); return { provider: 'resend', fallback: errors.length > 0 }; }
  catch (error) { errors.push(`Resend: ${error.message}`); throw new Error(errors.join('; ')); }
}

async function cfApi(env, path, body, fetchImpl = fetch) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.D1_DATABASE_ID || !env.D1_BACKUP_API_TOKEN) throw new Error('D1 备份 API Secrets/Vars 未配置');
  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.D1_DATABASE_ID}${path}`, { method: 'POST', headers: { authorization: `Bearer ${env.D1_BACKUP_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.errors?.map(item => item.message).join('; ') || `Cloudflare API ${response.status}`);
  return data.result;
}
async function sleep(ms) { await new Promise(resolve => setTimeout(resolve, ms)); }
export async function startD1Export(env, fetchImpl = fetch) {
  return cfApi(env, '/export', { output_format: 'polling' }, fetchImpl);
}
export async function pollD1Export(env, bookmark, fetchImpl = fetch) {
  return cfApi(env, '/export', { output_format: 'polling', current_bookmark: bookmark }, fetchImpl);
}
export async function storeD1Backup(env, result, retentionDays = BACKUP_RETENTION_DAYS, fetchImpl = fetch, target = 'r2', storageConfig = null) {
  if (!result?.signed_url) throw new Error('D1 导出未返回下载地址');
  const download = await fetchImpl(result.signed_url);
  if (!download.ok) throw new Error('无法下载 D1 导出文件');
  const key = `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  await backupBackend(env, target, storageConfig).put(key, download.body, { httpMetadata: { contentType: 'application/sql' } });
  await purgeOldBackups(env, Date.now(), retentionDays, target, storageConfig);
  return { key };
}
function backupBackend(env, target, storageConfig) {
  return storageBackend(env, storageConfig || { storageType: 'r2', s3Storage: {}, webdavStorage: {} }, target || 'r2');
}
export async function createD1Backup(env, dependencies = {}, retentionDays = BACKUP_RETENTION_DAYS, target = 'r2', storageConfig = null) {
  const fetchImpl = dependencies.fetch || fetch;
  let result;
  try {
    result = await cfApi(env, '/export', { output_format: 'download' }, fetchImpl);
  } catch { result = null; }
  if (!result?.signed_url) {
    result = await cfApi(env, '/export', { output_format: 'polling' }, fetchImpl);
    const bookmark = result.at_bookmark;
    if (!bookmark) throw new Error('D1 导出未返回 bookmark');
    for (let attempt = 0; attempt < 30 && !result.signed_url; attempt += 1) {
      if (attempt) await (dependencies.sleep || sleep)(2000);
      result = await cfApi(env, '/export', { output_format: 'polling', current_bookmark: bookmark }, fetchImpl);
      if (result.status === 'error') throw new Error(result.error || 'D1 导出失败');
    }
    if (!result.signed_url) throw new Error('D1 导出超时（数据库较大或导出服务繁忙，请稍后重试）');
  }
  const download = await fetchImpl(result.signed_url);
  if (!download.ok) throw new Error('无法下载 D1 导出文件');
  const key = `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  await backupBackend(env, target, storageConfig).put(key, download.body, { httpMetadata: { contentType: 'application/sql' } });
  await purgeOldBackups(env, Date.now(), retentionDays, target, storageConfig);
  return { key };
}
export async function listBackups(env, target = 'r2', storageConfig = null) {
  const objects = await backupBackend(env, target, storageConfig).list(BACKUP_PREFIX);
  return objects.filter(item => String(item.key || '').startsWith(BACKUP_PREFIX))
    .sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime())
    .map(item => ({ key: item.key, name: item.key.slice(BACKUP_PREFIX.length), size: Number(item.size || 0), uploaded: item.uploaded }));
}
export async function purgeOldBackups(env, now = Date.now(), retentionDays = BACKUP_RETENTION_DAYS, target = 'r2', storageConfig = null) {
  const backend = backupBackend(env, target, storageConfig);
  const backups = await listBackups(env, target, storageConfig); let deleted = 0;
  for (const item of backups) if (now - new Date(item.uploaded).getTime() > retentionDays * 86400000) { await backend.delete(item.key); deleted += 1; }
  return deleted;
}
// Compact MD5 implementation for D1 Import's required file etag.
export function md5Hex(buffer) {
  const bytes = new Uint8Array(buffer); const originalLength = bytes.length; const paddedLength = (((originalLength + 8) >>> 6) + 1) * 64;
  const data = new Uint8Array(paddedLength); data.set(bytes); data[originalLength] = 0x80;
  const bits = originalLength * 8; for (let i = 0; i < 8; i += 1) data[paddedLength - 8 + i] = Math.floor(bits / 2 ** (8 * i)) & 255;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const s = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0); const rot = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
  for (let offset = 0; offset < data.length; offset += 64) {
    const m = Array.from({ length: 16 }, (_, i) => (data[offset+i*4] | data[offset+i*4+1]<<8 | data[offset+i*4+2]<<16 | data[offset+i*4+3]<<24) >>> 0);
    let a=a0,b=b0,c=c0,d=d0;
    for (let i=0;i<64;i+=1) { let f,g; if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;} const temp=d;d=c;c=b;b=(b+rot((a+f+k[i]+m[g])>>>0,s[i]))>>>0;a=temp; }
    a0=(a0+a)>>>0;b0=(b0+b)>>>0;c0=(c0+c)>>>0;d0=(d0+d)>>>0;
  }
  return [a0,b0,c0,d0].map(v => [v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255].map(x=>x.toString(16).padStart(2,'0')).join('')).join('');
}
export async function restoreD1Backup(env, key, dependencies = {}, target = 'r2', storageConfig = null) {
  if (!key.startsWith(BACKUP_PREFIX) || key.includes('..')) throw new Error('备份名称无效');
  const object = await backupBackend(env, target, storageConfig).get(key); if (!object) throw new Error('备份不存在');
  const bytes = typeof object.arrayBuffer === 'function'
    ? await object.arrayBuffer()
    : await new Response(object.body).arrayBuffer();
  const etag = md5Hex(bytes); const fetchImpl = dependencies.fetch || fetch;
  const init = await cfApi(env, '/import', { action: 'init', etag }, fetchImpl);
  if (!init.upload_url || !init.filename) throw new Error('D1 Import 初始化失败');
  const upload = await fetchImpl(init.upload_url, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes }); if (!upload.ok) throw new Error('备份上传至 D1 Import 失败');
  let result = await cfApi(env, '/import', { action: 'ingest', etag, filename: init.filename }, fetchImpl);
  const bookmark = result.at_bookmark;
  for (let attempt=0;attempt<30 && result.status!=='complete';attempt+=1) { if(result.status==='error') throw new Error(result.error||'恢复失败'); await (dependencies.sleep||sleep)(1500); result=await cfApi(env,'/import',{action:'poll',current_bookmark:bookmark},fetchImpl); }
  if (result.status !== 'complete') throw new Error('D1 恢复超时');
  return result.result || {};
}

function inlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
  return text;
}
export function renderRssDescription(memo, host) {
  const blocks = String(memo.content || '').split(/\n{2,}/).map(part => `<p>${inlineMarkdown(part).replace(/\n/g, '<br>')}</p>`);
  if (memo.externalUrl) blocks.push(`<p><a href="${escapeHtml(memo.externalUrl)}">${escapeHtml(memo.externalTitle || memo.externalUrl)}</a></p>`);
  for (const image of String(memo.imgs || '').split(',').filter(Boolean)) blocks.push(`<p><img src="${escapeHtml(image.startsWith('/') ? host + image : image)}" alt="" /></p>`);
  let ext = {}; try { ext = JSON.parse(memo.ext || '{}'); } catch {}
  const music = ext.music || {}; let musicUrl = music.mode === 'direct' ? music.url || '' : '';
  if (music.server === 'netease') musicUrl = `https://music.163.com/#/${music.type || 'song'}?id=${encodeURIComponent(music.id || '')}`;
  if (music.server === 'tencent') musicUrl = `https://y.qq.com/n/ryqq/${music.type === 'playlist' ? 'playlist' : 'songDetail'}/${encodeURIComponent(music.id || '')}`;
  if (musicUrl) blocks.push(`<p><a href="${escapeHtml(musicUrl)}">在线音乐</a></p>`);
  if (ext.video?.value) { const value = ext.video.value.startsWith('/') ? host + ext.video.value : ext.video.value; blocks.push(`<p><a href="${escapeHtml(value)}">${escapeHtml(ext.video.type === 'bilibili' ? 'Bilibili 视频' : ext.video.type === 'youtube' ? 'YouTube 视频' : '在线视频')}</a></p>`); }
  for (const card of [ext.doubanBook, ext.doubanMovie]) if (card?.url) blocks.push(`<p><a href="${escapeHtml(card.url)}">${escapeHtml(card.title || '豆瓣条目')}</a></p>`);
  return blocks.join('');
}

export { BACKUP_PREFIX, BACKUP_RETENTION_DAYS, MAX_DIRECT_UPLOAD_BYTES, escapeHtml };
