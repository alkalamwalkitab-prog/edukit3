// EduKit — منطق الخادم (مصادقة لوحة التحكم + حفظ المحتوى والنتائج)
// معزول عن Netlify ليمكن اختباره بمخزن في الذاكرة.
// RACHID EL MOURABIT | المحفظة التربوية - EduKit
import crypto from 'node:crypto';
import Engine from '../../../public/js/engine.js';

const TOKEN_TTL_MS = 8 * 3600 * 1000;
const MAX_QUESTIONS = 2000;
const MIN_PASSWORD_LEN = 10;
const ID_RE = /^[A-Za-z0-9_-]{2,48}$/;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const str = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);

export const EMPTY_CONTENT = { domains: [], questions: [], overrides: {}, hidden: [], tests: [] };

/* ---------- تنقية المحتوى القادم من لوحة التحكم ---------- */
function cleanQuestion(q) {
  const o = {
    id: str(q.id, 48), domain: str(q.domain, 48), topic: str(q.topic, 120), level: q.level, type: q.type,
    text: str(q.text, 2000), explanation: str(q.explanation, 3000), source: str(q.source, 500),
    origin: q.origin === 'official' ? 'official' : 'training'
  };
  if (q.type === 'match') o.pairs = (Array.isArray(q.pairs) ? q.pairs : []).slice(0, 6).map((p) => ({ term: str(p && p.term, 300), def: str(p && p.def, 500) }));
  else { o.choices = (Array.isArray(q.choices) ? q.choices : []).slice(0, 4).map((c) => str(c, 500)); o.answer = q.answer; }
  return o;
}
function checkQuestion(q, errors, label) {
  if (!ID_RE.test(q.id)) errors.push(`${label}: معرّف غير صالح`);
  const e = Engine.validateQuestion(q);
  e.forEach((m) => errors.push(`${label}: ${m}`));
  if (q.origin === 'official' && !q.source) errors.push(`${label}: السؤال الرسمي يتطلب ذكر المصدر`);
}
export function sanitizeContent(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['محتوى غير صالح'] };
  const out = { domains: [], questions: [], overrides: {}, hidden: [], tests: [] };

  (Array.isArray(input.domains) ? input.domains : []).slice(0, 40).forEach((d, i) => {
    if (!d || !/^[a-z0-9-]{2,40}$/.test(String(d.id || ''))) { errors.push(`مجال ${i + 1}: معرّف غير صالح (حروف لاتينية صغيرة وأرقام وشرطة)`); return; }
    if (!str(d.name, 120)) { errors.push(`مجال ${d.id}: الاسم مفقود`); return; }
    const minutes = Number.isInteger(d.minutes) && d.minutes >= 5 && d.minutes <= 180 ? d.minutes : 25;
    out.domains.push({
      id: d.id, name: str(d.name, 120), nameFr: str(d.nameFr, 120), icon: str(d.icon, 4) || '📘',
      target: str(d.target, 160) || 'جميع الأسلاك', targetFr: str(d.targetFr, 160), minutes,
      topics: (Array.isArray(d.topics) ? d.topics : []).slice(0, 40).map((x) => str(x, 100)).filter(Boolean)
    });
  });
  const ids = new Set();
  (Array.isArray(input.questions) ? input.questions : []).slice(0, MAX_QUESTIONS).forEach((q, i) => {
    const c = cleanQuestion(q || {}); checkQuestion(c, errors, `سؤال ${i + 1}`);
    if (ids.has(c.id)) errors.push(`سؤال ${i + 1}: المعرّف مكرر`); ids.add(c.id); out.questions.push(c);
  });
  const ov = input.overrides && typeof input.overrides === 'object' ? input.overrides : {};
  Object.keys(ov).slice(0, MAX_QUESTIONS).forEach((k) => {
    const c = cleanQuestion(Object.assign({}, ov[k], { id: k })); checkQuestion(c, errors, `تعديل ${k}`); out.overrides[k] = c;
  });
  out.hidden = (Array.isArray(input.hidden) ? input.hidden : []).slice(0, 5000).map((x) => str(x, 48)).filter(Boolean);
  (Array.isArray(input.tests) ? input.tests : []).slice(0, 200).forEach((t, i) => {
    const label = `اختبار ${i + 1}`;
    if (!t || !ID_RE.test(String(t.id || ''))) { errors.push(`${label}: معرّف غير صالح`); return; }
    if (!Array.isArray(t.ids) || t.ids.length !== Engine.TOTAL || new Set(t.ids).size !== Engine.TOTAL) { errors.push(`${label}: يجب اختيار ${Engine.TOTAL} سؤالاً مختلفاً بالضبط`); return; }
    if (!str(t.title, 160)) { errors.push(`${label}: العنوان مفقود`); return; }
    out.tests.push({ id: t.id, domain: str(t.domain, 48), title: str(t.title, 160), titleFr: str(t.titleFr, 160), level: str(t.level, 80) || 'متدرج', minutes: Number.isInteger(t.minutes) && t.minutes >= 5 && t.minutes <= 180 ? t.minutes : 25, ids: t.ids.map((x) => str(x, 48)) });
  });
  return errors.length ? { ok: false, errors: errors.slice(0, 25) } : { ok: true, content: out };
}

