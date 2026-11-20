/* EduKit — محرك الاختبارات (منطق خالص بلا DOM، قابل للاختبار في Node)
   RACHID EL MOURABIT | المحفظة التربوية - EduKit */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EduEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TOTAL = 15;
  var QUOTA = { mcq: 8, tf: 2, situation: 2, fill: 1, match: 1, applied: 1 };
  var LEVELS = ['easy', 'medium', 'hard'];
  var LEVEL_RANK = { easy: 0, medium: 1, hard: 2 };
  var TYPES = Object.keys(QUOTA);

  /* ---------- أدوات عامة ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function range(n) { var r = []; for (var i = 0; i < n; i++) r.push(i); return r; }
  function isChoiceType(t) { return t !== 'match'; }

  /* ---------- التحقق من صحة سؤال ---------- */
  function validateQuestion(q) {
    var e = [];
    if (!q || typeof q !== 'object') return ['سؤال غير صالح'];
    if (!q.id || typeof q.id !== 'string') e.push('المعرّف مفقود');
    if (!q.domain) e.push('المجال مفقود');
    if (!q.topic || !String(q.topic).trim()) e.push('الموضوع مفقود');
    if (LEVELS.indexOf(q.level) < 0) e.push('مستوى الصعوبة غير صالح');
    if (TYPES.indexOf(q.type) < 0) e.push('نوع السؤال غير صالح');
    if (!q.text || !String(q.text).trim()) e.push('نص السؤال فارغ');
    if (!q.explanation || !String(q.explanation).trim()) e.push('التفسير مفقود');
    if (q.type === 'match') {
      var p = q.pairs;
      if (!Array.isArray(p) || p.length < 3 || p.length > 6) e.push('المطابقة تتطلب من 3 إلى 6 أزواج');
      else {
        var terms = {}, defs = {};
        p.forEach(function (x) {
          if (!x || !String(x.term || '').trim() || !String(x.def || '').trim()) e.push('زوج مطابقة ناقص');
          else { terms[x.term.trim()] = 1; defs[x.def.trim()] = 1; }
        });
        if (Object.keys(terms).length !== p.length || Object.keys(defs).length !== p.length) e.push('المفاهيم أو التعريفات مكررة');
      }
    } else if (TYPES.indexOf(q.type) >= 0) {
      var need = q.type === 'tf' ? 2 : 4;
      var c = q.choices;
      if (!Array.isArray(c) || c.length !== need) e.push('عدد الاختيارات يجب أن يكون ' + need);
      else {
        var seen = {};
        c.forEach(function (x) { var s = String(x || '').trim(); if (!s) e.push('اختيار فارغ'); seen[s] = 1; });
        if (Object.keys(seen).length !== need) e.push('الاختيارات مكررة');
      }
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= need) e.push('الإجابة الصحيحة غير محددة');
      if (q.type === 'fill' && String(q.text || '').indexOf('___') < 0) e.push('سؤال الإكمال يجب أن يتضمن فراغاً (____)');
    }
    return e;
  }

  /* ---------- دمج المحتوى المدمج مع محتوى الخادم ---------- */
  function mergeContent(builtin, remote) {
    remote = remote || {};
    var hidden = {}; (remote.hidden || []).forEach(function (id) { hidden[id] = 1; });
    var overrides = remote.overrides || {};
    var domains = (builtin.domains || []).slice();
    var have = {}; domains.forEach(function (d) { have[d.id] = 1; });
    (remote.domains || []).forEach(function (d) { if (d && d.id && !have[d.id]) { domains.push(d); have[d.id] = 1; } });
    var qs = [];
    (builtin.questions || []).forEach(function (q) {
      if (hidden[q.id]) return;
      qs.push(overrides[q.id] ? Object.assign({}, overrides[q.id], { id: q.id, builtin: true }) : Object.assign({ builtin: true }, q));
    });
    (remote.questions || []).forEach(function (q) { if (!hidden[q.id]) qs.push(Object.assign({}, q)); });
    qs = qs.filter(function (q) { return have[q.domain] && validateQuestion(q).length === 0; });
    var ids = {}; qs.forEach(function (q) { ids[q.id] = 1; });
    var tests = (builtin.tests || []).concat(remote.tests || []).filter(function (t) {
      return t && Array.isArray(t.ids) && t.ids.length === TOTAL && t.ids.every(function (i) { return ids[i]; });
    });
    return { domains: domains, questions: qs, tests: tests };
  }

  /* ---------- اختيار الأسئلة ---------- */
  function pickQuestions(pool, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var quota = opts.quota || QUOTA;
    var total = opts.total || TOTAL;
    var seen = {}; (opts.seen || []).forEach(function (id) { seen[id] = 1; });
    if (pool.length < total) return { ok: false, have: pool.length, need: total };
    var used = {}, picked = [], domCount = {};
    var levelOrder = ['medium', 'easy', 'hard'];

    function rank(q) { return seen[q.id] ? 1 : 0; }
    function take(cands, n) {
      var list = shuffle(cands, rng).sort(function (a, b) { return rank(a) - rank(b); });
      var out = [], cyc = 0;
      while (out.length < n && list.length) {
        var lv = levelOrder[cyc % 3]; cyc++;
        var best = rank(list[0]), bi = -1, bs = 1e9;
        for (var i = 0; i < list.length; i++) {
          var q = list[i];
          if (rank(q) !== best) break;
          var s = (domCount[q.domain] || 0) * 10 + (q.level === lv ? 0 : 1);
          if (s < bs) { bs = s; bi = i; }
        }
        var chosen = list.splice(bi, 1)[0];
        out.push(chosen); used[chosen.id] = 1; domCount[chosen.domain] = (domCount[chosen.domain] || 0) + 1;
      }
      return out;
    }
    Object.keys(quota).forEach(function (type) {
      var c = pool.filter(function (q) { return q.type === type && !used[q.id]; });
      picked = picked.concat(take(c, quota[type]));
    });
    if (picked.length < total) {
      picked = picked.concat(take(pool.filter(function (q) { return !used[q.id]; }), total - picked.length));
    }
    picked = shuffle(picked, rng).sort(function (a, b) { return LEVEL_RANK[a.level] - LEVEL_RANK[b.level]; });
    return { ok: true, questions: picked };
  }

  /* ---------- محاولة ---------- */
  function makeInstance(q, rng) {
    if (q.type === 'match') return { defOrder: shuffle(range(q.pairs.length), rng) };
    if (q.type === 'tf') return { order: [0, 1] };
    return { order: shuffle(range(q.choices.length), rng) };
  }
  function createAttempt(o) {
    var rng = o.rng || Math.random;
    var qs = o.questions;
    return {
      id: 'a' + Date.now().toString(36) + Math.floor(rng() * 1e6).toString(36),
      mode: o.mode, domainId: o.domainId || null, testId: o.testId || null, title: o.title || '',
      startedAt: o.now || Date.now(),
      deadline: o.timerMin ? (o.now || Date.now()) + o.timerMin * 60000 : null,
      timerMin: o.timerMin || 0,
      submitted: false, result: null,
      questions: qs,
      items: qs.map(function (q) { var inst = makeInstance(q, rng); return { inst: inst, answer: null, flagged: false, checked: false }; })
    };
  }
  function isAnswered(q, a) {
    if (q.type === 'match') return Array.isArray(a) && a.length === q.pairs.length && a.every(function (x) { return Number.isInteger(x); });
    return Number.isInteger(a);
  }
  function isCorrect(q, a) {
    if (!isAnswered(q, a)) return false;
    if (q.type === 'match') return a.every(function (v, i) { return v === i; });
    return a === q.answer;
  }
  function levelFor(correct, total) {
    var p = correct * 100 / total;
    if (p >= 90) return 'excellent';
    if (p >= 75) return 'verygood';
    if (p >= 60) return 'average';
    if (p >= 40) return 'needs';
    return 'weak';
  }
  function scoreAttempt(att) {
    var total = att.questions.length, correct = 0, wrong = 0, unanswered = 0;
    var byTopic = {}, byDomain = {};
    att.questions.forEach(function (q, i) {
      var a = att.items[i].answer, ans = isAnswered(q, a), ok = isCorrect(q, a);
      if (ok) correct++; else if (ans) wrong++; else unanswered++;
      [[byTopic, q.topic], [byDomain, q.domain]].forEach(function (p) {
        var m = p[0], k = p[1];
        if (!m[k]) m[k] = { key: k, correct: 0, total: 0 };
        m[k].total++; if (ok) m[k].correct++;
      });
    });
    return {
      total: total, correct: correct, wrong: wrong, unanswered: unanswered,
      percent: Math.round(correct * 1000 / total) / 10,
      level: levelFor(correct, total),
      byTopic: Object.keys(byTopic).map(function (k) { return byTopic[k]; }),
      byDomain: Object.keys(byDomain).map(function (k) { return byDomain[k]; })
    };
  }
  /* يُسلَّم الاختبار مرة واحدة فقط */
  function submitAttempt(att, now) {
    if (att.submitted) return false;
    att.submitted = true; att.submittedAt = now || Date.now();
    att.result = scoreAttempt(att);
    return true;
  }

  return {
    TOTAL: TOTAL, QUOTA: QUOTA, LEVELS: LEVELS, TYPES: TYPES, isChoiceType: isChoiceType,
    mulberry32: mulberry32, shuffle: shuffle, validateQuestion: validateQuestion,
    mergeContent: mergeContent, pickQuestions: pickQuestions, createAttempt: createAttempt,
    isAnswered: isAnswered, isCorrect: isCorrect, levelFor: levelFor,
    scoreAttempt: scoreAttempt, submitAttempt: submitAttempt
  };
});
