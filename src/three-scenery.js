// Scenery builders for the sleigh view: regional prop kits and low-poly landmarks.
// Classic script (no import/export). Globals: THREE (r152 UMD), hash32, mulberry32 (engine).
// Units are KILOMETRES: origin = city centre at ground level, +Y up, +X east, +Z south.
// The caller scales the returned group by 1/6371 and places it on the globe.
window.SantaScenery = (() => {
  if (typeof THREE === 'undefined') return null;
  const T = THREE;
  const PI = Math.PI;

  // ---------- procedural textures (cached) ----------
  const texCache = new Map();
  function canvasTex(key, w, h, draw, repX = 1, repY = 1) {
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repX, repY); t.colorSpace = T.SRGBColorSpace;
    texCache.set(key, t); return t;
  }
  const noise = (g, w, h, n, a) => { const r = mulberry32(0x5EED); for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < .5 ? 0 : 255},${r() < .5 ? 0 : 255},${r() < .5 ? 0 : 255},${r() * a})`; g.fillRect(r() * w, r() * h, 2, 2); } };
  const TEX = {
    brick: () => canvasTex('brick', 128, 128, (g, w, h) => { g.fillStyle = '#8d3a2c'; g.fillRect(0, 0, w, h); g.fillStyle = '#6e2c22'; for (let y = 0; y < h; y += 8) for (let x = (y / 8 % 2) * 8; x < w; x += 16) g.fillRect(x, y, 15, 7); noise(g, w, h, 300, .12); }, 6, 6),
    stone: () => canvasTex('stone', 128, 128, (g, w, h) => { g.fillStyle = '#cfc4b0'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < h; y += 16) { g.fillRect(0, y, w, 1); for (let x = (y / 16 % 2) * 12; x < w; x += 24) g.fillRect(x, y, 1, 16); } noise(g, w, h, 400, .08); }, 4, 4),
    marble: () => canvasTex('marble', 128, 128, (g, w, h) => { g.fillStyle = '#e6e1d6'; g.fillRect(0, 0, w, h); noise(g, w, h, 500, .06); }, 2, 2),
    glass: () => canvasTex('glass', 128, 128, (g, w, h) => { g.fillStyle = '#2a3140'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.06)'; for (let y = 0; y < h; y += 12) g.fillRect(0, y, w, 1); for (let x = 0; x < w; x += 10) g.fillRect(x, 0, 1, h); }, 3, 6),
    snow: () => canvasTex('snow', 256, 256, (g, w, h) => { g.fillStyle = '#d7dde9'; g.fillRect(0, 0, w, h); noise(g, w, h, 1200, .07); const r = mulberry32(0x5A1E); for (let i = 0; i < 330; i++) { g.fillStyle = r() < .6 ? '#ffffff' : '#eef4ff'; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); } }, 40, 40),
    earth: () => canvasTex('earth', 256, 256, (g, w, h) => { g.fillStyle = '#1a1d24'; g.fillRect(0, 0, w, h); noise(g, w, h, 900, .05); g.fillStyle = 'rgba(255,220,170,0.09)'; for (let k = 0; k < w; k += 64) { g.fillRect(k, 0, 2, h); g.fillRect(0, k + 20, w, 2); } g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < w; k += 64) g.fillRect(k + 2, 0, 1, h); }, 40, 40),
    thatch: () => canvasTex('thatch', 64, 64, (g, w, h) => { g.fillStyle = '#9a7a3a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h); }, 4, 2),
    // lit-window emissive map: black border so UV (0,0) is dark; warm dots inside
    windows: (warm) => canvasTex('win' + warm, 64, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = mulberry32(0xA11 + Math.round(warm * 100)); for (let y = 8; y < h - 6; y += 10) for (let x = 8; x < w - 6; x += 9) { const u = r(); if (u < warm) { const v = r(); g.fillStyle = v < .55 ? '#ffd27a' : v < .85 ? '#fff1cf' : '#ffb55a'; g.fillRect(x, y, 5, 6); if (r() < .3) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y, 2, 6); } } else if (u < warm + .35) { g.fillStyle = '#2a2420'; g.fillRect(x, y, 5, 6); } } }, 1, 1),
    windowsTiled: (warm) => canvasTex('winT' + warm, 64, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = mulberry32(0xB11 + Math.round(warm * 100)); for (let y = 4; y < h - 2; y += 10) for (let x = 4; x < w - 2; x += 9) if (r() < warm) { g.fillStyle = r() < .75 ? '#ffd58a' : '#fff1cf'; g.fillRect(x, y, 5, 6); } }, 3, 8),
    stripes: (i) => { const pairs = [['#1f7a4a', '#f2efe8'], ['#b3302a', '#f2efe8'], ['#2a5fb3', '#f2efe8'], ['#d9a441', '#2d6b4a'], ['#b3302a', '#d9a441']]; const [a, b] = pairs[i % pairs.length]; return canvasTex('stripe' + i, 64, 64, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let k = 0; k < 10; k += 2) g.fillRect(k * w / 10, 0, w / 10, h); }, 4, 1); },
    candy: () => canvasTex('candy', 64, 64, (g, w, h) => { g.fillStyle = '#f6f1e7'; g.fillRect(0, 0, w, h); g.fillStyle = '#e5484d'; for (let k = 0; k < 8; k += 2) g.fillRect(0, k * h / 8, w, h / 8); }, 1, 6),
    clock: () => canvasTex('clock', 64, 64, (g, w, h) => { g.fillStyle = '#f4e9c8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#333'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.stroke(); g.beginPath(); g.moveTo(32, 32); g.lineTo(32, 12); g.moveTo(32, 32); g.lineTo(46, 36); g.stroke(); }, 1, 1),
    arches: () => canvasTex('arches', 128, 128, (g, w, h) => { g.fillStyle = '#cfbfa2'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a3b2c'; for (let row = 0; row < 3; row++) for (let x = 6; x < w; x += 22) { g.beginPath(); g.arc(x + 7, row * 42 + 24, 7, PI, 0); g.lineTo(x + 14, row * 42 + 40); g.lineTo(x, row * 42 + 40); g.closePath(); g.fill(); } }, 12, 1),
    smoke: () => canvasTex('smoke', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(200,205,215,0.9)'); gr.addColorStop(.5, 'rgba(200,205,215,0.35)'); gr.addColorStop(1, 'rgba(200,205,215,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }),
    glow: () => canvasTex('glow', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }),
  };

  // ---------- materials ----------
  const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: .85, metalness: 0 }, o));
  const materials = {
    stone: std({ map: TEX.stone(), color: '#ffffff' }),
    marble: std({ map: TEX.marble(), roughness: .6 }),
    brick: std({ map: TEX.brick() }),
    red: std({ color: '#a7322a', roughness: .7 }),
    sand: std({ color: '#d8b878', roughness: 1 }),
    gold: std({ color: '#e8bb5e', metalness: .8, roughness: .35 }),
    white: std({ color: '#f2efe8', roughness: .6 }),
    green: std({ color: '#2f6b48' }),
    darkgreen: std({ color: '#1f4a33' }),
    verdigris: std({ color: '#6fa58c', roughness: .7 }),
    steel: std({ color: '#8c98a8', metalness: .7, roughness: .4 }),
    rust: std({ color: '#c0362c', roughness: .6, metalness: .2 }),
    wood: std({ color: '#6b4424' }),
    trunk: std({ color: '#4a3220' }),
    glass: std({ map: TEX.glass(), emissive: '#ffffff', emissiveMap: TEX.windowsTiled(.5), emissiveIntensity: 1.25, roughness: .5, metalness: .2 }),
    glassWarm: std({ map: TEX.glass(), emissive: '#ffffff', emissiveMap: TEX.windowsTiled(.7), emissiveIntensity: 1.45, roughness: .5, metalness: .2 }),
    dark: std({ color: '#1b2436' }),
    snow: std({ color: '#dfe6f2', roughness: 1 }),
    water: std({ color: '#0c1a2e', metalness: .6, roughness: .25 }),
    cream: std({ color: '#f6f1e7', roughness: .8 }),
    gingerbread: std({ color: '#b97a3f', roughness: .9, emissive: '#ffffff', emissiveMap: TEX.windows(.6), emissiveIntensity: .8 }),
    lamp: std({ color: '#ffe9a8', emissive: '#ffe9a8', emissiveIntensity: 2 }),
    redstar: std({ color: '#ff4d3d', emissive: '#ff2a1a', emissiveIntensity: 1.5 }),
    pink: std({ color: '#e07aa0', roughness: .5 }),
    blue: std({ color: '#2a5fb3', roughness: .6 }),
    amber: std({ color: '#7a4e2a', roughness: .5, metalness: .4, emissive: '#ffb060', emissiveIntensity: .25 }),
    thatch: std({ map: TEX.thatch(), roughness: 1 }),
    candy: std({ map: TEX.candy(), roughness: .5 }),
    arches: std({ map: TEX.arches(), roughness: .9 }),
    clock: std({ map: TEX.clock(), emissive: '#ffe9a8', emissiveIntensity: .35 }),
    stripes: [0, 1, 2, 3, 4].map(i => std({ map: TEX.stripes(i), roughness: .55 })),
    gumdrops: ['#e5484d', '#3ddc84', '#f5c451', '#a66bff', '#5aa9ff', '#ff8a3d'].map(c => std({ color: c, roughness: .35 })),
  };
  const shared = new Set(); // geometries/materials that must never be disposed
  Object.values(materials).flat().forEach(m => shared.add(m));

  // ---------- primitive helpers (bottom-centred, km) ----------
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => mesh(new T.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
  const cyl = (rt, rb, h, seg, mat, x = 0, y = 0, z = 0) => mesh(new T.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z);
  const cone = (r, h, seg, mat, x = 0, y = 0, z = 0) => mesh(new T.ConeGeometry(r, h, seg), mat, x, y + h / 2, z);
  const sph = (r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const m = mesh(new T.SphereGeometry(r, 16, 12), mat, x, y, z); m.scale.set(sx, sy, sz); return m; };
  const hemi = (r, mat, x = 0, y = 0, z = 0, sy = 1) => { const m = mesh(new T.SphereGeometry(r, 18, 10, 0, 2 * PI, 0, PI / 2), mat, x, y, z); m.scale.y = sy; return m; };
  const pyramid = (r, h, mat, x = 0, y = 0, z = 0) => { const m = cone(r, h, 4, mat, x, y, z); m.rotation.y = PI / 4; return m; };
  function onionGeo(r, h) { const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; const rr = r * (t < 0.55 ? Math.sin(t / 0.55 * PI * 0.5 + 0.2) * 1.05 : Math.pow(1 - (t - 0.55) / 0.45, 1.6)); pts.push(new T.Vector2(Math.max(r * 0.02, rr), t * h)); } return new T.LatheGeometry(pts, 20); }
  function onion(r, h, mat, x = 0, y = 0, z = 0) { const g = new T.Group(); g.add(mesh(onionGeo(r, h), mat)); const sp = cyl(r * 0.06, r * 0.18, h * 0.35, 6, materials.gold, 0, h); g.add(sp); g.position.set(x, y, z); return g; }
  const tube = (pts, r, mat, seg = 32) => mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), seg, r, 6, false), mat);
  const V = (x, y, z) => new T.Vector3(x, y, z);

  // ---------- geometry merging for instanced props ----------
  // parts: [{ geo, color: '#hex', uv: 'tile'|'zero', tile: [u, v], m: Matrix4 }]
  function mergeParts(parts, snowRoofs) {
    const pos = [], nor = [], uv = [], col = [];
    const c = new T.Color();
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      if (p.m) g.applyMatrix4(p.m);
      const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
      c.set(snowRoofs && p.roof ? '#dfe6f2' : p.color);
      const [tu, tv] = p.tile || [1, 1];
      for (let i = 0; i < pa.count; i++) {
        pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i));
        if (p.uv === 'zero' || (p.skipTop && Math.abs(na.getY(i)) > 0.9)) uv.push(0, 0); else uv.push(ua.getX(i) * tu, ua.getY(i) * tv);
        col.push(c.r, c.g, c.b);
      }
      if (g !== p.geo) g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return out;
  }
  // merge plain geometries (position/normal/uv) into one, for one-draw-call details
  function mergePlain(parts) {
    const pos = [], nor = [], uv = [];
    for (const p of parts) { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo; if (p.m) g.applyMatrix4(p.m); const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; for (let i = 0; i < pa.count; i++) { pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i)); uv.push(ua.getX(i), ua.getY(i)); } if (g !== p.geo) g.dispose(); p.geo.dispose(); }
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); return out;
  }
  const at = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new T.Matrix4().compose(V(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, 0)), V(sx, sy, sz));
  const B_ = (w, h, d) => new T.BoxGeometry(w, h, d);
  const C_ = (rt, rb, h, seg) => new T.CylinderGeometry(rt, rb, h, seg);
  const K_ = (r, h, seg) => new T.ConeGeometry(r, h, seg);
  const S_ = (r, seg = 12, rings = 8) => new T.SphereGeometry(r, seg, rings);
  const H_ = (r) => new T.SphereGeometry(r, 14, 8, 0, 2 * PI, 0, PI / 2);

  // Unit props: height 1, footprint 1, bottom at y=0. Walls use uv 'tile' (windows glow); the rest 'zero'.
  const WALL = '#9aa3b2', ROOF = '#3a3f4f', LEAF = '#2a5a3a', TRUNK = '#5a3a22', STONE = '#cfc4b0', GOLD = '#e8bb5e', SAND = '#c9a56a', WHITE = '#ece8df', GREENROOF = '#3a7a56', TEAL = '#2d6b7a';
  const PROPS = {
    block: () => [{ geo: B_(1, 1, 1), color: WALL, uv: 'tile', tile: [3, 4], skipTop: true, m: at(0, .5, 0) }],
    tower: () => [{ geo: B_(1, 1, 1), color: '#6d7a92', uv: 'tile', tile: [4, 9], skipTop: true, m: at(0, .5, 0) }, { geo: B_(.6, .06, .6), color: ROOF, roof: true, uv: 'zero', m: at(0, 1.03, 0) }],
    house: () => [{ geo: B_(1, .68, 1), color: '#c9b79a', uv: 'tile', tile: [2, 1.5], skipTop: true, m: at(0, .34, 0) }, { geo: K_(.85, .34, 4), color: ROOF, roof: true, uv: 'zero', m: at(0, .85, 0, 1, 1, 1, PI / 4) }, { geo: B_(.12, .32, .12), color: '#6b4a3a', uv: 'zero', m: at(.28, .78, -.22) }],
    spire: () => [{ geo: B_(.6, .45, 1), color: STONE, uv: 'tile', tile: [2, 2], skipTop: true, m: at(0, .225, .1) }, { geo: K_(.42, .2, 4), color: ROOF, roof: true, uv: 'zero', m: at(0, .55, .1, 1, 1, 1, PI / 4) }, { geo: B_(.26, .55, .26), color: STONE, uv: 'tile', tile: [1, 3], skipTop: true, m: at(0, .275, -.35) }, { geo: K_(.19, .42, 4), color: ROOF, roof: true, uv: 'zero', m: at(0, .76, -.35, 1, 1, 1, PI / 4) }, { geo: B_(.03, .1, .03), color: GOLD, uv: 'zero', m: at(0, 1, -.35) }],
    onion: () => [{ geo: C_(.3, .32, .55, 12), color: WHITE, uv: 'tile', tile: [3, 2], m: at(0, .275, 0) }, { geo: onionGeo(.36, .4), color: GOLD, uv: 'zero', m: at(0, .55, 0) }, { geo: C_(.015, .04, .08, 6), color: GOLD, uv: 'zero', m: at(0, .96, 0) }],
    minaret: () => [{ geo: C_(.12, .15, .75, 10), color: WHITE, uv: 'zero', m: at(0, .375, 0) }, { geo: new T.TorusGeometry(.17, .03, 6, 12), color: WHITE, uv: 'zero', m: new T.Matrix4().compose(V(0, .62, 0), new T.Quaternion().setFromEuler(new T.Euler(PI / 2, 0, 0)), V(1, 1, 1)) }, { geo: K_(.14, .25, 10), color: TEAL, uv: 'zero', m: at(0, .875, 0) }],
    dome: () => [{ geo: B_(1, .5, 1), color: SAND, uv: 'tile', tile: [2, 1.5], skipTop: true, m: at(0, .25, 0) }, { geo: H_(.42), color: TEAL, uv: 'zero', m: at(0, .5, 0, 1, 1.2, 1) }],
    pagoda: () => [{ geo: B_(.6, .3, .6), color: '#8a3a2a', uv: 'tile', tile: [2, 1], skipTop: true, m: at(0, .15, 0) }, { geo: K_(.7, .18, 4), color: ROOF, roof: true, uv: 'zero', m: at(0, .39, 0, 1, 1, 1, PI / 4) }, { geo: B_(.45, .22, .45), color: '#8a3a2a', uv: 'tile', tile: [2, 1], skipTop: true, m: at(0, .59, 0) }, { geo: K_(.55, .16, 4), color: ROOF, roof: true, uv: 'zero', m: at(0, .78, 0, 1, 1, 1, PI / 4) }, { geo: B_(.3, .14, .3), color: '#8a3a2a', uv: 'zero', m: at(0, .93, 0) }, { geo: K_(.4, .14, 4), color: ROOF, roof: true, uv: 'zero', m: at(0, 1.07, 0, 1, 1, 1, PI / 4) }],
    stupa: () => [{ geo: C_(.5, .55, .2, 12), color: WHITE, uv: 'zero', m: at(0, .1, 0) }, { geo: S_(.4), color: GOLD, uv: 'zero', m: at(0, .55, 0, 1, 1.1, 1) }, { geo: K_(.12, .3, 8), color: GOLD, uv: 'zero', m: at(0, 1.05, 0) }],
    chhatri: () => [{ geo: B_(1, .06, 1), color: STONE, uv: 'zero', m: at(0, .03, 0) }, ...[[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]].map(([x, z]) => ({ geo: C_(.06, .06, .6, 6), color: STONE, uv: 'zero', m: at(x, .36, z) })), { geo: B_(1, .08, 1), color: STONE, uv: 'zero', m: at(0, .7, 0) }, { geo: H_(.42), color: SAND, uv: 'zero', m: at(0, .74, 0, 1, .7, 1) }],
    plaza: () => [{ geo: B_(1, .5, 1), color: '#e2d2b0', uv: 'tile', tile: [3, 1.5], skipTop: true, m: at(0, .25, 0) }, { geo: B_(.22, .95, .22), color: '#e2d2b0', uv: 'tile', tile: [1, 3], skipTop: true, m: at(-.38, .475, .38) }, { geo: B_(.22, .95, .22), color: '#e2d2b0', uv: 'tile', tile: [1, 3], skipTop: true, m: at(.38, .475, .38) }, { geo: H_(.22), color: TEAL, uv: 'zero', m: at(0, .5, -.1) }, { geo: K_(.14, .2, 4), color: ROOF, roof: true, uv: 'zero', m: at(-.38, 1.05, .38, 1, 1, 1, PI / 4) }, { geo: K_(.14, .2, 4), color: ROOF, roof: true, uv: 'zero', m: at(.38, 1.05, .38, 1, 1, 1, PI / 4) }],
    adobe: () => [{ geo: B_(1, 1, 1), color: '#c08a56', uv: 'tile', tile: [1, 1], skipTop: true, m: at(0, .5, 0) }, { geo: B_(.3, .3, .3), color: '#c08a56', uv: 'zero', m: at(.25, 1.1, -.2) }],
    hut: () => [{ geo: C_(.4, .42, .5, 10), color: '#a4703c', uv: 'zero', m: at(0, .25, 0) }, { geo: K_(.6, .5, 10), color: '#9a7a3a', uv: 'zero', m: at(0, .75, 0) }],
    stilt: () => [...[[-.35, -.35], [.35, -.35], [-.35, .35], [.35, .35]].map(([x, z]) => ({ geo: B_(.06, .4, .06), color: TRUNK, uv: 'zero', m: at(x, .2, z) })), { geo: B_(1, .45, 1), color: '#b08a5a', uv: 'tile', tile: [1, 1], skipTop: true, m: at(0, .625, 0) }, { geo: K_(.8, .3, 4), color: '#9a7a3a', roof: true, uv: 'zero', m: at(0, 1, 0, 1, 1, 1, PI / 4) }],
    pine: () => [{ geo: C_(.06, .08, .3, 6), color: TRUNK, uv: 'zero', m: at(0, .15, 0) }, { geo: K_(.5, .45, 7), color: LEAF, uv: 'zero', m: at(0, .45, 0) }, { geo: K_(.38, .38, 7), color: LEAF, uv: 'zero', m: at(0, .7, 0) }, { geo: K_(.25, .32, 7), color: '#3a7a52', roof: true, uv: 'zero', m: at(0, .94, 0) }],
    palm: () => [{ geo: C_(.05, .08, .9, 6), color: '#8a6a40', uv: 'zero', m: new T.Matrix4().compose(V(.08, .45, 0), new T.Quaternion().setFromEuler(new T.Euler(0, 0, -.18)), V(1, 1, 1)) }, ...[0, 1, 2, 3, 4, 5].map(i => ({ geo: B_(.7, .03, .18), color: '#3f8a4a', uv: 'zero', m: new T.Matrix4().compose(V(.16 + Math.cos(i * PI / 3) * .3, .93, Math.sin(i * PI / 3) * .3), new T.Quaternion().setFromEuler(new T.Euler(0, -i * PI / 3, -.35)), V(1, 1, 1)) }))],
    baobab: () => [{ geo: C_(.22, .36, .7, 9), color: '#7a6248', uv: 'zero', m: at(0, .35, 0) }, { geo: S_(.45), color: '#6a7a4a', uv: 'zero', m: at(0, .8, 0, 1, .5, 1) }],
    acacia: () => [{ geo: C_(.05, .09, .55, 6), color: TRUNK, uv: 'zero', m: at(0, .275, 0) }, { geo: C_(.5, .3, .25, 10), color: '#5a7a3a', uv: 'zero', m: at(0, .675, 0) }],
  };
  const geoCache = new Map();
  function propGeometry(type, snowRoofs = false) {
    const key = type + (snowRoofs ? ':snow' : '');
    if (!geoCache.has(key)) { const g = mergeParts(PROPS[type](), snowRoofs); shared.add(g); geoCache.set(key, g); }
    return geoCache.get(key);
  }
  const propMaterial = std({ vertexColors: true, roughness: .9, emissive: '#ffffff', emissiveMap: TEX.windows(.55), emissiveIntensity: 1.35 });
  const propMaterialLite = std({ vertexColors: true, roughness: .9 });
  shared.add(propMaterial); shared.add(propMaterialLite);
  const TINTS = ['#ffffff', '#f3e6cf', '#e0c2b5', '#c9d1e0'].map(c => new T.Color(c));
  const snowcapGeo = new T.BoxGeometry(1, 1, 1); shared.add(snowcapGeo);
  const waterGeo = new T.CircleGeometry(1, 24); waterGeo.rotateX(-PI / 2); shared.add(waterGeo);

  // ---------- ground + streets ----------
  function groundGeometry(R) {
    const rings = 20, rad = 64; const pos = [], uv = [], idx = [];
    for (let i = 0; i <= rings; i++) { const r = R * i / rings; const sag = 6371 - Math.sqrt(6371 * 6371 - r * r); for (let j = 0; j < rad; j++) { const a = j / rad * 2 * PI; const x = Math.cos(a) * r, z = Math.sin(a) * r; pos.push(x, -sag, z); uv.push(x / R * 20, z / R * 20); } }
    for (let i = 0; i < rings; i++) for (let j = 0; j < rad; j++) { const a = i * rad + j, b = i * rad + (j + 1) % rad, c = (i + 1) * rad + j, d = (i + 1) * rad + (j + 1) % rad; if (i > 0) idx.push(a, b, c); idx.push(b, d, c); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const STREET_STYLE = { european: 'radial', eastern: 'radial', 'middle-east': 'radial', nordic: 'radial', 'north-american': 'grid', 'east-asia': 'grid', latin: 'grid', 'south-asia': 'grid', sahel: 'blobs', african: 'blobs', island: 'blobs', 'tropical-asia': 'blobs' };
  function streetTex(style) {
    return canvasTex('streets-' + style, 1024, 1024, (g, w, h) => {
      const c = w / 2; g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,170,90,0.55)'; g.fillStyle = 'rgba(255,170,90,0.5)'; g.lineWidth = 1;
      const r = mulberry32(0x57E1);
      if (style === 'radial') { for (let rr = 30; rr < c; rr += 26) { g.beginPath(); g.arc(c, c, rr * (1 + (r() - .5) * .06), 0, 7); g.stroke(); } for (let a = 0; a < 28; a++) { const t = a / 28 * 6.283 + (r() - .5) * .1; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(t) * c, c + Math.sin(t) * c); g.stroke(); } }
      else if (style === 'grid') { for (let x = 14; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - .5) * 8, h); g.stroke(); } for (let y = 14; y < h; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - .5) * 8); g.stroke(); } }
      else { for (let i = 0; i < 400; i++) { const x = c + (r() - .5) * 900, y = c + (r() - .5) * 900; g.beginPath(); g.arc(x, y, 1 + r() * 3, 0, 7); g.fill(); } for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(c, c); g.lineTo(c + (r() - .5) * 1000, c + (r() - .5) * 1000); g.stroke(); } }
      // fade to black at the rim
      const gr = g.createRadialGradient(c, c, c * .4, c, c, c); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }

  // ---------- lights as points: lamps, Christmas strings, uplights, smoke ----------
  // Sizes are computed from the distance in km, recovered from the model matrix scale, so the same shader works
  // whether the diorama is drawn in km (harness) or scaled onto the globe (the app).
  const PR = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1.5);
  function pointMat(o) {
    const m = new T.ShaderMaterial({
      uniforms: { uK: { value: o.k }, uMin: { value: o.min }, uMax: { value: o.max }, uPR: { value: PR }, uTime: { value: 0 }, uOpacity: { value: o.opacity == null ? 1 : o.opacity }, map: { value: o.map || null } },
      defines: Object.assign({}, o.twinkle ? { TWINKLE: 1 } : {}, o.map ? { USE_MAP_TEX: 1 } : {}, o.soft ? { SOFT: 1 } : {}),
      vertexShader: `uniform float uK, uMin, uMax, uPR, uTime; attribute vec3 color; attribute float phase; attribute float sizeMul; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float sc = length(vec3(modelMatrix[0])); float dKm = max(1e-4, -mv.z / sc);
          gl_PointSize = clamp(uK / dKm, uMin, uMax) * uPR * sizeMul; gl_Position = projectionMatrix * mv; vC = color;
          #ifdef TWINKLE
            vA = 0.55 + 0.45 * sin(uTime * 2.6 + phase * 6.2832);
          #else
            vA = 1.0;
          #endif
        }`,
      fragmentShader: `uniform float uOpacity; uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
          #ifdef USE_MAP_TEX
            float a = texture2D(map, gl_PointCoord).a;
          #else
            float a = pow(1.0 - r, 1.6);
          #endif
          #ifdef SOFT
            a *= 0.55 + 0.45 * (1.0 - r);
          #endif
          gl_FragColor = vec4(vC, a * vA * uOpacity); }`,
      transparent: true, depthWrite: false, blending: o.additive === false ? T.NormalBlending : T.AdditiveBlending, fog: false,
    });
    return m;
  }
  function pointsFrom(list, mat) { // list: [{x,y,z,c:[r,g,b],ph,s}]
    const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n), sm = new Float32Array(n);
    list.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; col[i * 3] = p.c[0]; col[i * 3 + 1] = p.c[1]; col[i * 3 + 2] = p.c[2]; ph[i] = p.ph || 0; sm[i] = p.s || 1; });
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('phase', new T.BufferAttribute(ph, 1)); g.setAttribute('sizeMul', new T.BufferAttribute(sm, 1));
    const pts = new T.Points(g, mat); pts.frustumCulled = false; return pts;
  }
  const rgb = hex => { const c = new T.Color(hex); return [c.r, c.g, c.b]; };
  const LAMP = rgb('#ffd9a0'), XMAS = ['#ff3b30', '#2fd36b', '#ffd23a', '#3b8bff', '#fff6e0', '#ff7ad9'].map(rgb);
  // the world-space position of a point given in a prop's unit frame (x,y,z in [-.5,.5]x[0,1]x[-.5,.5])
  function propPoint(p, ux, uy, uz) { const cs = Math.cos(p.rot || 0), sn = Math.sin(p.rot || 0); const lx = ux * p.w, lz = uz * p.d; return { x: p.x + lx * cs + lz * sn, y: uy * p.h, z: p.z - lx * sn + lz * cs }; }
  // lamp positions follow the same street pattern as the glow texture
  function lampPositions(style, radiusKm, rnd) {
    const out = [], R = radiusKm * 0.95;
    const push = (x, z) => { if (Math.hypot(x, z) < R) out.push({ x, y: 0.006, z, c: LAMP, s: 1 }); };
    if (style === 'radial') { for (let rr = 0.25; rr < R; rr += 0.55 * (1 + rr / R)) { const n = Math.max(8, Math.round(rr * 22)); for (let i = 0; i < n; i++) { const a = i / n * 2 * PI + rnd() * .02; if (rnd() < 0.75) push(Math.cos(a) * rr, Math.sin(a) * rr); } } for (let a = 0; a < 14; a++) { const t = a / 14 * 2 * PI + (rnd() - .5) * .1; for (let rr = 0.2; rr < R; rr += 0.22) if (rnd() < 0.8) push(Math.cos(t) * rr, Math.sin(t) * rr); } }
    else if (style === 'grid') { const step = 0.42; for (let x = -R; x <= R; x += step) for (let z = -R; z <= R; z += step * 1.25) { const onX = Math.round(x / step) % 2 === 0, onZ = Math.round(z / (step * 1.25)) % 2 === 0; if ((onX || onZ) && rnd() < 0.5 && Math.hypot(x, z) < R * (0.55 + 0.45 * rnd())) push(x + (rnd() - .5) * .05, z + (rnd() - .5) * .05); } }
    else { for (let i = 0; i < 12; i++) { const cx = (rnd() - .5) * R * 1.4, cz = (rnd() - .5) * R * 1.4; for (let k = 0; k < 18; k++) push(cx + (rnd() - .5) * .9, cz + (rnd() - .5) * .9); } for (let i = 0; i < 6; i++) { const t = rnd() * 2 * PI; for (let rr = 0.2; rr < R; rr += 0.25) if (rnd() < 0.7) push(Math.cos(t) * rr, Math.sin(t) * rr); } }
    // thin out so the total stays modest, denser toward the centre
    return out.filter(p => rnd() < Math.max(0.25, 1 - Math.hypot(p.x, p.z) / R)).slice(0, 420);
  }
  // the town Christmas tree: dark cone, spiral of coloured lights, gold star
  function townTree(x, z, hKm, rnd) {
    const g = new T.Group(); g.name = 'towntree';
    const cone = mesh(new T.ConeGeometry(hKm * 0.34, hKm, 10), materials.darkgreen, 0, hKm / 2 + hKm * 0.06, 0); g.add(cone);
    g.add(cyl(hKm * 0.04, hKm * 0.05, hKm * 0.08, 6, materials.trunk, 0, 0, 0));
    const star = mesh(new T.OctahedronGeometry(hKm * 0.07), std({ color: '#ffd27a', emissive: '#ffd27a', emissiveIntensity: 2.2, roughness: .4 }), 0, hKm * 1.08, 0); g.add(star);
    const pts = []; const n = 110;
    for (let i = 0; i < n; i++) { const t = i / n, a = t * 9 * PI; const r = hKm * 0.34 * (1 - t) * 1.02; pts.push({ x: Math.cos(a) * r, y: hKm * 0.06 + t * hKm, z: Math.sin(a) * r, c: XMAS[i % XMAS.length], ph: rnd(), s: 1.1 }); }
    const lights = pointsFrom(pts, pointMat({ k: 1.6, min: 2.2, max: 7, twinkle: true })); g.add(lights);
    g.position.set(x, 0, z); g.userData.lights = lights;
    return g;
  }
  const TALL = new Set(['eiffel', 'tokyotower', 'burj', 'cntower', 'willis', 'petronas', 'pearl', 'needle', 'nseoul', 'mbs']);

  // ---------- build ----------
  function build(spec, opts = {}) {
    const g = new T.Group(); g.name = 'diorama';
    const snow = !!(spec.climate && spec.climate.snow), haze = spec.climate ? spec.climate.haze : .5;
    const R = Math.max(45, spec.radiusKm * 2.5);
    const ground = new T.Mesh(groundGeometry(R), std({ map: snow ? TEX.snow() : TEX.earth(), color: snow ? '#6b7488' : '#1a1d24', roughness: 1 }));
    ground.name = 'ground'; ground.receiveShadow = true; g.add(ground);
    const streets = new T.Mesh(new T.CircleGeometry(spec.radiusKm * 1.3, 48), new T.MeshBasicMaterial({ map: streetTex(STREET_STYLE[spec.kit] || 'radial'), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.05 + 0.12 * haze }));
    streets.rotation.x = -PI / 2; streets.position.y = 0.004; streets.name = 'streets'; g.add(streets);
    streets.material.opacity = Math.min(0.05, 0.02 + 0.04 * haze); // ambient street light only; real lamps are points below
    const seed = typeof hash32 === 'function' ? hash32(opts.year || 2026, (spec.radiusKm * 1000) | 0) : 1234;
    const rnd = mulberry32(seed);
    const houses = [], eaveCandidates = [];

    // group props by type
    const byType = new Map(); let caps = 0;
    for (const p of spec.props || []) { if (!byType.has(p.type)) byType.set(p.type, []); byType.get(p.type).push(p); if (p.snowcap && ['block', 'tower', 'adobe', 'stilt'].includes(p.type)) caps++; }
    for (const w of byType.get('water') || []) { const m = new T.Mesh(waterGeo, materials.water); m.scale.set(w.w, 1, w.d); m.position.set(w.x, 0.002, w.z); m.receiveShadow = true; g.add(m); }
    const mat4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
    let capMesh = null, capI = 0;
    if (caps) { capMesh = new T.InstancedMesh(snowcapGeo, materials.snow, caps); capMesh.castShadow = true; capMesh.name = 'snowcaps'; }
    for (const [type, list] of byType) {
      if (type === 'water' || !PROPS[type]) continue;
      const im = new T.InstancedMesh(propGeometry(type, snow), opts.lite ? propMaterialLite : propMaterial, list.length);
      if (type === 'house') { for (const p of list) { houses.push(p); if (rnd() < 0.4) eaveCandidates.push(p); } }
      im.castShadow = im.receiveShadow = true; im.name = 'props-' + type;
      list.forEach((p, i) => {
        q.setFromEuler(e.set(0, p.rot || 0, 0));
        mat4.compose(V(p.x, 0, p.z), q, V(p.w, p.h, p.d)); im.setMatrixAt(i, mat4);
        im.setColorAt(i, TINTS[(p.variant || 0) % 4]);
        if (capMesh && p.snowcap && ['block', 'tower', 'adobe', 'stilt'].includes(type)) { mat4.compose(V(p.x, p.h + 0.006, p.z), q, V(p.w * 1.04, 0.012, p.d * 1.04)); capMesh.setMatrixAt(capI++, mat4); }
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      g.add(im);
    }
    if (capMesh) { capMesh.count = capI; capMesh.instanceMatrix.needsUpdate = true; g.add(capMesh); }

    const lights = [];
    if (spec.landmark && B[spec.landmark.id]) {
      const lm = B[spec.landmark.id](spec); lm.name = 'landmark-' + spec.landmark.id; g.add(lm);
      const fr = Math.max(0.05, (spec.landmark.footprintKm || 0.3) * 0.5);
      for (let i = 0; i < 6; i++) { const a = i / 6 * 2 * PI; lights.push({ x: Math.cos(a) * fr, y: 0.004, z: Math.sin(a) * fr }); }
    } else {
      for (let i = 0; i < 4; i++) { const a = i / 4 * 2 * PI + .4; lights.push({ x: Math.cos(a) * 0.25, y: 0.004, z: Math.sin(a) * 0.25 }); }
    }
    // --- street lamps (points) ---
    const lamps = pointsFrom(lampPositions(STREET_STYLE[spec.kit] || 'radial', spec.radiusKm, rnd), pointMat({ k: 2.4, min: 2.6, max: 8, opacity: 1 }));
    lamps.name = 'lamps'; g.add(lamps);
    // --- Christmas lights on eaves (≤ 600 points) ---
    const eave = [];
    for (const p of eaveCandidates) { if (eave.length > 560) break; const pal = XMAS; for (const side of [-0.52, 0.52]) for (let u = -0.42; u <= 0.43; u += 0.14) { const q = propPoint(p, u, 0.7, side); eave.push({ x: q.x, y: q.y, z: q.z, c: pal[(eave.length + (side > 0 ? 3 : 0)) % pal.length], ph: rnd(), s: 0.9 }); } }
    const xmas = eave.length ? pointsFrom(eave, pointMat({ k: 1.7, min: 2.2, max: 6, twinkle: true })) : null;
    if (xmas) { xmas.name = 'xmas'; g.add(xmas); }
    // --- town Christmas tree in the square, clear of the landmark footprint ---
    const fp = spec.landmark ? (spec.landmark.footprintKm || 0.3) : 0.2;
    const td = Math.max(0.12, fp * 0.6 + 0.03);
    const tree = townTree(td * 0.77, td * 0.64, 0.012 + 0.006 * Math.min(1, spec.radiusKm / 16), rnd); g.add(tree);
    // --- chimney smoke: 3 puffs per chimney on up to 60 houses, animated by tick(dt) ---
    const chim = houses.slice().sort(() => rnd() - .5).slice(0, 60).map(p => propPoint(p, 0.28, 0.93, -0.22));
    const puffs = []; const wind = { x: (rnd() - .5) * 0.003, z: (rnd() - .5) * 0.003 };
    for (const c of chim) for (let k = 0; k < 3; k++) puffs.push({ cx: c.x, cy: c.y, cz: c.z, age: rnd() * 7, life: 6 + rnd() * 3, x: c.x, y: c.y, z: c.z });
    const smokeMat = pointMat({ k: 3.2, min: 3, max: 90, map: TEX.smoke(), additive: false, opacity: .45 });
    const smoke = pointsFrom(puffs.map(q => ({ x: q.x, y: q.y, z: q.z, c: [0.86, 0.87, 0.9], s: 1 })), smokeMat); smoke.name = 'smoke'; g.add(smoke);
    // --- landmark glow: warm uplights at its feet, a red aviation light on the tall ones ---
    const glows = [];
    if (spec.landmark && B[spec.landmark.id]) {
      const lm = g.getObjectByName('landmark-' + spec.landmark.id);
      const bb = new T.Box3().setFromObject(lm); const top = isFinite(bb.max.y) ? bb.max.y : (spec.landmark.heightKm || 0.05);
      const fr = Math.max(0.03, (spec.landmark.footprintKm || 0.3) * 0.3);
      for (let i = 0; i < 4; i++) { const a = i / 4 * 2 * PI + .5; glows.push({ x: Math.cos(a) * fr, y: 0.012, z: Math.sin(a) * fr, c: [1, 0.78, 0.45], s: 1 }); }
      if (TALL.has(spec.landmark.id)) glows.push({ x: 0, y: top + 0.002, z: 0, c: [1, 0.15, 0.1], s: 0.45, ph: 0.2 });
    }
    glows.push({ x: tree.position.x, y: 0.004, z: tree.position.z, c: [1, 0.85, 0.6], s: 0.6 });
    const glowPts = pointsFrom(glows, pointMat({ k: 9, min: 14, max: 140, twinkle: true, opacity: .7, soft: true })); glowPts.name = 'glows'; g.add(glowPts);
    // --- animation: smoke rises and drifts, lights twinkle ---
    let time = 0; const sp = smoke.geometry.attributes.position, ss = smoke.geometry.attributes.sizeMul;
    const tick = (dt) => {
      dt = Math.min(dt || 0, 0.1); time += dt;
      for (const m of [lamps.material, xmas && xmas.material, tree.userData.lights.material, glowPts.material]) if (m) m.uniforms.uTime.value = time;
      for (let i = 0; i < puffs.length; i++) { const q = puffs[i]; q.age += dt; if (q.age > q.life) { q.age = 0; q.x = q.cx; q.y = q.cy; q.z = q.cz; } const k = q.age / q.life; q.y = q.cy + q.age * 0.0028; q.x = q.cx + q.age * wind.x + Math.sin(q.age * 1.7 + i) * 0.0006 * k; q.z = q.cz + q.age * wind.z; sp.setXYZ(i, q.x, q.y, q.z); ss.setX(i, 0.4 + 2.2 * k); }
      sp.needsUpdate = true; ss.needsUpdate = true;
      smokeMat.uniforms.uOpacity.value = 0.45;
    };
    tick(0);
    g.userData = { lights, kit: spec.kit, landmark: spec.landmark ? spec.landmark.id : null, tick };
    return g;
  }

  function dispose(group) {
    group.traverse(o => {
      if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) if (!shared.has(m)) { if (m.map && !texCache.has(m.map)) { /* textures shared via cache */ } m.dispose(); }
    });
  }

  // ---------- landmark builders (km, real scale, origin at ground) ----------
  const B = {};
  const grp = (...kids) => { const g = new T.Group(); kids.forEach(k => k && g.add(k)); return g; };
  // Eiffel-style lattice tower: 4 leaning legs, two platforms, tapered column, antenna
  function lattice(h, mat, legSpread = 0.19) {
    const g = new T.Group(); const s = h / 0.33;
    const legH = 0.115 * s, legTop = 0.02 * s, legBase = legSpread / 2 * s;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(0.012 * s, legH * 1.05, 0.012 * s, mat, 0, 0, 0);
      const dx = (legBase - legTop) * sx, dz = (legBase - legTop) * sz;
      leg.position.set(sx * (legBase + legTop) / 2, legH / 2, sz * (legBase + legTop) / 2);
      leg.rotation.z = Math.atan2(dx, legH) * 1; leg.rotation.x = -Math.atan2(dz, legH);
      g.add(leg);
    }
    g.add(box(0.075 * s, 0.006 * s, 0.075 * s, mat, 0, 0.057 * s, 0), box(0.045 * s, 0.006 * s, 0.045 * s, mat, 0, legH, 0));
    g.add(cyl(0.004 * s, 0.017 * s, 0.19 * s, 4, mat, 0, legH, 0), cyl(0.0012 * s, 0.002 * s, 0.03 * s, 4, materials.steel, 0, 0.3 * s, 0));
    return g;
  }
  B.eiffel = (spec) => { const g = lattice(0.33, materials.amber); const snowy = !!(spec && spec.climate && spec.climate.snow); if (!snowy) { const lawn = box(0.22, 0.0008, 0.05, materials.darkgreen, 0, -0.0003, 0.17); lawn.castShadow = false; g.add(lawn); } return g; }; // the Champ de Mars: a lawn flush with the ground; under snow it is just snow
  B.tokyotower = () => { const g = lattice(0.333, materials.stripes[1]); const pg = new T.Mesh(propGeometry('pagoda'), propMaterial); pg.scale.set(0.03, 0.055, 0.03); pg.position.set(0.09, 0, 0.04); pg.castShadow = pg.receiveShadow = true; g.add(pg); return g; };
  B.stbasil = () => {
    const g = grp(box(0.07, 0.014, 0.07, materials.brick));
    g.add(cyl(0.009, 0.01, 0.016, 8, materials.brick, 0, 0.014), cone(0.0095, 0.03, 8, materials.green, 0, 0.03), onion(0.005, 0.009, materials.gold, 0, 0.06));
    for (let i = 0; i < 8; i++) { const a = i / 8 * 2 * PI, Rr = i % 2 ? 0.019 : 0.023, h = i % 2 ? 0.018 : 0.024, r = i % 2 ? 0.0055 : 0.007; const x = Math.cos(a) * Rr, z = Math.sin(a) * Rr; g.add(cyl(r, r * 1.08, h, 14, i % 3 ? materials.brick : materials.stone, x, 0.014, z), onion(r * 1.3, r * 2.7, materials.stripes[i % 5], x, 0.014 + h, z)); }
    g.add(box(0.18, 0.01, 0.006, materials.brick, -0.03, 0, -0.06));
    g.add(mesh(mergePlain(Array.from({ length: 18 }, (_, i) => ({ geo: B_(0.003, 0.003, 0.006), m: at(-0.115 + i * 0.01, 0.0115, -0.06) }))), materials.brick)); // merlons, one draw call
    const sp = grp(box(0.012, 0.03, 0.012, materials.brick), box(0.008, 0.014, 0.008, materials.stone, 0, 0.03), cone(0.006, 0.02, 4, materials.green, 0, 0.044)); sp.children[2].rotation.y = PI / 4;
    const star = mesh(new T.OctahedronGeometry(0.0022), materials.redstar, 0, 0.066, 0); sp.add(star); sp.position.set(-0.08, 0, -0.06); g.add(sp);
    return g;
  };
  B.bigben = () => {
    const g = grp(box(0.012, 0.062, 0.012, materials.stone, 0.03, 0, 0), box(0.014, 0.016, 0.014, materials.stone, 0.03, 0.062, 0), cone(0.009, 0.02, 4, materials.darkgreen, 0.03, 0.078, 0));
    g.children[2].rotation.y = PI / 4;
    for (const [rx, ry] of [[0, 0], [0, PI / 2], [0, PI], [0, -PI / 2]]) { const f = mesh(new T.PlaneGeometry(0.011, 0.011), materials.clock, 0, 0, 0); f.position.set(0.03 + Math.sin(ry) * 0.0071, 0.07, Math.cos(ry) * 0.0071); f.rotation.y = ry; g.add(f); }
    g.add(box(0.26, 0.022, 0.05, materials.stone, -0.11, 0, -0.03), box(0.022, 0.098, 0.022, materials.stone, -0.23, 0, -0.03));
    g.add(mesh(mergePlain(Array.from({ length: 12 }, (_, i) => ({ geo: K_(0.003, 0.012, 4), m: at(-0.2 + i * 0.018, 0.028, -0.045) }))), materials.stone));
    const eye = mesh(new T.TorusGeometry(0.067, 0.0015, 6, 36), materials.steel, 0.14, 0.072, 0.09); eye.rotation.y = PI / 2; g.add(eye);
    for (let i = 0; i < 8; i++) { const sp = mesh(new T.CylinderGeometry(0.0006, 0.0006, 0.134, 4), materials.steel, 0.14, 0.072, 0.09); sp.rotation.x = i * PI / 8; g.add(sp); }
    g.add(cyl(0.002, 0.004, 0.072, 4, materials.steel, 0.14, 0, 0.105), cyl(0.002, 0.004, 0.072, 4, materials.steel, 0.14, 0, 0.075));
    g.add(box(0.4, 0.001, 0.1, materials.water, 0, 0, 0.17));
    return g;
  };
  B.liberty = () => {
    const g = grp(box(0.047, 0.014, 0.047, materials.stone), box(0.028, 0.027, 0.028, materials.stone, 0, 0.014), cyl(0.009, 0.012, 0.034, 10, materials.verdigris, 0, 0.041), sph(0.0055, materials.verdigris, 0, 0.08));
    for (let i = 0; i < 7; i++) { const a = -PI / 2 + (i - 3) * 0.35; g.add(cone(0.0012, 0.008, 4, materials.verdigris, Math.cos(a) * 0.0055, 0.082, Math.sin(a) * 0.0055 - 0.002)); }
    const arm = cyl(0.0025, 0.0025, 0.03, 6, materials.verdigris, 0.01, 0.062, 0); arm.rotation.z = -0.2; g.add(arm);
    g.add(sph(0.0035, materials.lamp, 0.016, 0.093, 0));
    const spr = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .8 })); spr.scale.set(0.02, 0.02, 1); spr.position.set(0.016, 0.093, 0); g.add(spr);
    g.add(box(0.06, 0.2, 0.04, materials.glass, -0.3, 0, -0.45), box(0.04, 0.3, 0.03, materials.glass, -0.3, 0, -0.45), box(0.02, 0.38, 0.02, materials.glass, -0.3, 0, -0.45), cyl(0.0015, 0.004, 0.06, 6, materials.steel, -0.3, 0.38, -0.45));
    const wtc = cyl(0.015, 0.03, 0.42, 4, materials.glass, 0.2, 0, -0.5); wtc.rotation.y = PI / 4; g.add(wtc, cyl(0.001, 0.003, 0.12, 6, materials.steel, 0.2, 0.42, -0.5));
    return g;
  };
  B.opera = () => {
    const g = grp(box(0.18, 0.01, 0.1, materials.stone));
    const shellMat = std({ color: '#f2efe8', roughness: .5, side: T.DoubleSide });
    const shell = (r, x, z, ry, sx = .8) => { const m = mesh(new T.SphereGeometry(r, 16, 12, 0, PI / 2, 0, PI / 2), shellMat, x, 0.01, z); m.rotation.y = ry; m.scale.set(sx, 1.4, 1); g.add(m); };
    [[0.032, 0.03, -0.02], [0.027, 0.0, -0.02], [0.021, -0.025, -0.02], [0.03, 0.06, 0.015], [0.025, 0.035, 0.015], [0.019, 0.012, 0.015]].forEach(([r, x, z]) => shell(r, x, z, -PI / 2));
    const arc = mesh(new T.TorusGeometry(0.25, 0.004, 8, 40, 0.55 * PI), materials.steel, -0.15, 0.0, -0.4); arc.rotation.y = PI / 2; arc.rotation.z = (PI - 0.55 * PI) / 2 + 0; g.add(arc);
    g.add(box(0.5, 0.004, 0.04, materials.steel, -0.15, 0.05, -0.4));
    for (const x of [-0.37, 0.07]) g.add(box(0.03, 0.09, 0.05, materials.stone, x, 0, -0.4));
    g.add(box(0.7, 0.001, 0.5, materials.water, 0, 0, -0.35));
    return g;
  };
  B.giza = () => {
    const g = grp(pyramid(0.115, 0.139, materials.sand, 0, 0, 0), pyramid(0.108, 0.136, materials.sand, -0.33, 0, 0.25), pyramid(0.052, 0.065, materials.sand, -0.62, 0, 0.48));
    g.add(box(0.02, 0.012, 0.06, materials.sand, 0.2, 0, 0.28), box(0.012, 0.018, 0.012, materials.sand, 0.2, 0.004, 0.3), box(0.006, 0.006, 0.02, materials.sand, 0.192, 0, 0.3), box(0.006, 0.006, 0.02, materials.sand, 0.208, 0, 0.3));
    return g;
  };
  B.burj = () => {
    const g = new T.Group();
    const shaft = (h, r, x, z) => g.add(cyl(r * 0.35, r, h, 6, materials.glass, x, 0, z), cyl(r * 0.15, r * 0.35, h * 0.12, 6, materials.steel, x, h, z));
    shaft(0.6, 0.018, 0, 0); shaft(0.45, 0.016, 0.028, 0.012); shaft(0.36, 0.015, -0.026, 0.014); shaft(0.3, 0.014, 0, -0.03);
    g.add(cyl(0.002, 0.008, 0.25, 6, materials.steel, 0, 0.6, 0), cyl(0.0008, 0.002, 0.08, 4, materials.steel, 0, 0.83, 0));
    const sail = mesh(new T.SphereGeometry(0.02, 16, 12, 0, PI), materials.white, -0.3, 0.16, 0.2); sail.scale.set(1.2, 8, 1.8); g.add(sail);
    g.add(box(0.2, 0.001, 0.2, materials.water, -0.3, 0, 0.2));
    return g;
  };
  B.redeemer = () => {
    const g = grp(cyl(0.05, 0.3, 0.7, 14, materials.darkgreen), box(0.012, 0.008, 0.012, materials.stone, 0, 0.7));
    g.add(cyl(0.005, 0.006, 0.03, 8, materials.cream, 0, 0.708), box(0.028, 0.004, 0.004, materials.cream, 0, 0.73), sph(0.004, materials.cream, 0, 0.74));
    const hill = sph(0.1, materials.darkgreen, 0.5, 0, 0.45, 1, 2, 1); g.add(hill);
    g.add(box(1.2, 0.001, 0.5, materials.water, 0.4, 0, 0.9));
    return g;
  };
  B.colosseum = () => {
    const g = new T.Group();
    const outer = new T.Mesh(new T.CylinderGeometry(0.094, 0.094, 0.036, 48, 1, true), materials.arches); outer.scale.x = 1.3; outer.position.y = 0.018; outer.castShadow = outer.receiveShadow = true; outer.material.side = T.DoubleSide; g.add(outer);
    const top = new T.Mesh(new T.CylinderGeometry(0.094, 0.094, 0.012, 48, 1, true, 0, PI), materials.arches); top.scale.x = 1.3; top.position.y = 0.042; top.castShadow = true; g.add(top);
    const inner = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.02, 32, 1, true), materials.stone); inner.scale.x = 1.3; inner.position.y = 0.01; inner.material.side = T.DoubleSide; g.add(inner);
    const floor = mesh(new T.CircleGeometry(0.06, 24), materials.sand, 0, 0.002, 0); floor.rotation.x = -PI / 2; floor.scale.x = 1.3; g.add(floor);
    return g;
  };
  B.stpeters = () => {
    const g = grp(box(0.19, 0.045, 0.06, materials.marble, 0, 0, 0.02), box(0.11, 0.05, 0.02, materials.marble, 0, 0, 0.065), cyl(0.021, 0.021, 0.02, 20, materials.marble, 0, 0.045, 0));
    g.add(hemi(0.022, materials.verdigris, 0, 0.065, 0, 1.1), cyl(0.004, 0.005, 0.01, 8, materials.marble, 0, 0.088, 0), sph(0.003, materials.gold, 0, 0.1, 0));
    const cols = new T.InstancedMesh(new T.CylinderGeometry(0.0015, 0.0015, 0.015, 8), materials.marble, 80); const m = new T.Matrix4();
    for (let i = 0; i < 80; i++) { const side = i < 40 ? -1 : 1, t = (i % 40) / 39; const a = PI * 0.55 + t * PI * 0.9 * side * -1 * side; const ang = side < 0 ? (PI * 0.2 + t * PI * 0.6) : (PI * 1.2 + t * PI * 0.6); m.makeTranslation(Math.cos(ang) * 0.1, 0.0075, 0.17 + Math.sin(ang) * 0.08 * (side < 0 ? 1 : -1) * -1 + 0.0); cols.setMatrixAt(i, m); }
    cols.castShadow = true; g.add(cols);
    g.add(cyl(0.001, 0.0018, 0.025, 4, materials.stone, 0, 0, 0.17));
    return g;
  };
  B.petronas = () => {
    const g = new T.Group();
    for (const x of [-0.04, 0.04]) { g.add(cyl(0.015, 0.018, 0.2, 8, materials.glass, x, 0, 0), cyl(0.011, 0.014, 0.15, 8, materials.glass, x, 0.2, 0), cyl(0.006, 0.01, 0.08, 8, materials.glass, x, 0.35, 0), cyl(0.0005, 0.004, 0.022, 8, materials.steel, x, 0.43, 0)); }
    g.add(box(0.05, 0.006, 0.012, materials.steel, 0, 0.17, 0), box(0.06, 0.08, 0.05, materials.glass, 0, 0, 0.06));
    return g;
  };
  B.pearl = () => {
    const g = new T.Group();
    for (let i = 0; i < 3; i++) { const a = i / 3 * 2 * PI; const leg = cyl(0.004, 0.006, 0.1, 8, materials.steel, Math.cos(a) * 0.016, 0, Math.sin(a) * 0.016); leg.rotation.z = Math.cos(a) * 0.22; leg.rotation.x = -Math.sin(a) * 0.22; g.add(leg); }
    g.add(cyl(0.006, 0.008, 0.36, 10, materials.steel, 0, 0.09, 0), sph(0.025, materials.pink, 0, 0.1, 0), sph(0.016, materials.pink, 0, 0.26, 0), sph(0.007, materials.pink, 0, 0.36, 0), cyl(0.0008, 0.002, 0.1, 4, materials.steel, 0, 0.37, 0));
    for (let i = 0; i < 6; i++) { const seg = cyl(0.028 - i * 0.003, 0.03 - i * 0.003, 0.105, 12, materials.glass, 0.16, i * 0.105, -0.1); seg.rotation.y = i * 0.2; g.add(seg); }
    g.add(box(0.03, 0.42, 0.03, materials.glass, 0.1, 0, -0.14), box(0.025, 0.3, 0.025, materials.glass, 0.21, 0, -0.06));
    g.add(box(1, 0.001, 0.25, materials.water, 0, 0, 0.22));
    return g;
  };
  B.goldengate = () => {
    const g = new T.Group(); const H = 0.227, span = 1.28;
    for (const z of [-span / 2, span / 2]) { for (const x of [-0.012, 0.012]) g.add(box(0.006, H, 0.01, materials.rust, x, 0, z)); for (const y of [0.08, 0.14, 0.2]) g.add(box(0.03, 0.008, 0.008, materials.rust, 0, y, z)); }
    g.add(box(0.027, 0.004, span * 1.5, materials.rust, 0, 0.067, 0));
    for (const x of [-0.012, 0.012]) {
      const c = new T.QuadraticBezierCurve3(V(x, H, -span / 2), V(x, 0.07, 0), V(x, H, span / 2)); g.add(mesh(new T.TubeGeometry(c, 40, 0.002, 6), materials.rust));
      const side = new T.QuadraticBezierCurve3(V(x, H, -span / 2), V(x, 0.12, -span * 0.75), V(x, 0.07, -span)); g.add(mesh(new T.TubeGeometry(side, 16, 0.002, 6), materials.rust));
      const side2 = new T.QuadraticBezierCurve3(V(x, H, span / 2), V(x, 0.12, span * 0.75), V(x, 0.07, span)); g.add(mesh(new T.TubeGeometry(side2, 16, 0.002, 6), materials.rust));
      const hang = new T.InstancedMesh(new T.BoxGeometry(0.0008, 1, 0.0008), materials.rust, 30); const m = new T.Matrix4();
      for (let i = 0; i < 30; i++) { const t = i / 29; const p = c.getPoint(t); const h = p.y - 0.069; m.compose(V(x, 0.069 + h / 2, p.z), new T.Quaternion(), V(1, Math.max(0.001, h), 1)); hang.setMatrixAt(i, m); }
      g.add(hang);
    }
    g.add(box(2.4, 0.001, 0.5, materials.water, 0, -0.0005, 0));
    return g;
  };
  B.cntower = () => grp(cyl(0.006, 0.02, 0.34, 12, materials.stone), cyl(0.025, 0.02, 0.025, 14, materials.steel, 0, 0.33), cyl(0.012, 0.012, 0.012, 10, materials.steel, 0, 0.44), cyl(0.0008, 0.0035, 0.11, 6, materials.steel, 0, 0.45), box(0.06, 0.04, 0.09, materials.glass, 0.09, 0, -0.03));
  B.hagiasophia = () => {
    const g = grp(box(0.07, 0.03, 0.07, materials.sand), cyl(0.031, 0.031, 0.006, 20, materials.sand, 0, 0.03), hemi(0.031, materials.verdigris, 0, 0.036, 0, 0.6));
    for (const [x, z] of [[0.032, 0], [-0.032, 0], [0, 0.032], [0, -0.032]]) g.add(hemi(0.02, materials.verdigris, x, 0.03, z, 0.55));
    for (const [x, z] of [[0.045, 0.045], [-0.045, 0.045], [0.045, -0.045], [-0.045, -0.045]]) g.add(cyl(0.0025, 0.003, 0.055, 8, materials.sand, x, 0, z), cone(0.0028, 0.01, 8, materials.verdigris, x, 0.055, z));
    g.add(box(0.5, 0.001, 0.4, materials.water, 0, 0, -0.35));
    return g;
  };
  B.tiantan = () => {
    const g = grp(cyl(0.045, 0.045, 0.002, 24, materials.marble), cyl(0.038, 0.038, 0.002, 24, materials.marble, 0, 0.002), cyl(0.03, 0.03, 0.002, 24, materials.marble, 0, 0.004));
    g.add(cyl(0.018, 0.018, 0.012, 16, materials.red, 0, 0.006), cone(0.024, 0.006, 16, materials.blue, 0, 0.018), cyl(0.013, 0.013, 0.006, 16, materials.red, 0, 0.024), cone(0.018, 0.007, 16, materials.blue, 0, 0.03), cyl(0.009, 0.009, 0.005, 16, materials.red, 0, 0.037), cone(0.012, 0.012, 16, materials.blue, 0, 0.042), sph(0.002, materials.gold, 0, 0.055));
    const gate = grp(box(0.12, 0.012, 0.03, materials.red), box(0.08, 0.008, 0.02, materials.red, 0, 0.012)); const r1 = pyramid(0.07, 0.007, materials.gold, 0, 0.012); r1.scale.set(1.3, 1, 0.5); const r2 = pyramid(0.05, 0.006, materials.gold, 0, 0.02); r2.scale.set(1.3, 1, 0.5); gate.add(r1, r2); gate.position.set(0.25, 0, -0.12); g.add(gate);
    return g;
  };
  B.parthenon = () => {
    const rock = cyl(0.09, 0.16, 0.08, 16, std({ color: '#7d6b5a', roughness: 1 })); const g = grp(rock, box(0.07, 0.003, 0.031, materials.marble, 0, 0.08), box(0.07, 0.004, 0.031, materials.marble, 0, 0.0934));
    const cols = new T.InstancedMesh(new T.CylinderGeometry(0.001, 0.0012, 0.0104, 8), materials.marble, 46); const m = new T.Matrix4(); let k = 0;
    for (let i = 0; i < 17; i++) for (const z of [-0.0135, 0.0135]) { m.makeTranslation(-0.0315 + i * 0.0039375, 0.083 + 0.0052, z); cols.setMatrixAt(k++, m); }
    for (let i = 1; i < 7; i++) for (const x of [-0.0315, 0.0315]) { m.makeTranslation(x, 0.083 + 0.0052, -0.0135 + i * 0.00386); cols.setMatrixAt(k++, m); }
    cols.count = k; cols.castShadow = true; g.add(cols);
    for (const x of [-0.034, 0.034]) { const ped = mesh(new T.CylinderGeometry(0.016, 0.016, 0.004, 3), materials.marble, x, 0.1, 0); ped.rotation.z = PI / 2; ped.rotation.y = 0; ped.scale.set(0.5, 1, 1); g.add(ped); }
    return g;
  };
  B.leveque = () => {
    const g = grp(box(0.03, 0.08, 0.03, materials.cream), box(0.02, 0.06, 0.02, materials.cream, 0, 0.08), box(0.014, 0.03, 0.014, materials.cream, 0, 0.14), pyramid(0.011, 0.012, materials.cream, 0, 0.17), sph(0.002, materials.lamp, 0, 0.183));
    const horse = mesh(new T.TorusGeometry(0.08, 0.016, 8, 32, 1.5 * PI), materials.stone, 0.22, 0.004, -0.28); horse.rotation.x = -PI / 2; horse.rotation.z = PI * 0.25; horse.scale.set(1, 1, 0.35); g.add(horse);
    g.add(box(0.03, 0.14, 0.03, materials.glass, 0.06, 0, 0.03), box(0.025, 0.1, 0.025, materials.glass, -0.05, 0, 0.02));
    return g;
  };
  B.capitol = () => {
    const g = grp(box(0.22, 0.02, 0.07, materials.marble), box(0.07, 0.03, 0.07, materials.marble, 0, 0.02), cyl(0.025, 0.027, 0.02, 20, materials.marble, 0, 0.05), hemi(0.025, materials.marble, 0, 0.07, 0, 1), cyl(0.004, 0.005, 0.012, 8, materials.marble, 0, 0.094), sph(0.002, materials.gold, 0, 0.108));
    const ob = cyl(0.004, 0.0055, 0.152, 4, materials.marble, 0, 0, 0.55); ob.rotation.y = PI / 4; g.add(ob); const tip = pyramid(0.0055, 0.017, materials.marble, 0, 0.152, 0.55); g.add(tip);
    g.add(box(0.03, 0.001, 0.3, materials.water, 0, 0, 0.78));
    return g;
  };
  B.nativity = () => {
    const g = grp(box(0.04, 0.018, 0.07, materials.stone), box(0.006, 0.03, 0.006, materials.stone, 0.02, 0, -0.03), box(0.002, 0.006, 0.0006, materials.gold, 0.02, 0.03, -0.03), box(0.0006, 0.002, 0.0006, materials.gold, 0.02, 0.0325, -0.03));
    const star = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow(), transparent: true, depthWrite: false, blending: T.AdditiveBlending })); star.scale.set(0.05, 0.05, 1); star.position.set(0, 0.14, 0); g.add(star);
    g.add(sph(0.004, materials.lamp, 0, 0.14, 0));
    return g;
  };
  B.needle = () => {
    const g = new T.Group();
    for (let i = 0; i < 3; i++) { const a = i / 3 * 2 * PI; const leg = cyl(0.002, 0.004, 0.125, 8, materials.white, Math.cos(a) * 0.012, 0, Math.sin(a) * 0.012); leg.rotation.z = Math.cos(a) * 0.12; leg.rotation.x = -Math.sin(a) * 0.12; g.add(leg); }
    const waist = mesh(new T.TorusGeometry(0.006, 0.0015, 6, 16), materials.white, 0, 0.1, 0); waist.rotation.x = PI / 2; g.add(waist);
    g.add(cyl(0.004, 0.004, 0.03, 10, materials.white, 0, 0.125), cone(0.02, 0.012, 16, materials.white, 0, 0.138), cyl(0.02, 0.016, 0.01, 16, materials.glassWarm, 0, 0.15), cone(0.012, 0.008, 16, materials.rust, 0, 0.16), cyl(0.001, 0.0025, 0.02, 6, materials.steel, 0, 0.166));
    g.add(box(0.05, 0.28, 0.04, materials.glass, 0.2, 0, -0.25), box(0.04, 0.22, 0.04, materials.glass, 0.26, 0, -0.18));
    return g;
  };
  B.brandenburg = () => {
    const g = grp(box(0.065, 0.005, 0.011, materials.stone, 0, 0.015), box(0.03, 0.005, 0.011, materials.stone, 0, 0.02));
    const cols = new T.InstancedMesh(new T.CylinderGeometry(0.0017, 0.0019, 0.015, 8), materials.stone, 12); const m = new T.Matrix4();
    for (let i = 0; i < 6; i++) for (const z of [-0.004, 0.004]) { m.makeTranslation(-0.027 + i * 0.0108, 0.0075, z); cols.setMatrixAt(i * 2 + (z > 0 ? 1 : 0), m); } cols.castShadow = true; g.add(cols);
    for (let i = 0; i < 4; i++) g.add(box(0.002, 0.004, 0.005, materials.verdigris, -0.005 + i * 0.0033, 0.025, 0)); g.add(box(0.004, 0.005, 0.005, materials.verdigris, 0, 0.025, -0.006));
    g.add(cyl(0.003, 0.004, 0.2, 10, materials.stone, -0.3, 0, -0.3), sph(0.016, materials.steel, -0.3, 0.2, -0.3), cyl(0.0008, 0.002, 0.15, 6, materials.steel, -0.3, 0.216, -0.3));
    return g;
  };
  B.indiagate = () => {
    const g = grp(box(0.009, 0.03, 0.009, materials.sand, -0.009, 0, 0), box(0.009, 0.03, 0.009, materials.sand, 0.009, 0, 0), box(0.03, 0.008, 0.009, materials.sand, 0, 0.03), box(0.02, 0.004, 0.009, materials.sand, 0, 0.038), hemi(0.004, materials.sand, 0, 0.042, 0, 1));
    const tomb = grp(box(0.05, 0.02, 0.05, materials.red, 0, 0, 0), onion(0.012, 0.03, materials.white, 0, 0.02, 0)); for (const [x, z] of [[-0.02, -0.02], [0.02, -0.02], [-0.02, 0.02], [0.02, 0.02]]) { const ch = new T.Mesh(propGeometry('chhatri'), propMaterial); ch.scale.set(0.008, 0.01, 0.008); ch.position.set(x, 0.02, z); tomb.add(ch); } tomb.position.set(-0.22, 0, -0.16); g.add(tomb);
    return g;
  };
  B.willis = () => {
    const g = new T.Group(); const hs = [[0.443, 0.443, 0.368, 0.368, 0.368, 0.295, 0.295, 0.204, 0.204]];
    const H = [0.204, 0.368, 0.443, 0.368, 0.443, 0.368, 0.295, 0.204, 0.295]; let k = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) g.add(box(0.0225, H[k++], 0.0225, materials.dark, i * 0.0228, 0, j * 0.0228));
    g.add(cyl(0.0006, 0.0015, 0.084, 4, materials.steel, -0.0228, 0.443, -0.0228), cyl(0.0006, 0.0015, 0.084, 4, materials.steel, 0.0228, 0.443, -0.0228));
    g.add(box(0.04, 0.28, 0.04, materials.glass, 0.12, 0, -0.1), box(0.03, 0.22, 0.03, materials.glass, -0.1, 0, -0.12), box(0.6, 0.001, 0.3, materials.water, 0, 0, 0.35));
    return g;
  };
  B.nseoul = () => grp(cone(0.32, 0.24, 18, materials.darkgreen), cyl(0.004, 0.006, 0.15, 10, materials.white, 0, 0.24), cyl(0.012, 0.01, 0.012, 12, materials.glassWarm, 0, 0.38), cyl(0.0008, 0.002, 0.08, 6, materials.steel, 0, 0.392));
  B.mbs = () => {
    const g = new T.Group();
    [-0.06, 0, 0.06].forEach((x, i) => { const t = box(0.04, 0.19, 0.03, materials.glass, x, 0, 0); t.rotation.z = (i - 1) * 0.04; g.add(t); });
    g.add(box(0.24, 0.008, 0.035, materials.white, -0.01, 0.19, 0), box(0.3, 0.001, 0.3, materials.water, 0, 0, 0.3));
    return g;
  };
  B.workshop = () => {
    const g = grp(cyl(0.0035, 0.0035, 0.03, 12, materials.candy), sph(0.0045, materials.lamp, 0, 0.034, 0));
    g.add(box(0.025, 0.012, 0.018, materials.gingerbread, 0.03, 0, -0.012)); const roof = pyramid(0.019, 0.009, materials.cream, 0.03, 0.012, -0.012); roof.scale.set(1.3, 1, 0.95); g.add(roof);
    g.add(box(0.016, 0.009, 0.012, materials.wood, -0.03, 0, 0.01)); const broof = pyramid(0.012, 0.006, materials.snow, -0.03, 0.009, 0.01); g.add(broof);
    const r = mulberry32(0x6D5);
    for (let i = 0; i < 14; i++) { const a = r() * 2 * PI, rad = 0.012 + r() * 0.02, sz = 0.002 + r() * 0.0025; g.add(sph(sz, materials.gumdrops[i % 6], Math.cos(a) * rad, sz * 0.8, Math.sin(a) * rad, 1, 0.8, 1)); }
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; g.add(cyl(0.0018, 0.0018, 0.014, 8, materials.candy, Math.sin(a) * 0.03, 0, Math.cos(a) * 0.03)); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * 2 * PI; const p = new T.Mesh(propGeometry('pine'), propMaterial); p.scale.set(0.004, 0.009, 0.004); p.position.set(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05); p.castShadow = true; g.add(p); }
    return g;
  };

  return { build, dispose, B, materials, textures: TEX, propGeometry, propMaterial };
})();
