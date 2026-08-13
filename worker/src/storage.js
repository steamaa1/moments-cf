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
  const bodyIsStream = body !== null && typeof body?.getReader === 'function';
  const payloadHash = body === null || bodyIsStream ? 'UNSIGNED-PAYLOAD' : bytesToHex(await sha256(body));
  const amzPayload = bodyIsStream ? 'UNSIGNED-PAYLOAD' : (headers['x-amz-content-sha256'] || null);
  const signedHeaders = ['host', ...(contentType ? ['content-type'] : []), ...(amzPayload ? ['x-amz-content-sha256'] : [])];
  const canonicalHeaders = `host:${host}\n${contentType ? `content-type:${contentType}\n` : ''}${amzPayload ? `x-amz-content-sha256:${amzPayload}\n` : ''}`;
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
  if (bodyIsStream) requestHeaders['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';
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
      return { body: response.body, size: Number(response.headers.get('content-length') || 0), httpEtag: response.headers.get('etag'), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' }, writeHttpMetadata: (headers) => { headers.set('content-type', response.headers.get('content-type') || 'application/octet-stream'); } };
    },
    async head(key) {
      requireConfig();
      const response = await s3Request({ endpoint, region, bucket, accessKeyId, secretAccessKey, method: 'HEAD', key });
      if (!response.ok) return null;
      return { size: Number(response.headers.get('content-length') || 0), httpEtag: response.headers.get('etag'), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' }, writeHttpMetadata: (headers) => { headers.set('content-type', response.headers.get('content-type') || 'application/octet-stream'); } };
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
      const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map(match => match[1]);
      const sizes = [...xml.matchAll(/<Size>(\d+)<\/Size>/g)].map(match => Number(match[1]));
      const dates = [...xml.matchAll(/<LastModified>([^<]*)<\/LastModified>/g)].map(match => match[1]);
      for (let index = 0; index < keys.length; index += 1) {
        objects.push({ key: keys[index], size: sizes[index] || 0, uploaded: new Date(dates[index] || 0) });
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
  const objectUrl = (key) => `${base()}/${String(key).split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
  const ensureParentCollections = async (key) => {
    const parts = String(key).split('/').filter(Boolean).slice(0, -1);
    let path = '';
    for (const part of parts) {
      path += `${path ? '/' : ''}${encodeURIComponent(part)}`;
      const response = await fetch(`${base()}/${path}`, { method: 'MKCOL', headers: headers() });
      if (![200, 201, 204, 405].includes(response.status)) throw new Error(`WebDAV 创建目录失败（${response.status}）`);
    }
  };
  return {
    name: 'webdav',
    async put(key, body, metadata = {}) {
      requireConfig();
      await ensureParentCollections(key);
      const response = await fetch(objectUrl(key), { method: 'PUT', headers: { ...headers(), 'content-type': metadata.httpMetadata?.contentType || 'application/octet-stream' }, body });
      if (!response.ok && response.status !== 201 && response.status !== 204) throw new Error(`WebDAV 上传失败（${response.status}）`);
      return { key };
    },
    async get(key, options = {}) {
      requireConfig();
      const rangeHeaders = options.range ? { range: `bytes=${options.range.offset}-${options.range.offset + options.range.length - 1}` } : {};
      const response = await fetch(`${base()}/${key}`, { method: 'GET', headers: { ...headers(), ...rangeHeaders } });
      if (!response.ok) return null;
      return { body: response.body, size: Number(response.headers.get('content-length') || 0), httpEtag: response.headers.get('etag'), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' }, writeHttpMetadata: (headers) => { headers.set('content-type', response.headers.get('content-type') || 'application/octet-stream'); } };
    },
    async head(key) {
      requireConfig();
      const response = await fetch(`${base()}/${key}`, { method: 'HEAD', headers: headers() });
      if (!response.ok) return null;
      return { size: Number(response.headers.get('content-length') || 0), httpEtag: response.headers.get('etag'), httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' }, writeHttpMetadata: (headers) => { headers.set('content-type', response.headers.get('content-type') || 'application/octet-stream'); } };
    },
    async delete(key) {
      requireConfig();
      const response = await fetch(`${base()}/${key}`, { method: 'DELETE', headers: headers() });
      if (!response.ok && response.status !== 404) throw new Error(`WebDAV 删除失败（${response.status}）`);
    },
    async list(prefix) {
      requireConfig();
      const response = await fetch(`${base()}/${prefix || ''}`, { method: 'PROPFIND', headers: { ...headers(), depth: '1', 'content-type': 'application/xml' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>' });
      if (!response.ok) throw new Error(`WebDAV 列表失败（${response.status}）`);
      const xml = await response.text();
      const objects = [];
      const baseUrl = base();
      const tagValue = (source, name) => source.match(new RegExp(`<(?:[\\w.-]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, 'i'))?.[1] || '';
      const decodeXml = (value) => String(value || '').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
      for (const match of xml.matchAll(/<(?:[\w.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?response>/gi)) {
        const href = decodeXml(tagValue(match[1], 'href'));
        const size = tagValue(match[1], 'getcontentlength');
        const modified = decodeXml(tagValue(match[1], 'getlastmodified'));
        if (!href || !size || !modified) continue;
        let decoded = href;
        try { decoded = decodeURIComponent(href); } catch {}
        const key = decoded.startsWith(baseUrl) ? decoded.slice(baseUrl.length).replace(/^\//, '') : decoded.split('/').filter(Boolean).pop() || '';
        if (!key) continue;
        objects.push({ key, size: Number(size || 0), uploaded: new Date(modified) });
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