/* ---------- تحقق من نتيجة مترشح ---------- */
export function sanitizeResult(b, now) {
  if (!b || typeof b !== 'object') return null;
  const total = Engine.TOTAL;
  if (!Number.isInteger(b.score) || b.score < 0 || b.score > total || b.total !== total) return null;
  if (!['training', 'exam', 'full'].includes(b.mode)) return null;
  const dom = str(b.domainId, 60); if (!/^[A-Za-z0-9_-]{1,60}$/.test(dom)) return null;
  const agg = (arr) => (Array.isArray(arr) ? arr : []).slice(0, 40).filter((x) => x && Number.isInteger(x.c) && Number.isInteger(x.t) && x.t >= 1 && x.t <= total && x.c >= 0 && x.c <= x.t).map((x) => ({ k: str(x.k, 80), c: x.c, t: x.t }));
  return {
    ts: now, domainId: dom, testId: b.testId ? str(b.testId, 60) : null, mode: b.mode, score: b.score, total,
    durationSec: Number.isInteger(b.durationSec) && b.durationSec >= 0 && b.durationSec <= 86400 ? b.durationSec : 0,
    byTopic: agg(b.byTopic), byDomain: agg(b.byDomain)
  };
}

/* ---------- النواة ---------- */
export function makeCore({ store, env, now = () => Date.now() }) {
  const key = sha('edukit-v1|' + (env.ADMIN_SECRET || env.ADMIN_PASSWORD || ''));
  const fails = new Map();   // محاولات الدخول الفاشلة (على مستوى النسخة الحالية من الدالة)
  const hits = new Map();    // تحديد معدل إرسال النتائج

  const sign = (payload) => { const p = b64u(JSON.stringify(payload)); return p + '.' + b64u(crypto.createHmac('sha256', key).update(p).digest()); };
  const verify = (tok) => {
    if (typeof tok !== 'string') return null;
    const [p, s] = tok.split('.'); if (!p || !s) return null;
    const exp = crypto.createHmac('sha256', key).update(p).digest();
    let got; try { got = Buffer.from(s, 'base64url'); } catch { return null; }
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return null;
    try { const pay = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return pay.exp > now() ? pay : null; } catch { return null; }
  };
  const authed = (headers) => {
    const h = headers.authorization || headers.Authorization || '';
    return verify(h.startsWith('Bearer ') ? h.slice(7) : '');
  };
  const J = (status, json) => ({ status, json });

  async function handle({ method, path, headers = {}, body = null, ip = 'unknown' }) {
    const p = path.replace(/\/+$/, '') || '/';
    const t = now();

    if (method === 'GET' && p === '/api/questions') {
      const content = (await store.get('content')) || EMPTY_CONTENT;
      return J(200, { online: true, content });
    }

    if (method === 'POST' && p === '/api/results') {
      const h = (hits.get(ip) || []).filter((x) => t - x < 3600000);
      if (h.length >= 60) return J(429, { error: 'rate_limited' });
      const r = sanitizeResult(body, t); if (!r) return J(400, { error: 'invalid_result' });
      h.push(t); hits.set(ip, h);
      await store.set(`results/${String(t).padStart(13, '0')}-${crypto.randomBytes(3).toString('hex')}`, r);
      return J(201, { ok: true });
    }

    if (method === 'POST' && p === '/api/login') {
      const pw = env.ADMIN_PASSWORD;
      if (!pw || pw.length < MIN_PASSWORD_LEN) return J(503, { error: 'not_configured', message: `عرّف متغير البيئة ADMIN_PASSWORD (على الأقل ${MIN_PASSWORD_LEN} أحرف) في إعدادات الاستضافة.` });
      const f = fails.get(ip) || { n: 0, until: 0 };
      if (f.until > t) return J(429, { error: 'locked', retryAfterSec: Math.ceil((f.until - t) / 1000) });
      const given = body && typeof body.password === 'string' ? body.password.slice(0, 200) : '';
      const ok = crypto.timingSafeEqual(sha(given), sha(pw));
      if (!ok) { f.n += 1; if (f.n >= 5) { f.until = t + 15 * 60000; f.n = 0; } fails.set(ip, f); return J(401, { error: 'bad_credentials' }); }
      fails.delete(ip);
      const exp = t + TOKEN_TTL_MS;
      return J(200, { token: sign({ sub: 'RACHID EL MOURABIT', exp }), exp, name: 'RACHID EL MOURABIT' });
    }

    if (p.startsWith('/api/admin/')) {
      if (!env.ADMIN_PASSWORD) return J(503, { error: 'not_configured' });
      if (!authed(headers)) return J(401, { error: 'unauthorized' });

      if (method === 'GET' && p === '/api/admin/check') return J(200, { ok: true, name: 'RACHID EL MOURABIT' });
      if (method === 'GET' && p === '/api/admin/content') return J(200, { content: (await store.get('content')) || EMPTY_CONTENT });
      if (method === 'PUT' && p === '/api/admin/content') {
        const r = sanitizeContent(body && body.content);
        if (!r.ok) return J(400, { error: 'invalid_content', errors: r.errors });
        await store.set('content', r.content);
        return J(200, { ok: true, counts: { domains: r.content.domains.length, questions: r.content.questions.length, tests: r.content.tests.length } });
      }
      if (method === 'GET' && p === '/api/admin/stats') {
        const keys = (await store.list('results/')).sort().reverse().slice(0, 2000);
        const rows = [];
        for (let i = 0; i < keys.length; i += 25) {
          const part = await Promise.all(keys.slice(i, i + 25).map((k) => store.get(k)));
          part.forEach((r) => { if (r) rows.push(r); });
        }
        const byDomain = {}, byMode = {}, topics = {};
        let sum = 0;
        rows.forEach((r) => {
          sum += r.score;
          (byDomain[r.domainId] = byDomain[r.domainId] || { n: 0, sum: 0 }).n++; byDomain[r.domainId].sum += r.score;
          byMode[r.mode] = (byMode[r.mode] || 0) + 1;
          (r.byTopic || []).forEach((x) => { const o = (topics[x.k] = topics[x.k] || { k: x.k, c: 0, t: 0 }); o.c += x.c; o.t += x.t; });
        });
        return J(200, {
          count: rows.length, truncated: keys.length >= 2000,
          avgPercent: rows.length ? Math.round(sum * 1000 / (rows.length * Engine.TOTAL)) / 10 : null,
          byDomain: Object.keys(byDomain).map((k) => ({ domainId: k, n: byDomain[k].n, avgPercent: Math.round(byDomain[k].sum * 1000 / (byDomain[k].n * Engine.TOTAL)) / 10 })),
          byMode, topics: Object.values(topics).sort((a, b) => a.c / a.t - b.c / b.t).slice(0, 40),
          rows: rows.map((r) => ({ ts: r.ts, domainId: r.domainId, testId: r.testId, mode: r.mode, score: r.score, total: r.total, durationSec: r.durationSec }))
        });
      }
      if (method === 'POST' && p === '/api/admin/results/clear') {
        const keys = await store.list('results/');
        for (const k of keys) await store.delete(k);
        return J(200, { ok: true, deleted: keys.length });
      }
    }
    return J(404, { error: 'not_found' });
  }
  return { handle, sign, verify };
}
