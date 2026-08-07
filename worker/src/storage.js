/**
 * Pluggable media/backup storage backends: R2 (binding), generic S3-compatible,
 * and WebDAV. All backends expose { put, get, head, delete, list }.
 * R2 backends additionally expose presignPut; S3 backends expose presignPut too.
 */
const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256(value) {
  return crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value);
}
async function hmac(key, value) {
  const material = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', material, typeof value === 'string' ? encoder.encode(value) : value);
}
function awsEncode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }
function queryEncode(value) { return encodeURIComponent(value).replace(/%2F/gi, '/'); }

/** Sign one S3-compatible request and execute it. */
export async function s3Request({ endpoint, region, bucket, accessKeyId, secretAccessKey, method, key, query = '', headers = {}, body = null, now = new Date() }) {
  const host = String(endpoint).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const date = now.toISOString().replace(/[:-]|\\.\\d{3}/g, '');
  const shortDate = date.slice(0, 8);
  const scope = `${shortDate}/${region || 'auto'}/s3/aws4_request`;
  const canonicalUri = key ? `/${bucket}/${key.split('/').map(awsEncode).join('/')}` : `/${bucket}`;
  const sortedQuery = query
    ? [...new URLSearchParams(query).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`).join('&')
    : '';
  const contentType = headers['content-type'] || '';
  const payloadHash = body === null ? 'UNSIGNED-PAYLOAD' : bytesToHex(await sha256(body));
  const signedHeaders = ['host', ...(contentType ? ['content-type'] : []), ...(headers['x-amz-content-sha256'] ? ['x-amz-content-sha256'] : [])];
  const canonicalHeaders = `host:${host}\n${contentType ? `content-type:${contentType}\n` : ''}${headers['x-amz-content-sha256'] ? `x-amz-content-sha256:${headers['x-amz-content-sha256']}\n` : ''}`;
  const canonicalRequest = `${method}\n${canonicalUri}\n${sortedQuery}\n${canonicalHeaders}\n${signedHeaders.join(';')}\n${payloadHash}`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${bytesToHex(await sha256(canonicalRequest))}`;
  const kDate = await hmac(`AWS4${secretAccessKey}`, shortDate);
  const kRegion = await hmac(kDate, region || 'auto');
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = bytesToHex(await hmac(kSigning, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`;
  const url = `${String(endpoint).replace(/\/+$/, '')}${canonicalUri}${sortedQuery ? `?${sortedQuery}` : ''}`;
  const requestHeaders = { authorization, host, ...headers };
  if (contentType) requestHeaders['content-type'] = contentType;
  if (payloadHash !== 'UNSIGNED-PAYLOAD') requestHeaders['x-amz-content-sha256'] = payloadHash;
  return fetch(url, { method, headers: requestHeaders, body });
}

export function r2Backend(env) {
  if (!env.MEDIA) throw new Error('R2 binding is not configured');
  return {
    name: 'r2',
    async put(key, body, metadata = {}) { await env.MEDIA.put(key, body, metadata); return { key }; },
    async get(key, options) { return env.MEDIA.get(key, options); },
    async head(key) { return env.MEDIA.head(key); },
    async delete(key) { await env.MEDIA.delete(key); },
    async list(prefix) { const listed = await env.MEDIA.list({ prefix, limit: 1000 }); return (listed.objects || []); },
    async presignPut({ key, contentType, expires = 900, now = new Date() }) {
      const { createR2PresignedPut } = await import('./phase7.js');
      return createR2PresignedPut({ accountId: env.CLOUDFLARE_ACCOUNT_ID, bucket: env.R2_BUCKET_NAME || 'moments-media', key, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, contentType, expires, now });
    },
  };
}

export function s3Backend(config) {
  const { endpoint, region = 'auto', bucket, accessKeyId, secretAccessKey } = config || {};
  const requireConfig = () => { if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('S3 存储凭据未配置'); };
  return {
    name: 's3',
    async put(key, body, metadata = {}) {
      requireConfig();
      const response = await s3Request({ endpoint, region, bucket, accessKeyId, secretAccessKey, method: 'PUT', key, headers: { 'content-type': metadata.httpMetadata?.contentType || 'application/octet-stream' }, body: typeof body === 'string' ? encoder.encode(body) : body });
      if (!response.ok) throw new Error(`S3 上传失败（${response.status}）`);
      return { key };
    },
    async get(key, options = {}) {
      requireConfig();
      const headers = {};
      if (options.range) headers.range = `bytes=${options.range.offset}-${options.range.offset + options.range.length - 1}`;
      const response = await s3Request({ endpoint, region, bucket, accessKeyId, secretAccessKey, method: 'GET', key, headers });
      if (!response.ok) return null;
      return { body: response.body, size: Number(response.headers.get('content-length') || 0), httpEtag: response.headers.get('etag'), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' }, writeHttpMetadata: () => {} };
    },
    async head(key) {
      requireConfig();
      const response = await s3Request({ endpoint, region, bucket, accessKeyId, secretAccessKey, method: 'HEAD', key });
      if (!response.ok) return null;
      return { size: Number(response.headers.get('content-length') || 0), httpEtag: response.headers.get('etag'), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' }, writeHttpMetadata: () => {} };
    },
    async delete(key) {
      requireConfig();
      const response = await s3Request({ endpoint, region, bucket, accessKeyId, secretAccessKey, method: 'DELETE', key });
      if (!response.ok && response.status !== 404) throw new Error(`S3 删除失败（${response.status}）`);
    },
    async list(prefix) {
      requireConfig();
      const response = await s3Request({ endpoint, region, bucket, accessKeyId, secretAccessKey, method: 'GET', query: `list-type=2&prefix=${encodeURIComponent(prefix || '')}` });
      if (!response.ok) throw new Error(`S3 列表失败（${response.status}）`);
      const xml = await response.text();
      const objects = [];
      for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>\s*<Size>(\d+)<\/Size>[\s\S]*?<LastModified>([^<]*)<\/LastModified>/g)) {
        objects.push({ key: match[1], size: Number(match[2]), uploaded: new Date(match[3]) });
      }
      return objects;
    },
    async presignPut({ key, contentType, expires = 900, now = new Date() }) {
      requireConfig();
      const host = String(endpoint).replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const date = now.toISOString().replace(/[:-]|\\.\\d{3}/g, '');
      const shortDate = date.slice(0, 8);
      const scope = `${shortDate}/${region || 'auto'}/s3/aws4_request`;
      const params = new URLSearchParams({
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${accessKeyId}/${scope}`,
        'X-Amz-Date': date, 'X-Amz-Expires': String(Math.min(3600, Math.max(60, expires))),
        'X-Amz-SignedHeaders': 'content-type;host',
      });
      const canonicalQuery = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${awsEncode(k)}=${queryEncode(v)}`).join('&');
      const canonicalUri = `/${bucket}/${key.split('/').map(awsEncode).join('/')}`;
      const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuery}\ncontent-type:${contentType}\nhost:${host}\n\ncontent-type;host\nUNSIGNED-PAYLOAD`;
      const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${bytesToHex(await sha256(canonicalRequest))}`;
      const kDate = await hmac(`AWS4${secretAccessKey}`, shortDate);
      const kRegion = await hmac(kDate, region || 'auto');
      const kService = await hmac(kRegion, 's3');
      const kSigning = await hmac(kService, 'aws4_request');
      const signature = bytesToHex(await hmac(kSigning, stringToSign));
      return `${String(endpoint).replace(/\/+$/, '')}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
    },
  };
}

