/* Procedural low-poly assets: shared geometries, kit and pitch textures, player meshes. Everything is disposable. */
(function (NS) {
  'use strict';

  var geo = {};
  var jerseyCache = {};
  var limbCache = {};
  var HIP = 1.2;      // hip height: legs are about half the body, like a person
  var pitchTexture = null;
  var ballTextures = {};

  function hexToCss(hex) {
    var s = hex.toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }

  function initGeometries() {
    geo.torso = new THREE.BoxGeometry(0.82, 1.0, 0.48);
    geo.head = new THREE.BoxGeometry(0.5, 0.56, 0.5);
    geo.hair = new THREE.BoxGeometry(0.54, 0.2, 0.54);
    geo.limb = new THREE.BoxGeometry(0.27, 1.17, 0.29); // one box per leg: shorts, sock and boot are painted on it
    geo.arm = new THREE.BoxGeometry(0.2, 0.98, 0.2);    // sleeve and skin painted on it
    geo.card = new THREE.BoxGeometry(0.36, 0.5, 0.1); // booking card shown over the head
    geo.shadow = new THREE.CircleGeometry(0.85, 12);
    geo.shadow.rotateX(-Math.PI / 2);
    // controlled-player marker: an arrow above the head, pointing down at the player
    geo.arrow = new THREE.ConeGeometry(0.85, 1.5, 4);
    geo.arrow.rotateX(Math.PI);
    geo.ball = ballGeometry();
    geo.ballShadow = new THREE.CircleGeometry(NS.BALL_R * 1.15, 12);
    geo.ballShadow.rotateX(-Math.PI / 2);
    geo.trail = new THREE.SphereGeometry(NS.BALL_R * 0.8, 6, 4);
  }

  // ---- Polygons (Settings > Polygons): sides of the rounded bodies and of the ball; AUTO follows the quality tier ----
  var SIDES = { LOW: 6, MEDIUM: 8, HIGH: 12, ULTRA: 20 };
  var BALL_SEG = { LOW: [16, 12], MEDIUM: [24, 16], HIGH: [32, 24], ULTRA: [48, 32] };
  function detail() {
    var s = NS.World && NS.World.settings;
    var d = s && s.playerDetail;
    if (SIDES[d]) return d;
    var t = NS.Quality ? NS.Quality.tier().name : 'MED';
    return t === 'LOW' ? 'LOW' : (t === 'HIGH' ? 'HIGH' : 'MEDIUM');
  }
  function model() {
    var s = NS.World && NS.World.settings;
    return s && (s.playerModel === 'CLASSIC' || BUILDS[s.playerModel]) ? s.playerModel : 'ATHLETE';
  }

  var ballDetail = '';
  function ballGeometry() {
    ballDetail = detail();
    var seg = BALL_SEG[ballDetail];
    return new THREE.SphereGeometry(NS.BALL_R, seg[0], seg[1]); // UV-mapped for the ball skins
  }

  // The ball again with the polygons now chosen: returns the old geometry for the caller to swap and dispose, or null
  // when it has not changed.
  function rebuildBall() {
    if (ballDetail === detail()) return null;
    var old = geo.ball;
    geo.ball = ballGeometry();
    return old;
  }

  function jerseyTexture(pattern, c1, c2) {
    var key = pattern + '_' + c1 + '_' + c2;
    if (jerseyCache[key]) return jerseyCache[key];
    var canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = hexToCss(c1);
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = hexToCss(c2);
    if (pattern === 'STRIPES') {
      for (var x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 64);
    } else if (pattern === 'HOOPS') {
      for (var y = 0; y < 64; y += 16) ctx.fillRect(0, y, 64, 8);
    } else if (pattern === 'SASH') {
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.lineTo(64, 46); ctx.lineTo(64, 64); ctx.lineTo(46, 64); ctx.lineTo(0, 18);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, 64, 7);
    }
    var tex = new THREE.CanvasTexture(canvas);
    jerseyCache[key] = tex;
    return tex;
  }

  // A leg (shorts / sock / boot) or an arm (sleeve / skin) painted from the top down: no extra meshes per player.
  function limbTexture(top, mid, bottom, topPart, bottomPart) {
    var key = top + '_' + mid + '_' + bottom + '_' + topPart;
    if (limbCache[key]) return limbCache[key];
    var canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = hexToCss(mid);
    ctx.fillRect(0, 0, 8, 64);
    ctx.fillStyle = hexToCss(top);
    ctx.fillRect(0, 0, 8, Math.round(64 * topPart));
    if (bottomPart > 0) {
      ctx.fillStyle = hexToCss(bottom);
      ctx.fillRect(0, 64 - Math.round(64 * bottomPart), 8, 64);
    }
    var tex = new THREE.CanvasTexture(canvas);
    limbCache[key] = tex;
    return tex;
  }

  // The grass of a real pitch: a mowing pattern in the lighter green, the grain of the blades, worn goalmouths
  function mow(ctx, design, light, HW, HH, X, Y, sx, sy, W, H) {
    var i, j, n;
    ctx.fillStyle = light;
    if (design === 'CHECKS') {
      // a chessboard: 18 bands along, 12 across
      var cw = 2 * HW / 18, ch = 2 * HH / 12;
      for (i = 0; i < 18; i++) for (j = 0; j < 12; j++) if ((i + j) % 2) ctx.fillRect(X(-HW + i * cw), Y(-HH + j * ch), cw * sx + 0.5, ch * sy + 0.5);
    } else if (design === 'RINGS') {
      // rings around the centre spot (every second one lighter), the rest in straight bands
      var rw = 2 * HW / 18;
      for (i = 1; i < 18; i += 2) ctx.fillRect(X(-HW + i * rw), 0, rw * sx + 0.5, H);
      ctx.save();
      ctx.translate(X(0), Y(0));
      ctx.scale(sx, sy);
      var step = NS.CIRCLE_R * 0.55;
      for (n = 7; n >= 1; n--) {
        ctx.beginPath();
        ctx.arc(0, 0, n * step, 0, Math.PI * 2);
        ctx.fillStyle = n % 2 ? light : NS.stadium.grass[0]; // from the outside in: light, dark, light...
        ctx.fill();
      }
      ctx.restore();
    } else if (design === 'DIAGONAL') {
      // diagonal bands at 45 degrees (in metres, whatever the canvas scale)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.translate(X(0), Y(0));
      ctx.scale(sx, sy);
      ctx.rotate(Math.PI / 4);
      var dw = 7, span = HW + HH + 20;
      for (i = -Math.ceil(span / dw); i < span / dw; i += 2) ctx.fillRect(i * dw, -span, dw, span * 2);
      ctx.restore();
    } else if (design === 'PLAID') {
      // wide bands both ways: where they cross it is lighter still
      var pw = 2 * HW / 12, ph = 2 * HH / 8;
      ctx.globalAlpha = 0.6;
      for (i = 1; i < 12; i += 2) ctx.fillRect(X(-HW + i * pw), 0, pw * sx + 0.5, H);
      for (j = 1; j < 8; j += 2) ctx.fillRect(0, Y(-HH + j * ph), W, ph * sy + 0.5);
      ctx.globalAlpha = 1;
    } else {
      // classic stripes along the pitch
      var sw = 2 * HW / 18;
      for (i = 1; i < 18; i += 2) ctx.fillRect(X(-HW + i * sw), 0, sw * sx + 0.5, H);
    }
    // the grain: thousands of tiny light and dark marks
    n = Math.round(W * H / 90);
    for (i = 0; i < n; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1);
    }
    // worn grass in both goalmouths and on the centre spot (brownish, soft edges)
    function wear(x, z, r, a) {
      ctx.save();
      ctx.translate(X(x), Y(z));
      ctx.scale(sx, sy);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(120,105,60,' + a + ')');
      g.addColorStop(1, 'rgba(120,105,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (var e = -1; e <= 1; e += 2) { wear(e * (HW - 2), 0, 4.5, 0.35); wear(e * (HW - NS.PEN_D), 0, 2.5, 0.25); }
    wear(0, 0, 3, 0.2);
  }

  // The pitch: the lines sit exactly on the real 105 x 68 markings (the goal lines run through the posts), with a
  // strip of grass outside them for throw-ins and corners: the plane is PITCH_MARGIN bigger on every side.
  var PITCH_MARGIN = 4;
  function buildPitchTexture(withStripes) {
    // (a big pitch gets a sharper 2048 x 1024 grass, 4x the pixels: not on LOW, which has no stripes)
    var big = NS.PITCH_HALF_W > 70 && withStripes;
    var W = big ? 2048 : 1024, H = big ? 1024 : 512;
    var HW = NS.PITCH_HALF_W, HH = NS.PITCH_HALF_H, M = PITCH_MARGIN;
    var sx = W / (2 * (HW + M)), sy = H / (2 * (HH + M));
    function X(x) { return (x + HW + M) * sx; }
    function Y(z) { return (z + HH + M) * sy; }
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var grass = NS.stadium.grass;
    ctx.fillStyle = grass[0];
    ctx.fillRect(0, 0, W, H);
    if (withStripes) mow(ctx, NS.PITCH_DESIGNS[NS.pitchDesign] || 'STRIPES', grass[1], HW, HH, X, Y, sx, sy, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5 * W / 1024;
    function rect(x0, z0, x1, z1) { ctx.strokeRect(X(x0), Y(z0), X(x1) - X(x0), Y(z1) - Y(z0)); }
    // circles and arcs in metres (the canvas is not scaled the same way on both axes)
    function arc(cx, cz, r, a0, a1, fill) {
      ctx.save();
      ctx.translate(X(cx), Y(cz));
      ctx.scale(sx, sy);
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a1);
      ctx.restore();
      if (fill) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill(); } else ctx.stroke();
    }
    rect(-HW, -HH, HW, HH);
    ctx.beginPath(); ctx.moveTo(X(0), Y(-HH)); ctx.lineTo(X(0), Y(HH)); ctx.stroke();
    var R = NS.CIRCLE_R, P = NS.PEN_D;
    arc(0, 0, R, 0, Math.PI * 2);
    arc(0, 0, 0.3, 0, Math.PI * 2, true);
    var open = Math.acos((NS.BOX_D - P) / R); // the penalty arc: the part of the circle outside the box
    for (var e = -1; e <= 1; e += 2) {
      var gx = e * HW;
      rect(Math.min(gx, gx - e * NS.BOX_D), -NS.BOX_HW, Math.max(gx, gx - e * NS.BOX_D), NS.BOX_HW);
      rect(Math.min(gx, gx - e * NS.SIX_D), -NS.SIX_HW, Math.max(gx, gx - e * NS.SIX_D), NS.SIX_HW);
      arc(gx - e * P, 0, 0.3, 0, Math.PI * 2, true);
      if (e < 0) arc(gx + P, 0, R, -open, open);
      else arc(gx - P, 0, R, Math.PI - open, Math.PI + open);
      // corner arcs
      arc(gx, -HH, NS.CORNER_R, e < 0 ? 0 : Math.PI / 2, e < 0 ? Math.PI / 2 : Math.PI);
      arc(gx, HH, NS.CORNER_R, e < 0 ? -Math.PI / 2 : Math.PI, e < 0 ? 0 : Math.PI * 1.5);
    }
    if (pitchTexture) pitchTexture.dispose();
    pitchTexture = new THREE.CanvasTexture(canvas);
    return pitchTexture;
  }

  // ---- ball skins: equirectangular 256 x 128 canvas textures (drawn once, cached) ----
  // The 12 panels of a classic ball: both poles + two rings of five at +-26.6 degrees of latitude.
  function panelCentres(fn) {
    for (var k = 0; k < 5; k++) {
      fn((k / 5) * 256, 45);
      fn(((k + 0.5) / 5) * 256, 83);
    }
  }

  function poly(ctx, cx, cy, r, n, rot, sx) {
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var a = rot + i * Math.PI * 2 / n;
      var x = cx + Math.cos(a) * r * sx, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function star(ctx, cx, cy, r, sx) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 ? r * 0.45 : r;
      var x = cx + Math.cos(a) * rr * sx, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function panels(ctx, color, wrap) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 9);
    ctx.fillRect(0, 119, 256, 9);
    panelCentres(function (x, y) {
      poly(ctx, x, y, 9.5, 5, -Math.PI / 2, 1.15);
      if (wrap && x < 12) poly(ctx, x + 256, y, 9.5, 5, -Math.PI / 2, 1.15);
    });
  }

  function seams(ctx, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (var x = 0; x < 256; x += 25.6) { ctx.beginPath(); ctx.moveTo(x, 9); ctx.lineTo(x + 12.8, 45); ctx.lineTo(x, 83); ctx.lineTo(x + 12.8, 119); ctx.stroke(); }
  }

  function ballTexture(skin) {
    if (ballTextures[skin]) return ballTextures[skin];
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    var x;
    if (skin === 'PRO') {
      // modern white ball with two flowing colour bands
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 256, 128);
      ctx.lineWidth = 11;
      ctx.strokeStyle = '#2563eb';
      ctx.beginPath();
      for (x = 0; x <= 256; x += 8) { var y1 = 42 + Math.sin(x / 256 * Math.PI * 4) * 12; if (x) ctx.lineTo(x, y1); else ctx.moveTo(x, y1); }
      ctx.stroke();
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();
      for (x = 0; x <= 256; x += 8) { var y2 = 86 + Math.sin(x / 256 * Math.PI * 4 + Math.PI) * 12; if (x) ctx.lineTo(x, y2); else ctx.moveTo(x, y2); }
      ctx.stroke();
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 256, 6); ctx.fillRect(0, 122, 256, 6);
    } else if (skin === 'NIGHT') {
      // hi-vis yellow with dark panels (easy to follow on a dark pitch)
      ctx.fillStyle = '#fde047'; ctx.fillRect(0, 0, 256, 128);
      seams(ctx, 'rgba(120, 53, 15, 0.5)');
      panels(ctx, '#312e81', true);
    } else if (skin === 'RETRO') {
      // brown leather, panel stitching and the lace
      ctx.fillStyle = '#9a4b16'; ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = '#5b2a06'; ctx.lineWidth = 2;
      for (x = 0; x < 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(256, 64); ctx.stroke();
      ctx.strokeStyle = '#f5f5f4'; ctx.lineWidth = 2;
      for (var k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(120, 52 + k * 4); ctx.lineTo(136, 52 + k * 4); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(128, 50); ctx.lineTo(128, 76); ctx.stroke();
    } else if (skin === 'GOLD') {
      // gold ball with white stars
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#fcd34d';
      for (x = 0; x < 256; x += 16) ctx.fillRect(x, 0, 8, 128);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 7); ctx.fillRect(0, 121, 256, 7);
      panelCentres(function (cx, cy) { star(ctx, cx, cy, 10, 1.15); });
    } else {
      // CLASSIC: white hexagons, black pentagons
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 128);
      seams(ctx, 'rgba(100, 116, 139, 0.55)');
      panels(ctx, '#111827', true);
    }
    var tex = new THREE.CanvasTexture(canvas);
    ballTextures[skin] = tex;
    return tex;
  }

  // A player: root turns with the facing; body pivots at the hips (lean, roll, slide); legs pivot at the hips and
  // arms at the shoulders, so runs, kicks, tackles and dives can be animated by rotations only, whatever the model.
  function limb(parent, g, mat, x, y, len) {
    var pivot = new THREE.Bone(); // (a bone: the merged body follows it, see bake)
    pivot.position.set(x, y, 0);
    var m = new THREE.Mesh(g, mat);
    m.position.y = -len / 2;
    pivot.add(m);
    parent.add(pivot);
    return pivot;
  }

  // ---- rounded bodies (ATHLETE, TOON): lathes, every size a fraction of the player's height h ----
  // [radius, y] pairs from the bottom up; legs / arms: [radius, t] with t = 0 at the hip / shoulder, 1 at the end.
  // ATHLETE is a real footballer: legs about half his height, shoulders at 0.81, a head of 1/8.
  var BUILDS = {
    ATHLETE: {
      hip: 0.51, legX: 0.052, legW: 0.03,
      leg: [[0.046, 0], [0.044, 0.12], [0.036, 0.4], [0.027, 0.52], [0.033, 0.64], [0.021, 0.9], [0.019, 1]],
      boot: [0.03, 0.024, 0.07, 0.024],
      pelvis: [[0.086, -0.075], [0.1, -0.045], [0.1, 0.02], [0.092, 0.06]], pelvisZ: 0.68,
      torso: [[0.092, 0], [0.088, 0.08], [0.105, 0.16], [0.118, 0.23], [0.121, 0.265], [0.1, 0.295], [0.048, 0.312]], torsoZ: 0.58,
      head: [[0.03, 0.29], [0.03, 0.37], [0.046, 0.378], [0.052, 0.4], [0.054, 0.43], [0.05, 0.462], [0.038, 0.48], [0.02, 0.49]], headZ: 1.12,
      hair: [[0.057, 0.428], [0.057, 0.448], [0.053, 0.468], [0.041, 0.484], [0.022, 0.494]], headC: 0.43,
      armX: 0.135, armY: 0.272, armL: 0.42,
      arm: [[0.031, 0], [0.029, 0.15], [0.024, 0.46], [0.025, 0.55], [0.018, 0.78], [0.022, 0.87], [0.014, 1]]
    },
    TOON: {
      hip: 0.36, legX: 0.07, legW: 0.05,
      leg: [[0.066, 0], [0.061, 0.4], [0.055, 0.7], [0.05, 1]],
      boot: [0.052, 0.036, 0.085, 0.036],
      pelvis: [[0.12, -0.06], [0.135, -0.03], [0.135, 0.02], [0.125, 0.05]], pelvisZ: 0.75,
      torso: [[0.125, 0], [0.135, 0.08], [0.14, 0.16], [0.12, 0.22], [0.06, 0.25]], torsoZ: 0.7,
      head: [[0.04, 0.23], [0.04, 0.3], [0.1, 0.32], [0.15, 0.4], [0.16, 0.47], [0.14, 0.55], [0.09, 0.61], [0.03, 0.635]], headZ: 0.95,
      hair: [[0.163, 0.47], [0.152, 0.54], [0.1, 0.605], [0.034, 0.642]], headC: 0.47,
      armX: 0.165, armY: 0.2, armL: 0.3,
      arm: [[0.045, 0], [0.04, 0.5], [0.035, 0.75], [0.046, 0.88], [0.026, 1]]
    }
  };
  var HAIR_STYLES = ['short', 'short', 'buzz', 'afro', 'bald', 'short'];
  var HAIR_COLORS = [0x1a1816, 0x1a1816, 0x2b1d14, 0x4a3020, 0x8a6a3a, 0xc9a25a, 0x6b2f1a];
  var BOOT_COLORS = [0x111111, 0x111111, 0xf8fafc, 0xef4444, 0x22c55e, 0xfacc15, 0x3b82f6, 0xf97316];
  var bodyGeo = {}; // lathes by model, sides, height and part

  function rnd(seed, k) { var x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); }

  // A lathe from [radius, y] pairs (bottom to top, closed at both ends). v of the UVs follows the height, so the bands of
  // the limb and jersey textures fall where they are painted whatever the spacing of the points.
  function lathe(pts, seg) {
    var v = [new THREE.Vector2(0, pts[0][1])];
    for (var i = 0; i < pts.length; i++) v.push(new THREE.Vector2(pts[i][0], pts[i][1]));
    v.push(new THREE.Vector2(0, pts[pts.length - 1][1]));
    var g = new THREE.LatheGeometry(v, seg);
    var pos = g.attributes.position, uv = g.attributes.uv;
    var y0 = pts[0][1], y1 = pts[pts.length - 1][1];
    for (var k = 0; k < pos.count; k++) uv.setY(k, (pos.getY(k) - y0) / (y1 - y0));
    return g;
  }

  function scaled(pts, h, dy) {
    var out = [];
    for (var i = 0; i < pts.length; i++) out.push([pts[i][0] * h, pts[i][1] * h + (dy || 0)]);
    return out;
  }

  // a limb hanging from its pivot: [radius, t] -> lathe from y = -len (the end) up to 0; caps: both ends rounded (a
  // joint: the thigh and the shin overlap at the knee, so a bent knee shows no gap)
  function limbLathe(pts, h, len, seg, caps) {
    var out = [];
    for (var i = pts.length - 1; i >= 0; i--) out.push([pts[i][0] * h, -pts[i][1] * len]);
    if (caps) {
      var r0 = out[0][0], r1 = out[out.length - 1][0];
      out.unshift([r0 * 0.72, out[0][1] - r0 * 0.55]);
      out.push([r1 * 0.72, out[out.length - 1][1] + r1 * 0.55]);
    }
    return lathe(out, seg);
  }
  // the part of a limb profile between t0 and t1 (0 = its pivot, 1 = its end), as a profile of its own
  function segment(pts, t0, t1) {
    function rAt(t) {
      for (var i = 1; i < pts.length; i++) {
        if (t <= pts[i][1]) { var a = pts[i - 1], b = pts[i]; return a[0] + (b[0] - a[0]) * (t - a[1]) / (b[1] - a[1]); }
      }
      return pts[pts.length - 1][0];
    }
    var out = [[rAt(t0), 0]];
    for (var i = 0; i < pts.length; i++) if (pts[i][1] > t0 && pts[i][1] < t1) out.push([pts[i][0], (pts[i][1] - t0) / (t1 - t0)]);
    out.push([rAt(t1), 1]);
    return out;
  }
  var KNEE = 0.5, ELBOW = 0.46;   // the knee at half the leg, the elbow a little above half the arm

  function bodyPart(m, seg, h, part, style) {
    var key = m + '|' + seg + '|' + Math.round(h * 100) + '|' + part + (style || '');
    if (bodyGeo[key]) return bodyGeo[key];
    var b = BUILDS[m], g, L = (b.hip - b.boot[1]) * h;
    if (part === 'thigh') g = limbLathe(segment(b.leg, 0, KNEE), h, L * KNEE, seg, true);
    else if (part === 'shin') g = limbLathe(segment(b.leg, KNEE, 1), h, L * (1 - KNEE), seg, true);
    else if (part === 'uarm') g = limbLathe(segment(b.arm, 0, ELBOW), h, b.armL * h * ELBOW, seg, true);
    else if (part === 'farm') g = limbLathe(segment(b.arm, ELBOW, 1), h, b.armL * h * (1 - ELBOW), seg, true);
    else if (part === 'boot') g = new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.6)));
    else if (part === 'hair') {
      var k = style === 'afro' ? 1.32 : (style === 'buzz' ? 0.985 : 1), c = b.headC, pts = [];
      for (var i = 0; i < b.hair.length; i++) {
        var y = b.hair[i][1];
        pts.push([b.hair[i][0] * k, style === 'afro' ? c + (y - c) * 1.45 - 0.004 : y]);
      }
      g = lathe(scaled(pts, h), seg);
    } else g = lathe(scaled(b[part], h), seg);
    bodyGeo[key] = g;
    return g;
  }

  // A leg / arm painted in bands from the top down: colours[i] down to stops[i] (0 = top, 1 = the end).
  function bandTexture(colors, stops) {
    var key = 'b' + colors.join('_') + '|' + stops.join('_');
    if (limbCache[key]) return limbCache[key];
    var canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    var y = 0;
    for (var i = 0; i < colors.length; i++) {
      var y1 = Math.round(64 * stops[i]);
      ctx.fillStyle = hexToCss(colors[i]);
      ctx.fillRect(0, y, 8, y1 - y);
      y = y1;
    }
    var tex = new THREE.CanvasTexture(canvas);
    limbCache[key] = tex;
    return tex;
  }

  // The blocks look (the original players)
  function buildClassic(mesh, Mat, look) {
    var mats = mesh.mats, root = mesh.root;
    var torsoMat = new Mat({ map: jerseyTexture(look.pattern, look.c1, look.c2) });
    var headMat = new Mat({ color: look.skin });
    var hairMat = new Mat({ color: 0x1a1816 });
    // legs: shorts (top 38%), socks in the shirt colour, dark boots; arms: short sleeve then skin
    var shortsMat = new Mat({ map: limbTexture(look.shorts, look.c1, 0x111111, 0.38, 0.1) });
    var sleeveMat = new Mat({ map: limbTexture(look.c1, look.skin, 0, 0.3, 0) });
    mats.push(torsoMat, headMat, hairMat, shortsMat, sleeveMat);

    var body = new THREE.Bone();
    body.position.y = HIP; // hips
    root.add(body);
    var torso = new THREE.Mesh(geo.torso, torsoMat);
    torso.position.y = 0.52;
    body.add(torso);
    var head = new THREE.Mesh(geo.head, headMat);
    head.position.y = 1.34;
    body.add(head);
    var hair = new THREE.Mesh(geo.hair, hairMat);
    hair.position.y = 1.62;
    body.add(hair);
    mesh.body = body;
    mesh.leftArm = limb(body, geo.arm, sleeveMat, -0.52, 0.94, 0.98);
    mesh.rightArm = limb(body, geo.arm, sleeveMat, 0.52, 0.94, 0.98);
    mesh.leftLeg = limb(body, geo.limb, shortsMat, -0.2, 0.03, 1.17);
    mesh.rightLeg = limb(body, geo.limb, shortsMat, 0.2, 0.03, 1.17);
    mesh.hip = HIP; mesh.legX = 0.2; mesh.legW = 0.14; mesh.legLen = 1.17 + 0.03;
    mesh.leftKnee = mesh.rightKnee = mesh.leftElbow = mesh.rightElbow = null; // (blocks: no knees or elbows)
  }

  // ATHLETE / TOON: rounded bodies; ATHLETE players differ in height (1.72 - 1.92 m, keepers taller), hair and boots.
  function buildRounded(mesh, Mat, look, m) {
    var b = BUILDS[m], mats = mesh.mats, root = mesh.root, seg = SIDES[detail()], s = look.seed;
    // his real height when known (js/data/squads.js), else one from his look
    var metres = m === 'ATHLETE' ? (look.ht > 150 ? look.ht / 100 : 1.72 + rnd(s, 1) * 0.2 + (look.gk ? 0.05 : 0)) : 1.81;
    var h = Math.round(metres * NS.M * 50) / 50; // (a few sizes, so the lathes are shared)
    var hairStyle = HAIR_STYLES[Math.floor(rnd(s, 2) * HAIR_STYLES.length)];
    var hairColor = look.skin === 0x8d5524 ? 0x111111 : HAIR_COLORS[Math.floor(rnd(s, 3) * HAIR_COLORS.length)];
    var boots = BOOT_COLORS[Math.floor(rnd(s, 4) * BOOT_COLORS.length)];

    var shirtMat = new Mat({ map: jerseyTexture(look.pattern, look.c1, look.c2) });
    var shortsMat = new Mat({ color: look.shorts });
    var skinMat = new Mat({ color: look.skin });
    var hairMat = new Mat({ color: hairColor });
    var bootMat = new Mat({ color: boots });
    // thigh: shorts to mid-thigh, then the knee; shin: socks in the shirt colour from just below the knee;
    // upper arm: the sleeve, then skin; forearm and hand (a keeper: long sleeves, gloves)
    var thighMat = new Mat({ map: bandTexture([look.shorts, look.skin], [0.6, 1]) });
    var shinMat = new Mat({ map: bandTexture([look.skin, look.c1], [0.12, 1]) });
    var uarmMat = new Mat({ map: look.gk ? bandTexture([look.c1], [1]) : bandTexture([look.c1, look.skin], [0.6, 1]) });
    var farmMat = look.gk ? new Mat({ map: bandTexture([look.c1, 0xf1f5f9], [0.62, 1]) }) : skinMat;
    mats.push(shirtMat, shortsMat, skinMat, hairMat, bootMat, thighMat, shinMat, uarmMat);
    if (farmMat !== skinMat) mats.push(farmMat);

    var hip = b.hip * h;
    var body = new THREE.Bone();
    body.position.y = hip;
    root.add(body);
    var pelvis = new THREE.Mesh(bodyPart(m, seg, h, 'pelvis'), shortsMat);
    pelvis.scale.z = b.pelvisZ;
    body.add(pelvis);
    var torso = new THREE.Mesh(bodyPart(m, seg, h, 'torso'), shirtMat);
    torso.scale.z = b.torsoZ;
    body.add(torso);
    var head = new THREE.Mesh(bodyPart(m, seg, h, 'head'), skinMat);
    head.scale.z = b.headZ;
    body.add(head);
    if (hairStyle !== 'bald') {
      var hair = new THREE.Mesh(bodyPart(m, seg, h, 'hair', hairStyle), hairMat);
      hair.scale.z = b.headZ;
      hair.position.z = -0.006 * h; // a little to the back: the face stays clear
      body.add(hair);
    }
    mesh.body = body;
    // arms: shoulder -> upper arm -> elbow -> forearm and hand; legs: hip -> thigh -> knee -> shin and boot. The elbow
    // and the knee are pivots of their own (rotation.x: a bent knee folds the shin back, a bent elbow brings the forearm up)
    var uaL = b.armL * h * ELBOW, L = (b.hip - b.boot[1]) * h, thL = L * KNEE;
    var uarmG = bodyPart(m, seg, h, 'uarm'), farmG = bodyPart(m, seg, h, 'farm');
    var thighG = bodyPart(m, seg, h, 'thigh'), shinG = bodyPart(m, seg, h, 'shin');
    var bootG = bodyPart(m, seg, h, 'boot');
    mesh.leftArm = limb(body, uarmG, uarmMat, -b.armX * h, b.armY * h, 0);
    mesh.rightArm = limb(body, uarmG, uarmMat, b.armX * h, b.armY * h, 0);
    mesh.leftElbow = limb(mesh.leftArm, farmG, farmMat, 0, -uaL, 0);
    mesh.rightElbow = limb(mesh.rightArm, farmG, farmMat, 0, -uaL, 0);
    mesh.leftLeg = limb(body, thighG, thighMat, -b.legX * h, 0, 0);
    mesh.rightLeg = limb(body, thighG, thighMat, b.legX * h, 0, 0);
    mesh.leftKnee = limb(mesh.leftLeg, shinG, shinMat, 0, -thL, 0);
    mesh.rightKnee = limb(mesh.rightLeg, shinG, shinMat, 0, -thL, 0);
    // boots: a stretched ball at the end of each shin, toes forward
    for (var i = 0; i < 2; i++) {
      var boot = new THREE.Mesh(bootG, bootMat);
      boot.scale.set(b.boot[0] * h, b.boot[1] * h, b.boot[2] * h);
      boot.position.set(0, -(hip - thL) + b.boot[3] * h, b.boot[2] * h * 0.35);
      (i ? mesh.rightKnee : mesh.leftKnee).add(boot);
    }
    mesh.hip = hip; mesh.legX = b.legX * h; mesh.legW = b.legW * h; mesh.legLen = hip; mesh.thighLen = thL;
  }

  // ---- All the players in one draw call. Each body is built as above, parts hanging from pivots (bones); then its parts
  // are baked into one piece (bake): every vertex where it hangs at rest, bound to its pivot, painted from one small
  // picture of the player (his parts' own textures and colours side by side). Then all the players are put together into
  // one skinned mesh with one skeleton (syncPlayers, before drawing): one draw call for the 22 players and the referee
  // instead of 15 each. The pivots stay where they were, so the animation (js/game/match.js) and the replays turn them
  // exactly as before. A hidden player (sent off) has his part of the skeleton folded to nothing. The shadows:
  // js/render/scene.js, also one draw call.
  var bakeM = null, bakeInv = null, bakeN = null;
  var CELL_W = 128, CELL_H = 64; // one player's picture

  // the light of the lit look (js/render/scene.js: ambient 0.8, sun 0.65 from (25, 50, 30)) averaged over the player's
  // turn: a part facing up gets the sun, one facing sideways a fifth of it, one facing down only the ambient
  var SUN_UP = 50 / Math.sqrt(25 * 25 + 50 * 50 + 30 * 30), SUN_SIDE = Math.sqrt(1 - SUN_UP * SUN_UP) / Math.PI;
  function shade(ny) { return 0.8 + 0.65 * (Math.max(0, SUN_UP * ny) + SUN_SIDE * Math.sqrt(Math.max(0, 1 - ny * ny))); }

  function bake(mesh) {
    if (!bakeM) { bakeM = new THREE.Matrix4(); bakeInv = new THREE.Matrix4(); bakeN = new THREE.Matrix3(); }
    var root = mesh.root, parts = [], bones = [], slots = [], i, j, k;
    root.updateMatrixWorld(true);
    bakeInv.copy(root.matrixWorld).invert();
    root.traverse(function (o) { if (o.isBone) bones.push(o); else if (o.isMesh) parts.push(o); });
    // his picture: one slot per material (a jersey 64 wide, a band 8, a plain colour 4), side by side (112 at most)
    var x = 0;
    for (i = 0; i < parts.length; i++) {
      var mat = parts[i].material, s = null;
      for (j = 0; j < slots.length; j++) if (slots[j].mat === mat) s = slots[j];
      if (!s) { s = { mat: mat, x: x, w: mat.map ? mat.map.image.width : 4 }; x += s.w; slots.push(s); }
      parts[i].userData.slot = s;
    }
    var canvas = document.createElement('canvas');
    canvas.width = CELL_W;
    canvas.height = CELL_H;
    var ctx = canvas.getContext('2d');
    for (j = 0; j < slots.length; j++) {
      var sl = slots[j], sw = Math.min(sl.w, CELL_W - sl.x);
      if (sl.mat.map) ctx.drawImage(sl.mat.map.image, sl.x, 0, sw, CELL_H);
      else { ctx.fillStyle = hexToCss(sl.mat.color.getHex()); ctx.fillRect(sl.x, 0, sw, CELL_H); }
    }
    // the geometry: every part moved to where it hangs, its uvs into its slot (0..1 of his picture), its vertices bound
    // to its pivot; the pivots' rest places (from the root) for the skeleton
    var nv = 0, ni = 0;
    for (i = 0; i < parts.length; i++) { nv += parts[i].geometry.attributes.position.count; ni += parts[i].geometry.index.count; }
    var P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 3);
    var B = new Uint8Array(nv), I = new Uint32Array(ni);
    var v0 = 0, i0 = 0, v = new THREE.Vector3();
    for (i = 0; i < parts.length; i++) {
      var pm = parts[i], g = pm.geometry, gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv, gi = g.index;
      var bone = pm.parent;
      while (!bone.isBone) bone = bone.parent;
      var bi = bones.indexOf(bone), slot = pm.userData.slot;
      var u0 = (slot.x + 0.5) / CELL_W, uw = (Math.min(slot.w, CELL_W - slot.x) - 1) / CELL_W; // (texel centres only)
      bakeM.multiplyMatrices(bakeInv, pm.matrixWorld);
      bakeN.getNormalMatrix(bakeM);
      for (k = 0; k < gp.count; k++) {
        var o = v0 + k;
        v.fromBufferAttribute(gp, k).applyMatrix4(bakeM);
        P[o * 3] = v.x; P[o * 3 + 1] = v.y; P[o * 3 + 2] = v.z;
        v.fromBufferAttribute(gn, k).applyMatrix3(bakeN).normalize();
        N[o * 3] = v.x; N[o * 3 + 1] = v.y; N[o * 3 + 2] = v.z;
        C[o * 3] = C[o * 3 + 1] = C[o * 3 + 2] = shade(v.y);
        U[o * 2] = u0 + Math.min(1, Math.max(0, gu.getX(k))) * uw;
        U[o * 2 + 1] = 0.5 / CELL_H + Math.min(1, Math.max(0, gu.getY(k))) * ((CELL_H - 1) / CELL_H);
        B[o] = bi;
      }
      for (k = 0; k < gi.count; k++) I[i0 + k] = gi.getX(k) + v0;
      v0 += gp.count;
      i0 += gi.count;
      pm.parent.remove(pm);
    }
    var rest = [];
    for (j = 0; j < bones.length; j++) rest.push(new THREE.Matrix4().multiplyMatrices(bakeInv, bones[j].matrixWorld).invert());
    for (j = 0; j < mesh.mats.length; j++) mesh.mats[j].dispose(); // (the parts' materials; their textures are shared)
    mesh.mats = [];
    mesh.baked = { P: P, N: N, U: U, C: C, B: B, I: I, canvas: canvas, bones: bones, rest: rest };
    batchDirty = true;
  }

  // Builds the body into mesh.root (kept: the player's position, facing and visibility stay as they are).
  function build(mesh, lit) {
    var Mat = lit ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial;
    var m = model();
    if (m === 'CLASSIC') buildClassic(mesh, Mat, mesh.look);
    else buildRounded(mesh, Mat, mesh.look, m);
    bake(mesh);
    var root = mesh.root;
    mesh.lit = lit;
    mesh.style = styleKey(lit);
    // his booking (warning / yellow / red), hidden until he gets one; it sits just under the controlled-player arrow
    var cardMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    mesh.mats.push(cardMat);
    var card = new THREE.Mesh(geo.card, cardMat);
    card.position.y = 3.5;
    card.visible = false;
    root.add(card);
    mesh.card = card;
  }

  // Returns { root, body, leftLeg, rightLeg, leftArm, rightArm, card, mats, hip, legX, legW, legLen } (mats are owned
  // by the player and disposed with him). look = { pattern, c1, c2, shorts, skin, gk, seed }.
  var live = []; // every player's mesh until it is disposed (drawn together by syncPlayers; their shadows: scene.js)
  function createPlayer(look, lit) {
    var mesh = { root: new THREE.Group(), look: look, mats: [], style: '', lit: true, baked: null };
    build(mesh, lit);
    live.push(mesh);
    batchDirty = true;
    return mesh;
  }

  // The model or the polygons changed: the body is built again in place (same root, booking kept). False when the
  // player already looks that way.
  function styleKey(lit) { return model() + '|' + detail() + '|' + (lit ? 1 : 0); }

  function restylePlayer(mesh, lit) {
    if (mesh.style === styleKey(lit)) return false;
    var cardOn = mesh.card.visible, cardColor = mesh.card.material.color.getHex();
    for (var i = mesh.root.children.length - 1; i >= 0; i--) mesh.root.remove(mesh.root.children[i]);
    freeBody(mesh);
    build(mesh, lit);
    mesh.card.visible = cardOn;
    mesh.card.material.color.setHex(cardColor);
    return true;
  }

  // the rounded bodies' shared lathes (after every player was rebuilt with other polygons)
  function dropBodyGeometry() {
    for (var k in bodyGeo) bodyGeo[k].dispose();
    bodyGeo = {};
  }

  // (the booking card's material; the body itself is in the players' mesh, rebuilt without him)
  function freeBody(mesh) {
    for (var i = 0; i < mesh.mats.length; i++) mesh.mats[i].dispose();
    mesh.mats = [];
    mesh.baked = null;
    batchDirty = true;
  }

  function disposePlayer(mesh) {
    freeBody(mesh);
    var i = live.indexOf(mesh);
    if (i >= 0) live.splice(i, 1);
  }

  // ---- the players' mesh: every player of `live` in one skinned mesh, one skeleton, one picture (a grid of theirs) ----
  var batch = null, batchDirty = true, batchScene = null;
  var batchRanges = []; // per player: [root, first bone, bones] (the hidden ones are folded, see hideBones)

  function freeBatch() {
    if (!batch) return;
    if (batch.parent) batch.parent.remove(batch);
    batch.geometry.dispose();
    batch.material.map.dispose();
    batch.material.dispose();
    if (batch.skeleton.dispose) batch.skeleton.dispose();
    batch = null;
  }

  // after the skeleton's own update: the bones of a player who is not on show (hidden, or out of the scene) are made
  // nothing, so his part of the mesh shrinks to a point and is not drawn
  function hideBones() {
    THREE.Skeleton.prototype.update.call(this);
    var m = this.boneMatrices;
    for (var i = 0; i < batchRanges.length; i += 3) {
      var r = batchRanges[i];
      if (r.visible && r.parent) continue;
      m.fill(0, batchRanges[i + 1] * 16, (batchRanges[i + 1] + batchRanges[i + 2]) * 16);
    }
  }

  function buildBatch() {
    freeBatch();
    batchRanges.length = 0;
    batchDirty = false;
    var list = [], i, k, nv = 0, ni = 0;
    for (i = 0; i < live.length; i++) if (live[i].baked) { list.push(live[i]); nv += live[i].baked.B.length; ni += live[i].baked.I.length; }
    if (!list.length) return;
    // the picture: the players' own, in a grid 4 across
    var cols = 4, rows = Math.ceil(list.length / cols), AW = CELL_W * cols, AH = CELL_H;
    while (AH < rows * CELL_H) AH *= 2;
    var canvas = document.createElement('canvas');
    canvas.width = AW;
    canvas.height = AH;
    var ctx = canvas.getContext('2d');
    var P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 3);
    var SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var bones = [], rest = [], v0 = 0, i0 = 0;
    for (i = 0; i < list.length; i++) {
      var b = list[i].baked, cx = (i % cols) * CELL_W, cy = Math.floor(i / cols) * CELL_H, n = b.B.length, b0 = bones.length;
      ctx.drawImage(b.canvas, cx, cy);
      P.set(b.P, v0 * 3); N.set(b.N, v0 * 3); C.set(b.C, v0 * 3);
      for (k = 0; k < n; k++) {
        U[(v0 + k) * 2] = (cx + b.U[k * 2] * CELL_W) / AW;
        U[(v0 + k) * 2 + 1] = 1 - (cy + (1 - b.U[k * 2 + 1]) * CELL_H) / AH; // (the picture is drawn top down, v goes up)
        SI[(v0 + k) * 4] = b0 + b.B[k];
        SW[(v0 + k) * 4] = 1;
      }
      for (k = 0; k < b.I.length; k++) I[i0 + k] = b.I[k] + v0;
      batchRanges.push(list[i].root, b0, b.bones.length);
      for (k = 0; k < b.bones.length; k++) { bones.push(b.bones[k]); rest.push(b.rest[k].clone()); }
      v0 += n;
      i0 += b.I.length;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    g.setIndex(new THREE.BufferAttribute(I, 1));
    var tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;          // (mipmaps would blend the players' slots together; the picture is small anyway)
    tex.minFilter = THREE.LinearFilter;
    // lit (HIGH): the sun as the player turns; not lit: the same light painted once on the vertices (no lighting cost)
    var lit = list[0].lit, Mat = lit ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial;
    batch = new THREE.SkinnedMesh(g, new Mat({ map: tex, skinning: true, vertexColors: !lit }));
    batch.frustumCulled = false; // (the players are all over the pitch)
    var sk = new THREE.Skeleton(bones, rest); // (the bones' rest places from each player's root: the mesh stays at 0)
    sk.update = hideBones;
    batch.bind(sk, new THREE.Matrix4());
    batchScene.add(batch);
  }

  // before drawing (js/render/scene.js): the players' mesh again if a player came, went or changed look
  function syncPlayers(scene) {
    batchScene = scene;
    if (batchDirty) buildBatch();
  }

  // The crowd: flat stands (js/render/scene.js) wearing one small tile of fans drawn here once, no 3D people. Two frames
  // of the same fans (the same seeded draw): sitting, and on their feet with their arms up (a goal). 512 x 256, tiled
  // along the stands; mipmapped, so the far rows cost nothing more.
  var crowdTex = null;
  var FAN_COLS = 16, FAN_ROWS = 6;
  var FAN_SHIRTS = ['#dc2626', '#f8fafc', '#2563eb', '#16a34a', '#facc15', '#111827', '#ea580c', '#7c3aed', '#0ea5e9', '#b91c1c', '#e2e8f0', '#1e3a8a'];
  var FAN_SKIN = ['#f1c7a3', '#d9a07a', '#b97850', '#8d5a3b', '#5e3b26'];
  var FAN_HAIR = ['#111111', '#2b1b10', '#4a3020', '#8a6a3a', '#d6c08a', '#3a3a3a'];
  function drawCrowd(cheer) {
    var W = 512, H = 256, cw = W / FAN_COLS, rh = H / FAN_ROWS;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    for (var r = 0; r < FAN_ROWS; r++) {
      // the seat row (a step of the terrace): dark, its edge a little lighter
      var y0 = r * rh;
      ctx.fillStyle = r % 2 ? '#1b2333' : '#202a3d';
      ctx.fillRect(0, y0, W, rh);
      ctx.fillStyle = '#2c3850';
      ctx.fillRect(0, y0 + rh - 4, W, 4);
      for (var c = 0; c < FAN_COLS; c++) {
        var empty = rnd() < 0.08;
        var shirt = FAN_SHIRTS[Math.floor(rnd() * FAN_SHIRTS.length)];
        var skin = FAN_SKIN[Math.floor(rnd() * FAN_SKIN.length)];
        var hair = FAN_HAIR[Math.floor(rnd() * FAN_HAIR.length)];
        var jx = (rnd() - 0.5) * 6, jy = (rnd() - 0.5) * 3, arms = rnd(), lift = rnd(); // (the same draws in both frames)
        if (empty) continue;
        var x = c * cw + cw / 2 + jx, base = y0 + rh - 4;
        var up = cheer ? 6 + lift * 4 : 0;            // on his feet
        var sh = base - 17 - up + jy;                  // shoulders
        ctx.fillStyle = shirt;
        ctx.beginPath();                               // body: a rounded shirt
        ctx.moveTo(x - 9, base); ctx.lineTo(x - 9, sh + 4); ctx.quadraticCurveTo(x - 9, sh, x - 5, sh);
        ctx.lineTo(x + 5, sh); ctx.quadraticCurveTo(x + 9, sh, x + 9, sh + 4); ctx.lineTo(x + 9, base); ctx.closePath();
        ctx.fill();
        if (cheer && arms < 0.75) {                    // arms up (one or both)
          ctx.strokeStyle = shirt; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x - 7, sh + 2); ctx.lineTo(x - 11, sh - 10);
          if (arms < 0.5) { ctx.moveTo(x + 7, sh + 2); ctx.lineTo(x + 11, sh - 10); }
          ctx.stroke();
          ctx.fillStyle = skin;
          ctx.beginPath(); ctx.arc(x - 11, sh - 11, 2, 0, 6.283); ctx.fill();
          if (arms < 0.5) { ctx.beginPath(); ctx.arc(x + 11, sh - 11, 2, 0, 6.283); ctx.fill(); }
        }
        ctx.fillStyle = skin;                          // head
        ctx.beginPath(); ctx.arc(x, sh - 5, 5, 0, 6.283); ctx.fill();
        ctx.fillStyle = hair;                          // hair
        ctx.beginPath(); ctx.arc(x, sh - 6.5, 5, Math.PI, 6.283); ctx.fill();
      }
    }
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  function crowdTextures() {
    if (!crowdTex) crowdTex = [drawCrowd(false), drawCrowd(true)];
    return crowdTex;
  }

  function disposeAll() {
    var k;
    if (crowdTex) { crowdTex[0].dispose(); crowdTex[1].dispose(); crowdTex = null; }
    for (k in geo) geo[k].dispose();
    for (k in jerseyCache) jerseyCache[k].dispose();
    jerseyCache = {};
    for (k in limbCache) limbCache[k].dispose();
    limbCache = {};
    if (pitchTexture) pitchTexture.dispose();
    pitchTexture = null;
    for (k in ballTextures) ballTextures[k].dispose();
    ballTextures = {};
    dropBodyGeometry();
    freeBatch();
    batchDirty = true;
  }

  NS.Assets = {
    geo: geo,
    HIP: HIP,
    PITCH_MARGIN: PITCH_MARGIN,
    hexToCss: hexToCss,
    initGeometries: initGeometries,
    pitchTexture: buildPitchTexture,
    crowdTextures: crowdTextures,
    ballTexture: ballTexture,
    createPlayer: createPlayer,
    restylePlayer: restylePlayer,
    styleKey: styleKey,
    dropBodyGeometry: dropBodyGeometry,
    rebuildBall: rebuildBall,
    disposePlayer: disposePlayer,
    live: live,
    syncPlayers: syncPlayers,
    disposeAll: disposeAll
  };
})(window.RS6 = window.RS6 || {});
