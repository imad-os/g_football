/* Three.js scene: renderer, camera, stadium, ball, controlled-player arrows. No per-frame allocation. */
(function (NS) {
  'use strict';

  var renderer, scene, camera, dirLight, ambLight;
  var pitchMesh, crowdMesh, ballMesh;
  var rings = [null, null]; // controlled-player arrows (P1, P2)
  var arrowMats = [null, null];
  var ARROW_COLORS = [0x93c5fd, 0xfca5a5]; // light blue (P1), light red (P2)
  var ARROW_BLINK = 0xfde047;              // yellow flash while receiving a pass
  var ARROW_Y = 4.2;
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

  function buildGoal(xPos) {
    var sign = xPos < 0 ? -1 : 1;
    var postMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var netMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1, wireframe: true, transparent: true, opacity: 0.45 });
    var postGeo = new THREE.CylinderGeometry(0.14, 0.14, NS.GOAL_HEIGHT, 6);
    var p1 = new THREE.Mesh(postGeo, postMat);
    p1.position.set(xPos, NS.GOAL_HEIGHT / 2, -NS.GOAL_HALF_W);
    var p2 = new THREE.Mesh(postGeo, postMat);
    p2.position.set(xPos, NS.GOAL_HEIGHT / 2, NS.GOAL_HALF_W);
    var barGeo = new THREE.CylinderGeometry(0.14, 0.14, NS.GOAL_HALF_W * 2, 6);
    barGeo.rotateX(Math.PI / 2);
    var bar = new THREE.Mesh(barGeo, postMat);
    bar.position.set(xPos, NS.GOAL_HEIGHT, 0);
    var net = new THREE.Mesh(new THREE.BoxGeometry(NS.GOAL_DEPTH, NS.GOAL_HEIGHT, NS.GOAL_HALF_W * 2), netMat);
    net.position.set(xPos + sign * (NS.GOAL_DEPTH / 2), NS.GOAL_HEIGHT / 2, 0);
    scene.add(p1, p2, bar, net);
  }

  function buildStadium(tier) {
    var surroundGeo = new THREE.PlaneGeometry(NS.PITCH_HALF_W * 2 + 36, NS.PITCH_HALF_H * 2 + 30);
    surroundGeo.rotateX(-Math.PI / 2);
    var surround = new THREE.Mesh(surroundGeo, new THREE.MeshBasicMaterial({ color: 0x0f172a }));
    surround.position.y = -0.05;
    scene.add(surround);

    var pitchGeo = new THREE.PlaneGeometry(NS.PITCH_HALF_W * 2, NS.PITCH_HALF_H * 2);
    pitchGeo.rotateX(-Math.PI / 2);
    pitchMesh = new THREE.Mesh(pitchGeo, new THREE.MeshBasicMaterial({ map: NS.Assets.pitchTexture(tier.pitchStripes) }));
    scene.add(pitchMesh);

    var board = new THREE.Mesh(new THREE.BoxGeometry(NS.PITCH_HALF_W * 2 + 6, 1.4, 0.5), new THREE.MeshBasicMaterial({ color: 0x090d16 }));
    board.position.set(0, 0.7, -NS.PITCH_HALF_H - 2.5);
    scene.add(board);

    buildGoal(-NS.PITCH_HALF_W);
    buildGoal(NS.PITCH_HALF_W);

    var COUNT = 140;
    crowdMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff }), COUNT);
    var dummy = new THREE.Object3D();
    var palette = [0xef4444, 0x38bdf8, 0xfacc15, 0xf8fafc, 0x22c55e];
    var color = new THREE.Color();
    for (var i = 0; i < COUNT; i++) {
      var row = Math.floor(i / 28);
      var col = i % 28;
      dummy.position.set(-NS.PITCH_HALF_W + col * 3.4 * NS.PITCH_SCALE, 2.2 + row * 1.6, -NS.PITCH_HALF_H - 5.5 - row * 2.1);
      dummy.updateMatrix();
      crowdMesh.setMatrixAt(i, dummy.matrix);
      color.setHex(palette[i % palette.length]);
      crowdMesh.setColorAt(i, color);
    }
    scene.add(crowdMesh);
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

      ballMesh = new THREE.Mesh(NS.Assets.geo.ball, new THREE.MeshLambertMaterial({ color: 0xffffff }));
      scene.add(ballMesh);
      for (var i = 0; i < 2; i++) {
        // light fill + dark border (a slightly bigger back-face copy drawn behind it)
        rings[i] = new THREE.Group();
        arrowMats[i] = new THREE.MeshBasicMaterial({ color: ARROW_COLORS[i] });
        var border = new THREE.Mesh(NS.Assets.geo.arrow, new THREE.MeshBasicMaterial({ color: 0x0b1220, side: THREE.BackSide }));
        border.scale.set(1.28, 1.2, 1.28);
        rings[i].add(border);
        rings[i].add(new THREE.Mesh(NS.Assets.geo.arrow, arrowMats[i]));
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
    setBall: function (pos, rotX, rotZ) {
      ballMesh.position.copy(pos);
      ballMesh.rotation.x = rotX;
      ballMesh.rotation.z = rotZ;
    },
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
    // Smooth follow camera; called once per simulation step.
    followBall: function (dt, bx, bz, mode) {
      var cfg = CAM[mode] || CAM.WIDE;
      var tx = bx * cfg.trackX;
      var lim = 24 * NS.PITCH_SCALE;
      if (tx > lim) tx = lim; else if (tx < -lim) tx = -lim;
      var tz = cfg.dist + bz * 0.25;
      var k = Math.min(1, 5 * dt);
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (cfg.height - camera.position.y) * k;
      camera.position.z += (tz - camera.position.z) * k;
      lookTarget.set(bx * 0.45, 0, bz * 0.25);
      camera.lookAt(lookTarget);
    },
    render: function () { renderer.render(scene, camera); },
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
