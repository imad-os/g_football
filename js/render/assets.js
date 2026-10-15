/* Procedural low-poly assets: shared geometries, kit and pitch textures, player meshes. Everything is disposable. */
(function (NS) {
  'use strict';

  var geo = {};
  var jerseyCache = {};
  var pitchTexture = null;

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
    geo.shadow = new THREE.CircleGeometry(0.85, 12);
    geo.shadow.rotateX(-Math.PI / 2);
    geo.ring = new THREE.RingGeometry(0.95, 1.25, 16);
    geo.ring.rotateX(-Math.PI / 2);
    geo.ball = new THREE.IcosahedronGeometry(NS.BALL_R, 1);
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

  // Returns { root, leftLeg, rightLeg, mats } (mats are owned by the player and disposed with it).
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
    mats.push(torsoMat, headMat, hairMat, shortsMat);

    var torso = new THREE.Mesh(geo.torso, torsoMat);
    torso.position.y = 1.45;
    root.add(torso);
    var head = new THREE.Mesh(geo.head, headMat);
    head.position.y = 2.45;
    root.add(head);
    var hair = new THREE.Mesh(geo.hair, hairMat);
    hair.position.y = 2.78;
    root.add(hair);
    var leftLeg = new THREE.Mesh(geo.limb, shortsMat);
    leftLeg.position.set(-0.24, 0.55, 0);
    root.add(leftLeg);
    var rightLeg = new THREE.Mesh(geo.limb, shortsMat);
    rightLeg.position.set(0.24, 0.55, 0);
    root.add(rightLeg);
    return { root: root, leftLeg: leftLeg, rightLeg: rightLeg, mats: mats };
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
  }

  NS.Assets = {
    geo: geo,
    hexToCss: hexToCss,
    initGeometries: initGeometries,
    pitchTexture: buildPitchTexture,
    createPlayer: createPlayer,
    disposePlayer: disposePlayer,
    disposeAll: disposeAll
  };
})(window.RS6 = window.RS6 || {});
