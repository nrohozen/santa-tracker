// The sleigh rig: Santa's sleigh (procedural) and the reindeer team (Quaternius CC0 model, skinned, galloping).
// Units inside the rig: METRES. three-view.js places and scales the rig on the globe and owns the camera.
// Globals from the bundle: THREE, THREE.GLTFLoader, ASSETS (base64 glb), mulberry32.
window.SantaSleigh = (() => {
  if (typeof THREE === 'undefined') return null;

  const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: .85, metalness: 0 }, o));
  const MAT = {
    red: std({ color: '#b3202a', roughness: .45, metalness: .1 }),
    gold: std({ color: '#e8bb5e', metalness: .85, roughness: .3 }),
    steel: std({ color: '#9aa4b4', metalness: .9, roughness: .35 }),
    velvet: std({ color: '#5a0f16', roughness: .95 }),
    sack: std({ color: '#6b3b1f', roughness: 1 }),
    leather: new THREE.LineBasicMaterial({ color: 0x4a2e16 }),
    bell: std({ color: '#e8bb5e', metalness: .9, roughness: .3 }),
    nose: new THREE.MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 2.5 }),
    bulb: new THREE.MeshStandardMaterial({ color: '#ffe3a0', emissive: '#ffd080', emissiveIntensity: 2 }),
  };
  const shadowed = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  // Santa's sleigh: red body with a curled front, gold trim rails, steel runners, a seat, the sack behind.
  function buildSleigh() {
    const g = new THREE.Group(); g.name = 'sleigh';
    const shape = new THREE.Shape();
    shape.moveTo(-1.4, 0); shape.lineTo(1.2, 0); shape.quadraticCurveTo(1.9, 0.1, 2.0, 0.9); shape.quadraticCurveTo(2.05, 1.5, 1.6, 1.55);
    shape.quadraticCurveTo(1.9, 1.3, 1.75, 0.95); shape.lineTo(1.1, 0.75); shape.lineTo(-0.9, 0.75); shape.quadraticCurveTo(-1.5, 0.8, -1.4, 0.3); shape.closePath();
    const body = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 }), MAT.red));
    body.rotation.y = -Math.PI / 2; body.position.set(0.75, 0.25, 1.0); g.add(body);
    const trim = [new THREE.Vector3(0.75, 1.0, 2.4), new THREE.Vector3(0.75, 1.0, -0.2), new THREE.Vector3(0.75, 1.15, -0.9), new THREE.Vector3(0.75, 1.8, -1.0), new THREE.Vector3(0.75, 1.6, -0.7)];
    for (const sx of [-1, 1]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trim.map(p => new THREE.Vector3(p.x * sx, p.y, p.z))), 40, 0.035, 8), MAT.gold));
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.7, 0.02, 2.2), new THREE.Vector3(sx * 0.7, 0.02, -1.2), new THREE.Vector3(sx * 0.7, 0.35, -1.9), new THREE.Vector3(sx * 0.7, 0.9, -1.75)]);
      g.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.04, 8), MAT.steel)));
      for (const z of [1.6, -0.6]) { const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), MAT.steel); strut.position.set(sx * 0.7, 0.14, z); g.add(strut); }
    }
    const seat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.6), MAT.velvet)); seat.position.set(0, 0.85, 1.2); g.add(seat);
    const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.12), MAT.red)); back.position.set(0, 1.3, 1.55); g.add(back);
    const bag = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), MAT.sack)); bag.scale.set(1, 0.8, 0.9); bag.position.set(0, 1.1, 2.0); g.add(bag);
    const lamp = new THREE.PointLight(0xffd9a0, 6, 8, 2); lamp.position.set(0, 1.3, -0.9); g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.bulb); bulb.position.copy(lamp.position); g.add(bulb);
    g.position.set(0, -0.2, -0.4);
    return g;
  }

  // Team formation (metres, −Z forward): four pairs and Rudolph alone in front.
  const FORMATION = [{ x: 0, z: -19.5, lead: true }];
  for (let pair = 0; pair < 4; pair++) for (const side of [-1, 1]) FORMATION.push({ x: side * 1.7, z: -6.0 - pair * 3.3, pair, side });

  // Size a skinned model from its skeleton: the armature carries the real scale and the geometry bounds lie.
  function skeletonBounds(root) {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3(), v = new THREE.Vector3();
    root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.bones.forEach(bn => { bn.getWorldPosition(v); b.expandByPoint(v); }); });
    return b;
  }

  function base64ToBuffer(b64) {
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  // create() returns the rig immediately (sleigh only); the team is parsed asynchronously and attached when ready.
  function create(opts = {}) {
    const lite = !!opts.lite;
    const rig = new THREE.Group(); rig.name = 'sleighRig';
    rig.add(buildSleigh());
    const deer = [], mixers = [], actions = [];
    const nose = new THREE.PointLight(0xff3a2a, 22, 30, 2); nose.visible = false; rig.add(nose);
    const noseBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), MAT.nose); noseBall.visible = false; rig.add(noseBall);
    const state = { ready: false, count: 0, mode: 'gallop', t: 0 };
    const slots = lite ? FORMATION.slice(0, 5) : FORMATION;

    function attach(scene, slot, idx) {
      const d = scene; const b = skeletonBounds(d); const h = (b.max.y - b.min.y) * 1.12 || 1;
      const k = 1.9 / h; d.scale.setScalar(k); d.updateMatrixWorld(true);
      const b2 = skeletonBounds(d);
      d.position.set(slot.x, -0.6 - b2.min.y + 0.1, slot.z); d.rotation.y = Math.PI; // the model faces +Z; we fly toward −Z
      d.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      rig.add(d); deer.push(d);
      // harness: collar → the animal behind (or the sleigh) with a little sag; a bell on each collar
      const from = new THREE.Vector3(slot.x, 0.9, slot.z + 0.6);
      const to = slot.lead ? new THREE.Vector3(0, 0.9, -6.0 + 0.6) : (slot.pair === 3 || (lite && slot.pair === 1)) ? new THREE.Vector3(slot.side * 0.5, 0.7, 0.4) : new THREE.Vector3(slot.x, 0.9, slot.z + 3.3 - 0.6);
      const mid = new THREE.Vector3().lerpVectors(from, to, 0.5).add(new THREE.Vector3(0, -0.12, 0));
      rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, mid, to]), MAT.leather));
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.bell); bell.position.set(slot.x, 0.75, slot.z + 0.7); rig.add(bell);
      if (slot.lead) { noseBall.position.set(0, 1.3, slot.z - 1.1); nose.position.copy(noseBall.position); nose.visible = noseBall.visible = true; }
    }

    function parseTeam(glbBuffer) {
      const loader = new THREE.GLTFLoader();
      slots.forEach((slot, i) => {
        loader.parse(glbBuffer.slice(0), '', g => {
          attach(g.scene, slot, i);
          const mixer = new THREE.AnimationMixer(g.scene);
          const clips = g.animations;
          const pick = n => THREE.AnimationClip.findByName(clips, n);
          const gallopClip = pick('Gallop') || clips[0], idleClip = pick('Idle_Headlow') || pick('Idle') || gallopClip;
          const gallop = mixer.clipAction(gallopClip), idle = mixer.clipAction(idleClip);
          gallop.play(); gallop.time = (i * 0.17) % gallop.getClip().duration; mixer.timeScale = 1.12 + ((slot.pair || 0) % 2) * 0.1;
          mixers.push(mixer); actions.push({ gallop, idle });
          state.count++; if (state.count === slots.length) state.ready = true;
        }, err => console.warn('reindeer parse failed', err));
      });
    }

    try {
      if (typeof ASSETS !== 'undefined' && ASSETS.reindeer && THREE.GLTFLoader) parseTeam(base64ToBuffer(ASSETS.reindeer));
      else console.warn('no reindeer asset or loader; flying without the team');
    } catch (e) { console.warn('team setup failed', e); }

    // per-frame: gallop in flight, stand (idle) when parked; nose pulses
    function update(dt, flying) {
      state.t += dt;
      for (let i = 0; i < mixers.length; i++) {
        const { gallop, idle } = actions[i];
        if (flying && !gallop.isRunning()) { idle.fadeOut(0.4); gallop.reset().fadeIn(0.4).play(); }
        if (!flying && !idle.isRunning()) { gallop.fadeOut(0.4); idle.reset().fadeIn(0.4).play(); }
        mixers[i].update(dt);
      }
      nose.intensity = 18 + 10 * (0.5 + 0.5 * Math.sin(state.t * 4.5));
    }

    return { group: rig, update, state, deer, mixers };
  }

  return { create, FORMATION, MAT };
})();
