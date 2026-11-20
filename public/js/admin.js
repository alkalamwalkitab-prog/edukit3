/* EduKit — لوحة تحكم الأستاذ (واجهة). كلمة المرور لا توجد هنا: تُتحقق على الخادم فقط.
   RACHID EL MOURABIT | المحفظة التربوية - EduKit */
(function () {
  'use strict';
  var E = window.EduEngine, B = window.EDUKIT_BANK;
  var root = document.getElementById('admin');
  var TYPE_AR = { mcq: 'اختيار من متعدد', tf: 'صح أو خطأ', situation: 'وضعية مهنية', fill: 'إكمال فراغ', match: 'مطابقة', applied: 'سؤال تطبيقي' };
  var LVL_AR = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  var S = { token: null, content: null, tab: 'questions', editing: null, msg: null, errs: null, filter: { domain: '', type: '', q: '', hidden: false }, stats: null, testDraft: null, serverOk: null, loginErr: '' };

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }

  function api(method, path, body) {
    var h = { 'content-type': 'application/json' }; if (S.token) h.authorization = 'Bearer ' + S.token;
    return fetch(path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401 && S.token) { logout(); } return { status: r.status, json: j }; });
    });
  }
  function logout() { S.token = null; ss('edukit.admin', null); render(); }

  /* ---------- بيانات مدمجة ---------- */
  function allDomains() { return B.domains.concat(S.content.domains); }
  function domName(id) { var d = allDomains().filter(function (x) { return x.id === id; })[0]; return d ? d.name : id; }
  function allQ() {
    var hidden = {}; S.content.hidden.forEach(function (i) { hidden[i] = 1; });
    var out = [];
    B.questions.forEach(function (q) { var ov = S.content.overrides[q.id]; out.push({ q: ov ? Object.assign({}, ov) : q, builtin: true, edited: !!ov, hidden: !!hidden[q.id] }); });
    S.content.questions.forEach(function (q) { out.push({ q: q, builtin: false, edited: false, hidden: !!hidden[q.id] }); });
    return out;
  }
  function findQ(id) { return allQ().filter(function (x) { return x.q.id === id; })[0]; }
  function save(okMsg) {
    S.errs = null; S.msg = null;
    return api('PUT', '/api/admin/content', { content: S.content }).then(function (r) {
      if (r.status === 200) { S.msg = okMsg || 'تم الحفظ على الخادم.'; }
      else { S.errs = r.json.errors || [r.json.error || 'تعذر الحفظ']; }
      render(); return r.status === 200;
    });
  }

  /* ---------- الدخول ---------- */
  function viewLogin() {
    var msg = '';
    if (S.serverOk === false) msg = '<div class="errs">الخادم غير متاح: تتطلب لوحة التحكم نشر المشروع على Netlify مع الدوال الخادمية (راجع README). على الاستضافات الثابتة فقط (GitHub Pages أو Vercel بدون دوال) لا تعمل لوحة التحكم.</div>';
    if (S.loginErr) msg += '<div class="errs">' + esc(S.loginErr) + '</div>';
    return '<main class="wrap main"><div class="card login"><div style="text-align:center">' + logo() + '<h1>لوحة التحكم</h1><p class="muted">EduKit — المحفظة التربوية<br><b>RACHID EL MOURABIT</b></p></div>' + msg +
      '<form id="lf"><div class="fld"><label for="pw">كلمة المرور</label><input id="pw" type="password" autocomplete="current-password" required></div><p><button class="btn primary" type="submit">دخول</button> <a class="btn ghost" href="./">الموقع</a></p></form></div></main>';
  }
  function logo() { return '<svg width="56" height="56" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B2A5B"/><path d="M32 13 7 26l25 13 25-13z" fill="#C9A227"/><path d="M17 31v11c0 4 7.6 8 15 8s15-4 15-8V31L32 39z" fill="#fff"/></svg>'; }

  /* ---------- الهيكل ---------- */
  function viewShell(inner) {
    var tabs = [['questions', 'الأسئلة'], ['tests', 'الاختبارات'], ['domains', 'المجالات'], ['stats', 'الإحصائيات']].map(function (t) { return '<button data-act="tab" data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
    return '<header class="site-header"><div class="wrap header-in"><span class="brand">' + logo() + '<span class="brand-txt"><b>EduKit</b><small>لوحة التحكم</small><em>RACHID EL MOURABIT</em></span></span><nav class="nav"><a href="./">الموقع</a><button class="lang" data-act="logout">خروج</button></nav></div></header>' +
      '<main class="wrap main"><div class="tabs">' + tabs + '</div>' +
      (S.msg ? '<div class="okmsg">' + esc(S.msg) + '</div>' : '') + (S.errs ? '<div class="errs"><b>تعذر الحفظ:</b><ul>' + S.errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' : '') + inner + '</main>' +
      '<footer class="site-footer"><div class="wrap"><p>© جميع الحقوق محفوظة.<br><b>RACHID EL MOURABIT | المحفظة التربوية - EduKit</b></p></div></footer>';
  }

  /* ---------- تبويب الأسئلة ---------- */
  function viewQuestions() {
    if (S.editing) return viewQForm();
    var f = S.filter, rows = allQ().filter(function (x) {
      if (!f.hidden && x.hidden) return false;
      if (f.domain && x.q.domain !== f.domain) return false;
      if (f.type && x.q.type !== f.type) return false;
      if (f.q && (x.q.text + ' ' + x.q.topic + ' ' + x.q.id).indexOf(f.q) < 0) return false;
      return true;
    });
    var dopts = '<option value="">كل المجالات</option>' + allDomains().map(function (d) { return '<option value="' + esc(d.id) + '" ' + (f.domain === d.id ? 'selected' : '') + '>' + esc(d.name) + '</option>'; }).join('');
    var topts = '<option value="">كل الأنواع</option>' + Object.keys(TYPE_AR).map(function (k) { return '<option value="' + k + '" ' + (f.type === k ? 'selected' : '') + '>' + TYPE_AR[k] + '</option>'; }).join('');
    return '<div class="row between"><h2 style="margin:0">الأسئلة (' + rows.length + ')</h2><button class="btn gold" data-act="newq">+ إضافة سؤال</button></div>' +
      '<div class="filters"><select class="sel" data-f="domain">' + dopts + '</select><select class="sel" data-f="type">' + topts + '</select><input class="inp" style="direction:rtl;text-align:start" data-f="q" placeholder="بحث..." value="' + esc(f.q) + '"><label class="chk"><input type="checkbox" data-f="hidden" ' + (f.hidden ? 'checked' : '') + '> إظهار المحذوفة</label></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>المعرّف</th><th>المجال / الموضوع</th><th>النوع</th><th>الصعوبة</th><th>السؤال</th><th></th></tr></thead><tbody>' +
      rows.map(function (x) {
        var q = x.q;
        return '<tr class="' + (x.hidden ? 'off' : '') + '"><td>' + esc(q.id) + (x.builtin ? '<br><small class="muted">مدمج' + (x.edited ? ' · معدّل' : '') + '</small>' : '') + (q.origin === 'official' ? '<br><small>رسمي</small>' : '') + '</td><td>' + esc(domName(q.domain)) + '<br><small class="muted">' + esc(q.topic) + '</small></td><td>' + TYPE_AR[q.type] + '</td><td>' + LVL_AR[q.level] + '</td><td dir="auto">' + esc(q.text.slice(0, 110)) + '</td><td style="white-space:nowrap">' +
          (x.hidden ? '<button class="btn ghost sm" data-act="restore" data-id="' + esc(q.id) + '">استعادة</button>' : '<button class="btn ghost sm" data-act="editq" data-id="' + esc(q.id) + '">تعديل</button> <button class="btn ghost sm" data-act="delq" data-id="' + esc(q.id) + '">حذف</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function blankQ() { return { id: 'q-' + Date.now().toString(36), domain: allDomains()[0].id, topic: '', level: 'medium', type: 'mcq', text: '', choices: ['', '', '', ''], answer: 0, explanation: '', source: '', origin: 'training', _new: true }; }
  function viewQForm() {
    var q = S.editing, isM = q.type === 'match', isTf = q.type === 'tf';
    var dopts = allDomains().map(function (d) { return '<option value="' + esc(d.id) + '" ' + (q.domain === d.id ? 'selected' : '') + '>' + esc(d.name) + '</option>'; }).join('');
    var sel = function (map, cur, k) { return Object.keys(map).map(function (x) { return '<option value="' + x + '" ' + (cur === x ? 'selected' : '') + '>' + map[x] + '</option>'; }).join(''); };
    var body = '';
    if (isM) {
      var pairs = (q.pairs || []).slice(); while (pairs.length < 6) pairs.push({ term: '', def: '' });
      body = '<div class="fld full"><label>أزواج المطابقة (3 إلى 6؛ اترك الباقي فارغاً)</label>' + pairs.map(function (p, i) { return '<div class="prow"><input type="text" data-p="term" data-i="' + i + '" placeholder="المفهوم" value="' + esc(p.term) + '"><input type="text" data-p="def" data-i="' + i + '" placeholder="التعريف المطابق" value="' + esc(p.def) + '"></div>'; }).join('') + '</div>';
    } else {
      var ch = isTf ? ['صح', 'خطأ'] : (q.choices || ['', '', '', '']);
      body = '<div class="fld full"><label>' + (isTf ? 'الإجابة الصحيحة' : 'الاختيارات الأربعة (حدّد الصحيح)') + '</label>' + ch.map(function (c, i) {
        return '<div class="crow"><input type="radio" name="ans" data-ans="' + i + '" ' + (q.answer === i ? 'checked' : '') + '>' + (isTf ? '<span>' + esc(c) + '</span>' : '<input type="text" data-c="' + i + '" value="' + esc(c) + '" placeholder="الاختيار ' + (i + 1) + '">') + '</div>';
      }).join('') + '</div>';
    }
    return '<h2>' + (q._new ? 'سؤال جديد' : 'تعديل السؤال ' + esc(q.id)) + '</h2><form id="qf" class="card"><div class="fgrid">' +
      '<div class="fld"><label>المجال</label><select data-q="domain">' + dopts + '</select></div>' +
      '<div class="fld"><label>الموضوع</label><input type="text" data-q="topic" value="' + esc(q.topic) + '"></div>' +
      '<div class="fld"><label>مستوى الصعوبة</label><select data-q="level">' + sel(LVL_AR, q.level) + '</select></div>' +
      '<div class="fld"><label>نوع السؤال</label><select data-q="type" ' + (q._new ? '' : 'disabled') + '>' + sel(TYPE_AR, q.type) + '</select></div>' +
      '<div class="fld full"><label>نص السؤال' + (q.type === 'fill' ? ' (ضع ____ مكان الفراغ)' : '') + '</label><textarea data-q="text">' + esc(q.text) + '</textarea></div>' + body +
      '<div class="fld full"><label>التفسير العلمي</label><textarea data-q="explanation">' + esc(q.explanation) + '</textarea></div>' +
      '<div class="fld"><label>المصدر / المرجع</label><input type="text" data-q="source" value="' + esc(q.source) + '"></div>' +
      '<div class="fld"><label>أصل السؤال</label><select data-q="origin"><option value="training" ' + (q.origin !== 'official' ? 'selected' : '') + '>تدريبي من إعداد المنصة</option><option value="official" ' + (q.origin === 'official' ? 'selected' : '') + '>مأخوذ من مباراة رسمية (يتطلب مصدراً موثقاً)</option></select></div>' +
      '</div><p class="row"><button class="btn primary" type="submit">حفظ</button><button class="btn ghost" type="button" data-act="cancelq">إلغاء</button></p></form>';
  }
  function readQForm() {
    var q = S.editing;
    document.querySelectorAll('[data-q]').forEach(function (el) { q[el.getAttribute('data-q')] = el.value; });
    if (q.type === 'match') {
      var map = {}; document.querySelectorAll('[data-p]').forEach(function (el) { var i = el.getAttribute('data-i'); (map[i] = map[i] || {})[el.getAttribute('data-p')] = el.value.trim(); });
      q.pairs = Object.keys(map).map(function (i) { return map[i]; }).filter(function (p) { return p.term || p.def; });
      delete q.choices; delete q.answer;
    } else {
      if (q.type === 'tf') q.choices = ['صح', 'خطأ'];
      else { var ch = ['', '', '', '']; document.querySelectorAll('[data-c]').forEach(function (el) { ch[+el.getAttribute('data-c')] = el.value.trim(); }); q.choices = ch; }
      var r = document.querySelector('[data-ans]:checked'); q.answer = r ? +r.getAttribute('data-ans') : null;
      delete q.pairs;
    }
  }

  /* ---------- تبويب الاختبارات ---------- */
  function viewTests() {
    if (S.testDraft) return viewTestForm();
    var list = B.tests.map(function (t) { return { t: t, builtin: true }; }).concat(S.content.tests.map(function (t) { return { t: t, builtin: false }; }));
    return '<div class="row between"><h2 style="margin:0">الاختبارات الثابتة (' + list.length + ')</h2><button class="btn gold" data-act="newtest">+ إنشاء اختبار</button></div>' +
      '<p class="muted">كل اختبار يتكوّن من 15 سؤالاً بالضبط. إضافة إلى ذلك تولّد المنصة اختبارات متنوعة تلقائياً من بنك كل مجال.</p>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>العنوان</th><th>المجال</th><th>المعرّف</th><th></th></tr></thead><tbody>' + list.map(function (x) {
        return '<tr><td>' + esc(x.t.title) + '</td><td>' + esc(domName(x.t.domain)) + '</td><td>' + esc(x.t.id) + (x.builtin ? ' <small class="muted">(مدمج)</small>' : '') + '</td><td>' + (x.builtin ? '' : '<button class="btn ghost sm" data-act="deltest" data-id="' + esc(x.t.id) + '">حذف</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function viewTestForm() {
    var d = S.testDraft, dopts = allDomains().map(function (x) { return '<option value="' + esc(x.id) + '" ' + (d.domain === x.id ? 'selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    var pool = allQ().filter(function (x) { return !x.hidden && x.q.domain === d.domain; });
    return '<h2>اختبار جديد</h2><form id="tf" class="card"><div class="fgrid">' +
      '<div class="fld"><label>العنوان</label><input type="text" data-t="title" value="' + esc(d.title) + '"></div>' +
      '<div class="fld"><label>العنوان بالفرنسية (اختياري)</label><input type="text" data-t="titleFr" value="' + esc(d.titleFr) + '" dir="ltr"></div>' +
      '<div class="fld"><label>المجال</label><select data-t="domain">' + dopts + '</select></div>' +
      '<div class="fld"><label>المدة المقترحة (دقيقة)</label><input type="number" data-t="minutes" min="5" max="180" value="' + esc(d.minutes) + '"></div>' +
      '<div class="fld full"><label>اختر 15 سؤالاً (<span id="cnt">' + d.ids.length + '</span>/15)</label><div class="pick">' + (pool.length ? pool.map(function (x) {
        return '<label><input type="checkbox" data-pick="' + esc(x.q.id) + '" ' + (d.ids.indexOf(x.q.id) >= 0 ? 'checked' : '') + '><span dir="auto">[' + TYPE_AR[x.q.type] + ' · ' + LVL_AR[x.q.level] + '] ' + esc(x.q.text.slice(0, 90)) + '</span></label>';
      }).join('') : '<p class="muted">لا توجد أسئلة في هذا المجال.</p>') + '</div></div></div>' +
      '<p class="row"><button class="btn primary" type="submit">حفظ الاختبار</button><button class="btn ghost" type="button" data-act="canceltest">إلغاء</button></p></form>';
  }

  /* ---------- تبويب المجالات ---------- */
  function viewDomains() {
    var custom = S.content.domains;
    return '<h2>المجالات</h2><p class="muted">المجالات الخمسة الأساسية مدمجة. يمكنك إضافة مجالات جديدة، وتصبح جاهزة للاختبار عند بلوغها 15 سؤالاً.</p>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>المجال</th><th>المعرّف</th><th>الأسئلة</th><th></th></tr></thead><tbody>' + B.domains.concat(custom).map(function (d) {
        var n = allQ().filter(function (x) { return x.q.domain === d.id && !x.hidden; }).length, isC = custom.indexOf(d) >= 0;
        return '<tr><td>' + esc(d.icon || '') + ' ' + esc(d.name) + '</td><td>' + esc(d.id) + '</td><td>' + n + '/15</td><td>' + (isC ? '<button class="btn ghost sm" data-act="deldomain" data-id="' + esc(d.id) + '">حذف</button>' : '<small class="muted">مدمج</small>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<h3 style="margin-top:20px">إضافة مجال جديد</h3><form id="df" class="card"><div class="fgrid">' +
      '<div class="fld"><label>المعرّف (لاتيني صغير، مثال: special-needs)</label><input type="text" id="d_id" dir="ltr" pattern="[a-z0-9-]{2,40}" required></div>' +
      '<div class="fld"><label>الاسم بالعربية</label><input type="text" id="d_name" required></div>' +
      '<div class="fld"><label>الاسم بالفرنسية (اختياري)</label><input type="text" id="d_fr" dir="ltr"></div>' +
      '<div class="fld"><label>رمز</label><input type="text" id="d_icon" maxlength="4" value="📘"></div>' +
      '<div class="fld"><label>المدة المقترحة (دقيقة)</label><input type="number" id="d_min" value="25" min="5" max="180"></div>' +
      '<div class="fld full"><label>المواضيع (موضوع في كل سطر)</label><textarea id="d_topics"></textarea></div></div><p><button class="btn primary" type="submit">إضافة المجال</button></p></form>';
  }

  /* ---------- تبويب الإحصائيات ---------- */
  function viewStats() {
    var s = S.stats;
    if (!s) return '<p>جارٍ التحميل…</p>';
    var byD = s.byDomain.map(function (x) { return '<tr><td>' + esc(domName(x.domainId)) + '</td><td>' + x.n + '</td><td>' + x.avgPercent + '%</td></tr>'; }).join('');
    var tp = s.topics.map(function (x) { return '<tr><td dir="auto">' + esc(x.k) + '</td><td>' + x.c + '/' + x.t + '</td><td>' + Math.round(x.c * 100 / x.t) + '%</td></tr>'; }).join('');
    var rec = s.rows.slice(0, 30).map(function (r) { return '<tr><td>' + new Date(r.ts).toLocaleString('ar-MA') + '</td><td>' + esc(domName(r.domainId)) + '</td><td>' + esc(r.mode) + '</td><td>' + r.score + '/' + r.total + '</td></tr>'; }).join('');
    return '<h2>الإحصائيات</h2><p class="muted">نتائج مجهولة تُسجَّل عند تسليم الاختبار حين يكون الخادم متصلاً (لا تُجمع أي بيانات شخصية).</p>' +
      '<div class="kpis"><div class="stat"><b>' + s.count + '</b><span>محاولة مسجلة' + (s.truncated ? ' (آخر 2000)' : '') + '</span></div><div class="stat"><b>' + (s.avgPercent === null ? '—' : s.avgPercent + '%') + '</b><span>متوسط النسبة</span></div></div>' +
      '<p class="row"><button class="btn primary" data-act="csv" ' + (s.count ? '' : 'disabled') + '>تصدير CSV</button><button class="btn ghost" data-act="refreshstats">تحديث</button><button class="btn ghost" data-act="clearstats" ' + (s.count ? '' : 'disabled') + '>حذف كل النتائج</button></p>' +
      (s.count ? '<h3>حسب المجال</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>المجال</th><th>المحاولات</th><th>المتوسط</th></tr></thead><tbody>' + byD + '</tbody></table></div>' +
        '<h3>المواضيع الأضعف أداءً</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الموضوع</th><th>صحيح/إجمالي</th><th>النسبة</th></tr></thead><tbody>' + tp + '</tbody></table></div>' +
        '<h3>آخر المحاولات</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>المجال</th><th>النمط</th><th>النتيجة</th></tr></thead><tbody>' + rec + '</tbody></table></div>' : '<p>لا توجد نتائج مسجلة بعد.</p>');
  }
  function loadStats() { return api('GET', '/api/admin/stats').then(function (r) { S.stats = r.status === 200 ? r.json : { count: 0, byDomain: [], topics: [], rows: [] }; render(); }); }
  function csv() {
    var rows = [['date', 'domain', 'test', 'mode', 'score', 'total', 'percent', 'duration_sec']].concat(S.stats.rows.map(function (r) { return [new Date(r.ts).toISOString(), r.domainId, r.testId || '', r.mode, r.score, r.total, Math.round(r.score * 1000 / r.total) / 10, r.durationSec]; }));
    var txt = '﻿' + rows.map(function (r) { return r.map(function (c) { var s = String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = 'edukit-results.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- العرض ---------- */
  function render() {
    if (!S.token || !S.content) { root.innerHTML = viewLogin(); var pw = document.getElementById('pw'); if (pw) pw.focus(); return; }
    var inner = S.tab === 'questions' ? viewQuestions() : S.tab === 'tests' ? viewTests() : S.tab === 'domains' ? viewDomains() : viewStats();
    root.innerHTML = viewShell(inner);
  }
  function boot() {
    S.token = ss('edukit.admin');
    fetch('/api/questions').then(function (r) { return r.json(); }).then(function (j) { S.serverOk = !!(j && j.online); }, function () { S.serverOk = false; }).then(function () {
      if (S.token && S.serverOk) {
        api('GET', '/api/admin/content').then(function (r) { if (r.status === 200) { S.content = normalize(r.json.content); render(); } else { S.token = null; ss('edukit.admin', null); render(); } });
      } else render();
    });
  }
  function normalize(c) { c = c || {}; return { domains: c.domains || [], questions: c.questions || [], overrides: c.overrides || {}, hidden: c.hidden || [], tests: c.tests || [] }; }

  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var id = ev.target.id;
    if (id === 'lf') {
      var pw = document.getElementById('pw').value;
      api('POST', '/api/login', { password: pw }).then(function (r) {
        if (r.status === 200) {
          S.token = r.json.token; ss('edukit.admin', S.token); S.loginErr = '';
          return api('GET', '/api/admin/content').then(function (c) { S.content = normalize(c.json.content); render(); });
        }
        S.loginErr = r.status === 401 ? 'كلمة المرور غير صحيحة.' : r.status === 429 ? 'محاولات كثيرة. حاول لاحقاً.' : r.status === 503 ? (r.json.message || 'لم تُضبط كلمة مرور المسؤول على الخادم.') : 'تعذر الاتصال بالخادم.';
        render();
      });
    } else if (id === 'qf') {
      readQForm();
      var q = Object.assign({}, S.editing), isNew = q._new; delete q._new;
      if (q.type !== 'match') { q.text = q.text.trim(); }
      var errs = E.validateQuestion(q);
      if (q.origin === 'official' && !String(q.source || '').trim()) errs.push('السؤال الرسمي يتطلب مصدراً');
      if (errs.length) { S.errs = errs; S.msg = null; render(); window.scrollTo(0, 0); return; }
      var existing = findQ(q.id);
      if (isNew) S.content.questions.push(q);
      else if (existing && existing.builtin) S.content.overrides[q.id] = q;
      else S.content.questions = S.content.questions.map(function (x) { return x.id === q.id ? q : x; });
      S.editing = null; save('تم حفظ السؤال.');
    } else if (id === 'tf') {
      var d = S.testDraft;
      document.querySelectorAll('[data-t]').forEach(function (el) { d[el.getAttribute('data-t')] = el.type === 'number' ? parseInt(el.value, 10) : el.value; });
      if (!d.title.trim()) { S.errs = ['العنوان مطلوب']; render(); return; }
      if (d.ids.length !== 15) { S.errs = ['يجب اختيار 15 سؤالاً بالضبط (المحدد حالياً ' + d.ids.length + ')']; render(); return; }
      S.content.tests.push({ id: 't-' + Date.now().toString(36), domain: d.domain, title: d.title.trim(), titleFr: d.titleFr.trim(), level: 'متدرج', minutes: d.minutes || 25, ids: d.ids });
      S.testDraft = null; save('تم حفظ الاختبار.');
    } else if (id === 'df') {
      var nd = { id: document.getElementById('d_id').value.trim(), name: document.getElementById('d_name').value.trim(), nameFr: document.getElementById('d_fr').value.trim(), icon: document.getElementById('d_icon').value.trim() || '📘', minutes: parseInt(document.getElementById('d_min').value, 10) || 25, target: 'جميع الأسلاك', topics: document.getElementById('d_topics').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) };
      if (allDomains().some(function (x) { return x.id === nd.id; })) { S.errs = ['معرّف المجال مستعمل من قبل']; render(); return; }
      S.content.domains.push(nd); save('تمت إضافة المجال.');
    }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.hasAttribute('data-f')) { var k = el.getAttribute('data-f'); S.filter[k] = el.type === 'checkbox' ? el.checked : el.value; render(); }
    else if (el.hasAttribute('data-q') && S.editing && (el.getAttribute('data-q') === 'type')) {
      readQForm(); var q = S.editing;
      if (q.type === 'match') { q.pairs = [{ term: '', def: '' }, { term: '', def: '' }, { term: '', def: '' }, { term: '', def: '' }]; }
      else { q.choices = q.type === 'tf' ? ['صح', 'خطأ'] : ['', '', '', '']; q.answer = 0; }
      render();
    }
    else if (el.hasAttribute('data-t') && S.testDraft && el.getAttribute('data-t') === 'domain') { S.testDraft.domain = el.value; S.testDraft.ids = []; render(); }
    else if (el.hasAttribute('data-pick') && S.testDraft) {
      var id = el.getAttribute('data-pick'), ids = S.testDraft.ids, i = ids.indexOf(id);
      if (el.checked && i < 0) { if (ids.length >= 15) { el.checked = false; return; } ids.push(id); } else if (!el.checked && i >= 0) ids.splice(i, 1);
      document.getElementById('cnt').textContent = ids.length;
    }
  });
  document.addEventListener('input', function (ev) { if (ev.target.getAttribute && ev.target.getAttribute('data-f') === 'q') { S.filter.q = ev.target.value; /* يُطبَّق عند المغادرة */ } });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.getAttribute && ev.target.getAttribute('data-f') === 'q') { ev.preventDefault(); S.filter.q = ev.target.value; render(); } });
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'); if (!el) return;
    var a = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    S.msg = null;
    if (a === 'logout') logout();
    else if (a === 'tab') { S.tab = el.getAttribute('data-tab'); S.errs = null; S.editing = null; S.testDraft = null; if (S.tab === 'stats') { S.stats = null; render(); loadStats(); } else render(); }
    else if (a === 'newq') { S.editing = blankQ(); S.errs = null; render(); }
    else if (a === 'editq') { var x = findQ(id); S.editing = JSON.parse(JSON.stringify(x.q)); S.errs = null; render(); window.scrollTo(0, 0); }
    else if (a === 'cancelq') { S.editing = null; S.errs = null; render(); }
    else if (a === 'delq') {
      var y = findQ(id), used = B.tests.concat(S.content.tests).filter(function (t) { return t.ids.indexOf(id) >= 0; });
      if (!window.confirm('حذف السؤال ' + id + '؟' + (used.length ? '\nتنبيه: هو ضمن ' + used.length + ' اختبار(ات) ثابتة وستتوقف عن الظهور.' : ''))) return;
      if (y.builtin) { if (S.content.hidden.indexOf(id) < 0) S.content.hidden.push(id); }
      else S.content.questions = S.content.questions.filter(function (q) { return q.id !== id; });
      save('تم حذف السؤال.');
    }
    else if (a === 'restore') { S.content.hidden = S.content.hidden.filter(function (h) { return h !== id; }); save('تمت استعادة السؤال.'); }
    else if (a === 'newtest') { S.testDraft = { title: '', titleFr: '', domain: allDomains()[0].id, minutes: 25, ids: [] }; S.errs = null; render(); }
    else if (a === 'canceltest') { S.testDraft = null; S.errs = null; render(); }
    else if (a === 'deltest') { if (window.confirm('حذف هذا الاختبار؟')) { S.content.tests = S.content.tests.filter(function (t) { return t.id !== id; }); save('تم حذف الاختبار.'); } }
    else if (a === 'deldomain') {
      var n = S.content.questions.filter(function (q) { return q.domain === id; }).length;
      if (n) { S.errs = ['لا يمكن حذف مجال يحتوي أسئلة (' + n + '). احذف أسئلته أولاً.']; render(); return; }
      if (window.confirm('حذف المجال؟')) { S.content.domains = S.content.domains.filter(function (d) { return d.id !== id; }); save('تم حذف المجال.'); }
    }
    else if (a === 'csv') csv();
    else if (a === 'refreshstats') { S.stats = null; render(); loadStats(); }
    else if (a === 'clearstats') { if (window.confirm('حذف كل النتائج المسجلة نهائياً؟')) api('POST', '/api/admin/results/clear').then(function () { S.stats = null; render(); loadStats(); }); }
  });
  boot();
})();
