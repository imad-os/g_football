/* trainer.html: checkoAI's training without the game around it. Everything here goes through the game's own NS.Aima
 * (brains, cloud, learning from data, recording, training matches through NS.Debug), so the page follows the game's
 * updates by itself; it only draws the controls. The page keeps training in a background tab (NS.Debug's worker beat). */
(function (NS) {
  'use strict';

  var A = NS.Aima, World = NS.World, T = NS.I18n.t;
  var $ = function (id) { return document.getElementById(id); };
  var sel = '';           // the brain shown and trained (default: the active one)
  var setSel = '';        // the data set
  var confirmKey = '', open = {}, shape = '', dirty = true;

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
  function fill(select, items, value) {
    select.innerHTML = '';
    items.forEach(function (it) {
      var o = el('option', null, it[1]);
      o.value = String(it[0]);
      select.appendChild(o);
    });
    if (value !== undefined) select.value = String(value);
  }
  function opt(key) { for (var i = 0; i < A.TR_OPTS.length; i++) if (A.TR_OPTS[i][0] === key) return A.TR_OPTS[i][1]; return []; }
  function num(id) { return +$(id).value; }
  function when(t) { return t ? new Date(t).toLocaleString() : '-'; }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function live(x) { return x.state === 'running' || x.state === 'loading'; }

  // ---- the brain shown (loaded from the cloud when needed)
  var loading = '';
  function brain() {
    var list = A.brains();
    if (!sel || !list.some(function (e) { return e.id === sel; })) sel = A.activeId();
    var b = A.loadedBrain(sel);
    if (b || loading === sel) return b;
    loading = sel;
    A.getBrain(sel).then(function () { loading = ''; dirty = true; }, function () { loading = ''; msg('Could not load that brain.', true); });
    return null;
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

  // ---- the brains
  function name() { return $('brainName').value.trim().slice(0, 24); }
  function drawBrains() {
    var box = $('brains');
    box.innerHTML = '';
    A.brains().forEach(function (e) {
      var id = e.id, act = id === A.activeId(), used = A.inUse(id);
      var row = el('div', 'brow' + (id === sel ? ' sel' : ''));
      var head = el('div', 'bhead');
      head.appendChild(el('b', null, (act ? '★ ' : '') + e.name));
      head.appendChild(el('span', 'muted small', e.size + ' · ' + (e.matches || 0) + ' matches' + (used ? ' · in use' : '')));
      head.onclick = function () { sel = id; confirmKey = ''; dirty = true; };
      row.appendChild(head);
      if (id === sel) {
        var bt = el('div', 'row');
        if (!act) bt.appendChild(button('Use in the game', 'primary', function () {
          A.use(id).then(function (b) { msg(b.name + ' is now the active brain.'); dirty = true; }, function () { msg('Could not load it.', true); });
        }));
        bt.appendChild(button('Clone', '', function () {
          A.clone(id, name() || e.name + ' 2').then(function (b) { sel = b.id; msg('Cloned: ' + b.name); dirty = true; });
        }));
        bt.appendChild(button('Rename', '', function () {
          if (!name()) { msg('Type the new name first.', true); return; }
          A.rename(id, name()).then(function () { msg('Renamed.'); dirty = true; });
        }));
        if (!act && !used && A.brains().length > 1) bt.appendChild(button(confirmKey === 'del' + id ? 'Press again to delete' : 'Delete', 'danger', function () {
          if (confirmKey !== 'del' + id) { confirmKey = 'del' + id; dirty = true; return; }
          confirmKey = '';
          if (A.remove(id)) { sel = A.activeId(); msg('Deleted.'); } else msg('It is in use.', true);
          dirty = true;
        }));
        row.appendChild(bt);
      }
      box.appendChild(row);
    });
  }

  function drawOpts(b) {
    var box = $('brainOpts');
    box.innerHTML = '';
    $('setName').textContent = b ? b.name : '';
    if (!b) { box.appendChild(el('div', 'muted', 'loading...')); return; }
    A.OPTS.forEach(function (o) {
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

  // ---- data sets
  function drawSets(b) {
    var box = $('sets');
    box.innerHTML = '';
    var sets = A.dataSets();
    if (!sets.some(function (x) { return x.id === setSel; })) setSel = sets.length ? sets[0].id : '';
    if (!sets.length) box.appendChild(el('div', 'muted', A.hasCloud() ? 'no data set yet (' + A.dataState() + ')' : 'no cloud configured'));
    sets.forEach(function (x) {
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
    var cur = null;
    sets.forEach(function (x) { if (x.id === setSel) cur = x; });
    var lr = cur && b ? A.learnt(b, cur.id) : null;
    $('learnt').textContent = cur && b ? b.name + ': ' + (lr ? lr.passes + ' passes · ' + lr.chunks + ' / ' + cur.chunks + ' chunks learnt' +
      (lr.next ? ' · goes on from chunk ' + (lr.next + 1) : '') : 'nothing learnt from this set yet') : '';
    var miss = cur ? A.dataMissing(cur.id) : 0;
    var rs = $('bResend');
    rs.className = miss ? '' : 'hidden';
    rs.textContent = 'Resend unsaved chunks (' + miss + ')';
    $('bDelSet').textContent = confirmKey === 'dset' ? 'Press again to delete' : 'Delete set';
    // the record target: a new set or one of these
    var rv = $('rSet').value;
    fill($('rSet'), [['', 'new data set']].concat(sets.map(function (x) { return [x.id, 'add to: ' + x.name]; })), rv);
    $('rName').style.display = $('rSet').value ? 'none' : '';
  }

  // ---- jobs: training sessions and data jobs, newest first
  function jobCard(kind, x) {
    var c = el('div', 'job ' + x.state);
    var head = el('div', 'jhead');
    head.appendChild(el('b', null, kind === 'ses' ? '#' + x.id + ' training ' + (x.b ? x.b.name : '?') + ' v ' + (x.oppLabel || x.cfg.opp) :
      (x.kind === 'rec' ? 'Record "' + x.setName + '"' : 'Learn ' + (x.b ? x.b.name : '') + ' <- "' + x.setName + '"')));
    head.appendChild(el('span', 'pill ' + x.state, x.state));
    c.appendChild(head);
    if (kind === 'ses') {
      var bar = el('div', 'bar'), f = el('i');
      bar.appendChild(f);
      c.appendChild(bar);
      c._bar = f;
    } else if (x.kind === 'learn') {
      var bar2 = el('div', 'bar'), f2 = el('i');
      bar2.appendChild(f2);
      c.appendChild(bar2);
      c._bar = f2;
    }
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
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { msg('Copied.'); }, function () {});
  }
  function drawJobs() {
    var box = $('jobs');
    box.innerHTML = '';
    var all = [];
    A.sessions().forEach(function (S) { all.push(['ses', S, S.started || 0]); });
    A.dataJobs().forEach(function (J) { all.push(['job', J, J.started || 0]); });
    all.sort(function (a, b) { return b[2] - a[2]; });
    if (!all.length) box.appendChild(el('div', 'muted', 'nothing running'));
    all.forEach(function (j) { box.appendChild(jobCard(j[0], j[1])); });
    $('busy').textContent = A.busy() ? '● working' : '';
  }

  // ---- the brain's numbers and history
  function drawStats(b) {
    var box = $('stats'), ul = $('hist');
    box.innerHTML = ''; ul.innerHTML = '';
    $('statName').textContent = b ? b.name : '';
    if (!b) return;
    var s = b.st, w = A.work(b), f = A.fmtOps, sy = A.style(b);
    var rows = [
      ['network', b.cfg.size + '  ' + A.F + '-' + b.H1 + '-' + b.H2 + '-' + A.NOUT + '  (' + b.NP.toLocaleString() + ' parameters)'],
      ['matches', s.matches + '  (' + s.w + '-' + s.d + '-' + s.l + ')  trained ' + (s.trainMatches || 0)],
      ['goals', s.goals + '  (team ' + s.gf + '-' + s.ga + ')'],
      ['passes', s.passes + '  (' + (s.passes ? pct(Math.min(1, s.passOk / s.passes)) : '-') + ')'],
      ['shots', s.shots + '  (on target ' + s.onTarget + ')'],
      ['updates', 'RL ' + s.rl + '  /  copy ' + s.im],
      ['decisions', s.decisions + '  (own ' + (s.decisions ? pct(s.modelDec / s.decisions) : '-') + ')'],
      ['Legend help', pct(b.help())],
      ['style', 'pass ' + pct(sy.pass) + ' · shoot ' + pct(sy.shoot) + ' · sprint ' + pct(sy.sprint) + ' · carry ' + pct(sy.carry)],
      ['work', w.measured ? f(w.perSec) + ' /s' : '-'],
      ['memory', (Math.round(w.memBytes / 104857.6) / 10) + ' MB'],
      ['created', when(b.created)],
      ['saved', when(b.saved)]
    ];
    var data = b.data || {};
    Object.keys(data).forEach(function (k) {
      var d = data[k];
      rows.push(['data "' + d.name + '"', d.passes + ' passes · ' + d.chunks + ' chunks · ' + d.steps + ' steps' + (d.next ? ' · next chunk ' + (d.next + 1) : '')]);
    });
    rows.forEach(function (r) { box.appendChild(el('span', 'k', r[0])); box.appendChild(el('span', 'v', r[1])); });
    b.hist.slice(-30).reverse().forEach(function (h) {
      var li = el('li');
      li.appendChild(el('span', 'muted', new Date(h.t).toLocaleString() + '  '));
      li.appendChild(document.createTextNode(h.k + (h.d ? ' ' + JSON.stringify(h.d) : '')));
      ul.appendChild(li);
    });
  }

  // ---- drawing: the whole page when something changed shape, else only the live texts
  function shapeKey() {
    var k = [sel, setSel, confirmKey, A.cloud, A.account(), A.dataState(), A.activeId(), loading, JSON.stringify(open)];
    A.brains().forEach(function (e) { k.push(e.id + e.name + e.size + e.matches + A.inUse(e.id)); });
    A.dataSets().forEach(function (x) { k.push(x.id + x.chunks + x.name + A.dataMissing(x.id)); });
    A.sessions().forEach(function (S) { k.push('s' + S.id + S.state); });
    A.dataJobs().forEach(function (J) { k.push('j' + J.id + J.state); });
    var b = A.loadedBrain(sel);
    if (b) k.push(b.saved, JSON.stringify(b.cfg));
    return k.join('|');
  }
  function draw() {
    var b = brain();
    drawAccount();
    drawBrains();
    drawOpts(b);
    drawSets(b);
    drawJobs();
    drawStats(b);
    var ov = $('tOpp').value;
    fill($('tOpp'), [['EASY', 'CPU Easy'], ['NORMAL', 'CPU Normal'], ['HARD', 'CPU Hard'], ['LEGEND', 'CPU Legend']].concat(
      A.brains().map(function (e) { return ['B:' + e.id, 'checkoAI ' + e.name]; })), ov || 'NORMAL');
  }
  function tick() {
    var k = shapeKey();
    if (dirty || k !== shape) { dirty = false; shape = k; draw(); return; }
    var cards = $('jobs').children;
    for (var i = 0; i < cards.length; i++) if (cards[i]._x) liveText(cards[i]);
    $('busy').textContent = A.busy() ? '● working' : '';
  }

  // ---- actions
  function wire() {
    fill($('dPasses'), A.DT_PASSES.map(function (v) { return [v, String(v)]; }), 1);
    fill($('dWin'), A.DT_WIN.map(function (v) { return [v, String(v)]; }), 100);
    fill($('dRounds'), A.DT_ROUNDS.map(function (v) { return [v, v ? String(v) : '∞ (until stopped)']; }), 1);
    var hours = opt('hours').map(function (v) { return [v, v ? String(v) : 'no limit']; });
    fill($('dHours'), hours, 0);
    fill($('tHours'), hours, 0);
    fill($('tMatches'), opt('matches').map(function (v) { return [v, v ? String(v) : '∞ (until stopped)']; }), 10);
    fill($('tSize'), opt('size').map(function (v) { return [v, String(v)]; }), 11);
    fill($('tStadium'), opt('stadium').map(function (v) { return [v, v]; }), 'CLASSIC');
    fill($('tLength'), opt('length').map(function (v) { return [v, String(v)]; }), 3);
    $('rSet').onchange = function () { $('rName').style.display = $('rSet').value ? 'none' : ''; };

    $('bNew').onclick = function () { var b = A.create(name() || 'checkoAI ' + (A.brains().length + 1)); sel = b.id; msg('Created ' + b.name); dirty = true; };
    $('bSave').onclick = function () { var b = A.loadedBrain(sel); if (b) { A.saveBrain(b); msg('Saved ' + b.name + ' (cloud: ' + A.cloud + ')'); } };
    $('bReset').onclick = function () {
      var b = A.loadedBrain(sel);
      if (!b || !window.confirm(T('aima.confirm.reset'))) return;
      A.reset(b); msg(T('aima.done.reset')); dirty = true;
    };
    $('bLearn').onclick = function () {
      var b = A.loadedBrain(sel);
      if (!b || !setSel) { msg('Pick a brain and a data set first.', true); return; }
      var J = A.startLearn({ brain: b.id, sets: [setSel], passes: num('dPasses'), win: num('dWin'), rounds: num('dRounds'), hours: num('dHours') });
      msg(J ? '' : 'Cannot start: the brain is busy, the set has other inputs, or you are not signed in as the trainer.', !J);
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
      if (!target && !$('rName').value.trim()) { msg('Give the new data set a name.', true); return; }
      var J = A.startRecord({ set: target, name: $('rName').value.trim(), matches: num('tMatches'), teamSize: num('tSize'), stadium: $('tStadium').value,
        duration: num('tLength'), hours: num('tHours') });
      if (J) { setSel = J.set; msg(''); } else msg('Cannot record now.', true);
      dirty = true;
    };
    $('bTrain').onclick = function () {
      var b = A.loadedBrain(sel);
      if (!b) return;
      var S = A.startSession({ brain: b.id, opp: $('tOpp').value, matches: num('tMatches'), teamSize: num('tSize'), stadium: $('tStadium').value,
        duration: num('tLength'), hours: num('tHours') });
      msg(S ? '' : 'Cannot start a training now.', !S);
      dirty = true;
    };
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
    draw();
    setInterval(tick, 500);
  }
  init();
})(window.RS6 = window.RS6 || {});
