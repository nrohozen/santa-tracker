// The sleigh rig: Santa's sleigh (procedural), his own hands on the reins, and the reindeer team
// (Quaternius CC0 model, skinned, galloping) with leather harness, brass bells, breath and a sparkle trail.
// Units inside the rig: METRES, +Y up, −Z forward. three-view.js places and scales the rig and owns the camera,
// which sits at rig (0, 1.9, 1.4) looking forward: everything here is composed for that seat.
// Globals from the bundle: THREE, THREE.GLTFLoader, ASSETS (base64 glb), mulberry32, hash32.
window.SantaSleigh = (() => {
  if (typeof THREE === 'undefined') return null;

  // ---------- procedural textures ----------
  const canvasTex = (w, h, draw, repeat) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  };
  const noise = (g, w, h, n, a, r) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${(r() * a).toFixed(3)})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } };
  const TEX = {
    // sleigh paint: deep red lacquer with faint wood grain and a gold pinstripe a little below the rail
    paint: () => canvasTex(256, 256, (g, w, h) => {
      const r = mulberry32(0x5E1);
      g.fillStyle = '#a3171f'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(0,0,0,${(0.03 + 0.07 * r()).toFixed(3)})`; g.fillRect(0, y + r() * 2, w, 1); }
      noise(g, w, h, 500, .06, r);
      g.fillStyle = '#e8bb5e'; g.fillRect(0, h * 0.60, w, 3); g.fillRect(0, h * 0.64, w, 1.5);
    }, [0.5, 0.5]),
    plush: () => canvasTex(128, 128, (g, w, h) => { const r = mulberry32(0x7E1); g.fillStyle = '#5a0f16'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, .18, r); }, [3, 3]),
    burlap: () => canvasTex(128, 128, (g, w, h) => { const r = mulberry32(0xB0A); g.fillStyle = '#6b4a2a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; for (let i = 0; i < w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } noise(g, w, h, 600, .12, r); }, [4, 4]),
    ribbon: (base, rib) => canvasTex(64, 64, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = rib; g.fillRect(w * .42, 0, w * .16, h); g.fillRect(0, h * .42, w, h * .16); }),
    puff: () => canvasTex(64, 64, (g, w, h) => { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(.4, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, h); }),
    spark: () => canvasTex(32, 32, (g, w, h) => { const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, 'rgba(255,250,230,1)'); grd.addColorStop(.3, 'rgba(255,225,150,.8)'); grd.addColorStop(1, 'rgba(255,200,100,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, h); }),
    glow: (c0, c1) => canvasTex(64, 64, (g, w, h) => { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, c0); grd.addColorStop(1, c1); g.fillStyle = grd; g.fillRect(0, 0, w, h); }),
  };

  const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: .85, metalness: 0 }, o));
  const MAT = {
    red: std({ map: TEX.paint(), roughness: .38, metalness: .12 }),
    redPlain: std({ color: '#a3171f', roughness: .45, metalness: .1 }),
    gold: std({ color: '#e8bb5e', metalness: .85, roughness: .3 }),
    steel: std({ color: '#b8c2d0', metalness: .95, roughness: .28 }),
    velvet: std({ map: TEX.plush(), roughness: .98 }),
    sack: std({ map: TEX.burlap(), roughness: 1 }),
    leather: std({ color: '#3a2412', roughness: .9, metalness: .05 }),
    bell: std({ color: '#f0c35e', metalness: .95, roughness: .22 }),
    sleeve: std({ color: '#b31d22', roughness: .9 }),
    fur: std({ color: '#f4efe6', roughness: 1 }),
    mitten: std({ color: '#1f5a36', roughness: .95 }),
    nose: new THREE.MeshStandardMaterial({ color: '#ff3a24', emissive: '#ff2a1a', emissiveIntensity: 4 }),
    bulb: new THREE.MeshStandardMaterial({ color: '#ffe3a0', emissive: '#ffd080', emissiveIntensity: 2.2 }),
    present: [std({ map: TEX.ribbon('#2f7a46', '#f5c451') }), std({ map: TEX.ribbon('#2a5fb3', '#f6f1e7') }), std({ map: TEX.ribbon('#f6f1e7', '#b8332f') }), std({ map: TEX.ribbon('#d9a441', '#b8332f') })],
  };
  const shadowed = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  // Merge a list of geometries (after applying their meshes' matrices) into one non-indexed geometry: one draw call.
  function mergeMeshes(meshes) {
    const parts = meshes.map(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      if (!parts.every(p => p.attributes[name])) continue;
      const size = parts[0].attributes[name].itemSize, total = parts.reduce((n, p) => n + p.attributes[name].count, 0);
      const arr = new Float32Array(total * size); let off = 0;
      for (const p of parts) { arr.set(p.attributes[name].array, off); off += p.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    parts.forEach(p => p.dispose());
    return out;
  }
  const at = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };
  const tube = (pts, r, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6, false);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------- Santa's sleigh ----------
  function buildSleigh() {
    const g = new THREE.Group(); g.name = 'sleigh';
    const shape = new THREE.Shape();
    shape.moveTo(-1.4, 0); shape.lineTo(1.2, 0); shape.quadraticCurveTo(1.9, 0.1, 2.0, 0.9); shape.quadraticCurveTo(2.05, 1.5, 1.6, 1.55);
    shape.quadraticCurveTo(1.9, 1.3, 1.75, 0.95); shape.lineTo(1.1, 0.75); shape.lineTo(-0.9, 0.75); shape.quadraticCurveTo(-1.5, 0.8, -1.4, 0.3); shape.closePath();
    const body = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 }), MAT.red));
    body.rotation.y = -Math.PI / 2; body.position.set(0.75, 0.25, 1.0); g.add(body);
    // gold trim rails, one merged mesh
    const trim = [V(0.75, 1.0, 2.4), V(0.75, 1.0, -0.2), V(0.75, 1.15, -0.9), V(0.75, 1.8, -1.0), V(0.75, 1.6, -0.7)];
    g.add(new THREE.Mesh(mergeMeshes([-1, 1].map(sx => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trim.map(p => V(p.x * sx, p.y, p.z))), 40, 0.035, 8)))), MAT.gold));
    // runners + struts, one merged steel mesh
    const steelParts = [];
    for (const sx of [-1, 1]) {
      steelParts.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(sx * 0.7, 0.02, 2.2), V(sx * 0.7, 0.02, -1.2), V(sx * 0.7, 0.35, -1.9), V(sx * 0.7, 0.9, -1.75)]), 48, 0.04, 8)));
      for (const z of [1.6, -0.6]) steelParts.push(at(new THREE.BoxGeometry(0.06, 0.26, 0.06), null, sx * 0.7, 0.14, z));
    }
    g.add(shadowed(new THREE.Mesh(mergeMeshes(steelParts), MAT.steel)));
    const seat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.6), MAT.velvet)); seat.position.set(0, 0.85, 1.2); g.add(seat);
    const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.12), MAT.redPlain)); back.position.set(0, 1.3, 1.55); g.add(back);
    const bag = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), MAT.sack)); bag.scale.set(1, 0.8, 0.9); bag.position.set(0, 1.1, 2.0); g.add(bag);
    // wrapped presents poking out of the sack
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    [[-0.35, 1.55, 1.95, 0.32, 0.3], [0.2, 1.62, 2.05, 0.36, 0.26], [0.45, 1.5, 1.8, 0.24, 0.3], [-0.05, 1.7, 2.2, 0.28, 0.22]].forEach(([x, y, z, s, h], i) => {
      const p = shadowed(new THREE.Mesh(boxGeo, MAT.present[i % 4])); p.position.set(x, y, z); p.scale.set(s, h, s); p.rotation.set(0.1 * i, 0.5 * i, -0.08 * i); g.add(p);
    });
    // the dash console: a brass-bezelled panel tilted toward Santa; its canvas is redrawn by setConsole(lines)
    const cc = document.createElement('canvas'); cc.width = 768; cc.height = 288;
    const ctex = new THREE.CanvasTexture(cc); ctex.colorSpace = THREE.SRGBColorSpace; ctex.anisotropy = 4;
    const tilt = -0.85, cz = -0.58, cy = 1.36;
    const bezel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.44, 0.05), MAT.gold)); bezel.position.set(0, cy, cz); bezel.rotation.x = tilt; g.add(bezel);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.36), new THREE.MeshStandardMaterial({ map: ctex, emissiveMap: ctex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9, roughness: .35, metalness: 0 }));
    screen.position.set(0, cy + 0.028 * Math.sin(-tilt), cz + 0.028 * Math.cos(-tilt)); screen.rotation.x = tilt; g.add(screen);
    g.userData.console = { canvas: cc, ctx: cc.getContext('2d'), tex: ctex, last: '' };
    // a brass carriage lantern on a post at the right of the dash
    const lx = 0.62, ly = 1.42, lz = -0.95;
    const lamp = new THREE.PointLight(0xffd9a0, 7, 9, 2); lamp.position.set(lx, ly, lz); g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), MAT.bulb); bulb.position.set(lx, ly, lz); g.add(bulb);
    const lantern = [at(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), null, lx, ly - 0.38, lz), at(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), null, lx, ly - 0.13, lz), at(new THREE.CylinderGeometry(0.05, 0.1, 0.07, 10), null, lx, ly + 0.14, lz), at(new THREE.SphereGeometry(0.02, 6, 6), null, lx, ly + 0.2, lz)];
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; lantern.push(at(new THREE.BoxGeometry(0.012, 0.26, 0.012), null, lx + Math.cos(a) * 0.075, ly, lz + Math.sin(a) * 0.075)); }
    g.add(new THREE.Mesh(mergeMeshes(lantern), MAT.gold));
    g.position.set(0, -0.2, -0.4);
    return g;
  }

  // ---------- Santa's hands on the reins (rig metres; the camera is at (0, 1.9, 1.4)) ----------
  const MITTEN = [V(-0.55, 1.45, -0.05), V(0.55, 1.45, -0.05)];
  function buildHands() {
    const g = new THREE.Group(); g.name = 'hands';
    const sleeves = [], furs = [], mitts = [];
    for (const sx of [-1, 1]) {
      const wrist = V(sx * 0.55, 1.45, -0.05), elbow = V(sx * 0.72, 1.12, 0.85);
      const dir = wrist.clone().sub(elbow), len = dir.length(), mid = elbow.clone().add(wrist).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, len, 12)); sleeve.position.copy(mid); sleeve.quaternion.copy(q); sleeves.push(sleeve);
      const cuffPos = elbow.clone().add(dir.clone().multiplyScalar(0.82));
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12)); cuff.position.copy(cuffPos); cuff.quaternion.copy(q); furs.push(cuff);
      // mitten: a fist (flattened sphere) with a thumb, closed around the rein
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10)); fist.position.copy(wrist); fist.scale.set(1, 0.85, 1.2); mitts.push(fist);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8)); thumb.position.copy(wrist).add(V(-sx * 0.07, 0.06, -0.03)); thumb.scale.set(1, 1.2, 1.5); mitts.push(thumb);
      const wristFur = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 8, 14)); wristFur.position.copy(wrist).add(dir.clone().normalize().multiplyScalar(-0.06)); wristFur.quaternion.copy(q); wristFur.rotateX(Math.PI / 2); furs.push(wristFur);
    }
    g.add(shadowed(new THREE.Mesh(mergeMeshes(sleeves), MAT.sleeve)));
    g.add(new THREE.Mesh(mergeMeshes(furs), MAT.fur));
    g.add(shadowed(new THREE.Mesh(mergeMeshes(mitts), MAT.mitten)));
    // Santa himself: the top of a red belly with a black belt and brass buckle rises into the bottom of the frame
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), MAT.sleeve); belly.position.set(0, 1.02, 1.0); belly.scale.set(1.1, 0.9, 0.85); g.add(belly);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 8, 28), std({ color: '#141010', roughness: .6 })); belt.position.set(0, 1.3, 1.0); belt.rotation.x = Math.PI / 2; belt.scale.set(1.08, 0.85, 1); g.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.03), MAT.gold); buckle.position.set(0, 1.3, 0.56); g.add(buckle);
    return g;
  }

  // ---------- team formation (metres, −Z forward): four pairs and Rudolph alone in front ----------
  const FORMATION = [{ x: 0, z: -19.5, lead: true }];
  for (let pair = 0; pair < 4; pair++) for (const side of [-1, 1]) FORMATION.push({ x: side * 1.7, z: -6.0 - pair * 3.3, pair, side });
  const collarOf = slot => V(slot.x, 0.92, slot.z + 0.45);
  const noseOf = slot => V(slot.x, 1.22, slot.z - 1.1);

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

  // A Points system with per-point size and alpha (breath puffs, sparkle dust). One draw call each.
  function particleSystem(n, texture, colour, blending) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, uColor: { value: new THREE.Color(colour) }, uScale: { value: 520 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uColor; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(uColor * t.rgb, t.a * vA); }`,
      transparent: true, depthWrite: false, blending,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    const life = new Float32Array(n), vel = new Float32Array(n * 3), grow = new Float32Array(n);
    return { pts, pos, size, alpha, life, vel, grow, n, next: 0, geo };
  }

  // create() returns the rig immediately (sleigh, hands, particles); the team is parsed asynchronously and attached when ready.
  function create(opts = {}) {
    const lite = !!opts.lite;
    const rig = new THREE.Group(); rig.name = 'sleighRig';
    const sleighMesh = buildSleigh(); rig.add(sleighMesh);
    const hands = buildHands(); rig.add(hands);
    const deer = [], mixers = [], actions = [], breathers = [];
    const slots = lite ? FORMATION.slice(0, 5) : FORMATION;
    const state = { ready: false, count: 0, mode: 'gallop', t: 0 };

    // Rudolph's nose: emissive ball + pulsing light + a soft glow sprite
    const leadNose = noseOf(FORMATION[0]);
    const nose = new THREE.PointLight(0xff3a2a, 22, 30, 2); nose.position.copy(leadNose); nose.visible = false; rig.add(nose);
    const noseBall = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), MAT.nose); noseBall.position.copy(leadNose); noseBall.visible = false; rig.add(noseBall);
    const noseGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow('rgba(255,70,50,.9)', 'rgba(255,40,30,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .85 }));
    noseGlow.scale.set(0.9, 0.9, 1); noseGlow.position.copy(leadNose); noseGlow.visible = false; rig.add(noseGlow);

    // reins: mitten → lead pair collars (a sagging catenary each); static, one merged mesh
    const lead = slots.filter(s => s.pair === 0);
    const reinParts = [];
    for (const sx of [-1, 1]) {
      const to = lead.find(s => s.side === sx); if (!to) continue;
      const a = MITTEN[sx < 0 ? 0 : 1], b = collarOf(to);
      const m1 = a.clone().lerp(b, 0.35).add(V(0, -0.28, 0)), m2 = a.clone().lerp(b, 0.7).add(V(0, -0.22, 0));
      reinParts.push(new THREE.Mesh(tube([a, m1, m2, b], 0.016, 28)));
    }
    if (reinParts.length) rig.add(new THREE.Mesh(mergeMeshes(reinParts), MAT.leather));

    // harness: collar rings (instanced), traces collar→collar→sleigh (merged tubes), bells (instanced)
    const traceParts = [];
    const collars = new THREE.InstancedMesh(new THREE.TorusGeometry(0.3, 0.028, 8, 16), MAT.leather, slots.length);
    const bells = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), MAT.bell, slots.length * 3);
    const mtx = new THREE.Matrix4(); let bi = 0;
    slots.forEach((slot, i) => {
      const c = collarOf(slot);
      collars.setMatrixAt(i, mtx.makeTranslation(c.x, c.y, c.z));
      for (let k = -1; k <= 1; k++) bells.setMatrixAt(bi++, mtx.makeTranslation(c.x + k * 0.12, c.y - 0.31 - Math.abs(k) * 0.02, c.z + 0.02));
      const to = slot.lead ? collarOf(lead[0] || slots[1]) : (slot.pair === 3 || (lite && slot.pair === 1)) ? V(slot.side * 0.55, 0.75, 0.45) : collarOf(slots.find(s => s.side === slot.side && s.pair === slot.pair + 1));
      const mid = c.clone().lerp(to, 0.5).add(V(0, -0.14, 0));
      traceParts.push(new THREE.Mesh(tube([c, mid, to], 0.014, 16)));
    });
    collars.castShadow = true; rig.add(collars); rig.add(bells);
    rig.add(new THREE.Mesh(mergeMeshes(traceParts), MAT.leather));

    // breath (24 puffs) and sparkle dust (≤ 400)
    const breath = particleSystem(24, TEX.puff(), '#dfe6f2', THREE.NormalBlending);
    const dust = particleSystem(lite ? 160 : 400, TEX.spark(), '#ffe3a8', THREE.AdditiveBlending);
    rig.add(breath.pts); rig.add(dust.pts);
    const rnd = mulberry32(hash32(0x5A17, 9));
    slots.forEach((slot, i) => breathers.push({ slot, nextAt: 0.5 + rnd() * 2, period: 1.6 + rnd() * 1.4 }));

    function attach(scene, slot) {
      const d = scene; const b = skeletonBounds(d); const h = (b.max.y - b.min.y) * 1.12 || 1;
      const k = 1.9 / h; d.scale.setScalar(k); d.updateMatrixWorld(true);
      const b2 = skeletonBounds(d);
      d.position.set(slot.x, -0.6 - b2.min.y + 0.1, slot.z); d.rotation.y = Math.PI; // the model faces +Z; we fly toward −Z
      d.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      rig.add(d); deer.push(d);
      if (slot.lead) nose.visible = noseBall.visible = noseGlow.visible = true;
    }

    function parseTeam(glbBuffer) {
      const loader = new THREE.GLTFLoader();
      slots.forEach((slot, i) => {
        loader.parse(glbBuffer.slice(0), '', g => {
          attach(g.scene, slot);
          const mixer = new THREE.AnimationMixer(g.scene);
          const clips = g.animations;
          const pick = n => THREE.AnimationClip.findByName(clips, n);
          const gallopClip = pick('Gallop') || clips[0], idleClip = pick('Idle_Headlow') || pick('Idle') || gallopClip;
          const gallop = mixer.clipAction(gallopClip), idle = mixer.clipAction(idleClip);
          const r = mulberry32(hash32(0xDEE2, i));
          gallop.play(); gallop.time = r() * gallop.getClip().duration; mixer.timeScale = 1.05 + r() * 0.25;
          mixers.push(mixer); actions.push({ gallop, idle });
          state.count++; if (state.count === slots.length) state.ready = true;
        }, err => console.warn('reindeer parse failed', err));
      });
    }

    try {
      if (typeof ASSETS !== 'undefined' && ASSETS.reindeer && THREE.GLTFLoader) parseTeam(base64ToBuffer(ASSETS.reindeer));
      else console.warn('no reindeer asset or loader; flying without the team');
    } catch (e) { console.warn('team setup failed', e); }

    const emit = (sys, x, y, z, vx, vy, vz, size, grow, life) => {
      const i = sys.next; sys.next = (sys.next + 1) % sys.n;
      sys.pos[i * 3] = x; sys.pos[i * 3 + 1] = y; sys.pos[i * 3 + 2] = z; sys.vel[i * 3] = vx; sys.vel[i * 3 + 1] = vy; sys.vel[i * 3 + 2] = vz;
      sys.size[i] = size; sys.grow[i] = grow; sys.life[i] = life; sys.alpha[i] = 1;
    };
    const step = (sys, dt, fade) => {
      for (let i = 0; i < sys.n; i++) {
        if (sys.life[i] <= 0) { sys.alpha[i] = 0; continue; }
        sys.life[i] -= dt; sys.pos[i * 3] += sys.vel[i * 3] * dt; sys.pos[i * 3 + 1] += sys.vel[i * 3 + 1] * dt; sys.pos[i * 3 + 2] += sys.vel[i * 3 + 2] * dt;
        sys.size[i] += sys.grow[i] * dt; sys.alpha[i] = Math.max(0, fade(sys.life[i]));
      }
      sys.geo.attributes.position.needsUpdate = true; sys.geo.attributes.aSize.needsUpdate = true; sys.geo.attributes.aAlpha.needsUpdate = true;
    };
    let dustAcc = 0;
    const drnd = mulberry32(0xD057);

    // per-frame: gallop in flight, stand (idle) when parked; nose pulses; hands sway; breath and dust
    function update(dt, flying, speedKmh) {
      state.t += dt;
      for (let i = 0; i < mixers.length; i++) {
        const { gallop, idle } = actions[i];
        if (flying && !gallop.isRunning()) { idle.fadeOut(0.4); gallop.reset().fadeIn(0.4).play(); }
        if (!flying && !idle.isRunning()) { gallop.fadeOut(0.4); idle.reset().fadeIn(0.4).play(); }
        mixers[i].update(dt);
      }
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 2 * Math.PI / 1.2);
      nose.intensity = 16 + 14 * pulse; noseGlow.material.opacity = 0.55 + 0.4 * pulse; noseGlow.scale.setScalar(0.8 + 0.3 * pulse);
      // hands: a little tug with the gallop when flying, a resting breath when parked
      const sway = flying ? 1 : 0.3;
      hands.position.y = 0.015 * sway * Math.sin(state.t * 7.0); hands.position.x = 0.008 * sway * Math.sin(state.t * 3.5 + 1); hands.rotation.z = 0.01 * sway * Math.sin(state.t * 3.5);
      // breath: each animal exhales on its own cadence; puffs drift back toward the sleigh and up
      for (const b of breathers) {
        if (state.t < b.nextAt) continue;
        b.nextAt = state.t + b.period * (0.8 + 0.4 * drnd());
        const n = noseOf(b.slot);
        emit(breath, n.x + (drnd() - .5) * 0.08, n.y - 0.05, n.z, (drnd() - .5) * 0.3, 0.45 + drnd() * 0.25, flying ? 1.8 + drnd() * 0.6 : 0.4, 0.3, 0.7, 1.3);
      }
      step(breath, dt, life => Math.min(1, life / 1.0) * 0.8);
      // sparkle dust from the runners when flying: streams back past the seat at the frame edges
      if (flying) {
        dustAcc += dt * (lite ? 60 : 140);
        while (dustAcc >= 1) {
          dustAcc -= 1;
          const sx = drnd() < .5 ? -1 : 1, front = drnd() < 0.6, zAlong = front ? -2.0 + drnd() * 1.2 : -0.8 + drnd() * 3.0;
          emit(dust, sx * (0.78 + drnd() * 0.12), front ? 0.5 + drnd() * 0.5 : 0.06 + drnd() * 0.1, zAlong, sx * (0.8 + drnd() * 1.4), 0.9 + drnd() * 1.4, 5 + drnd() * 4, 0.03 + drnd() * 0.05, 0.015, 1.4 + drnd() * 0.8);
        }
      }
      step(dust, dt, life => Math.min(1, life / 0.6));
    }

    // Draw the console: walnut panel, brass rule, up to four lines of warm text. Redraws only when the text changes.
    function setConsole(lines) {
      const c = sleighMesh.userData.console; if (!c) return;
      const key = lines.join('|'); if (key === c.last) return; c.last = key;
      const g = c.ctx, w = c.canvas.width, h = c.canvas.height;
      const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#1d1510'); grd.addColorStop(1, '#0d0907');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(232,187,94,.55)'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = 'rgba(232,187,94,.35)'; g.fillRect(28, 78, w - 56, 2);
      g.textBaseline = 'middle';
      lines.slice(0, 4).forEach((ln, i) => {
        const first = i === 0;
        g.font = (first ? 'bold 44px ' : '34px ') + '"Patrick Hand", "Segoe Print", cursive';
        g.fillStyle = first ? '#ffe9b0' : '#f3d9a4';
        g.shadowColor = 'rgba(255,200,120,.55)'; g.shadowBlur = first ? 14 : 8;
        g.fillText(ln, 32, first ? 48 : 108 + (i - 1) * 54, w - 64);
      });
      g.shadowBlur = 0; c.tex.needsUpdate = true;
    }
    const setPixelScale = heightPx => { const k = heightPx / (2 * Math.tan(Math.PI / 6)); breath.pts.material.uniforms.uScale.value = k; dust.pts.material.uniforms.uScale.value = k; };
    const particles = () => ({ breath: Array.from(breath.life).filter(l => l > 0).length, dust: Array.from(dust.life).filter(l => l > 0).length });
    return { group: rig, update, state, deer, mixers, setConsole, setPixelScale, particles };
  }

  return { create, FORMATION, MAT };
})();
