/* EduKit — واجهة المترشح
   RACHID EL MOURABIT | المحفظة التربوية - EduKit */
(function () {
  'use strict';
  var E = window.EduEngine, B = window.EDUKIT_BANK, I = window.EDUKIT_I18N;
  var TOTAL = E.TOTAL;

  /* ---------- تخزين محلي آمن ---------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* تجاهل */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* تجاهل */ } }
  };

  var state = { lang: LS.get('edukit.lang', 'ar') === 'fr' ? 'fr' : 'ar', content: null, online: false, att: null, cur: 0, timerId: null, savedStatus: null, modal: null };

  function t(k) { var d = I[state.lang]; return d[k] !== undefined ? d[k] : I.ar[k]; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var $app = document.getElementById('app');
  function dname(d) { return state.lang === 'fr' && d.nameFr ? d.nameFr : d.name; }
  function dtarget(d) { return state.lang === 'fr' && d.targetFr ? d.targetFr : d.target; }
  function domById(id) { return state.content.domains.filter(function (d) { return d.id === id; })[0]; }
  function qCount(id) { return state.content.questions.filter(function (q) { return q.domain === id; }).length; }
  function isReady(id) { return qCount(id) >= TOTAL; }

  /* ---------- الاتصال بالخادم (اختياري) ---------- */
  function fetchJSON(url, ms, opts) {
    return new Promise(function (res, rej) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var to = setTimeout(function () { if (ctl) ctl.abort(); rej(new Error('timeout')); }, ms || 4000);
      var o = opts || {}; if (ctl) o.signal = ctl.signal;
      fetch(url, o).then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(res, rej);
    });
  }
  function loadContent() {
    return fetchJSON('/api/questions', 4000).then(function (r) {
      if (r && r.online && r.content) { state.online = true; state.content = E.mergeContent(B, r.content); }
      else throw new Error('offline');
    }).catch(function () { state.online = false; state.content = E.mergeContent(B, {}); });
  }
  function postResult(att) {
    if (!state.online) return Promise.resolve(false);
    var r = att.result;
    var body = {
      domainId: att.domainId || 'all', testId: att.testId || null, mode: att.mode, score: r.correct, total: r.total,
      durationSec: Math.max(0, Math.round(((att.submittedAt || Date.now()) - att.startedAt) / 1000)),
      byTopic: r.byTopic.map(function (x) { return { k: x.key, c: x.correct, t: x.total }; }),
      byDomain: r.byDomain.map(function (x) { return { k: x.key, c: x.correct, t: x.total }; })
    };
    return fetchJSON('/api/results', 5000, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function () { return true; }, function () { return false; });
  }

  /* ---------- مكونات مشتركة ---------- */
  function logoSvg(size) {
    return '<svg class="logo" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0B2A5B"/><path d="M32 13 7 26l25 13 25-13z" fill="#C9A227"/><path d="M17 31v11c0 4 7.6 8 15 8s15-4 15-8V31L32 39z" fill="#fff"/><path d="M57 26v14" stroke="#C9A227" stroke-width="2.6" stroke-linecap="round"/><circle cx="57" cy="42.5" r="2.7" fill="#C9A227"/><path d="M32 39v11" stroke="#0B2A5B" stroke-width="1.6"/></svg>';
  }
  function headerHtml() {
    return '<header class="site-header no-print"><div class="wrap header-in">' +
      '<a class="brand" href="#/">' + logoSvg(44) + '<span class="brand-txt"><b>EduKit</b><small>' + esc(t('brandSub')) + '</small><em>RACHID EL MOURABIT</em></span></a>' +
      '<nav class="nav"><a href="#/">' + esc(t('home')) + '</a><a href="#/" data-action="toDomains">' + esc(t('domainsNav')) + '</a><a href="#/all">' + esc(t('comprehensiveNav')) + '</a>' +
      '<button class="lang" data-action="lang" aria-label="Langue / اللغة">' + (state.lang === 'ar' ? 'FR' : 'عربي') + '</button></nav></div></header>';
  }
  function printHeader() {
    return '<div class="print-only print-head">' + logoSvg(40) + '<div><b>EduKit — ' + esc(t('brandSub')) + '</b><br>RACHID EL MOURABIT</div></div>';
  }
  function footerHtml() {
    return '<footer class="site-footer"><div class="wrap"><p class="disc">' + esc(t('disclaimer')) + '</p><p>' + esc(t('rights')) + '<br><b>RACHID EL MOURABIT | المحفظة التربوية - EduKit</b></p></div></footer>';
  }
  function shell(inner) { return headerHtml() + '<main class="wrap main">' + inner + '</main>' + footerHtml() + (state.modal || ''); }
  function toast(msg) {
    var el = document.createElement('div'); el.className = 'toast no-print'; el.textContent = msg; document.body.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.remove(); }, 2600);
  }
  function qText(q) { return esc(q.text).replace(/_{3,}/g, '<span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>'); }
  function fmtTime(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
  function modeLabel(m) { return m === 'training' ? t('training') : m === 'exam' ? t('exam') : t('full'); }

  /* ---------- الصفحة الرئيسية ---------- */
  function viewHome() {
    var c = state.content, ready = c.domains.filter(function (d) { return isReady(d.id); }).length;
    var saved = LS.get('edukit.attempt', null), resume = '';
    if (saved && !saved.submitted) {
      resume = '<div class="banner no-print"><span>' + esc(t('resume')) + ': <b>' + esc(saved.title) + '</b></span><span><button class="btn gold sm" data-action="resume">' + esc(t('resumeBtn')) + '</button> <button class="btn ghost sm" data-action="discard">' + esc(t('discard')) + '</button></span></div>';
    }
    var cards = c.domains.map(function (d) {
      var n = qCount(d.id), ok = n >= TOTAL;
      return '<article class="card domain ' + (ok ? '' : 'dim') + '"><div class="d-ico">' + esc(d.icon || '📘') + '</div><h3>' + esc(dname(d)) + '</h3>' +
        '<p class="muted">' + n + ' ' + esc(t('questionsAvail')) + (ok ? '' : ' · <b class="warn">' + esc(t('notReady')) + ' (' + n + '/' + TOTAL + ')</b>') + '</p>' +
        '<div class="chips">' + (d.topics || []).slice(0, 6).map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('') + ((d.topics || []).length > 6 ? '<span class="chip">+' + ((d.topics || []).length - 6) + '</span>' : '') + '</div>' +
        '<a class="btn ' + (ok ? 'primary' : 'ghost') + '" href="#/domain/' + encodeURIComponent(d.id) + '">' + esc(t('open')) + '</a></article>';
    }).join('');
    var url = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split('#')[0];
    return shell(resume +
      '<section class="hero"><div class="hero-art" aria-hidden="true">🎓 <span>📖</span> <span>✏️</span></div><h1>' + esc(t('heroTitle')) + '</h1><p class="lead">' + esc(t('heroSub')) + '</p>' +
      '<p class="tag">' + esc(t('tagline')) + '</p><p class="by">' + esc(t('by')) + ' <b>RACHID EL MOURABIT</b> · ' + esc(t('brandSub')) + '</p>' +
      '<a class="btn gold lg" href="#/" data-action="toDomains">' + esc(t('startNow')) + '</a></section>' +
      '<section class="stats">' +
      stat(c.domains.length, t('statDomains')) + stat(ready, t('statReady')) + stat(c.questions.length, t('statQuestions')) + stat(c.tests.length, t('statTests')) +
      '</section><p class="muted center small">' + esc(t('statNote')) + '</p>' +
      '<section id="domains"><h2>' + esc(t('domainsTitle')) + '</h2><div class="grid">' + cards + '</div></section>' +
      '<section><h2>' + esc(t('modesTitle')) + '</h2><div class="grid three">' +
      '<div class="card"><h3>🧪 ' + esc(t('modeTraining')) + '</h3><p>' + esc(t('modeTrainingD')) + '</p></div>' +
      '<div class="card"><h3>⏱️ ' + esc(t('modeExam')) + '</h3><p>' + esc(t('modeExamD')) + '</p></div>' +
      '<div class="card"><h3>🧭 ' + esc(t('modeFull')) + '</h3><p>' + esc(t('modeFullD')) + '</p><a class="btn ghost" href="#/all">' + esc(t('open')) + '</a></div></div></section>' +
      '<section class="card share no-print"><h3>🔗 ' + esc(t('shareTitle')) + '</h3><p>' + esc(t('shareText')) + '</p><div class="row"><input class="inp" id="shareUrl" readonly value="' + esc(url) + '"><button class="btn primary" data-action="copyLink">' + esc(t('copyLink')) + '</button></div></section>');
  }
  function stat(n, label) { return '<div class="stat"><b>' + n + '</b><span>' + esc(label) + '</span></div>'; }

  /* ---------- صفحة مجال / الاختبار الشامل ---------- */
  function viewDomain(id) {
    var d = domById(id);
    if (!d) return viewHome();
    var n = qCount(id), ok = n >= TOTAL;
    var tests = state.content.tests.filter(function (x) { return x.domain === id; });
    var h = '<a class="back" href="#/">← ' + esc(t('back')) + '</a><section class="card intro"><div class="d-ico big">' + esc(d.icon || '📘') + '</div><h1>' + esc(t('testTitle')) + ' · ' + esc(dname(d)) + '</h1>' + infoTable(dtarget(d), d.minutes || 25) + '</section>';
    if (!ok) {
      h += '<div class="card warnbox"><b>' + esc(t('notReady')) + '</b><p>' + esc(t('notReadyMsg')) + ' (' + n + '/' + TOTAL + ') — ' + esc(t('needMore')) + ' ' + (TOTAL - n) + ' ' + esc(t('moreQ')) + '</p></div>';
      return shell(h);
    }
    h += modeForm(d.minutes || 25, false) +
      '<section class="card"><h3>🎲 ' + esc(t('randomTest')) + '</h3><p class="muted">' + esc(t('randomTestD')) + '</p><button class="btn gold lg" data-action="start" data-domain="' + esc(id) + '">' + esc(t('startTest')) + '</button></section>';
    if (tests.length) {
      h += '<section><h2>' + esc(t('fixedTests')) + '</h2>' + tests.map(function (x) {
        return '<div class="card row between"><div><h3>' + esc(state.lang === 'fr' && x.titleFr ? x.titleFr : x.title) + '</h3><p class="muted">' + TOTAL + ' · ' + esc(x.level || '') + ' · ' + (x.minutes || 25) + ' ' + esc(t('minutes')) + '</p></div><button class="btn primary" data-action="start" data-domain="' + esc(id) + '" data-test="' + esc(x.id) + '">' + esc(t('startTest')) + '</button></div>';
      }).join('') + '</section>';
    }
    return shell(h);
  }
  function viewAll() {
    var n = state.content.questions.length;
    var h = '<a class="back" href="#/">← ' + esc(t('back')) + '</a><section class="card intro"><div class="d-ico big">🧭</div><h1>' + esc(t('comprehensiveTitle')) + '</h1><p>' + esc(t('comprehensiveDesc')) + '</p>' + infoTable(state.lang === 'fr' ? 'Tous les cycles' : 'جميع الأسلاك', 30) + '</section>';
    if (n < TOTAL) return shell(h + '<div class="card warnbox">' + esc(t('noContent')) + '</div>');
    h += modeForm(30, true) + '<section class="card"><button class="btn gold lg" data-action="start" data-all="1">' + esc(t('startTest')) + '</button></section>';
    return shell(h);
  }
  function infoTable(target, minutes) {
    return '<dl class="info"><div><dt>' + esc(t('targetLevel')) + '</dt><dd>' + esc(target) + '</dd></div><div><dt>' + esc(t('numQ')) + '</dt><dd>' + TOTAL + '</dd></div><div><dt>' + esc(t('suggested')) + '</dt><dd>' + minutes + ' ' + esc(t('minutes')) + '</dd></div><div><dt>' + esc(t('difficulty')) + '</dt><dd>' + esc(t('diffMixed')) + '</dd></div></dl>';
  }
  function modeForm(minutes, full) {
    var opts = full ? '' : '<label class="opt-r"><input type="radio" name="mode" value="training" checked> <span><b>' + esc(t('modeTraining')) + '</b><small>' + esc(t('modeTrainingD')) + '</small></span></label>';
    opts += '<label class="opt-r"><input type="radio" name="mode" value="' + (full ? 'full' : 'exam') + '" ' + (full ? 'checked' : '') + '> <span><b>' + esc(full ? t('modeFull') : t('modeExam')) + '</b><small>' + esc(full ? t('modeFullD') : t('modeExamD')) + '</small></span></label>';
    return '<section class="card"><h3>' + esc(t('chooseMode')) + '</h3><div class="modes">' + opts + '</div><label class="chk"><input type="checkbox" id="useTimer"> ' + esc(t('timerOpt')) + ' (' + minutes + ' ' + esc(t('minutes')) + ')</label><input type="hidden" id="timerMin" value="' + minutes + '"></section>';
  }

  /* ---------- بدء الاختبار ---------- */
  function seenKey(k) { return LS.get('edukit.seen', {})[k] || []; }
  function startAttempt(o) {
    var qs, title, key;
    var all = state.content.questions;
    if (o.testId) {
      var tt = state.content.tests.filter(function (x) { return x.id === o.testId; })[0];
      if (!tt) return;
      qs = tt.ids.map(function (id) { return all.filter(function (q) { return q.id === id; })[0]; });
      title = state.lang === 'fr' && tt.titleFr ? tt.titleFr : tt.title; key = o.domainId;
    } else {
      var pool = o.all ? all : all.filter(function (q) { return q.domain === o.domainId; });
      key = o.all ? 'all' : o.domainId;
      var r = E.pickQuestions(pool, { seen: seenKey(key) });
      if (!r.ok) { toast(t('noContent')); return; }
      qs = r.questions;
      title = o.all ? t('comprehensiveTitle') : t('testTitle') + ' · ' + dname(domById(o.domainId));
    }
    var modeEl = document.querySelector('input[name=mode]:checked');
    var mode = modeEl ? modeEl.value : (o.all ? 'full' : 'training');
    var timerOn = document.getElementById('useTimer') && document.getElementById('useTimer').checked && mode !== 'training';
    var tm = parseInt((document.getElementById('timerMin') || {}).value, 10) || 25;
    var att = E.createAttempt({ questions: qs, mode: mode, domainId: o.all ? null : o.domainId, testId: o.testId || null, title: title, timerMin: timerOn ? tm : 0 });
    att.seenKey = key; att.all = !!o.all;
    state.att = att; state.cur = 0; state.savedStatus = null; state.modal = null;
    LS.set('edukit.attempt', att);
    location.hash = '#/quiz';
  }

  /* ---------- واجهة الاختبار ---------- */
  function answeredCount(att) { return att.questions.filter(function (q, i) { return E.isAnswered(q, att.items[i].answer); }).length; }
  function viewQuiz() {
    var att = state.att;
    if (!att || att.submitted) { location.hash = '#/'; return ''; }
    var i = state.cur, q = att.questions[i], it = att.items[i], training = att.mode === 'training';
    var ans = answeredCount(att), pct = Math.round(ans * 100 / TOTAL);
    var locked = training && it.checked;
    var body = '';
    if (q.type === 'match') {
      var a = it.answer || q.pairs.map(function () { return null; });
      body += '<p class="muted small">' + esc(t('matchHint')) + '</p><div class="match">';
      q.pairs.forEach(function (p, ti) {
        var cls = locked ? (a[ti] === ti ? ' good' : ' bad') : '';
        body += '<div class="mrow' + cls + '"><div class="mterm" dir="auto">' + esc(p.term) + '</div><select class="sel" data-action="match" data-term="' + ti + '" ' + (locked ? 'disabled' : '') + '><option value="">' + esc(t('choose')) + '…</option>' +
          it.inst.defOrder.map(function (di) { return '<option value="' + di + '" ' + (a[ti] === di ? 'selected' : '') + '>' + esc(q.pairs[di].def) + '</option>'; }).join('') + '</select>' +
          (locked && a[ti] !== ti ? '<div class="fix">✔ ' + esc(p.def) + '</div>' : '') + '</div>';
      });
      body += '</div>';
    } else {
      body += '<div class="opts">' + it.inst.order.map(function (o, pos) {
        var cls = 'opt';
        if (it.answer === o) cls += ' sel-on';
        if (locked) { if (o === q.answer) cls += ' good'; else if (it.answer === o) cls += ' bad'; }
        return '<button class="' + cls + '" data-action="pick" data-o="' + o + '" ' + (locked ? 'disabled' : '') + ' aria-pressed="' + (it.answer === o) + '"><span class="letter">' + 'ABCD'.charAt(pos) + '</span><span dir="auto">' + esc(q.choices[o]) + '</span></button>';
      }).join('') + '</div>';
    }
    var fb = '';
    if (locked) {
      var okNow = E.isCorrect(q, it.answer);
      fb = '<div class="fb ' + (okNow ? 'good' : 'bad') + '"><b>' + esc(okNow ? t('correctNow') : t('wrongNow')) + '</b><p dir="auto">' + esc(q.explanation) + '</p>' + (q.source ? '<small>' + esc(t('source')) + ': ' + esc(q.source) + '</small>' : '') + '</div>';
    }
    var nav = att.questions.map(function (qq, k) {
      var c = 'nb'; if (k === i) c += ' cur'; if (E.isAnswered(qq, att.items[k].answer)) c += ' done'; if (att.items[k].flagged) c += ' flag';
      return '<button class="' + c + '" data-action="goto" data-i="' + k + '" aria-label="' + (k + 1) + '">' + (k + 1) + (att.items[k].flagged ? '<i>⚑</i>' : '') + '</button>';
    }).join('');
    var timer = att.deadline ? '<div class="timer" id="timer">' + esc(t('timeLeft')) + ': <b id="tleft">' + fmtTime(att.deadline - Date.now()) + '</b></div>' : '';
    var canCheck = training && !it.checked && E.isAnswered(q, it.answer);
    return shell(
      '<section class="quiz"><div class="qhead"><div><h1 class="qtitle">' + esc(att.title) + '</h1><span class="badge">' + esc(modeLabel(att.mode)) + '</span></div>' + timer + '</div>' +
      '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pct + '%"></span></div>' +
      '<div class="counters"><span>' + esc(t('answered')) + ': <b>' + ans + '</b></span><span>' + esc(t('remaining')) + ': <b>' + (TOTAL - ans) + '</b></span><span>' + (i + 1) + ' / ' + TOTAL + '</span></div>' +
      '<div class="navgrid" aria-label="navigation">' + nav + '</div>' +
      '<article class="card qcard"><div class="qmeta"><span class="qn">' + esc(t('qOf')) + ' ' + (i + 1) + ' ' + esc(t('of')) + ' ' + TOTAL + '</span><span class="tag t-' + q.type + '">' + esc(I[state.lang].types[q.type]) + '</span><span class="tag lvl-' + q.level + '">' + esc(I[state.lang].levels[q.level]) + '</span><span class="tag topic">' + esc((domById(q.domain) ? dname(domById(q.domain)) + ' · ' : '') + q.topic) + '</span></div>' +
      '<p class="qtext" dir="auto">' + qText(q) + '</p>' + body + fb +
      '<div class="qctl"><button class="btn ghost" data-action="prev" ' + (i === 0 ? 'disabled' : '') + '>' + esc(t('prev')) + '</button>' +
      '<button class="btn ghost" data-action="flag">⚑ ' + esc(it.flagged ? t('unflag') : t('flag')) + '</button>' +
      (canCheck ? '<button class="btn gold" data-action="check">' + esc(t('check')) + '</button>' : '') +
      '<button class="btn ghost" data-action="next" ' + (i === TOTAL - 1 ? 'disabled' : '') + '>' + esc(t('next')) + '</button></div></article>' +
      '<div class="finish"><button class="btn primary lg" data-action="finish">' + esc(t('finish')) + '</button></div></section>');
  }
  function persist() { if (state.att && !state.att.submitted) LS.set('edukit.attempt', state.att); }
  function startTimer() {
    stopTimer();
    var att = state.att;
    if (!att || !att.deadline || att.submitted) return;
    state.timerId = setInterval(function () {
      var left = att.deadline - Date.now(), el = document.getElementById('tleft');
      if (el) el.textContent = fmtTime(left);
      var box = document.getElementById('timer'); if (box && left < 60000) box.classList.add('low');
      if (left <= 0) { stopTimer(); submit(true); }
    }, 500);
  }
  function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }

  function openFinishModal() {
    var att = state.att, un = [], fl = [];
    att.questions.forEach(function (q, i) { if (!E.isAnswered(q, att.items[i].answer)) un.push(i + 1); if (att.items[i].flagged) fl.push(i + 1); });
    var m = '<div class="overlay no-print" role="dialog" aria-modal="true"><div class="modal"><p>' + esc(t('confirmFinish')) + '</p>';
    if (un.length) m += '<p class="warn">⚠ ' + esc(t('unansweredWarn')) + ' (' + un.length + '): ' + un.join('، ') + '</p>';
    if (fl.length) m += '<p>⚑ ' + esc(t('flaggedWarn')) + ': ' + fl.join('، ') + '</p>';
    m += '<div class="row"><button class="btn primary" data-action="submit">' + esc(t('submit')) + '</button><button class="btn ghost" data-action="closeModal">' + esc(t('goBack')) + '</button></div></div></div>';
    state.modal = m; render(true);
  }
  function submit(auto) {
    var att = state.att; if (!att) return;
    state.modal = null;
    if (!E.submitAttempt(att)) { location.hash = '#/result'; return; }   // لا يُرسَل الاختبار مرتين
    stopTimer();
    var seen = LS.get('edukit.seen', {}), k = att.seenKey || 'all';
    seen[k] = (seen[k] || []).concat(att.questions.map(function (q) { return q.id; })).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(-300);
    LS.set('edukit.seen', seen);
    LS.del('edukit.attempt'); LS.set('edukit.last', att);
    state.savedStatus = 'pending';
    postResult(att).then(function (ok) { state.savedStatus = ok ? 'server' : 'local'; if (location.hash === '#/result') render(true); });
    if (!state.online) state.savedStatus = 'local';
    if (auto) toast(t('timeUp'));
    location.hash = '#/result';
  }

  /* ---------- النتائج ---------- */
  function ansText(q, it) {
    if (q.type === 'match') return '';
    return E.isAnswered(q, it.answer) ? esc(q.choices[it.answer]) : '<i>' + esc(t('noAnswer')) + '</i>';
  }
  function barRow(label, c, tot) {
    var p = Math.round(c * 100 / tot);
    return '<div class="brow"><span class="bl" dir="auto">' + esc(label) + '</span><div class="bt"><i style="width:' + p + '%" class="' + (p >= 75 ? 'hi' : p >= 60 ? 'mid' : 'lo') + '"></i></div><span class="bv">' + c + '/' + tot + '</span></div>';
  }
  function viewResult() {
    var att = state.att && state.att.submitted ? state.att : LS.get('edukit.last', null);
    if (!att || !att.result) { location.hash = '#/'; return ''; }
    state.att = att;
    var r = att.result, L = I[state.lang];
    var circ = 2 * Math.PI * 52, off = circ * (1 - r.correct / r.total);
    var groups = att.mode === 'full' || att.all ? r.byDomain.map(function (x) { var d = domById(x.key); return { label: d ? dname(d) : x.key, c: x.correct, t: x.total }; }) : r.byTopic.map(function (x) { return { label: x.key, c: x.correct, t: x.total }; });
    var strong = groups.filter(function (g) { return g.c * 100 / g.t >= 75; }), weak = groups.filter(function (g) { return g.c * 100 / g.t < 60; });
    var small = groups.some(function (g) { return g.t < 3; });
    var det = att.questions.map(function (q, i) {
      var it = att.items[i], ok = E.isCorrect(q, it.answer), body = '';
      if (q.type === 'match') {
        var a = it.answer || [];
        body = '<table class="mt"><tbody>' + q.pairs.map(function (p, ti) {
          var good = a[ti] === ti, mine = Number.isInteger(a[ti]) ? q.pairs[a[ti]].def : t('noAnswer');
          return '<tr class="' + (good ? 'good' : 'bad') + '"><td dir="auto"><b>' + esc(p.term) + '</b></td><td dir="auto">' + esc(mine) + '</td><td dir="auto">' + (good ? '✔' : esc(p.def)) + '</td></tr>';
        }).join('') + '</tbody></table>';
      } else {
        body = '<p><b>' + esc(t('yourAnswer')) + ':</b> <span dir="auto">' + ansText(q, it) + '</span></p><p><b>' + esc(t('correctAnswer')) + ':</b> <span dir="auto">' + esc(q.choices[q.answer]) + '</span></p>';
      }
      return '<article class="card corr ' + (ok ? 'good' : 'bad') + '"><div class="qmeta"><span class="qn">' + (i + 1) + '</span><span class="verdict ' + (ok ? 'good' : 'bad') + '">' + esc(ok ? t('isCorrect') : t('isWrong')) + '</span><span class="tag">' + esc(L.types[q.type]) + '</span><span class="tag lvl-' + q.level + '">' + esc(L.levels[q.level]) + '</span><span class="tag topic">' + esc(q.topic) + '</span></div>' +
        '<p class="qtext" dir="auto">' + qText(q) + '</p>' + body + '<div class="expl"><b>' + esc(t('explanation')) + ':</b> <span dir="auto">' + esc(q.explanation) + '</span></div>' +
        (q.source ? '<p class="src">' + esc(t('source')) + ': <span dir="auto">' + esc(q.source) + '</span></p>' : '') + '<p class="origin">' + esc(q.origin === 'official' ? t('originOfficial') : t('origin')) + '</p></article>';
    }).join('');
    var note = state.savedStatus === 'server' ? t('savedServer') : (state.savedStatus === 'local' ? t('savedLocal') : '');
    var date = new Date(att.submittedAt || Date.now()).toLocaleString(state.lang === 'fr' ? 'fr-FR' : 'ar-MA');
    return shell(printHeader() +
      '<section class="card result"><h1>' + esc(t('resultTitle')) + ' — ' + esc(att.title) + '</h1><p class="muted">' + esc(t('mode')) + ': ' + esc(modeLabel(att.mode)) + ' · ' + esc(t('date')) + ': ' + esc(date) + '</p>' +
      '<div class="score-row"><svg class="donut" viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="' + r.correct + '/' + r.total + '"><circle cx="60" cy="60" r="52" fill="none" stroke="#e5e9f2" stroke-width="12"/><circle cx="60" cy="60" r="52" fill="none" stroke="#C9A227" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 60 60)"/><text x="60" y="60" text-anchor="middle" class="d1">' + r.correct + '/' + r.total + '</text><text x="60" y="80" text-anchor="middle" class="d2">' + r.percent + '%</text></svg>' +
      '<div class="score-info"><div class="big">' + esc(t('finalScore')) + ': <b>' + r.correct + '/' + r.total + '</b> (' + r.percent + '%)</div>' +
      '<div class="level l-' + r.level + '">' + esc(L.evalLabels[r.level]) + '</div>' +
      '<ul class="counts"><li class="good">' + r.correct + ' ' + esc(t('correct')) + '</li><li class="bad">' + r.wrong + ' ' + esc(t('wrong')) + '</li><li>' + r.unanswered + ' ' + esc(t('unanswered')) + '</li></ul></div></div>' +
      '<h3>' + esc(t('perfChart')) + '</h3><div class="stack" role="img" aria-label="chart"><i class="good" style="width:' + (r.correct * 100 / r.total) + '%"></i><i class="bad" style="width:' + (r.wrong * 100 / r.total) + '%"></i><i class="none" style="width:' + (r.unanswered * 100 / r.total) + '%"></i></div>' +
      '<h3>' + esc(att.mode === 'full' || att.all ? t('byDomain') : t('byTopic')) + '</h3>' + groups.map(function (g) { return barRow(g.label, g.c, g.t); }).join('') +
      '<div class="sw"><div><h4>✅ ' + esc(t('strengths')) + '</h4>' + (strong.length ? '<ul>' + strong.map(function (g) { return '<li dir="auto">' + esc(g.label) + '</li>'; }).join('') + '</ul>' : '<p class="muted">' + esc(t('none')) + '</p>') + '</div><div><h4>⚠️ ' + esc(t('weaknesses')) + '</h4>' + (weak.length ? '<ul>' + weak.map(function (g) { return '<li dir="auto">' + esc(g.label) + '</li>'; }).join('') + '</ul>' : '<p class="muted">' + esc(t('none')) + '</p>') + '</div></div>' +
      (small ? '<p class="muted small">' + esc(t('smallSample')) + '</p>' : '') +
      (note ? '<p class="muted small no-print">' + esc(note) + '</p>' : '') +
      '<div class="row no-print actions"><button class="btn gold" data-action="retry">' + esc(t('retry')) + '</button><button class="btn primary" data-action="print">' + esc(t('print')) + '</button><button class="btn ghost" data-action="share">' + esc(t('share')) + '</button><a class="btn ghost" id="wa" target="_blank" rel="noopener" href="' + esc(waLink(att)) + '">' + esc(t('whatsapp')) + '</a><a class="btn ghost" href="#/">' + esc(t('home')) + '</a></div></section>' +
      '<h2>' + esc(t('detail')) + '</h2>' + det);
  }
  function shareMsg(att) {
    var r = att.result, url = location.origin && location.origin !== 'null' ? location.origin + location.pathname : '';
    return I[state.lang].shareMsg(r.correct + '/' + r.total, r.percent, att.title, url);
  }
  function waLink(att) { return 'https://wa.me/?text=' + encodeURIComponent(shareMsg(att)); }
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return false; });
    return new Promise(function (res) {
      var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); res(ok);
    });
  }

  /* ---------- التوجيه والعرض ---------- */
  function render(keepScroll) {
    var y = window.scrollY;
    var h = location.hash || '#/', html;
    if (!state.content) { $app.innerHTML = '<p class="wrap main center">…</p>'; return; }
    document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    if (h.indexOf('#/domain/') === 0) html = viewDomain(decodeURIComponent(h.slice(9)));
    else if (h === '#/all') html = viewAll();
    else if (h === '#/quiz') html = viewQuiz();
    else if (h === '#/result') html = viewResult();
    else html = viewHome();
    if (h !== '#/quiz') stopTimer();
    $app.innerHTML = html;
    document.title = 'EduKit — ' + t('brandSub') + ' | RACHID EL MOURABIT';
    if (h === '#/quiz') startTimer();
    if (keepScroll === true) window.scrollTo(0, y); else window.scrollTo(0, 0);
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]'); if (!el || el.tagName === 'SELECT') return;
    var a = el.getAttribute('data-action'), att = state.att;
    if (a === 'lang') { state.lang = state.lang === 'ar' ? 'fr' : 'ar'; LS.set('edukit.lang', state.lang); render(true); }
    else if (a === 'toDomains') { ev.preventDefault(); if (location.hash !== '#/' && location.hash !== '') { location.hash = '#/'; setTimeout(scrollDomains, 50); } else scrollDomains(); }
    else if (a === 'copyLink') { var u = document.getElementById('shareUrl').value; copyText(u).then(function (ok) { toast(ok ? t('copied') : u); }); }
    else if (a === 'start') startAttempt({ domainId: el.getAttribute('data-domain'), testId: el.getAttribute('data-test'), all: !!el.getAttribute('data-all') });
    else if (a === 'resume') { state.att = LS.get('edukit.attempt', null); state.cur = 0; if (state.att) location.hash = '#/quiz'; }
    else if (a === 'discard') { LS.del('edukit.attempt'); render(true); }
    else if (!att) return;
    else if (a === 'pick') {
      var it = att.items[state.cur], q = att.questions[state.cur];
      if (att.submitted || (att.mode === 'training' && it.checked)) return;
      it.answer = parseInt(el.getAttribute('data-o'), 10); persist(); render(true);
    }
    else if (a === 'check') { att.items[state.cur].checked = true; persist(); render(true); }
    else if (a === 'flag') { var f = att.items[state.cur]; f.flagged = !f.flagged; persist(); render(true); }
    else if (a === 'prev') { if (state.cur > 0) { state.cur--; render(); } }
    else if (a === 'next') { if (state.cur < TOTAL - 1) { state.cur++; render(); } }
    else if (a === 'goto') { state.cur = parseInt(el.getAttribute('data-i'), 10); render(); }
    else if (a === 'finish') openFinishModal();
    else if (a === 'closeModal') { state.modal = null; render(true); }
    else if (a === 'submit') submit(false);
    else if (a === 'retry') {
      var old = att, qs;
      if (old.testId) { qs = old.questions; }
      else {
        var pool = old.all ? state.content.questions : state.content.questions.filter(function (qq) { return qq.domain === old.domainId; });
        var r = E.pickQuestions(pool, { seen: seenKey(old.seenKey || 'all') }); if (!r.ok) { toast(t('noContent')); return; } qs = r.questions;
      }
      var n = E.createAttempt({ questions: qs, mode: old.mode, domainId: old.domainId, testId: old.testId, title: old.title, timerMin: old.timerMin });
      n.seenKey = old.seenKey; n.all = old.all; state.att = n; state.cur = 0; state.savedStatus = null; LS.set('edukit.attempt', n); location.hash = '#/quiz';
    }
    else if (a === 'print') window.print();
    else if (a === 'share') {
      var msg = shareMsg(att);
      if (navigator.share) navigator.share({ text: msg }).catch(function () { /* أُلغيت المشاركة */ });
      else copyText(msg).then(function (ok) { toast(ok ? t('copied') : msg); });
    }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.getAttribute && el.getAttribute('data-action') === 'match' && state.att && !state.att.submitted) {
      var att = state.att, it = att.items[state.cur], q = att.questions[state.cur];
      if (att.mode === 'training' && it.checked) return;
      var a = Array.isArray(it.answer) ? it.answer.slice() : q.pairs.map(function () { return null; });
      a[parseInt(el.getAttribute('data-term'), 10)] = el.value === '' ? null : parseInt(el.value, 10);
      it.answer = a; persist(); render(true);
    }
  });
  function scrollDomains() { var d = document.getElementById('domains'); if (d) d.scrollIntoView({ behavior: 'smooth' }); }
  window.addEventListener('hashchange', function () { state.modal = null; render(); });

  loadContent().then(function () {
    var saved = LS.get('edukit.attempt', null);
    if (saved && !saved.submitted) { /* يُعرض شريط المتابعة في الرئيسية */ }
    render();
  });
})();
