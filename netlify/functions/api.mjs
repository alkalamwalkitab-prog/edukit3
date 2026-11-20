// EduKit — دالة Netlify الوحيدة (/api/*): تغلّف نواة الخادم بمخزن Netlify Blobs.
// RACHID EL MOURABIT | المحفظة التربوية - EduKit
import { getStore } from '@netlify/blobs';
import { makeCore } from './lib/core.mjs';

const MAX_BODY = 1_500_000; // ~1.5MB

function blobStore() {
  const s = getStore('edukit');
  return {
    get: (k) => s.get(k, { type: 'json' }),
    set: (k, v) => s.setJSON(k, v),
    delete: (k) => s.delete(k),
    list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key)
  };
}

const reply = (status, json) =>
  new Response(JSON.stringify(json), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

export default async (req, context) => {
  try {
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const text = await req.text();
      if (text.length > MAX_BODY) return reply(413, { error: 'too_large' });
      if (text) { try { body = JSON.parse(text); } catch { return reply(400, { error: 'bad_json' }); } }
    }
    const core = makeCore({ store: blobStore(), env: process.env });
    const out = await core.handle({
      method: req.method,
      path: new URL(req.url).pathname,
      headers: Object.fromEntries(req.headers),
      body,
      ip: (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || 'unknown'
    });
    return reply(out.status, out.json);
  } catch (e) {
    console.error('edukit api error', e && e.message);
    return reply(500, { error: 'server_error' });
  }
};

export const config = { path: '/api/*' };
