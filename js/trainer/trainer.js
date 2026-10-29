/* trainer.html: checkoAI's training without the game around it. Everything here goes through the game's own NS.Aima
 * (brains, cloud, learning from data, recording, training matches through NS.Debug), so the page follows the game's
 * updates by itself; it only draws the controls, in tabs: Brains, Training, Data sets, Jobs, Stats. The brain picked at
 * the top is the one every tab works on. The page keeps working in a background tab (NS.Debug's worker beat), at the
 * CPU load picked at the top (NS.Debug.setLoad). */
(function (NS) {
  'use strict';

  var A = NS.Aima, World = NS.World, T = NS.I18n.t;
  var $ = function (id) { return document.getElementById(id); };
  var TABS = ['brains', 'train', 'data', 'jobs', 'stats'];
  var LOADS = [10, 25, 50, 75, 100];
  var tab = 'brains';
  var sel = '';           // the brain every tab works on (default: the active one)
  var setSel = '';        // the data set
  var confirmKey = '', open = {}, shape = '', dirty = true, loading = '', failed = '', newName = '';
  var progKind = 'train'; // the Stats tab's improvement charts: training or benchmark blocks

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function button(label, cls, fn) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.onclick = fn;
    return b;
  }
  function msg(text, bad) {
    var m = $('msg');
    m.textContent = text || '';
    m.className = 'msg' + (text ? '' : ' hidden') + (bad ? ' bad' : '');
  }
  // a select's options; keeps its value when it is still one of them
  function fill(select, items, value) {
    var keep = value !== undefined ? String(value) : select.value;
    var sig = JSON.stringify(items);
    if (select._sig !== sig) {
      select._sig = sig;
      select.innerHTML = '';
      items.forEach(function (it) {
        var o = el('option', null, it[1]);
        o.value = String(it[0]);
        select.appendChild(o);
      });
    }
    if (items.some(function (it) { return String(it[0]) === keep; })) select.value = keep;
  }
  function opt(key) { for (var i = 0; i < A.TR_OPTS.length; i++) if (A.TR_OPTS[i][0] === key) return A.TR_OPTS[i][1]; return []; }
  function num(id) { return +$(id).value; }
  function when(t) { return t ? new Date(t).toLocaleString() : '-'; }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function live(x) { return x.state === 'running' || x.state === 'loading'; }
  function store(k, v) { try { localStorage.setItem('rs6trainer_' + k, v); } catch (e) {} }
  function stored(k) { try { return localStorage.getItem('rs6trainer_' + k); } catch (e) { return null; } }
  function entry(id) { var l = A.brains(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }

  // ---- the selected brain (loaded from the cloud when needed; a brain that failed is not asked for again and again)
  function brain() {
    if (!sel || !entry(sel)) sel = A.activeId();
    var b = A.loadedBrain(sel);
    if (b || loading === sel || failed === sel) return b;
    loading = sel;
    A.getBrain(sel).then(function () { loading = ''; dirty = true; }, function () {
      failed = loading; loading = ''; msg('Could not load that brain.', true); dirty = true;
    });
    return null;
  }
  function pick(id) { sel = id; failed = ''; confirmKey = ''; dirty = true; }

  // ---- tabs
  function showTab(t) {
    if (TABS.indexOf(t) < 0) t = 'brains';
    tab = t;
    store('tab', t);
    var bs = $('tabs').querySelectorAll('[data-tab]');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('sel', bs[i].getAttribute('data-tab') === t);
    TABS.forEach(function (k) { $('tab-' + k).classList.toggle('hidden', k !== t); });
    dirty = true;
  }

  // ---- header: cloud and the Google sign-in (the same account as the game's trainer profile)
  function drawAccount() {
    var box = $('account');
    box.innerHTML = '';
    var acc = A.account();
    box.appendChild(el('span', 'pill ' + (A.cloud === 'ok' ? 'ok' : (A.cloud.indexOf('error') === 0 ? 'bad' : '')), 'cloud: ' + A.cloud));
    if (!A.hasCloud()) return;
    if (acc) {
      box.appendChild(el('span', 'muted', acc));
      box.appendChild(button('Sign out', '', function () { A.signOut(); dirty = true; }));
      return;
    }
    box.appendChild(button('Sign in with Google', 'primary', function () {
      msg('Signing in...');
      A.signIn().then(function (who) { msg('Signed in as ' + who); dirty = true; }, function (e) { msg('Sign-in failed: ' + (e && e.message || e), true); });
    }));
    var code = el('input');
    code.placeholder = 'or paste a code';
    code.spellcheck = false;
    box.appendChild(code);
    box.appendChild(button('Use code', '', function () {
      if (!code.value.trim()) return;
      A.signInCode(code.value.trim()).then(function (who) { msg('Signed in as ' + who); dirty = true; }, function (e) { msg('Sign-in failed: ' + (e && e.message || e), true); });
    }));
    var a = el('a', 'small', 'get a code');
    a.href = 'aima-login.html';
    a.target = '_blank';
    box.appendChild(a);
  }

  function algoShort(e) { return e.algo === 'OPT' ? 'OPT 2.0' : 'AC 1.2 · ' + e.size; }
  function drawPicker() {
    fill($('brainSel'), A.brains().map(function (e) {
      return [e.id, (e.id === A.activeId() ? '★ ' : '') + e.name + '  (' + algoShort(e) + ')'];
    }), sel);
  }

  // ---- BRAINS tab
  function drawBrains() {
    var box = $('brains');
    box.innerHTML = '';
    A.brains().forEach(function (e) {
      var row = el('div', 'brow' + (e.id === sel ? ' sel' : ''));
      row.appendChild(el('b', null, (e.id === A.activeId() ? '★ ' : '') + e.name));
      row.appendChild(el('span', 'muted small', algoShort(e) + ' · ' + (e.matches || 0) + ' matches' + (A.inUse(e.id) ? ' · in use' : '')));
      row.onclick = function () { pick(e.id); };
      box.appendChild(row);
    });
  }
  function drawSelected(b) {
    var e = entry(sel), acts = $('selActs');
    acts.innerHTML = '';
    $('selTitle').textContent = e ? (e.id === A.activeId() ? '★ ' : '') + e.name : 'Brain';
    $('selInfo').textContent = b ? A.algoName(b) + (e.id === A.activeId() ? ' · the brain the game plays with' : '') : (loading ? 'loading...' : '');
    if (!e) return;
    var id = e.id, act = id === A.activeId(), used = A.inUse(id);
    if (!act) acts.appendChild(button('Use in the game', 'primary', function () {
      A.use(id).then(function (x) { msg(x.name + ' is now the active brain.'); dirty = true; }, function () { msg('Could not load it.', true); });
    }));
    // clone / rename: one name box, used by whichever is pressed
    var nm = el('input');
    nm.type = 'text'; nm.maxLength = 24; nm.spellcheck = false; nm.placeholder = 'new name (clone / rename)';
    nm.value = newName;
    nm.oninput = function () { newName = nm.value; };
    acts.appendChild(nm);
    acts.appendChild(button('Clone', '', function () {
      A.clone(id, newName.trim().slice(0, 24) || e.name + ' 2').then(function (x) { newName = ''; pick(x.id); msg('Cloned: ' + x.name); });
    }));
    acts.appendChild(button('Rename', '', function () {
      if (!newName.trim()) { msg('Type the new name first.', true); nm.focus(); return; }
      A.rename(id, newName.trim().slice(0, 24)).then(function () { newName = ''; msg('Renamed.'); dirty = true; });
    }));
    if (!act && !used && A.brains().length > 1) acts.appendChild(button(confirmKey === 'del' + id ? 'Press again to delete' : 'Delete', 'danger', function () {
      if (confirmKey !== 'del' + id) { confirmKey = 'del' + id; dirty = true; return; }
      confirmKey = '';
      if (A.remove(id)) { pick(A.activeId()); msg('Deleted.'); } else msg('It is in use.', true);
      dirty = true;
    }));
  }
  function drawOpts(b) {
    var box = $('brainOpts');
    box.innerHTML = '';
    if (!b) { box.appendChild(el('div', 'muted', 'loading...')); return; }
    // (an OPT brain shows only the settings it uses: learning, and learning from the trainer's play)
    A.optsFor(b).forEach(function (o) {
      var lab = el('label', null, T(o[1]));
      lab.title = T(o[1] + '.h');
      var s = el('select');
      fill(s, o[2].map(function (v) { return [JSON.stringify(v[0]), v[1].indexOf('.') > 0 ? T(v[1]) : v[1]]; }), JSON.stringify(b.cfg[o[0]]));
      s.disabled = A.inUse(b.id) && o[0] === 'size';
      s.onchange = function () {
        var v = JSON.parse(s.value);
        if (o[0] === 'size') {
          if (A.sizeNeedsCloud(v) && !A.hasCloud()) { msg(T('aima.needcloud'), true); dirty = true; return; }
          if (!window.confirm(T('aima.confirm.size'))) { dirty = true; return; }
          if (!A.setSize(v, b)) msg('Cannot change the size now.', true); else msg(T('aima.done.size'));
        } else A.setCfg(o[0], v, b);
        dirty = true;
      };
      lab.appendChild(s);
      box.appendChild(lab);
    });
  }

  // ---- TRAINING tab
  function drawTrain(b) {
    $('trainFor').textContent = b ? 'for ' + b.name : '';
    fill($('tOpp'), [['EASY', 'CPU Easy'], ['NORMAL', 'CPU Normal'], ['HARD', 'CPU Pro'], ['LEGEND', 'CPU Legend']].concat(
      A.brains().map(function (e) { return ['B:' + e.id, 'checkoAI ' + e.name + (e.id === sel ? ' (itself)' : '')]; })));
    $('bTrain').disabled = $('bBench').disabled = !b;
  }

  // ---- DATA SETS tab
  function drawSets(b) {
    var box = $('sets');
    box.innerHTML = '';
    var sets = A.dataSets();
    if (!sets.some(function (x) { return x.id === setSel; })) setSel = sets.length ? sets[0].id : '';
    if (!sets.length) box.appendChild(el('div', 'muted', A.hasCloud() ? 'no data set yet (' + A.dataState() + ')' : 'no cloud configured'));
    var cur = null;
    sets.forEach(function (x) {
      if (x.id === setSel) cur = x;
      var row = el('label', 'set' + (x.id === setSel ? ' sel' : ''));
      var r = el('input');
      r.type = 'radio'; r.name = 'set'; r.checked = x.id === setSel;
      r.onchange = function () { setSel = x.id; confirmKey = ''; dirty = true; };
      row.appendChild(r);
      row.appendChild(el('b', null, x.name + (x.local ? ' *' : '')));
      row.appendChild(el('span', 'muted small', x.chunks + ' chunks · ' + x.samples + ' decisions · ' + x.presses + ' presses · ' + x.matches + ' matches · ' +
        x.teamSize + ' a side · ' + when(x.updated) + (x.F !== A.F ? ' · other inputs: record again' : '')));
      box.appendChild(row);
    });
    var miss = cur ? A.dataMissing(cur.id) : 0;
    var rs = $('bResend');
    rs.className = miss ? '' : 'hidden';
    rs.textContent = 'Resend unsaved chunks (' + miss + ')';
    $('bDelSet').textContent = confirmKey === 'dset' ? 'Press again to delete' : 'Delete set';
    $('bDelSet').disabled = !cur;
    // the record target: a new set or one of these
    fill($('rSet'), [['', 'new data set']].concat(sets.map(function (x) { return [x.id, 'add to: ' + x.name]; })));
    $('rName').style.display = $('rSet').value ? 'none' : '';
    // learning: for the selected brain (AIMA-AC 1.2 only)
    var isOpt = !!b && b.algo === 'OPT';
    $('learnFor').textContent = cur && b ? b.name + ' <- "' + cur.name + '"' : '';
    $('learnOpt').classList.toggle('hidden', !isOpt);
    $('bLearn').disabled = !b || !cur || isOpt;
    var lr = cur && b && !isOpt ? A.learnt(b, cur.id) : null;
    $('learnt').textContent = cur && b && !isOpt ? (lr ? lr.passes.toFixed(3) + ' passes · ' + lr.chunks + ' / ' + cur.chunks + ' chunks learnt' +
      (lr.next ? ' · goes on from chunk ' + (lr.next + 1) : '') : 'nothing learnt from this set yet') : '';
  }

  // ---- charts (canvas, no library). Points: [{ n, r, w, d, l, gf, ga }] (sums over n matches), xs: the match number at
  // each point's end. Three charts: reward per match (with its trend), results (win / draw / loss share), goals per match
  var C_R = '#c084fc', C_W = '#22c55e', C_D = '#475569', C_L = '#ef4444', C_GF = '#38bdf8', C_GA = '#f97316';
  var PAD = { l: 36, r: 8, t: 8, b: 18 };
  function charts() {
    var box = el('div', 'charts');
    box._c = [['Reward per match', 'higher = better play', [['average', C_R], ['trend', C_R]]], ['Results', 'win · draw · loss', [['win', C_W], ['draw', C_D], ['loss', C_L]]],
      ['Goals per match', 'scored · conceded', [['scored', C_GF], ['conceded', C_GA]]]].map(function (t) {
      var w = el('div', 'chart'), h = el('div', 'ctitle'), lg = el('div', 'legend');
      h.appendChild(el('b', null, t[0]));
      w._note = h.appendChild(el('span', 'muted small', t[1]));
      w.appendChild(h);
      w._cv = w.appendChild(document.createElement('canvas'));
      t[2].forEach(function (k, i) { var s = lg.appendChild(el('span', null, k[0])); s.style.setProperty('--c', k[1]); if (t[0] === 'Reward per match' && !i) s.className = 'faint'; });
      w.appendChild(lg);
      box.appendChild(w);
      return w;
    });
    return box;
  }
  function per(p, k) { return p.n ? p[k] / p.n : 0; }
  // first third v last third of the matches (weighted by matches): "a -> b"
  function change(pts, f, fmt) {
    var n = pts.length, k = Math.max(1, Math.floor(n / 3)), a = 0, an = 0, b = 0, bn = 0, i;
    for (i = 0; i < k; i++) { a += f(pts[i]) * pts[i].n; an += pts[i].n; }
    for (i = n - k; i < n; i++) { b += f(pts[i]) * pts[i].n; bn += pts[i].n; }
    return n < 3 ? '' : fmt(a / an) + ' → ' + fmt(b / bn);
  }
  function drawCharts(box, pts, xs) {
    var c = box._c, r1 = function (v) { return (Math.round(v * 10) / 10).toFixed(1); };
    var rew = pts.map(function (p) { return per(p, 'r'); });
    lineChart(c[0]._cv, xs, [{ v: rew, c: C_R, trend: true }], r1);
    c[0]._note.textContent = change(pts, function (p) { return per(p, 'r'); }, r1) || 'higher = better play';
    stackChart(c[1]._cv, xs, pts);
    c[1]._note.textContent = change(pts, function (p) { return per(p, 'w'); }, pct).replace(/^(.)/, 'wins $1') || 'win · draw · loss';
    lineChart(c[2]._cv, xs, [{ v: pts.map(function (p) { return per(p, 'gf'); }), c: C_GF }, { v: pts.map(function (p) { return per(p, 'ga'); }), c: C_GA }], r1, true);
    c[2]._note.textContent = pts.length >= 3 ? 'difference ' + change(pts, function (p) { return per(p, 'gf') - per(p, 'ga'); }, function (v) { return (v > 0 ? '+' : '') + r1(v); }) : 'scored · conceded';
  }
  function canvas(cv) {
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 150;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.font = '10px system-ui, sans-serif';
    return { g: g, w: w, h: h, pw: w - PAD.l - PAD.r, ph: h - PAD.t - PAD.b };
  }
  // the grid (3 levels), y labels, and the first / last match number under the x axis
  function frame(k, lo, hi, xs, yfmt) {
    var g = k.g;
    g.strokeStyle = '#24324d'; g.fillStyle = '#8a9bb8'; g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (var i = 0; i <= 2; i++) {
      var v = lo + (hi - lo) * i / 2, y = Math.round(PAD.t + k.ph * (1 - i / 2)) + 0.5;
      g.beginPath(); g.moveTo(PAD.l, y); g.lineTo(k.w - PAD.r, y); g.stroke();
      g.fillText(yfmt(v), PAD.l - 4, y);
    }
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left'; g.fillText(String(xs.length ? xs[0] : ''), PAD.l, k.h - 4);
    g.textAlign = 'right'; g.fillText(xs.length ? xs[xs.length - 1] + ' matches' : '', k.w - PAD.r, k.h - 4);
  }
  function xAt(k, i, n) { return PAD.l + k.pw * (n > 1 ? i / (n - 1) : 0.5); }
  // series: [{ v: [numbers], c: colour, trend: also its smoothed line }]; zero: the axis starts at 0
  function lineChart(cv, xs, series, yfmt, zero) {
    var k = canvas(cv), g = k.g, lo = Infinity, hi = -Infinity, n = xs.length;
    series.forEach(function (s) { s.v.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; }); });
    if (!n) return;
    if (zero) lo = Math.min(0, lo);
    if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
    var m = (hi - lo) * 0.08; hi += m; if (!zero) lo -= m;
    frame(k, lo, hi, xs, yfmt);
    var yAt = function (v) { return PAD.t + k.ph * (1 - (v - lo) / (hi - lo)); };
    function path(v, c, w, a) {
      g.globalAlpha = a; g.strokeStyle = g.fillStyle = c; g.lineWidth = w;
      if (v.length === 1) { g.beginPath(); g.arc(xAt(k, 0, 1), yAt(v[0]), 3, 0, 7); g.fill(); g.globalAlpha = 1; return; }
      g.beginPath();
      for (var i = 0; i < v.length; i++) { var x = xAt(k, i, v.length), y = yAt(v[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.globalAlpha = 1;
    }
    series.forEach(function (s) {
      if (!s.trend || n < 4) { path(s.v, s.c, 2, 1); return; }
      // the points thin, their moving average (over about a sixth of the run) thick: the trend through the noise
      path(s.v, s.c, 1, 0.35);
      var w = Math.max(2, Math.round(n / 6)), t = [], i, j;
      for (i = 0; i < n; i++) {
        var a = 0, c = 0;
        for (j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { a += s.v[j]; c++; }
        t.push(a / c);
      }
      path(t, s.c, 2.5, 1);
    });
  }
  // results: one bar per point, its wins (bottom), draws, losses as shares; a line at 50%
  function stackChart(cv, xs, pts) {
    var k = canvas(cv), g = k.g, n = pts.length;
    frame(k, 0, 1, xs, pct);
    if (!n) return;
    var bw = Math.max(1, k.pw / n - (n > 30 ? 1 : 2));
    for (var i = 0; i < n; i++) {
      var p = pts[i], x = PAD.l + k.pw * i / n + (k.pw / n - bw) / 2, y = PAD.t + k.ph;
      [[p.w, C_W], [p.d, C_D], [p.l, C_L]].forEach(function (q) {
        var h = p.n ? k.ph * q[0] / p.n : 0;
        g.fillStyle = q[1]; g.fillRect(x, y - h, bw, h); y -= h;
      });
    }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(PAD.l, PAD.t + k.ph / 2 + 0.5); g.lineTo(k.w - PAD.r, PAD.t + k.ph / 2 + 0.5); g.stroke();
    g.setLineDash([]);
  }
  // a session's points (A.series) as the charts' input: the match number at the end of each point
  function sesPoints(S) {
    var s = A.series(S), pts = s ? s.b.filter(function (p) { return p.n > 0; }) : [], xs = [], m = 0;
    pts.forEach(function (p) { m += p.n; xs.push(m); });
    return { pts: pts, xs: xs, size: s ? s.size : 1 };
  }

  // ---- JOBS tab: training sessions and data jobs, newest first
  function jobCard(kind, x) {
    var c = el('div', 'job ' + x.state);
    var head = el('div', 'jhead');
    head.appendChild(el('b', null, kind === 'ses' ? '#' + x.id + ' ' + (x.cfg.bench ? 'benchmark ' : 'training ') + (x.b ? x.b.name : '?') + ' v ' + (x.oppLabel || x.cfg.opp) :
      (x.kind === 'rec' ? 'Record "' + x.setName + '"' : 'Learn ' + (x.b ? x.b.name : '') + ' <- "' + x.setName + '"')));
    head.appendChild(el('span', 'pill ' + x.state, x.state));
    c.appendChild(head);
    if (kind === 'ses' || x.kind === 'learn') {
      var bar = el('div', 'bar'), f = el('i');
      bar.appendChild(f);
      c.appendChild(bar);
      c._bar = f;
    }
    if (kind === 'ses') { c._charts = charts(); c._charts.classList.add('hidden'); c.appendChild(c._charts); }
    var pre = el('pre', 'jtext');
    c.appendChild(pre);
    c._pre = pre;
    c._x = x; c._kind = kind;
    var acts = el('div', 'row');
    if (live(x)) acts.appendChild(button('Stop', 'danger', function () { if (kind === 'ses') A.stopSession(x.id); else A.stopJob(x.id); dirty = true; }));
    else acts.appendChild(button('Remove', '', function () { if (kind === 'ses') A.removeSession(x.id); else A.removeJob(x.id); dirty = true; }));
    if (kind === 'ses') acts.appendChild(button(open[x.id] ? 'Summary' : 'Full stats', '', function () { open[x.id] = !open[x.id]; dirty = true; }));
    acts.appendChild(button('Copy', '', function () { copy(pre.textContent); }));
    c.appendChild(acts);
    liveText(c);
    return c;
  }
  function liveText(c) {
    var x = c._x, t;
    if (c._kind === 'ses') {
      t = A.sessionText(x, !!open[x.id]);
      var played = x.done + (A.playing() === x ? Math.min(1, x.mins / 90) : 0);
      if (c._bar) c._bar.style.width = (x.cfg.matches ? Math.min(100, played * 100 / x.cfg.matches) : (played - x.done) * 100) + '%';
      t = x.done + ' / ' + (x.cfg.matches || '∞') + ' matches' + (A.playing() === x ? ' · now ' + Math.floor(x.mins) + "'" : '') + '\n' + t;
    } else {
      t = A.jobText(x);
      if (c._bar) c._bar.style.width = (x.total ? Math.min(100, x.steps * 100 / x.total) : 0) + '%';
    }
    if (c._pre.textContent !== t) c._pre.textContent = t;
    if (c._charts) liveCharts(c);
  }
  // a session's charts, redrawn when a match was added (or the page was resized); from 2 matches on
  function liveCharts(c) {
    var s = sesPoints(c._x), last = s.pts[s.pts.length - 1];
    var key = s.pts.length + ':' + s.size + ':' + (last ? last.n : 0) + ':' + c._charts.clientWidth;
    if (key === c._chartKey) return;
    c._chartKey = key;
    var show = s.xs.length && s.xs[s.xs.length - 1] >= 2;
    c._charts.classList.toggle('hidden', !show);
    if (show && c._charts.clientWidth) drawCharts(c._charts, s.pts, s.xs);
    if (show) c._charts.title = s.size > 1 ? 'each point: the average of ' + s.size + ' matches' : 'each point: one match';
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { msg('Copied.'); }, function () {});
  }
  function allJobs() {
    var all = [];
    A.sessions().forEach(function (S) { all.push(['ses', S, S.started || 0]); });
    A.dataJobs().forEach(function (J) { all.push(['job', J, J.started || 0]); });
    all.sort(function (a, b) { return b[2] - a[2]; });
    return all;
  }
  function drawJobs() {
    var box = $('jobs');
    box.innerHTML = '';
    var all = allJobs();
    if (!all.length) box.appendChild(el('div', 'muted', 'nothing yet: start a training (Training tab) or a recording / learning run (Data sets tab)'));
    all.forEach(function (j) { var c = box.appendChild(jobCard(j[0], j[1])); if (c._charts) liveCharts(c); });
    $('bStopAll').disabled = !all.some(function (j) { return live(j[1]); });
  }
  function drawBusy() {
    var n = allJobs().filter(function (j) { return live(j[1]); }).length;
    $('jobCount').textContent = n ? String(n) : '';
    $('busy').textContent = A.busy() ? '● working' + (NS.Debug.load() < 1 ? ' at ' + Math.round(NS.Debug.load() * 100) + '% CPU' : '') : '';
  }

  // ---- STATS tab: the brain's numbers and history
  function drawStats(b) {
    var box = $('stats'), ul = $('hist');
    box.innerHTML = ''; ul.innerHTML = '';
    $('statName').textContent = b ? b.name : '';
    if (!b) return;
    var s = b.st, w = A.work(b), f = A.fmtOps, opt2 = b.algo === 'OPT', sy = opt2 ? null : A.style(b);
    var rows = [
      ['algorithm', A.algoName(b)],
      opt2 ? ['network', 'options scorer 30-32-16-1 + value 12-16-1  (' + NS.AimaOpt.NP.toLocaleString() + ' parameters)']
        : ['network', b.cfg.size + '  ' + A.F + '-' + b.H1 + '-' + b.H2 + '-' + A.NOUT + '  (' + b.NP.toLocaleString() + ' parameters)'],
      opt2 ? ['choices', optPicks(s)] : null,
      opt2 ? ['lessons', String(NS.AimaOpt.lessons(b))] : null,
      ['matches', s.matches + '  (' + s.w + '-' + s.d + '-' + s.l + ')  trained ' + (s.trainMatches || 0)],
      ['goals', s.goals + '  (team ' + s.gf + '-' + s.ga + ')'],
      ['passes', s.passes + '  (' + (s.passes ? pct(Math.min(1, s.passOk / s.passes)) : '-') + ')'],
      ['shots', s.shots + '  (on target ' + s.onTarget + ')'],
      ['updates', 'RL ' + s.rl + '  /  copy ' + s.im],
      ['decisions', s.decisions + '  (own ' + (s.decisions ? pct(s.modelDec / s.decisions) : '-') + ')'],
      opt2 ? null : ['Legend help', pct(b.help())],
      opt2 ? null : ['style', 'pass ' + pct(sy.pass) + ' · shoot ' + pct(sy.shoot) + ' · sprint ' + pct(sy.sprint) + ' · carry ' + pct(sy.carry)],
      ['work', w.measured ? f(w.perSec) + ' /s' : '-'],
      ['memory', (Math.round(w.memBytes / 104857.6) / 10) + ' MB'],
      ['created', when(b.created)],
      ['saved', when(b.saved)]
    ].filter(function (r) { return !!r; });
    var data = b.data || {};
    Object.keys(data).forEach(function (k) {
      var d = data[k];
      rows.push(['data "' + d.name + '"', d.passes.toFixed(3) + ' passes · ' + d.chunks + ' chunks · ' + d.steps + ' steps' + (d.next ? ' · next chunk ' + (d.next + 1) : '')]);
    });
    rows.forEach(function (r) { box.appendChild(el('span', 'k', r[0])); box.appendChild(el('span', 'v', r[1])); });
    drawProg(b);
    b.hist.slice(-60).reverse().forEach(function (h) {
      var li = el('li');
      li.appendChild(el('span', 'muted', new Date(h.t).toLocaleString() + '  '));
      li.appendChild(document.createTextNode(h.k + (h.d ? ' ' + JSON.stringify(h.d) : '')));
      ul.appendChild(li);
    });
  }
  // the brain's improvement: its blocks of A.PROG_N matches (b.prog, saved with it), trainings and benchmarks apart
  // (a training explores, so its numbers sit lower than a benchmark's of the same brain)
  function drawProg(b) {
    var box = $('prog'), prog = b.prog || [];
    box.innerHTML = '';
    var has = { train: prog.some(function (p) { return !p.bench; }), bench: prog.some(function (p) { return p.bench; }) };
    if (!has[progKind]) progKind = has.train || !has.bench ? 'train' : 'bench';
    var pts = prog.filter(function (p) { return !!p.bench === (progKind === 'bench'); });
    var row = el('div', 'row');
    [['train', 'Training'], ['bench', 'Benchmark']].forEach(function (k) {
      var n = prog.filter(function (p) { return !!p.bench === (k[0] === 'bench'); }).length;
      var bt = button(k[1] + ' (' + n + ')', progKind === k[0] ? 'primary' : '', function () { progKind = k[0]; dirty = true; });
      bt.disabled = !n;
      row.appendChild(bt);
    });
    box.appendChild(row);
    if (!pts.length) {
      box.appendChild(el('p', 'muted small', 'Nothing yet. A block is added after every ' + A.PROG_N.toLocaleString() + ' matches of one training or ' +
        'benchmark (Training tab: Matches ' + A.PROG_N.toLocaleString() + ' or more, or ∞). Shorter runs are not kept: too few matches to be accurate.'));
      return;
    }
    var ch = box.appendChild(charts());
    var xs = pts.map(function (p) { return p.at; });
    drawCharts(ch, pts, xs);
    ch.title = 'each point: ' + A.PROG_N.toLocaleString() + ' matches; along the bottom: the brain\'s training matches so far';
    var last = pts[pts.length - 1];
    box.appendChild(el('p', 'muted small', pts.length + ' block' + (pts.length > 1 ? 's' : '') + ' of ' + A.PROG_N.toLocaleString() + ' matches · latest ' +
      when(last.t) + ' v ' + (last.opp || '?') + ': ' + last.w + '-' + last.d + '-' + last.l + ', reward ' + (Math.round(last.r / last.n * 10) / 10) + ' per match'));
  }
  // an OPT brain's choices per kind of option, and the share that were Legend's own
  function optPicks(s) {
    var names = ['dribble', 'clear', 'shot', 'pass', 'one-two', 'through', 'lofted through', 'cross', 'long'], p = s.optPick || [], n = 0, out = [];
    for (var i = 0; i < names.length; i++) n += p[i] || 0;
    for (i = 0; i < names.length; i++) if (p[i]) out.push(names[i] + ' ' + Math.round(p[i] * 100 / n) + '%');
    return n ? out.join(' · ') + '  (same as Legend ' + Math.round((s.optSame || 0) * 100 / n) + '%)' : '-';
  }

  // ---- drawing: the shown tab when something changed shape, else only the live texts. A select or box being used
  // is never redrawn under the mouse (it waits until it loses focus)
  function shapeKey() {
    var k = [tab, sel, setSel, confirmKey, A.cloud, A.account(), A.dataState(), A.activeId(), loading, JSON.stringify(open)];
    A.brains().forEach(function (e) { k.push(e.id + e.name + e.size + e.matches + A.inUse(e.id)); });
    if (tab === 'data') A.dataSets().forEach(function (x) { k.push(x.id + x.chunks + x.name + A.dataMissing(x.id)); });
    if (tab === 'jobs') allJobs().forEach(function (j) { k.push(j[0] + j[1].id + j[1].state); });
    var b = A.loadedBrain(sel);
    if (b && (tab === 'brains' || tab === 'stats')) k.push(b.saved, JSON.stringify(b.cfg));
    return k.join('|');
  }
  function busyField() {
    var a = document.activeElement;
    return !!a && (a.tagName === 'SELECT' || a.tagName === 'INPUT') && !!a.closest && !!a.closest('#brainOpts, #selActs, #account');
  }
  function draw() {
    var b = brain();
    drawAccount();
    drawPicker();
    if (tab === 'brains') { drawBrains(); drawSelected(b); drawOpts(b); }
    else if (tab === 'train') drawTrain(b);
    else if (tab === 'data') drawSets(b);
    else if (tab === 'jobs') drawJobs();
    else drawStats(b);
    drawBusy();
  }
  function tick() {
    var k = shapeKey();
    if ((dirty || k !== shape) && !busyField()) { dirty = false; shape = k; draw(); return; }
    if (tab === 'jobs') {
      var cards = $('jobs').children;
      for (var i = 0; i < cards.length; i++) if (cards[i]._x) liveText(cards[i]);
    }
    drawBusy();
  }

  // ---- actions
  function wire() {
    var bs = $('tabs').querySelectorAll('[data-tab]');
    for (var i = 0; i < bs.length; i++) bs[i].onclick = function () { showTab(this.getAttribute('data-tab')); tick(); };
    $('brainSel').onchange = function () { pick(this.value); tick(); };
    window.addEventListener('resize', function () { if (tab === 'stats') dirty = true; }); // (the charts fit the new width)

    // CPU load (kept in this browser)
    var ld = +stored('load') || 100;
    if (LOADS.indexOf(ld) < 0) ld = 100;
    fill($('cpuLoad'), LOADS.map(function (v) { return [v, v + '%' + (v === 100 ? ' (no limit)' : '')]; }), ld);
    NS.Debug.setLoad(ld / 100);
    $('cpuLoad').onchange = function () { NS.Debug.setLoad(+this.value / 100); store('load', this.value); dirty = true; };

    // the match options (training, recording) and the data options
    var hours = opt('hours').map(function (v) { return [v, v ? String(v) : 'no limit']; });
    var matches = opt('matches').map(function (v) { return [v, v ? String(v) : '∞ (until stopped)']; });
    var sizes = opt('size').map(function (v) { return [v, String(v)]; });
    var stadiums = opt('stadium').map(function (v) { return [v, v]; });
    var lengths = opt('length').map(function (v) { return [v, String(v)]; });
    [['t', 10], ['r', 10]].forEach(function (p) {
      fill($(p[0] + 'Matches'), matches, p[1]);
      fill($(p[0] + 'Size'), sizes, 11);
      fill($(p[0] + 'Stadium'), stadiums, 'SMALL');
      fill($(p[0] + 'Length'), lengths, 3);
      fill($(p[0] + 'Hours'), hours, 0);
    });
    fill($('tOpp'), [['LEGEND', 'CPU Legend']], 'LEGEND');
    fill($('dPasses'), A.DT_PASSES.map(function (v) { return [v, String(v)]; }), 1);
    fill($('dWin'), A.DT_WIN.map(function (v) { return [v, String(v)]; }), 100);
    fill($('dRounds'), A.DT_ROUNDS.map(function (v) { return [v, v ? String(v) : '∞ (until stopped)']; }), 1);
    fill($('dHours'), hours, 0);
    $('rSet').onchange = function () { $('rName').style.display = this.value ? 'none' : ''; };

    $('bNew').onclick = function () {
      var b = A.create($('newName').value.trim().slice(0, 24) || 'checkoAI ' + (A.brains().length + 1), $('newAlgo').value);
      $('newName').value = '';
      pick(b.id);
      msg('Created ' + b.name + ' (' + A.algoName(b) + ')');
    };
    $('bSave').onclick = function () { var b = A.loadedBrain(sel); if (b) { A.saveBrain(b); msg('Saved ' + b.name + ' (cloud: ' + A.cloud + ')'); } };
    $('bReset').onclick = function () {
      var b = A.loadedBrain(sel);
      if (!b || !window.confirm(T('aima.confirm.reset'))) return;
      A.reset(b); msg(T('aima.done.reset')); dirty = true;
    };
    $('bLearn').onclick = function () {
      var b = A.loadedBrain(sel);
      if (!b || !setSel) { msg('Pick a brain and a data set first.', true); return; }
      // recorded sets hold sticks and buttons (AIMA-AC); an OPT brain learns Legend's choices during its training matches
      if (b.algo === 'OPT') { msg('An OPT 2.0 brain does not use data sets: it copies Legend inside its training matches. Use the Training tab.', true); return; }
      var J = A.startLearn({ brain: b.id, sets: [setSel], passes: num('dPasses'), win: num('dWin'), rounds: num('dRounds'), hours: num('dHours') });
      if (J) { msg('Learning started (Jobs tab).'); showTab('jobs'); } else msg('Cannot start: the brain is busy, the set has other inputs, or you are not signed in as the trainer.', true);
      dirty = true;
    };
    $('bResend').onclick = function () { msg(A.resendSet(setSel) ? 'Sending again...' : 'Nothing to send (sign in first).'); dirty = true; };
    $('bDelSet').onclick = function () {
      if (!setSel) return;
      if (confirmKey !== 'dset') { confirmKey = 'dset'; dirty = true; return; }
      confirmKey = '';
      msg(A.deleteSet(setSel) ? 'Data set deleted.' : 'A job is using it.');
      dirty = true;
    };
    $('bReloadSets').onclick = function () { A.loadDataIndex(); dirty = true; };
    $('bRecord').onclick = function () {
      var target = $('rSet').value;
      if (!target && !$('rName').value.trim()) { msg('Give the new data set a name.', true); $('rName').focus(); return; }
      var J = A.startRecord({ set: target, name: $('rName').value.trim(), matches: num('rMatches'), teamSize: num('rSize'), stadium: $('rStadium').value,
        duration: num('rLength'), hours: num('rHours') });
      if (J) { setSel = J.set; $('rName').value = ''; msg('Recording started (Jobs tab).'); showTab('jobs'); } else msg('Cannot record now.', true);
      dirty = true;
    };
    function startTrain(bench) {
      var b = A.loadedBrain(sel);
      if (!b) { msg('The brain is still loading.', true); return; }
      var S = A.startSession({ brain: b.id, opp: $('tOpp').value, matches: num('tMatches'), teamSize: num('tSize'), stadium: $('tStadium').value,
        duration: num('tLength'), hours: num('tHours'), bench: !!bench });
      if (S) { msg(bench ? 'Benchmark: ' + b.name + ' plays without learning.' : 'Training ' + b.name + '.'); showTab('jobs'); }
      else msg('Cannot start a training now.', true);
      dirty = true;
    }
    $('bTrain').onclick = function () { startTrain(false); };
    $('bBench').onclick = function () { startTrain(true); };
    $('bStopAll').onclick = function () {
      A.stopTraining();
      A.dataJobs().forEach(function (J) { if (live(J)) A.stopJob(J.id); });
      dirty = true;
    };
    // leaving with a job running: the browser asks first (the brain is saved every minute anyway)
    window.addEventListener('beforeunload', function (e) {
      if (!A.busy()) return;
      A.dataJobs().forEach(function (J) { if (J.b) A.saveBrain(J.b); });
      e.preventDefault();
      e.returnValue = '';
    });
  }

  var actx = null;
  NS.Trainer = {
    // a short beep when a job is done (the game's chime is part of its sound engine, not loaded here)
    beep: function () {
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        var o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = 880; g.gain.value = 0.08;
        o.connect(g); g.connect(actx.destination);
        o.start(); o.stop(actx.currentTime + 0.25);
      } catch (e) {}
    }
  };

  function init() {
    NS.I18n.setLang('en');
    var st = NS.Storage.load();
    // nothing is drawn or heard: the lightest bodies, no sound
    st.soundEnabled = false; st.crowdChants = false; st.playerModel = 'CLASSIC'; st.playerDetail = 'LOW';
    World.settings = st;
    NS.Assets.initGeometries();
    // the trainer's own tool: the trainer's screens; the cloud itself only takes writes from the trainer's Google account
    A.init({ profile: { id: 'trainer-page', name: 'imad' }, standalone: true });
    NS.Match.syncRosters();
    if (A.hasCloud()) A.loadDataIndex();
    // (the jobs report every slice: the page reads them on its own beat instead, tick below)
    A.onTrain = null;
    A.onData = null;
    $('ver').textContent = 'v' + NS.VERSION;
    wire();
    showTab(stored('tab') || 'brains');
    draw();
    setInterval(tick, 500);
  }
  init();
})(window.RS6 = window.RS6 || {});
