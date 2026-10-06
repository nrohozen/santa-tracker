// Santa's point of view in real 3D (Three.js r152, vendored). Three passes share one camera pose:
//   far  — Earth units (radius 1): the textured globe, atmosphere, stars, sun, city lights, route lines, toy skylines
//   near — Earth units: city dioramas (built in km by SantaScenery, scaled 1/6371), fog, moon shadows
//   rig  — METRES, camera-relative: the sleigh and the reindeer team (skinned meshes need metre-scale matrices)
// Globals from the bundle: THREE, SantaScenery, SantaSleigh, ASSETS, and the engine (track, bearing, sceneSpec, …).
window.SantaGL = (() => {
  if (typeof THREE === 'undefined') return null;
  const RAD = Math.PI / 180;
  const KM = 1 / 6371, MT = 1 / 6_371_000;
  const xyz = (lat, lon, r = 1) => { const la = lat * RAD, lo = lon * RAD; return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- state ----------
  let renderer, canvas, lite = false;
  const far = {}, near = {}, rig = {};
  let earth, atmo, stars, sunSprite, skyDome, lights, nextLight, routeLine, tailLine, cities, cityIndex = [], cityRanges = new Map();
  let moon, hemi, snow, sleigh;
  let route = null, fullTrack = [], last = null, running = false, rafId = 0;
  const clock = new THREE.Clock();
  const dioramas = new Map(); // name → { group, spec, stop, lights, at }
  const look = { yaw: 0, pitch: 0, zoom: 1 };
  const cam = { ground: null, alt: 0.045, fwd: null, pitch: -28, roll: 0, prevHdg: null, bob: 0, blend: 0, city: null };
  const api = { labelSink: null };
  const W = 1000, H = 500;

  function supported() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
  }

  // ---------- textures ----------
  const texFromData = url => { const t = new THREE.TextureLoader().load(url); t.colorSpace = THREE.NoColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
  const glowTexture = (inner = '#ffffff', outer = 'rgba(255,255,255,0)') => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, inner); grd.addColorStop(0.35, inner); grd.addColorStop(1, outer);
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  };
  function windowTexture(seed) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#141c2c'; g.fillRect(0, 0, 64, 64);
    const r = mulberry32(seed);
    for (let y = 6; y < 60; y += 10) for (let x = 6; x < 60; x += 9) { if (r() < 0.62) { g.fillStyle = r() < 0.8 ? '#ffe9a8' : '#fff6d8'; g.fillRect(x, y, 5, 6); } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
  }

  // ---------- init ----------
  function init(opts) {
    canvas = opts.canvas; lite = !!opts.lite;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !lite; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;

    // --- far pass: the globe ---
    far.scene = new THREE.Scene(); far.scene.background = new THREE.Color('#02040a');
    far.camera = new THREE.PerspectiveCamera(60, 2, 0.0004, 80);
    skyDome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: { zenith: { value: new THREE.Color('#03050f') }, horizon: { value: new THREE.Color('#0e1626') }, up: { value: new THREE.Vector3(0, 1, 0) }, blend: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 zenith, horizon, up; uniform float blend; varying vec3 vP;
        void main(){ float h = clamp(dot(normalize(vP), up), -1.0, 1.0); float k = pow(clamp(h, 0.0, 1.0), 0.5);
          vec3 hazy = mix(horizon, zenith, k); vec3 space = mix(vec3(0.008, 0.016, 0.04), zenith, k);
          gl_FragColor = vec4(mix(space, hazy, blend), 1.0); }`,
    }));
    skyDome.renderOrder = -10; far.scene.add(skyDome);

    const hasAssets = typeof ASSETS !== 'undefined' && ASSETS.earthDay;
    const dayTex = hasAssets ? texFromData(ASSETS.earthDay) : null;
    const lightsTex = hasAssets ? texFromData(ASSETS.earthLights) : null;
    const specTex = hasAssets && ASSETS.earthSpecular ? texFromData(ASSETS.earthSpecular) : null;
    earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.ShaderMaterial({
      uniforms: { dayMap: { value: dayTex }, lightsMap: { value: lightsTex }, specMap: { value: specTex }, hasSpec: { value: specTex ? 1 : 0 }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, camPos: { value: new THREE.Vector3() } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D dayMap, lightsMap, specMap; uniform float hasSpec; uniform vec3 sunDir, camPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 n = normalize(vN); vec3 day = texture2D(dayMap, vUv).rgb; vec3 city = texture2D(lightsMap, vUv).rgb; float d = dot(n, sunDir);
          float dayF = smoothstep(-0.06, 0.1, d);
          vec3 night = day * 0.085 + vec3(0.01, 0.015, 0.035) + city * vec3(1.35, 1.15, 0.8);
          vec3 lit = day * (0.25 + 0.95 * max(d, 0.0));
          if (hasSpec > 0.5) { float s = texture2D(specMap, vUv).r; vec3 v = normalize(camPos - vW); vec3 h = normalize(v + sunDir); lit += s * pow(max(dot(n, h), 0.0), 40.0) * 0.6 * dayF; }
          vec3 col = mix(night, lit, dayF);
          col += vec3(0.5, 0.24, 0.07) * exp(-pow(d / 0.05, 2.0)) * 0.35;
          gl_FragColor = vec4(col, 1.0); }`,
    }));
    far.scene.add(earth);
    atmo = new THREE.Mesh(new THREE.SphereGeometry(1.028, 96, 64), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 2.2); gl_FragColor = vec4(0.36, 0.62, 1.0, 1.0) * i * 0.9; }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    far.scene.add(atmo);
    const sg = new THREE.BufferGeometry(); const sp = new Float32Array(1800 * 3); const rnd = mulberry32(0x57A2);
    for (let i = 0; i < 1800; i++) { const z = rnd() * 2 - 1, th = rnd() * 2 * Math.PI, s = Math.sqrt(1 - z * z); sp[i * 3] = 55 * s * Math.cos(th); sp[i * 3 + 1] = 55 * z; sp[i * 3 + 2] = 55 * s * Math.sin(th); }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 }));
    far.scene.add(stars);
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#fff3c4', 'rgba(245,196,81,0)'), transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunSprite.scale.set(9, 9, 1); far.scene.add(sunSprite);

    // city lights: perspective-sized but clamped points
    const lightMaterial = (minPx, maxPx, k, useVertexColor, color) => new THREE.ShaderMaterial({
      uniforms: { uK: { value: k }, uMin: { value: minPx }, uMax: { value: maxPx }, uColor: { value: new THREE.Color(color || '#ffffff') }, uPR: { value: renderer.getPixelRatio() } },
      vertexShader: `uniform float uK, uMin, uMax, uPR; varying vec3 vC; ${useVertexColor ? 'attribute vec3 color;' : 'uniform vec3 uColor;'}
        void main(){ vC = ${useVertexColor ? 'color' : 'uColor'}; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(uK / -mv.z, uMin, uMax) * uPR; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 1.6); gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    lights = new THREE.Points(new THREE.BufferGeometry(), lightMaterial(2.5, 14, 1.1, true)); far.scene.add(lights);
    nextLight = new THREE.Points(new THREE.BufferGeometry(), lightMaterial(7, 26, 2.2, false, '#ff5a52')); far.scene.add(nextLight);
    routeLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xf5c451, transparent: true, opacity: 0.55, dashSize: 0.004, gapSize: 0.006 })); far.scene.add(routeLine);
    tailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf5c451, transparent: true, opacity: 0.95 })); far.scene.add(tailLine);

    // --- near pass: dioramas in km, placed on the globe ---
    near.scene = new THREE.Scene();
    near.camera = new THREE.PerspectiveCamera(60, 2, 1e-6, 0.03);
    near.scene.fog = new THREE.FogExp2(new THREE.Color('#0e1626'), 0);
    hemi = new THREE.HemisphereLight(0x8090c0, 0x201810, 0.32); near.scene.add(hemi);
    moon = new THREE.DirectionalLight(0xcfd8ff, 0.55); moon.castShadow = !lite;
    moon.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
    const sc = moon.shadow.camera; sc.left = -2.2 * KM; sc.right = 2.2 * KM; sc.top = 2.2 * KM; sc.bottom = -2.2 * KM; sc.near = 0; sc.far = 0.012;
    moon.shadow.bias = -0.00035; moon.shadow.normalBias = 1.2e-7;
    near.scene.add(moon); near.scene.add(moon.target);

    // --- rig pass: metres, camera-relative ---
    rig.scene = new THREE.Scene();
    rig.camera = new THREE.PerspectiveCamera(60, 2, 0.25, 400);
    rig.scene.fog = new THREE.FogExp2(new THREE.Color('#0e1626'), 0);
    rig.hemi = new THREE.HemisphereLight(0x8090c0, 0x201810, 0.32); rig.scene.add(rig.hemi);
    rig.moon = new THREE.DirectionalLight(0xcfd8ff, 0.55); rig.moon.castShadow = !lite; rig.moon.shadow.mapSize.set(1024, 1024);
    const rc = rig.moon.shadow.camera; rc.left = -30; rc.right = 30; rc.top = 30; rc.bottom = -30; rc.near = 1; rc.far = 200; rig.moon.shadow.bias = -0.0008;
    rig.scene.add(rig.moon); rig.scene.add(rig.moon.target);
    if (window.SantaSleigh) { sleigh = SantaSleigh.create({ lite }); rig.scene.add(sleigh.group); }
    const snowG = new THREE.BufferGeometry(); const n = lite ? 500 : 1500; const spos = new Float32Array(n * 3); const sr = mulberry32(0x5A0);
    for (let i = 0; i < n; i++) { spos[i * 3] = (sr() - .5) * 120; spos[i * 3 + 1] = sr() * 40 - 5; spos[i * 3 + 2] = 20 - sr() * 140; }
    snowG.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    snow = new THREE.Points(snowG, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.65 })); snow.visible = false; rig.scene.add(snow);

    // look around: drag = yaw/pitch, wheel = zoom (altitude multiplier), double-click = reset
    let dragging = null;
    canvas.addEventListener('pointerdown', e => { dragging = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; look.yaw = clamp(dragging.yaw - (e.clientX - dragging.x) * 0.25, -120, 120); look.pitch = clamp(dragging.pitch + (e.clientY - dragging.y) * 0.2, -40, 30); if (!running) rerender(); });
    canvas.addEventListener('pointerup', () => { dragging = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); look.zoom = clamp(look.zoom * (e.deltaY > 0 ? 1.12 : 0.89), 0.4, 4); if (!running) rerender(); }, { passive: false });
    canvas.addEventListener('dblclick', () => { look.yaw = 0; look.pitch = 0; look.zoom = 1; if (!running) rerender(); });
    try { api.dbgFlags = new Set((new URLSearchParams(location.search).get('dbg') || '').split(',').filter(Boolean)); } catch { api.dbgFlags = new Set(); }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
  }

  function resize() {
    if (!renderer) return;
    const w = canvas.parentElement.clientWidth || 1000, h = Math.round(w / 2);
    renderer.setSize(w, h, false);
    for (const c of [far.camera, near.camera, rig.camera]) { c.aspect = 2; c.updateProjectionMatrix(); }
    if (!running) rerender();
  }
  const rerender = () => { if (!last) return; const out = draw(last.s, last.t, 0); if (api.labelSink) api.labelSink(last.s, out && out.label); };

  // ---------- route-dependent content ----------
  function setRoute(r, trackPts) {
    route = r; fullTrack = trackPts;
    const stops = r.waypoints.filter(w => !w.pole);
    const pos = new Float32Array(stops.length * 3), col = new Float32Array(stops.length * 3);
    stops.forEach((w, i) => { const v = xyz(w.lat, w.lon, 1.0025); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
    lights.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lights.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    lights.userData.stops = stops;
    buildCities(stops);
    routeLine.geometry.setFromPoints(trackPts.map(p => xyz(p.lat, p.lon, 1.0018))); routeLine.computeLineDistances();
    for (const name of [...dioramas.keys()]) dropDiorama(name);
    cam.ground = null;
  }

  // toy skylines for the cruise view (one InstancedMesh of boxes)
  const DONE_CITY = new THREE.Color('#ffd27a'), TODO_CITY = new THREE.Color('#8391ad'), NEXT_CITY = new THREE.Color('#ff9a8c');
  const frameAt = (lat, lon) => { const up = xyz(lat, lon); let east = new THREE.Vector3(0, 1, 0).cross(up); east = east.length() < 1e-6 ? new THREE.Vector3(1, 0, 0) : east.normalize(); const north = up.clone().cross(east).normalize(); return { up, east, north }; };
  function placeAt(lat, lon, east, north, offE, offN, w, h, d) {
    const base = xyz(lat, lon).add(east.clone().multiplyScalar(offE)).add(north.clone().multiplyScalar(offN)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), base);
    return new THREE.Matrix4().compose(base.clone().multiplyScalar(1 + h / 2), q, new THREE.Vector3(w, h, d));
  }
  function buildCities(stops) {
    if (cities) { far.scene.remove(cities); cities.geometry.dispose(); }
    const plan = []; cityRanges = new Map();
    stops.forEach((w, si) => {
      const r = mulberry32(hash32(si, 0xC17)), { east, north } = frameAt(w.lat, w.lon);
      const scale = Math.log10(1 + w.pop), n = 5 + Math.round(10 * Math.min(1, scale)); const from = plan.length;
      for (let i = 0; i < n; i++) {
        const ang = r() * 2 * Math.PI, rad = 0.0045 * Math.sqrt(r()) * (0.5 + scale / 2);
        const h = (0.0015 + 0.011 * scale) * (0.35 + r() * 0.65) * (i === 0 ? 1.25 : 1), wdt = 0.0008 + r() * 0.0012;
        plan.push({ si, m: placeAt(w.lat, w.lon, east, north, Math.sin(ang) * rad, Math.cos(ang) * rad, wdt, h, wdt) });
      }
      cityRanges.set(w.name, [from, plan.length]);
    });
    const wall = new THREE.MeshBasicMaterial({ map: windowTexture(0xB1D) }), roof = new THREE.MeshBasicMaterial({ color: 0x1b2436 });
    cities = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), [wall, wall, roof, roof, wall, wall], plan.length);
    cityIndex = plan.map(b => b.si); cities.userData.matrices = plan.map(b => b.m);
    plan.forEach((b, i) => { cities.setMatrixAt(i, b.m); cities.setColorAt(i, TODO_CITY); });
    cities.instanceMatrix.needsUpdate = true; cities.instanceColor.needsUpdate = true;
    far.scene.add(cities);
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function toyCityVisible(name, visible) {
    const rg = cityRanges.get(name); if (!rg || !cities) return;
    for (let i = rg[0]; i < rg[1]; i++) cities.setMatrixAt(i, visible ? cities.userData.matrices[i] : ZERO);
    cities.instanceMatrix.needsUpdate = true;
  }

  // ---------- dioramas ----------
  const LANDMARK_TOY = h => (h < 0.12 ? 2.3 : h < 0.3 ? 1.5 : 1.1); // small landmarks get a little help at sleigh height
  function ensureDiorama(stop) {
    if (!stop) return null;
    if (dioramas.has(stop.name)) { const e = dioramas.get(stop.name); e.at = performance.now(); return e; }
    if (!window.SantaScenery || typeof sceneSpec !== 'function') return null;
    const spec = sceneSpec(stop, route ? route.year : new Date().getUTCFullYear());
    let inner;
    try { inner = SantaScenery.build(spec, { lite, year: route && route.year }); } catch (e) { console.warn('diorama build failed', stop.name, e); return null; }
    if (spec.landmark) { let lm = null; inner.traverse(o => { if (!lm && o.name && o.name.startsWith('landmark')) lm = o; }); if (lm) lm.scale.setScalar(LANDMARK_TOY(spec.landmark.heightKm)); }
    // additive materials must not be fogged (fog colour would be ADDED and glow at the horizon); fade them with the haze instead
    inner.traverse(o => { if (o.material && o.material.blending === THREE.AdditiveBlending) { o.material.fog = false; o.material.needsUpdate = true; } });
    // the builder's dish winds with its normals pointing down (probe: groundNormalY0 = -1): render both sides so it is not culled from above
    const gm = inner.getObjectByName('ground'); if (gm && gm.material) { gm.material.side = THREE.DoubleSide; gm.material.needsUpdate = true; const nrm = gm.geometry.attributes.normal; if (nrm && nrm.getY(0) < 0) { for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i)); nrm.needsUpdate = true; } }
    const { up, east, north } = frameAt(stop.lat, stop.lon);
    const g = new THREE.Group(); g.name = `diorama:${stop.name}`;
    g.position.copy(up); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, north.clone().negate())); // +X east, +Y up, +Z south
    g.scale.setScalar(KM); g.add(inner);
    const spots = (inner.userData && inner.userData.lights) || [];
    const pls = spots.slice(0, lite ? 2 : 6).map(p => { const l = new THREE.PointLight(0xffc27a, 60 * MT * MT, 320 * MT, 2); l.position.set(p.x * KM, (p.y || 0.006) * KM, p.z * KM); return l; });
    pls.forEach(l => g.add(l));
    near.scene.add(g);
    toyCityVisible(stop.name, false);
    const entry = { group: g, spec, stop, lights: pls, at: performance.now() };
    dioramas.set(stop.name, entry);
    while (dioramas.size > 3) { let oldest = null; for (const [k, v] of dioramas) if (k !== stop.name && (!oldest || v.at < oldest[1].at)) oldest = [k, v]; if (oldest) dropDiorama(oldest[0]); else break; }
    return entry;
  }
  function dropDiorama(name) {
    const d = dioramas.get(name); if (!d) return;
    near.scene.remove(d.group);
    try { SantaScenery.dispose(d.group); } catch { /* best effort */ }
    toyCityVisible(name, true);
    dioramas.delete(name);
  }

  // ---------- camera state machine ----------
  // Where the sleigh "stands" at a city: 450 m short of the centre along the inbound track, 95 m up, nose toward it.
  function cityPose(city, inboundFrom) {
    const c = xyz(city.lat, city.lon);
    let dir = inboundFrom ? xyz(inboundFrom.lat, inboundFrom.lon).sub(c) : new THREE.Vector3(0, 1, 0).cross(c);
    dir.sub(c.clone().multiplyScalar(dir.dot(c))); if (dir.lengthSq() < 1e-12) dir = new THREE.Vector3(0, 1, 0).cross(c); dir.normalize(); // tangent, back toward where we came from
    const lm = typeof landmarkFor === 'function' ? landmarkFor(city) : null;
    const standoff = Math.max(0.38, lm ? lm.footprintKm * 0.8 : 0), alt = 0.095 + (lm ? Math.max(0, lm.heightKm * 0.25 - 0.02) : 0); // back off from big footprints, climb a little for tall ones
    const ground = c.clone().add(dir.clone().multiplyScalar(standoff * KM)).normalize();
    return { ground, fwd: dir.clone().negate(), alt: alt * KM, pitch: -6 };
  }
  function cruisePose(s) {
    const here = s.lat > 89.99 ? { lat: 89.99, lon: s.next ? s.next.lon : 0 } : s;
    const p = xyz(here.lat, here.lon);
    const hdg = s.next ? bearing(here, s.next) : 0;
    const { east, north } = frameAt(here.lat, here.lon);
    const fwd = north.clone().multiplyScalar(Math.cos(hdg * RAD)).add(east.clone().multiplyScalar(Math.sin(hdg * RAD))).normalize();
    return { ground: p, fwd, alt: 0.045, pitch: -28 };
  }
  function blendFor(s, t) {
    if (s.phase !== 'flight') return { blend: 1, city: s.at && !s.at.pole ? s.at : (typeof WORKSHOP_STOP !== 'undefined' ? WORKSHOP_STOP : null), parked: true };
    if (s.status === 'delivering') return { blend: 1, city: s.at, parked: false };
    const seg = s.segF || 0, w = s.at, n = s.next;
    const a = n && !n.pole ? clamp(1 - Math.min(s.etaMs / 90e3, (1 - seg) / 0.3), 0, 1) : 0;
    const d = w && !w.pole ? clamp(1 - Math.min((t - w.depart) / 60e3, seg / 0.3), 0, 1) : 0;
    return a >= d ? { blend: a, city: a > 0 ? n : null, parked: false } : { blend: d, city: w, parked: false };
  }
  const slerpV = (a, b, t) => { const o = Math.acos(clamp(a.dot(b), -1, 1)); if (o < 1e-6) return a.clone(); const s = Math.sin(o); return a.clone().multiplyScalar(Math.sin((1 - t) * o) / s).add(b.clone().multiplyScalar(Math.sin(t * o) / s)).normalize(); };

  // ---------- the frame ----------
  let dbg = {};
  function draw(s, t, dt) {
    if (!renderer || !route) return null;
    const { blend, city } = blendFor(s, t);
    const cruise = cruisePose(s);
    let want, climate = null, spec = null, entry = null;
    if (city && blend > 0) {
      entry = ensureDiorama(city);
      const prev = city.i > 0 && route.waypoints[city.i - 1] ? route.waypoints[city.i - 1] : null;
      const cp = cityPose(city, prev);
      want = { ground: slerpV(cruise.ground, cp.ground, blend), fwd: slerpV(cruise.fwd, cp.fwd, blend), alt: Math.exp(lerp(Math.log(cruise.alt * look.zoom), Math.log(cp.alt * look.zoom), blend)), pitch: lerp(cruise.pitch, cp.pitch, blend) };
      if (entry) { climate = entry.spec.climate; spec = entry.spec; }
    } else want = { ground: cruise.ground, fwd: cruise.fwd, alt: cruise.alt * look.zoom, pitch: cruise.pitch };
    const keep = new Set(); if (city) keep.add(city.name); if (s.next && !s.next.pole && blend > 0) keep.add(s.next.name);
    for (const name of [...dioramas.keys()]) if (!keep.has(name)) dropDiorama(name);

    // smoothing (snap when scrubbing far)
    if (!cam.ground || cam.ground.angleTo(want.ground) > 0.02 || Math.abs(Math.log(want.alt / cam.alt)) > 2) { cam.ground = want.ground.clone(); cam.alt = want.alt; cam.fwd = want.fwd.clone(); cam.pitch = want.pitch; }
    else { const k = dt > 0 ? 1 - Math.pow(0.001, dt) : 1; cam.ground = slerpV(cam.ground, want.ground, k); cam.alt = Math.exp(lerp(Math.log(cam.alt), Math.log(want.alt), k)); cam.fwd = slerpV(cam.fwd, want.fwd, k); cam.pitch = lerp(cam.pitch, want.pitch, k); }
    cam.blend = blend; cam.city = city;
    const up = cam.ground.clone(), fwd = cam.fwd.clone().sub(up.clone().multiplyScalar(cam.fwd.dot(up))).normalize();
    const fr = frameAt(s.lat, s.lon);
    const hdgNow = Math.atan2(fwd.dot(fr.east), fwd.dot(fr.north));
    if (cam.prevHdg == null) cam.prevHdg = hdgNow;
    let dh = hdgNow - cam.prevHdg; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI; cam.prevHdg = hdgNow;
    const flying = s.phase === 'flight';
    cam.roll = lerp(cam.roll, flying ? clamp(-dh * 6, -0.2, 0.2) : 0, dt > 0 ? 1 - Math.pow(0.02, dt) : 1);
    cam.bob += dt; const bob = flying ? 0.06 * Math.sin(cam.bob * 2 * Math.PI / 0.9) : 0;

    const right = fwd.clone().cross(up).normalize();
    const qBase = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd.clone().negate()));
    const qHead = new THREE.Quaternion().setFromEuler(new THREE.Euler((cam.pitch + look.pitch) * RAD, look.yaw * RAD, cam.roll, 'YXZ'));
    const q = qBase.clone().multiply(qHead);
    const seat = new THREE.Vector3(0, 1.9 + bob, 1.4); // metres inside the rig
    const camPos = up.clone().multiplyScalar(1 + cam.alt).add(right.clone().multiplyScalar(seat.x * MT)).add(up.clone().multiplyScalar(seat.y * MT)).add(fwd.clone().multiplyScalar(-seat.z * MT));
    for (const c of [far.camera, near.camera]) { c.position.copy(camPos); c.quaternion.copy(q); c.updateMatrixWorld(); }
    near.camera.near = Math.max(0.3 * MT, cam.alt * 0.05); near.camera.far = 0.03; near.camera.updateProjectionMatrix();
    rig.camera.position.copy(seat); rig.camera.quaternion.copy(qHead); rig.camera.updateMatrixWorld();

    // sun, sky, fog
    const sunDir = xyz(s.sun.lat, s.sun.lon);
    earth.material.uniforms.sunDir.value.copy(sunDir); earth.material.uniforms.camPos.value.copy(camPos);
    sunSprite.position.copy(camPos).add(sunDir.clone().multiplyScalar(50));
    stars.position.copy(camPos); skyDome.position.copy(camPos);
    atmo.visible = cam.alt > 0.03;
    earth.visible = blend < 0.6; // at the rooftops the dish covers the view; the globe shader still reads too bright at night here (open item)
    const sunEl = Math.asin(clamp(up.dot(sunDir), -1, 1)) / RAD;
    const tw = smooth(-16, 2, sunEl);
    const snowy = !!(climate && climate.snow);
    const fogColor = new THREE.Color(snowy ? '#1a2440' : '#0e1626').lerp(new THREE.Color('#5a4a4e'), tw);
    const haze = climate ? climate.haze : 0.5;
    const visKm = 3.6 - 2.2 * haze;
    const fogDensity = (1.73 / visKm) / KM * blend * blend; // per Earth unit
    near.scene.fog.color.copy(fogColor); near.scene.fog.density = fogDensity;
    rig.scene.fog.color.copy(fogColor); rig.scene.fog.density = (1.73 / visKm) / 1000 * blend * blend; // per metre
    skyDome.material.uniforms.horizon.value.copy(fogColor);
    skyDome.material.uniforms.zenith.value.copy(new THREE.Color('#03050f').lerp(new THREE.Color('#2a4a8a'), smooth(-6, 8, sunEl)));
    skyDome.material.uniforms.up.value.copy(up); skyDome.material.uniforms.blend.value = blend;

    // moon: opposite the sun, lifted above the local horizon so there is always a key light at night
    const moonDir = sunDir.clone().negate().multiplyScalar(0.8).add(up.clone().multiplyScalar(0.6)).normalize();
    const focus = city ? xyz(city.lat, city.lon) : up;
    moon.position.copy(focus).add(moonDir.clone().multiplyScalar(0.006)); moon.target.position.copy(focus); moon.target.updateMatrixWorld();
    moon.intensity = 0.18 + 0.22 * (1 - tw) + 0.5 * tw; hemi.intensity = 0.18 + 0.25 * tw;
    const qInv = qBase.clone().invert();
    rig.moon.position.copy(moonDir.clone().applyQuaternion(qInv).multiplyScalar(120)); rig.moon.target.position.set(0, 0, -8); rig.moon.target.updateMatrixWorld();
    rig.moon.intensity = moon.intensity; rig.hemi.intensity = hemi.intensity;
    rig.hemi.position.copy(up.clone().applyQuaternion(qInv));

    // far-pass bookkeeping
    const stops = lights.userData.stops, col = lights.geometry.getAttribute('color');
    stops.forEach((w, i) => { const c = (w.depart <= t || s.phase === 'done') ? DONE_CITY : TODO_CITY; col.setXYZ(i, c.r, c.g, c.b); }); col.needsUpdate = true;
    if (cities) { const key = `${s.stopsDone}:${s.phase}:${s.next && s.next.i}:${s.at && s.at.i}`; if (cities.userData.key !== key) { cities.userData.key = key; cityIndex.forEach((si, i) => { const w = stops[si]; cities.setColorAt(i, (w.depart <= t || s.phase === 'done' || s.at === w) ? DONE_CITY : (s.phase === 'flight' && s.next === w) ? NEXT_CITY : TODO_CITY); }); cities.instanceColor.needsUpdate = true; } }
    if (s.phase === 'flight' && s.next && !s.next.pole) { nextLight.geometry.setFromPoints([xyz(s.next.lat, s.next.lon, 1.003)]); nextLight.visible = true; } else nextLight.visible = false;
    routeLine.visible = s.phase !== 'done';
    if (s.phase === 'flight') { tailLine.geometry.setFromPoints(track(route, t - 150 * 60000, t).map(q2 => xyz(q2.lat, q2.lon, 1.0022))); tailLine.visible = true; } else tailLine.visible = false;

    // the team and the weather
    if (sleigh) sleigh.update(dt, flying);
    snow.visible = snowy && blend > 0.15;
    if (snow.visible && dt > 0) { const p = snow.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 1.7; if (y < -5) y = 35; p.setY(i, y); } p.needsUpdate = true; }
    snow.material.opacity = 0.65 * Math.min(1, blend * 1.5);

    // debug layer toggles (?dbg=noearth,nosky,noatmo,noground,nostreets,noprops,nolandmark,nolights,nofog,nofar,nonear,norig)
    const flags = api.dbgFlags || new Set();
    let groundMat = null, streetsMat = null, groundMesh = null;
    for (const d of dioramas.values()) d.group.traverse(o => {
      if (o.name === 'ground' && o.material) { groundMat = o.material; groundMesh = o; } if (o.name === 'streets' && o.material) streetsMat = o.material;
      if (!flags.size) return;
      if (o.name === 'ground') o.visible = !flags.has('noground'); if (o.name === 'streets') o.visible = !flags.has('nostreets');
      if (o.name && o.name.startsWith('props')) o.visible = !flags.has('noprops'); if (o.name && o.name.startsWith('landmark')) o.visible = !flags.has('nolandmark');
      if (o.isPointLight) o.visible = !flags.has('nolights');
    });
    if (flags.size) { earth.visible = earth.visible && !flags.has('noearth'); skyDome.visible = !flags.has('nosky'); if (flags.has('noatmo')) atmo.visible = false; if (flags.has('nofog')) { near.scene.fog.density = 0; rig.scene.fog.density = 0; } }

    // three passes
    renderer.clear();
    if (!flags.has('nofar')) renderer.render(far.scene, far.camera);
    renderer.clearDepth();
    if (dioramas.size && !flags.has('nonear')) renderer.render(near.scene, near.camera);
    renderer.clearDepth();
    if (!flags.has('norig')) renderer.render(rig.scene, rig.camera);

    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const matInfo = m => m ? { type: m.type, fog: m.fog, color: m.color && '#' + m.color.getHexString(), emissive: m.emissive && '#' + m.emissive.getHexString(), emissiveIntensity: m.emissiveIntensity, map: !!m.map, opacity: m.opacity, transparent: m.transparent, blending: m.blending } : null;
    const gn = groundMesh && groundMesh.geometry.attributes.normal; const gw = groundMesh ? new THREE.Vector3(0, 1, 0).applyQuaternion(groundMesh.getWorldQuaternion(new THREE.Quaternion())) : null;
    dbg = { sunEl: +sunEl.toFixed(1), sunDot: +up.dot(sunDir).toFixed(3), atmoVisible: atmo.visible, earthVisible: earth.visible, groundNormalY0: gn ? +gn.getY(0).toFixed(3) : null, groundUpDotWorldUp: gw ? +gw.dot(up).toFixed(3) : null, groundSide: groundMat ? groundMat.side : null, groundVerts: groundMesh ? groundMesh.geometry.attributes.position.count : null, groundMat: matInfo(groundMat), streetsMat: matInfo(streetsMat), hemi: +hemi.intensity.toFixed(3), moonI: +moon.intensity.toFixed(3), legacyLights: renderer.useLegacyLights, camDown: +camFwd.dot(up).toFixed(3), camToCity: city ? +(camPos.distanceTo(xyz(city.lat, city.lon)) / KM).toFixed(3) : null, nearChildren: near.scene.children.length, blend: +blend.toFixed(3), city: city ? city.name : null, landmark: spec && spec.landmark ? spec.landmark.id : null, dioramas: [...dioramas.keys()], fogDensity: +fogDensity.toFixed(1), fogColor: '#' + fogColor.getHexString(), camAltKm: +(cam.alt / KM).toFixed(3), near: near.camera.near, reindeer: sleigh ? sleigh.deer.length : 0, teamReady: !!(sleigh && sleigh.state.ready), mixersRunning: !!(sleigh && sleigh.mixers.length), shadowMap: renderer.shadowMap.enabled, earthTextures: [!!earth.material.uniforms.dayMap.value, !!earth.material.uniforms.lightsMap.value], passes: 3, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, snow: snow.visible };

    // HUD label for the next stop: in front, over the horizon, and not when the landmark itself is in view
    if (!s.next || s.next.pole) return { label: null };
    const v = xyz(s.next.lat, s.next.lon, 1.003);
    if (v.dot(up) < 1 / (1 + cam.alt)) return { label: null };
    if (blend > 0.5 && city === s.next) return { label: null };
    const ndc = v.clone().project(far.camera);
    if (ndc.z > 1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) return { label: null };
    return { label: { x: (ndc.x + 1) / 2 * W, y: (1 - ndc.y) / 2 * H } };
  }

  // ---------- public ----------
  function render(s, t) { last = { s, t }; return draw(s, t, 0); }
  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (last) { const out = draw(last.s, last.t, dt); if (api.labelSink) api.labelSink(last.s, out && out.label); }
    rafId = requestAnimationFrame(loop);
  }
  function start() { if (running) return; running = true; clock.getDelta(); rafId = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(rafId); }
  function debug() { return Object.assign({ running }, dbg); }

  Object.assign(api, { supported, init, setRoute, render, start, stop, resize, look, debug, _far: () => far, _near: () => near, _rig: () => rig });
  return api;
})();