function basicAuth(username, password) {
  const value = `${username}:${password}`;
  let binary = ''; for (const byte of encoder.encode(value)) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

export function webdavBackend(config) {
  const { url, username, password } = config || {};
  const requireConfig = () => { if (!url) throw new Error('WebDAV 存储凭据未配置'); };
  const base = () => String(url).replace(/\/+$/, '');
  const headers = () => ({ authorization: basicAuth(username || '', password || ''), ...(username ? {} : {}) });
  return {
    name: 'webdav',
    async put(key, body, metadata = {}) {
      requireConfig();
      const response = await fetch(`${base()}/${key}`, { method: 'PUT', headers: { ...headers(), 'content-type': metadata.httpMetadata?.contentType || 'application/octet-stream' }, body });
      if (!response.ok && response.status !== 201 && response.status !== 204) throw new Error(`WebDAV 上传失败（${response.status}）`);
      return { key };
    },
    async get(key, options = {}) {
      requireConfig();
      const rangeHeaders = options.range ? { range: `bytes=${options.range.offset}-${options.range.offset + options.range.length - 1}` } : {};
      const response = await fetch(`${base()}/${key}`, { method: 'GET', headers: { ...headers(), ...rangeHeaders } });
      if (!response.ok) return null;
      return { body: response.body, size: Number(response.headers.get('content-length') || 0), httpEtag: response.headers.get('etag'), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' }, writeHttpMetadata: () => {} };
    },
    async head(key) {
      requireConfig();
      const response = await fetch(`${base()}/${key}`, { method: 'HEAD', headers });
      if (!response.ok) return null;
      return { size: Number(response.headers.get('content-length') || 0), httpEtag: response.headers.get('etag'), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' }, writeHttpMetadata: () => {} };
    },
    async delete(key) {
      requireConfig();
      const response = await fetch(`${base()}/${key}`, { method: 'DELETE', headers });
      if (!response.ok && response.status !== 404) throw new Error(`WebDAV 删除失败（${response.status}）`);
    },
    async list(prefix) {
      requireConfig();
      const response = await fetch(`${base()}/${prefix || ''}`, { method: 'PROPFIND', headers: { ...headers(), depth: '1', 'content-type': 'application/xml' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>' });
      if (!response.ok) throw new Error(`WebDAV 列表失败（${response.status}）`);
      const xml = await response.text();
      const objects = [];
      for (const match of xml.matchAll(/<D:(?:href|getcontentlength|getlastmodified)>([^<]*)<\/D:\1>/g)) { /* placeholder */ }
      for (const hrefMatch of xml.matchAll(/<D:href>([^<]*)<\/D:href>[\s\S]*?<D:getcontentlength>(\d*)<\/D:getcontentlength>[\s\S]*?<D:getlastmodified>([^<]*)<\/D:getlastmodified>/g)) {
        const name = decodeURIComponent(hrefMatch[1].split('/').pop() || '');
        if (!name) continue;
        objects.push({ key: name, size: Number(hrefMatch[2] || 0), uploaded: new Date(hrefMatch[3]) });
      }
      return objects;
    },
  };
}

/** Resolve the active storage backend by type. */
export function storageBackend(env, config, type = 'r2') {
  if (type === 's3') return s3Backend(config?.s3Storage);
  if (type === 'webdav') return webdavBackend(config?.webdavStorage);
  return r2Backend(env);
}
