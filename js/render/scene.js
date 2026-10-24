/* Three.js scene: renderer, camera, stadium, ball, controlled-player arrows. No per-frame allocation. */
(function (NS) {
  'use strict';

  var renderer, scene, camera, dirLight, ambLight;
  var pitchMesh, crowdMesh, ballMesh, ballShadow, ballShadowMat;
  var spinQ = null, spinAxis = null;
  var wx = 0, wy = 0, wz = 0;  // the ball's spin (rad/s, world axes)
  var stadium = null;       // everything sized from the pitch (rebuilt when the stadium changes)
  var trail = [];           // pooled spheres behind a shot
  var TRAIL_N = 9;
  var trailCount = 0;
  var projV = null;
  var nets = [null, null];  // goal nets (-x, +x)
  var netT = [0, 0];        // net bulge, 1 when the ball hits it
  var rings = [null, null, null, null]; // controlled-player arrows (P1, P2, AI.MA of team 0 / 1)
  var ringWas = [false, false, false, false]; // (shown before a replay)
  var arrowMats = [null, null];
  var ARROW_COLORS = [0x93c5fd, 0xfca5a5, 0xc084fc, 0xc084fc]; // light blue (P1), light red (P2), violet (AI.MA)
  var ARROW_BLINK = 0xfde047;              // yellow flash while receiving a pass
  var ARROW_Y = 4.1;
  var ARROW_SCALE = 0.6;                   // a small pyramid above the head, not a big marker
  var arrowT = 0;
  var lookTarget = null;
  var canvasEl = null;
  var width = 0;
  var height = 0;
  var currentTier = null;

  var CAM = {
    CLOSE: { height: 29, dist: 36, trackX: 0.78 },
    WIDE: { height: 38, dist: 46, trackX: 0.68 },
    BLIMP: { height: 54, dist: 56, trackX: 0.5 }
  };

  function buildGoal(xPos, scene) {
    var sign = xPos < 0 ? -1 : 1;
    var postMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var netMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1, wireframe: true, transparent: true, opacity: 0.45 });
    var postGeo = new THREE.CylinderGeometry(NS.POST_R, NS.POST_R, NS.GOAL_HEIGHT, 8);
    var p1 = new THREE.Mesh(postGeo, postMat);
    p1.position.set(xPos, NS.GOAL_HEIGHT / 2, -NS.GOAL_HALF_W);
    var p2 = new THREE.Mesh(postGeo, postMat);
    p2.position.set(xPos, NS.GOAL_HEIGHT / 2, NS.GOAL_HALF_W);
    var barGeo = new THREE.CylinderGeometry(NS.POST_R, NS.POST_R, NS.GOAL_HALF_W * 2, 8);
    barGeo.rotateX(Math.PI / 2);
    var bar = new THREE.Mesh(barGeo, postMat);
    bar.position.set(xPos, NS.GOAL_HEIGHT, 0);
    var net = new THREE.Mesh(new THREE.BoxGeometry(NS.GOAL_DEPTH, NS.GOAL_HEIGHT, NS.GOAL_HALF_W * 2), netMat);
    net.position.set(xPos + sign * (NS.GOAL_DEPTH / 2), NS.GOAL_HEIGHT / 2, 0);
    scene.add(p1, p2, bar, net);
    nets[sign > 0 ? 1 : 0] = net;
  }

  function buildStadium(tier) {
    stadium = new THREE.Group();
    scene.add(stadium);
    var M = NS.Assets.PITCH_MARGIN;
    var surroundGeo = new THREE.PlaneGeometry(NS.PITCH_HALF_W * 2 + 40, NS.PITCH_HALF_H * 2 + 34);
    surroundGeo.rotateX(-Math.PI / 2);
    var surround = new THREE.Mesh(surroundGeo, new THREE.MeshBasicMaterial({ color: 0x0f172a }));
    surround.position.y = -0.05;
    stadium.add(surround);

    var pitchGeo = new THREE.PlaneGeometry((NS.PITCH_HALF_W + M) * 2, (NS.PITCH_HALF_H + M) * 2); // lines drawn M inside
    pitchGeo.rotateX(-Math.PI / 2);
    pitchMesh = new THREE.Mesh(pitchGeo, new THREE.MeshBasicMaterial({ map: NS.Assets.pitchTexture(tier.pitchStripes) }));
    stadium.add(pitchMesh);

    var board = new THREE.Mesh(new THREE.BoxGeometry(NS.PITCH_HALF_W * 2 + 6, 1.4, 0.5), new THREE.MeshBasicMaterial({ color: 0x090d16 }));
    board.position.set(0, 0.7, -NS.PITCH_HALF_H - M - 1);
    stadium.add(board);

    buildGoal(-NS.PITCH_HALF_W, stadium);
    buildGoal(NS.PITCH_HALF_W, stadium);

    var COUNT = 140;
    crowdMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff }), COUNT);
    var dummy = new THREE.Object3D();
    var palette = [0xef4444, 0x38bdf8, 0xfacc15, 0xf8fafc, 0x22c55e];
    var color = new THREE.Color();
    for (var i = 0; i < COUNT; i++) {
      var row = i % 5;
      var col = Math.floor(i / 5);
      dummy.position.set(-NS.PITCH_HALF_W + col * 3.4 * NS.PITCH_SCALE, 2.2 + row * 1.6, -NS.PITCH_HALF_H - M - 3.5 - row * 2.1);
      dummy.updateMatrix();
      crowdMesh.setMatrixAt(i, dummy.matrix);
      color.setHex(palette[i % palette.length]);
      crowdMesh.setColorAt(i, color);
    }
    stadium.add(crowdMesh);
  }

  NS.Scene = {
    init: function (canvas, tier) {
      canvasEl = canvas;
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
      width = window.innerWidth;
      height = window.innerHeight;
      renderer.setSize(width, height);
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060b16);
      camera = new THREE.PerspectiveCamera(42, width / height, 1, 240);
      camera.position.set(0, 38, 48);
      lookTarget = new THREE.Vector3(0, 0, -2);
      camera.lookAt(lookTarget);
      ambLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambLight);
      dirLight = new THREE.DirectionalLight(0xfffbeb, 0.65);
      dirLight.position.set(25, 50, 30);
      scene.add(dirLight);

      NS.Assets.initGeometries();
      buildStadium(tier);

      ballMesh = new THREE.Mesh(NS.Assets.geo.ball, new THREE.MeshLambertMaterial({ color: 0xffffff, map: NS.Assets.ballTexture('CLASSIC') }));
      scene.add(ballMesh);
      // its shadow on the grass: smaller and fainter the higher it flies (a small real-size ball is easy to follow)
      ballShadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
      ballShadow = new THREE.Mesh(NS.Assets.geo.ballShadow, ballShadowMat);
      scene.add(ballShadow);
      spinQ = new THREE.Quaternion();
      spinAxis = new THREE.Vector3();
      var trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false });
      for (var t = 0; t < TRAIL_N; t++) {
        var tm = new THREE.Mesh(NS.Assets.geo.trail, trailMat);
        var sc = 1 - t / TRAIL_N;
        tm.scale.set(sc, sc, sc);
        tm.visible = false;
        scene.add(tm);
        trail.push(tm);
      }
      projV = new THREE.Vector3();
      for (var i = 0; i < 4; i++) {
        // light fill + dark border (a slightly bigger back-face copy drawn behind it)
        rings[i] = new THREE.Group();
        arrowMats[i] = new THREE.MeshBasicMaterial({ color: ARROW_COLORS[i] });
        var border = new THREE.Mesh(NS.Assets.geo.arrow, new THREE.MeshBasicMaterial({ color: 0x0b1220, side: THREE.BackSide }));
        border.scale.set(1.28, 1.2, 1.28);
        rings[i].add(border);
        rings[i].add(new THREE.Mesh(NS.Assets.geo.arrow, arrowMats[i]));
        rings[i].scale.setScalar(ARROW_SCALE);
        rings[i].position.y = ARROW_Y;
        rings[i].visible = false;
        scene.add(rings[i]);
      }
      this.applyTier(tier);
    },
    applyTier: function (tier) {
      if (!renderer) return;
      currentTier = tier;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * tier.pixelRatio);
      renderer.setSize(width, height);
      if (pitchMesh) {
        pitchMesh.material.map = NS.Assets.pitchTexture(tier.pitchStripes);
        pitchMesh.material.needsUpdate = true;
      }
      if (crowdMesh) {
        crowdMesh.count = tier.crowdCount;
        crowdMesh.visible = tier.crowdCount > 0;
      }
      dirLight.visible = tier.useLighting;
    },
    resize: function () {
      if (!renderer) return;
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      this.applyTier(currentTier);
    },
    add: function (obj) { scene.add(obj); },
    remove: function (obj) { scene.remove(obj); },
    // The ball for this step: on the grass (or at a player's feet) it rolls without slipping (spin axis = up x velocity,
    // rate = speed / radius); in the air it keeps the spin it left the grass or the boot with. sideSpin = curl (World).
    setBall: function (pos, vel, sideSpin, dt, grounded) {
      var R = NS.BALL_R;
      if (grounded) { wx = vel.z / R; wy = 0; wz = -vel.x / R; }
      else { var k = Math.exp(-0.3 * dt); wx *= k; wz *= k; }
      wy += (sideSpin * 0.6 - wy) * 0.1;
      var w = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (w > 1e-4) {
        spinAxis.set(wx / w, wy / w, wz / w);
        spinQ.setFromAxisAngle(spinAxis, w * dt);
        ballMesh.quaternion.premultiply(spinQ);
        ballMesh.quaternion.normalize();
      }
      ballMesh.position.copy(pos);
      this.placeBallShadow();
    },
    placeBallShadow: function () {
      var p = ballMesh.position, up = p.y - NS.BALL_R;
      var s = 1 / (1 + up * 0.12);
      ballShadow.position.set(p.x, 0.025, p.z);
      ballShadow.scale.set(s, 1, s);
      ballShadowMat.opacity = 0.4 * s;
    },
    // Settings > Polygons: the ball with its new number of faces
    rebuildBall: function () {
      if (!ballMesh) return;
      var old = NS.Assets.rebuildBall();
      if (!old) return;
      ballMesh.geometry = NS.Assets.geo.ball;
      old.dispose();
    },
    setBallSkin: function (skin) {
      if (!ballMesh) return;
      ballMesh.material.map = NS.Assets.ballTexture(skin || 'CLASSIC');
      ballMesh.material.needsUpdate = true;
    },
    // Streak of fading balls behind a shot: on = add the current position, off = shrink away.
    trail: function (on, pos) {
      var i;
      if (on) {
        for (i = TRAIL_N - 1; i > 0; i--) trail[i].position.copy(trail[i - 1].position);
        trail[0].position.copy(pos);
        if (trailCount < TRAIL_N) trailCount++;
      } else if (trailCount > 0) {
        trailCount--;
      }
      for (i = 0; i < TRAIL_N; i++) trail[i].visible = i > 0 && i < trailCount;
    },
    // Screen position of a world point: Scene.px / Scene.py in 0..1 (from the top-left corner).
    project: function (pos) {
      projV.copy(pos).project(camera);
      this.px = (projV.x + 1) * 0.5;
      this.py = (1 - projV.y) * 0.5;
    },
    px: 0.5, py: 0.5,
    setRing: function (i, visible, x, z, blink) {
      var r = rings[i];
      r.visible = visible;
      if (visible) {
        arrowMats[i].color.setHex(blink && Math.floor(arrowT * 7) % 2 === 0 ? ARROW_BLINK : ARROW_COLORS[i]);
        arrowT += 0.016;
        r.position.set(x, ARROW_Y + Math.sin(arrowT * 5 + i * 1.6) * 0.15, z); // gentle bob
        r.rotation.y = arrowT * 2;
      }
    },
    // The ball hit the net of goal side (+1 / -1): it bulges and settles.
    netHit: function (side) { netT[side > 0 ? 1 : 0] = 1; },
    // Smooth follow camera; called once per simulation step (also settles the nets).
    followBall: function (dt, bx, bz, mode) {
      for (var n = 0; n < 2; n++) {
        if (netT[n] <= 0 || !nets[n]) continue;
        netT[n] -= dt * 1.6;
        var sgn = n === 1 ? 1 : -1;
        var bulge = netT[n] > 0 ? Math.sin(netT[n] * 9) * 0.22 * netT[n] : 0;
        nets[n].scale.set(1 + bulge, 1, 1);
        nets[n].position.x = sgn * (NS.PITCH_HALF_W + NS.GOAL_DEPTH * (1 + bulge) / 2);
      }
      var cfg = CAM[mode] || CAM.WIDE;
      var tx = bx * cfg.trackX;
      var lim = NS.PITCH_HALF_W * 0.6;
      if (tx > lim) tx = lim; else if (tx < -lim) tx = -lim;
      var tz = cfg.dist + bz * 0.5; // far enough to show throw-ins and corners on the near touchline
      var k = Math.min(1, 5 * dt);
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (cfg.height - camera.position.y) * k;
      camera.position.z += (tz - camera.position.z) * k;
      lookTarget.set(bx * 0.5, 0, bz * 0.58);
      camera.lookAt(lookTarget);
    },
    render: function () { renderer.render(scene, camera); },
    // replays (js/game/replay.js): what the camera, the ball and the nets look like now, 13 numbers from out[o], and the
    // ball's turn about the vertical in out[y]
    camState: function (out, o, y) {
      out[o] = camera.position.x; out[o + 1] = camera.position.y; out[o + 2] = camera.position.z;
      out[o + 3] = lookTarget.x; out[o + 4] = lookTarget.y; out[o + 5] = lookTarget.z;
      out[o + 6] = ballMesh.position.x; out[o + 7] = ballMesh.position.y; out[o + 8] = ballMesh.position.z;
      out[o + 9] = ballMesh.rotation.x; out[o + 10] = ballMesh.rotation.z; out[y] = ballMesh.rotation.y;
      out[o + 11] = nets[0] ? nets[0].scale.x - 1 : 0; out[o + 12] = nets[1] ? nets[1].scale.x - 1 : 0;
    },
    setCamState: function (a, o, y) {
      camera.position.set(a[o], a[o + 1], a[o + 2]);
      lookTarget.set(a[o + 3], a[o + 4], a[o + 5]);
      camera.lookAt(lookTarget);
      ballMesh.position.set(a[o + 6], a[o + 7], a[o + 8]);
      ballMesh.rotation.set(a[o + 9], a[y], a[o + 10]);
      this.placeBallShadow();
      for (var n = 0; n < 2; n++) {
        if (!nets[n]) continue;
        var bulge = a[o + 11 + n];
        nets[n].scale.set(1 + bulge, 1, 1);
        nets[n].position.x = (n === 1 ? 1 : -1) * (NS.PITCH_HALF_W + NS.GOAL_DEPTH * (1 + bulge) / 2);
      }
    },
    // a replay on screen: no arrows, no shot streak (put back as they were after it)
    replayMode: function (on) {
      for (var i = 0; i < 4; i++) {
        if (on) { ringWas[i] = rings[i].visible; rings[i].visible = false; } else rings[i].visible = ringWas[i];
      }
      for (i = 0; i < TRAIL_N; i++) trail[i].visible = on ? false : i > 0 && i < trailCount;
    },
    // A new match: another mowing pattern for the grass, drawn at random (the same pitch otherwise)
    newPitchDesign: function () {
      var n = NS.PITCH_DESIGNS.length, d = Math.floor(Math.random() * (n - 1));
      NS.pitchDesign = d >= NS.pitchDesign ? d + 1 : d; // never the same one twice in a row
      if (!pitchMesh) return;
      pitchMesh.material.map = NS.Assets.pitchTexture(currentTier ? currentTier.pitchStripes : true);
      pitchMesh.material.needsUpdate = true;
    },
    // A new stadium (pitch size): the pitch, lines, goals, boards and stands are built again.
    rebuildStadium: function () {
      if (!scene || !stadium) return;
      scene.remove(stadium);
      stadium.traverse(function (o) {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        if (o.material && o.material.dispose) o.material.dispose();
      });
      buildStadium(currentTier || { pitchStripes: true });
    },
    lit: function () { return currentTier ? currentTier.useLighting : true; },
    dispose: function () {
      if (!scene) return;
      scene.traverse(function (o) {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        if (o.material) {
          if (o.material.map && o.material.map.dispose) o.material.map.dispose();
          if (o.material.dispose) o.material.dispose();
        }
      });
      NS.Assets.disposeAll();
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      renderer = null;
      scene = null;
    }
  };
})(window.RS6 = window.RS6 || {});
