/**
 * Moments Cloudflare Worker entrypoint.
 *
 * Phase 1 intentionally contains only the runtime shell and health endpoint.
 * Business APIs will be migrated incrementally in later phases.
 */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...extraHeaders,
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = env.CORS_ORIGIN || '';
  const allowOrigin = allowed === '*' || (origin && allowed.split(',').map(v => v.trim()).includes(origin))
    ? origin || '*'
    : allowed.split(',')[0]?.trim() || '*';

  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, x-api-token, authorization',
    'access-control-allow-methods': 'GET,HEAD,POST,PUT,DELETE,OPTIONS',
    'vary': 'Origin',
  };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const headers = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (url.pathname === '/api/health') {
    return json({
      ok: true,
      service: 'moments-cf',
      phase: 1,
      database: Boolean(env.DB),
      media: Boolean(env.MEDIA),
    }, 200, headers);
  }

  return json({
    code: 404,
    message: 'Cloudflare API migration endpoint not implemented yet',
  }, 404, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    if (url.pathname.startsWith('/upload/')) {
      if (!env.MEDIA) return new Response('R2 binding is not configured', { status: 503 });
      const key = url.pathname.slice('/upload/'.length);
      const object = await env.MEDIA.get(key);
      if (!object) return new Response('Not Found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      return new Response(object.body, { headers });
    }

    if (url.pathname === '/rss') {
      return new Response('RSS migration is not implemented yet', {
        status: 501,
        headers: { 'content-type': 'text/plain; charset=UTF-8' },
      });
    }

    if (!env.ASSETS) {
      return new Response('Workers Assets binding is not configured', { status: 503 });
    }

    return env.ASSETS.fetch(request);
  },
};
