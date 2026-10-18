/* Procedural low-poly assets: shared geometries, kit and pitch textures, player meshes. Everything is disposable. */
(function (NS) {
  'use strict';

  var geo = {};
  var jerseyCache = {};
  var pitchTexture = null;
  var ballTextures = {};

  function hexToCss(hex) {
    var s = hex.toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }

  function initGeometries() {
    geo.torso = new THREE.BoxGeometry(0.95, 1.25, 0.55);
    geo.head = new THREE.BoxGeometry(0.62, 0.65, 0.62);
    geo.hair = new THREE.BoxGeometry(0.66, 0.25, 0.66);
    geo.limb = new THREE.BoxGeometry(0.32, 0.85, 0.32);
    geo.arm = new THREE.BoxGeometry(0.22, 0.78, 0.22);
    geo.card = new THREE.BoxGeometry(0.36, 0.5, 0.1); // booking card shown over the head
    geo.shadow = new THREE.CircleGeometry(0.85, 12);
    geo.shadow.rotateX(-Math.PI / 2);
    // controlled-player marker: an arrow above the head, pointing down at the player
    geo.arrow = new THREE.ConeGeometry(0.85, 1.5, 4);
    geo.arrow.rotateX(Math.PI);
    geo.ball = new THREE.SphereGeometry(NS.BALL_R, 18, 12); // UV-mapped for the ball skins
    geo.trail = new THREE.SphereGeometry(NS.BALL_R * 0.8, 6, 4);
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

  function buildPitchTexture(withStripes) {
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    var stripes = 12;
    var sw = canvas.width / stripes;
    for (var i = 0; i < stripes; i++) {
      ctx.fillStyle = (!withStripes || i % 2 === 0) ? '#1f7234' : '#26843d';
      ctx.fillRect(i * sw, 0, sw, canvas.height);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 14, canvas.width - 32, canvas.height - 28);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 14);
    ctx.lineTo(canvas.width / 2, canvas.height - 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(16, canvas.height / 2 - 58, 68, 116);
    ctx.strokeRect(canvas.width - 84, canvas.height / 2 - 58, 68, 116);
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

  // Returns { root, body, leftLeg, rightLeg, leftArm, rightArm, mats } (mats are owned by the player and disposed
  // with it). root turns with the facing; body pivots at the hips (lean, roll, slide); legs pivot at the hips and
  // arms at the shoulders, so runs, kicks, tackles and dives can be animated by rotations only.
  function limb(parent, g, mat, x, y, len) {
    var pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    var m = new THREE.Mesh(g, mat);
    m.position.y = -len / 2;
    pivot.add(m);
    parent.add(pivot);
    return pivot;
  }

  function createPlayer(pattern, c1, c2, shortsColor, skinColor, lit) {
    var Mat = lit ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial;
    var root = new THREE.Group();
    var mats = [];
    var shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38 });
    mats.push(shadowMat);
    var shadow = new THREE.Mesh(geo.shadow, shadowMat);
    shadow.position.y = 0.03;
    root.add(shadow);

    var torsoMat = new Mat({ map: jerseyTexture(pattern, c1, c2) });
    var headMat = new Mat({ color: skinColor });
    var hairMat = new Mat({ color: 0x1a1816 });
    var shortsMat = new Mat({ color: shortsColor });
    var sleeveMat = new Mat({ color: c1 });
    mats.push(torsoMat, headMat, hairMat, shortsMat, sleeveMat);

    var body = new THREE.Group();
    body.position.y = 0.9; // hips
    root.add(body);
    var torso = new THREE.Mesh(geo.torso, torsoMat);
    torso.position.y = 0.55;
    body.add(torso);
    var head = new THREE.Mesh(geo.head, headMat);
    head.position.y = 1.55;
    body.add(head);
    var hair = new THREE.Mesh(geo.hair, hairMat);
    hair.position.y = 1.88;
    body.add(hair);
    var leftArm = limb(body, geo.arm, sleeveMat, -0.6, 1.12, 0.78);
    var rightArm = limb(body, geo.arm, sleeveMat, 0.6, 1.12, 0.78);
    var leftLeg = limb(body, geo.limb, shortsMat, -0.24, 0, 0.85);
    var rightLeg = limb(body, geo.limb, shortsMat, 0.24, 0, 0.85);
    // his booking (warning / yellow / red), hidden until he gets one; it sits just under the controlled-player arrow
    var cardMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    mats.push(cardMat);
    var card = new THREE.Mesh(geo.card, cardMat);
    card.position.y = 3.35;
    card.visible = false;
    root.add(card);
    return { root: root, body: body, leftLeg: leftLeg, rightLeg: rightLeg, leftArm: leftArm, rightArm: rightArm, card: card, mats: mats };
  }

  function disposePlayer(mesh) {
    for (var i = 0; i < mesh.mats.length; i++) mesh.mats[i].dispose();
  }

  function disposeAll() {
    var k;
    for (k in geo) geo[k].dispose();
    for (k in jerseyCache) jerseyCache[k].dispose();
    jerseyCache = {};
    if (pitchTexture) pitchTexture.dispose();
    pitchTexture = null;
    for (k in ballTextures) ballTextures[k].dispose();
    ballTextures = {};
  }

  NS.Assets = {
    geo: geo,
    hexToCss: hexToCss,
    initGeometries: initGeometries,
    pitchTexture: buildPitchTexture,
    ballTexture: ballTexture,
    createPlayer: createPlayer,
    disposePlayer: disposePlayer,
    disposeAll: disposeAll
  };
})(window.RS6 = window.RS6 || {});
