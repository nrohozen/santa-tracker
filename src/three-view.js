// Santa's point of view in real 3D: a WebGL globe (Three.js) with a chase camera just behind the sleigh.
// Globals from the bundle: THREE, the engine (track, bearing, haversineKm, MIN, ...). Exposes window.SantaGL.
window.SantaGL = (() => {
  if (typeof THREE === 'undefined') return null;
  const RAD = Math.PI / 180;
  const EARTH_KM = 6371;
  // lat/lon → Three.js coordinates that line up with an equirectangular texture on THREE.SphereGeometry
  const xyz = (lat, lon, r = 1) => { const la = lat * RAD, lo = lon * RAD; return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)); };

  let renderer, scene, camera, earth, atmo, stars, sunSprite, lights, nextLight, routeLine, tailLine, workshop;
  let canvas, W = 1000, H = 500, route = null, fullTrack = [];
  let camPos = null, camTarget = null; // smoothed
  let last = null; // the last (state, time) drawn, so a resize or a drag can redraw while paused
  const api = { labelSink: null };
  const rerender = () => { if (!last) return; const out = render(last.s, last.t); if (api.labelSink) api.labelSink(last.s, out && out.label); };
  const look = { yaw: 0, pitch: 0, alt: 0.045 }; // user offsets: drag to look around, wheel to climb
  let dragging = null;

  function supported() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
  }

  function landTexture(landD) {
    const c = document.createElement('canvas'); c.width = 4096; c.height = 2048;
    const g = c.getContext('2d');
    g.fillStyle = '#0a1730'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2;
    for (let lon = -150; lon <= 150; lon += 30) { const x = (lon + 180) / 360 * c.width; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const y = (90 - lat) / 180 * c.height; g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    g.save(); g.scale(c.width / 1000, c.height / 500);
    const p = new Path2D(landD);
    g.fillStyle = '#2f4b6e'; g.fill(p, 'evenodd');
    g.strokeStyle = '#6d99d2'; g.lineWidth = 0.5; g.stroke(p);
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.colorSpace = THREE.NoColorSpace; // the custom shader writes these values straight out, no decode/encode pair
    return tex;
  }

  const glowTexture = (inner = '#ffffff', outer = 'rgba(255,255,255,0)') => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, inner); grd.addColorStop(0.35, inner); grd.addColorStop(1, outer);
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  };
  const emojiSprite = (emoji, px = 96) => {
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d'); g.font = `${px * 0.8}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, px / 2, px / 2 + px * 0.04);
    const m = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: true });
    return new THREE.Sprite(m);
  };

  function init(opts) {
    canvas = opts.canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#02040a');
    camera = new THREE.PerspectiveCamera(62, 2, 0.0005, 80);

    // the Earth: day texture, real night side from the sun direction, a warm band along the terminator
    earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.ShaderMaterial({
      uniforms: { map: { value: landTexture(opts.landD) }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN;
        void main(){ vec3 c = texture2D(map, vUv).rgb; float d = dot(normalize(vN), sunDir);
          float day = smoothstep(-0.07, 0.09, d);
          vec3 night = c * 0.55 + vec3(0.02, 0.03, 0.07);
          vec3 col = mix(night, c * 1.15 + 0.03, day);
          col += vec3(0.45, 0.22, 0.06) * exp(-pow(d / 0.05, 2.0)) * 0.35;
          gl_FragColor = vec4(col, 1.0); }`,
    }));
    scene.add(earth);

    atmo = new THREE.Mesh(new THREE.SphereGeometry(1.028, 96, 64), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 2.2); gl_FragColor = vec4(0.36, 0.62, 1.0, 1.0) * i * 0.9; }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    scene.add(atmo);

    // stars (seeded) and the sun
    const sg = new THREE.BufferGeometry(); const sp = new Float32Array(1800 * 3); const rnd = mulberry32(0x57A2);
    for (let i = 0; i < 1800; i++) { const z = rnd() * 2 - 1, th = rnd() * 2 * Math.PI, s = Math.sqrt(1 - z * z); sp[i * 3] = 60 * s * Math.cos(th); sp[i * 3 + 1] = 60 * z; sp[i * 3 + 2] = 60 * s * Math.sin(th); }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 }));
    scene.add(stars);
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#fff3c4', 'rgba(245,196,81,0)'), transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunSprite.scale.set(9, 9, 1); scene.add(sunSprite);

    // city lights: one Points cloud with per-vertex colours, plus a bigger single point for the next stop
    // city lights: perspective-sized but clamped, so a city under the sleigh is a dot, not a balloon
    const lightMaterial = (minPx, maxPx, k, useVertexColor, color) => new THREE.ShaderMaterial({
      uniforms: { uK: { value: k }, uMin: { value: minPx }, uMax: { value: maxPx }, uColor: { value: new THREE.Color(color || '#ffffff') }, uPR: { value: renderer.getPixelRatio() } },
      vertexShader: `uniform float uK, uMin, uMax, uPR; varying vec3 vC; ${useVertexColor ? 'attribute vec3 color;' : 'uniform vec3 uColor;'}
        void main(){ vC = ${useVertexColor ? 'color' : 'uColor'}; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(uK / -mv.z, uMin, uMax) * uPR; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 1.6); gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    lights = new THREE.Points(new THREE.BufferGeometry(), lightMaterial(2.5, 14, 1.1, true));
    scene.add(lights);
    nextLight = new THREE.Points(new THREE.BufferGeometry(), lightMaterial(7, 26, 2.2, false, '#ff5a52'));
    scene.add(nextLight);

    routeLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xf5c451, transparent: true, opacity: 0.55, dashSize: 0.004, gapSize: 0.006 }));
    scene.add(routeLine);
    tailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf5c451, transparent: true, opacity: 0.95 }));
    scene.add(tailLine);

    workshop = emojiSprite('🏠'); workshop.scale.set(0.02, 0.02, 1); workshop.position.copy(xyz(90, 0, 1.006)); scene.add(workshop);

    // look around: drag = yaw/pitch, wheel = altitude, double-click = reset
    canvas.addEventListener('pointerdown', e => { dragging = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; look.yaw = dragging.yaw - (e.clientX - dragging.x) * 0.25; look.pitch = Math.max(-40, Math.min(40, dragging.pitch + (e.clientY - dragging.y) * 0.2)); rerender(); });
    canvas.addEventListener('pointerup', () => { dragging = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); look.alt = Math.max(0.012, Math.min(0.6, look.alt * (e.deltaY > 0 ? 1.12 : 0.89))); rerender(); }, { passive: false });
    canvas.addEventListener('dblclick', () => { look.yaw = 0; look.pitch = 0; look.alt = 0.045; rerender(); });
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
  }

  function resize() {
    if (!renderer) return;
    const w = canvas.parentElement.clientWidth || 1000, h = Math.round(w / 2);
    renderer.setSize(w, h, false); // resizing clears the drawing buffer, so draw the last frame again
    camera.aspect = 2; camera.updateProjectionMatrix();
    rerender();
  }

  function setRoute(r, trackPts) {
    route = r; fullTrack = trackPts;
    const stops = r.waypoints.filter(w => !w.pole);
    const pos = new Float32Array(stops.length * 3), col = new Float32Array(stops.length * 3);
    stops.forEach((w, i) => { const v = xyz(w.lat, w.lon, 1.0025); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
    lights.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lights.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    lights.userData.stops = stops;
    routeLine.geometry.setFromPoints(trackPts.map(p => xyz(p.lat, p.lon, 1.0018)));
    routeLine.computeLineDistances();
  }

  const DONE = new THREE.Color('#f5c451'), TODO = new THREE.Color('#3a4a66');
  function render(s, t) {
    if (!renderer || !route) return null;
    last = { s, t };
    const here = s.lat > 89.99 ? { lat: 89.99, lon: s.next ? s.next.lon : 0 } : s;
    const p = xyz(here.lat, here.lon);
    const hdg = s.next ? bearing(here, s.next) : 0;
    // local frame: east, north, forward along the heading
    const east = new THREE.Vector3(0, 1, 0).cross(p).normalize();
    const north = p.clone().cross(east).normalize();
    const yawRad = (hdg + look.yaw) * RAD;
    const fwd = north.clone().multiplyScalar(Math.cos(yawRad)).add(east.clone().multiplyScalar(Math.sin(yawRad))).normalize();
    const alt = look.alt;
    const wantPos = p.clone().multiplyScalar(1 + alt).add(fwd.clone().multiplyScalar(-alt * 0.35));
    const pitch = (-28 + look.pitch) * RAD; // look a little down toward the ground ahead
    const dir = fwd.clone().multiplyScalar(Math.cos(pitch)).add(p.clone().multiplyScalar(Math.sin(pitch)));
    const wantTarget = wantPos.clone().add(dir);
    if (!camPos || camPos.distanceTo(wantPos) > 0.15) { camPos = wantPos.clone(); camTarget = wantTarget.clone(); }
    else { camPos.lerp(wantPos, 0.22); camTarget.lerp(wantTarget, 0.22); }
    camera.position.copy(camPos); camera.up.copy(p); camera.lookAt(camTarget);

    const sunDir = xyz(s.sun.lat, s.sun.lon);
    earth.material.uniforms.sunDir.value.copy(sunDir);
    sunSprite.position.copy(sunDir.clone().multiplyScalar(50));
    stars.position.copy(camera.position);

    const stops = lights.userData.stops, col = lights.geometry.getAttribute('color');
    stops.forEach((w, i) => { const c = (w.depart <= t || s.phase === 'done') ? DONE : TODO; col.setXYZ(i, c.r, c.g, c.b); });
    col.needsUpdate = true;
    if (s.phase === 'flight' && s.next && !s.next.pole) { nextLight.geometry.setFromPoints([xyz(s.next.lat, s.next.lon, 1.003)]); nextLight.visible = true; } else nextLight.visible = false;
    routeLine.visible = s.phase !== 'done';
    if (s.phase === 'flight') { tailLine.geometry.setFromPoints(track(route, t - 150 * MIN, t).map(q => xyz(q.lat, q.lon, 1.0022))); tailLine.visible = true; } else tailLine.visible = false;
    workshop.visible = s.phase !== 'flight' || here.lat > 60;

    renderer.render(scene, camera);

    // where the next stop is on screen (for the HUD label), if it is in front of the camera and over the horizon
    if (!s.next || s.next.pole) return { label: null };
    const v = xyz(s.next.lat, s.next.lon, 1.003);
    const horizonCos = 1 / (1 + alt);
    if (v.dot(p) < horizonCos) return { label: null };
    const ndc = v.clone().project(camera);
    if (ndc.z > 1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) return { label: null };
    return { label: { x: (ndc.x + 1) / 2 * W, y: (1 - ndc.y) / 2 * H } };
  }

  Object.assign(api, { supported, init, setRoute, render, resize, look });
  return api;
})();
