// Santa Tracker UI — drives the page from the pure engine.
// Globals from the build: LAND_TOPO (TopoJSON) and everything exported by engine.mjs.
(() => {
  const $ = id => document.getElementById(id);
  const W = 1000, H = 500;
  const px = p => [(p.lon + 180) / 360 * W, (90 - p.lat) / 180 * H];
  const SVG = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const rad = d => d * Math.PI / 180;

  // ---------- From the sleigh: a perspective chase camera just behind Santa, looking along his heading ----------
  const EARTH_KM = 6371;
  const FP = { altKm: 420, pitch: 36, fov: 90, near: 0.003 }; // camera height, degrees looking down, horizontal field of view, near plane (Earth radii)
  const PCX = 500, PCY = 250;
  const toVec = p => { const la = rad(p.lat), lo = rad(p.lon); return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const L = Math.hypot(...a) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
  const mix = (a, b, ka, kb) => [ka * a[0] + kb * b[0], ka * a[1] + kb * b[1], ka * a[2] + kb * b[2]];
  function fpCamera(s) {
    const here = s.lat > 89.99 ? { lat: 89.99, lon: s.next ? s.next.lon : 0 } : s;
    const p = toVec(here);
    const hdg = rad(s.next ? bearing(here, s.next) : 0);
    let east = cross([0, 0, 1], p); east = Math.hypot(...east) < 1e-6 ? [1, 0, 0] : norm(east);
    const north = cross(p, east);
    const horiz = mix(north, east, Math.cos(hdg), Math.sin(hdg));
    const ph = rad(FP.pitch);
    const f = norm(mix(horiz, p, Math.cos(ph), -Math.sin(ph)));
    const right = norm(cross(f, p));
    const up = cross(right, f);
    const k = 1 + FP.altKm / EARTH_KM;
    const horizonCos = 1 / k;
    return { p, east, north, C: p.map(v => v * k), f, right, up, horizonCos, horizonAng: Math.acos(horizonCos), fl: (W / 2) / Math.tan(rad(FP.fov) / 2) };
  }
  // Unit vector on the sphere → camera space [right, up, forward, visible]. Points beyond the horizon slide
  // along the great circle toward the nadir until they sit on the horizon, so shapes that cross it still fill.
  function fpCam(cam, X, clamp = true) {
    const d0 = dot3(X, cam.p);
    const visible = d0 >= cam.horizonCos;
    if (!visible && clamp) {
      const a = Math.acos(Math.max(-1, Math.min(1, d0))), b = cam.horizonAng, sa = Math.sin(a);
      if (sa > 1e-9) X = mix(cam.p, X, Math.sin(a - b) / sa, Math.sin(b) / sa);
    }
    const d = [X[0] - cam.C[0], X[1] - cam.C[1], X[2] - cam.C[2]];
    return [dot3(d, cam.right), dot3(d, cam.up), dot3(d, cam.f), visible];
  }
  const fpDir = (cam, D) => [dot3(D, cam.right), dot3(D, cam.up), dot3(D, cam.f)]; // a direction at infinity (sun, stars)
  const fpProj = (cam, q) => [PCX + cam.fl * q[0] / q[2], PCY - cam.fl * q[1] / q[2]];
  function clipNear(pts, near) { // Sutherland–Hodgman against the plane forward = near
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ain = a[2] > near, bin = b[2] > near;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (near - a[2]) / (b[2] - a[2]); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), near]); }
    }
    return out;
  }
  const fpRingPath = (cam, vecs) => { // ring of unit vectors already inside the horizon → projected path (near-clipped)
    const pts = clipNear(vecs.map(v => fpCam(cam, v, false)), FP.near);
    if (pts.length < 3) return '';
    return pts.map((q, i) => (i ? 'L' : 'M') + fpProj(cam, q).map(n => n.toFixed(1)).join(' ')).join('') + 'Z';
  };
  // Azimuthal-equidistant coordinates around the nadir (ground distance + bearing): a flat map on which the
  // horizon is a circle, so a landmass can be clipped to it with Sutherland–Hodgman against a 48-gon.
  const toAz = (cam, X) => { const c = Math.acos(Math.max(-1, Math.min(1, dot3(X, cam.p)))); const az = Math.atan2(dot3(X, cam.east), dot3(X, cam.north)); return [c * Math.sin(az), c * Math.cos(az)]; };
  const fromAz = (cam, [x, y]) => { const c = Math.hypot(x, y); if (c < 1e-12) return cam.p; const az = Math.atan2(x, y); return mix(cam.p, mix(cam.east, cam.north, Math.sin(az), Math.cos(az)), Math.cos(c), Math.sin(c)); };
  const CLIP_DIRS = Array.from({ length: 48 }, (_, i) => { const a = 2 * Math.PI * i / 48; return [Math.cos(a), Math.sin(a)]; });
  function clipToHorizon(pts2, r) {
    let poly = pts2;
    for (const [nx, ny] of CLIP_DIRS) {
      if (poly.length < 3) return [];
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = r - (a[0] * nx + a[1] * ny), db = r - (b[0] * nx + b[1] * ny);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
      }
      poly = out;
    }
    return poly;
  }
  const fpGroundRing = (cam, vecs) => { // ring of unit vectors → projected path of the part inside the horizon
    const clipped = clipToHorizon(vecs.map(v => toAz(cam, v)), cam.horizonAng);
    if (clipped.length < 3) return '';
    return fpRingPath(cam, clipped.map(q => fromAz(cam, q)));
  };
  const pipLonLat = (lon, lat, ring) => { // even-odd point in polygon on the plain lon/lat ring
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  function fpPolyline(cam, pts) { // open line of {lat,lon}: breaks where hidden or behind the camera
    let d = '', pen = false;
    for (const p of pts) {
      const q = fpCam(cam, toVec(p), false);
      if (!q[3] || q[2] <= FP.near) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + fpProj(cam, q).map(n => n.toFixed(1)).join(' '); pen = true;
    }
    return d;
  }
  const circleVecs = (center, e1, e2, ang, step = 3) => { const out = []; for (let a = 0; a < 360; a += step) { const t = rad(a); out.push(mix(center, mix(e1, e2, Math.cos(t), Math.sin(t)), Math.cos(ang), Math.sin(ang))); } return out; };
  const STARS = (() => { const r = mulberry32(0x5A17A), out = []; for (let i = 0; i < 260; i++) { const z = r() * 2 - 1, th = r() * 2 * Math.PI, sz = Math.sqrt(1 - z * z); out.push({ v: [sz * Math.cos(th), sz * Math.sin(th), z], m: r() }); } return out; })();
  const compass = h => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(h / 45) % 8];

  // ---------- years + routes ----------
  const currentYear = missionYear(new Date());
  const years = Array.from({ length: ARCHIVE_YEARS + 1 }, (_, i) => currentYear - i); // newest first
  const routeCache = new Map();
  const routeFor = y => { if (!routeCache.has(y)) routeCache.set(y, buildRoute(y)); return routeCache.get(y); };
  let year = currentYear;
  let route = routeFor(year);

  // ---------- static map ----------
  const ringsToPath = polys => {
    let d = '';
    for (const poly of polys) for (const ring of poly) {
      ring.forEach(([lon, lat], i) => { const [x, y] = px({ lat, lon }); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); });
      d += 'Z';
    }
    return d;
  };
  const polyline = pts => {
    let d = '', prev = null;
    for (const p of pts) {
      const [x, y] = px(p);
      // break at the dateline, and at the pole (its longitude is meaningless on this map)
      const jump = prev && (Math.abs(p.lon - prev.lon) > 180 || Math.abs(prev.lat) > 89 || Math.abs(p.lat) > 89);
      d += (!prev || jump ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
      prev = p;
    }
    return d;
  };

  const landPolys = decodeTopo(LAND_TOPO, 'land');
  const landVecs = landPolys.map(poly => poly.map(ring => ring.map(([lon, lat]) => toVec({ lat, lon }))));
  // real 3D when WebGL is available; the SVG renderer below is the fallback
  let GL = window.SantaGL && SantaGL.supported() ? SantaGL : null;
  if (GL) { try { GL.init({ canvas: $('gl'), landD: ringsToPath(landPolys) }); } catch (e) { console.warn('3D view unavailable, using the 2D renderer', e); GL = null; } }
  $('gl').toggleAttribute('hidden', !GL); $('pov').toggleAttribute('hidden', !!GL);
  if (GL) GL.labelSink = (st, pos) => setNextLabel(st, pos);
  $('land').appendChild(el('path', { id: 'land-path', d: ringsToPath(landPolys), 'fill-rule': 'evenodd' }));
  const grat = $('graticule');
  for (let lon = -150; lon <= 150; lon += 30) grat.appendChild(el('line', { x1: px({ lat: 0, lon })[0], x2: px({ lat: 0, lon })[0], y1: 0, y2: H }));
  for (let lat = -60; lat <= 60; lat += 30) grat.appendChild(el('line', { y1: px({ lat, lon: 0 })[1], y2: px({ lat, lon: 0 })[1], x1: 0, x2: W }));

  const localFmtDate = t => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const localFmtTime = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const utcStamp = t => { const d = new Date(t); return `Dec ${d.getUTCDate()} · ${fmtClockUtc(t)} UTC`; };
  const big = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(Math.round(n));
  const localStamp = w => `${fmtClockUtc(w.localArrive)} local`;
  const listNames = names => names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  const changeText = ch => {
    const groups = new Map();
    for (const c of ch) { const k = `${c.why}|${c.from}|${c.to}`; if (!groups.has(k)) groups.set(k, { ...c, names: [] }); groups.get(k).names.push(c.name); }
    return [...groups.values()].map(g => `${listNames(g.names)} moved from ${fmtOffset(g.from)} to ${fmtOffset(g.to)}: ${g.why}`).join('. ') + '.';
  };

  // ---------- per-route DOM (stops, future track, labels) ----------
  const stopEls = [], povStopEls = [];
  let fullTrack = [];
  function applyRouteDom() {
    const g = $('stops'); g.textContent = ''; stopEls.length = 0;
    const pg = $('pov-stops'); pg.textContent = ''; povStopEls.length = 0;
    for (const w of route.waypoints) {
      if (w.pole) continue;
      const [cx, cy] = px(w);
      const label = `${w.name}, ${w.country} (${fmtOffset(w.utc)}) · arrives ${localStamp(w)} (${fmtClockUtc(w.arrive)} UTC) · ${big(w.presents)} presents`;
      const c = el('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), class: 'stop' });
      const title = el('title'); title.textContent = label; c.appendChild(title);
      g.appendChild(c); stopEls.push([w, c]);
      const pc = el('circle', { class: 'light', visibility: 'hidden' });
      const pTitle = el('title'); pTitle.textContent = label; pc.appendChild(pTitle);
      pg.appendChild(pc); povStopEls.push([w, pc]);
    }
    fullTrack = track(route, route.launch, route.home);
    if (GL) GL.setRoute(route, fullTrack);
    $('scrub').min = route.launch; $('scrub').max = route.home; $('scrub').value = route.launch;
    $('scrub-min').textContent = `Launch · ${utcStamp(route.launch)}`;
    $('scrub-max').textContent = `Home · ${utcStamp(route.home)}`;
    $('how-totals').textContent = `In ${route.year} that is ${route.stopCount} stops, about ${fmtInt(route.totalKm)} km, in ${fmtDuration(route.home - route.launch)}.`;
    $('how-countries').textContent = `The route touches ${countryCount()} countries and territories: every country where someone is waiting up, one city each where only a capital was missing. ${SKIPPED.length} are left to sleep because public Christmas celebration there is banned or essentially absent: ${SKIPPED.map(k => `${k.country} (${k.why})`).join(', ')}. The list lives in the source, where list reconciliation can argue with it.`;
    $('foot-year').textContent = String(new Date().getFullYear());
  }

  // Switch the page to a year's route (no mode change here).
  function applyYear(y) {
    year = y; route = routeFor(y); applyRouteDom(); lastLogKey = '';
    $('year').value = String(y);
    for (const b of document.querySelectorAll('.year-card')) b.classList.toggle('is-on', +b.dataset.year === y);
    const ch = route.changes;
    $('year-notes').textContent = ch.length
      ? `${y}: ${changeText(ch)} The route around ${ch.length === 1 ? 'it' : 'them'} was redrawn to match.`
      : `${y}: no time-zone changes since the Christmas before. The elves just drew a new plan.`;
  }

  // ---------- archive grid + year select ----------
  const yearsEl = $('years'), sel = $('year');
  for (const y of years) {
    const r = routeFor(y);
    const b = document.createElement('button'); b.className = 'year-card'; b.type = 'button'; b.dataset.year = y;
    b.setAttribute('aria-label', `Replay the ${y} flight`);
    const svg = el('svg', { viewBox: '0 0 1000 500', 'aria-hidden': 'true' });
    svg.appendChild(el('rect', { class: 'ocean', width: W, height: H }));
    svg.appendChild(el('use', { href: '#land-path' }));
    svg.appendChild(el('path', { class: 'mini-route', d: polyline(track(r, r.launch, r.home, 3 * MIN)) }));
    const label = document.createElement('span'); label.className = 'year-label'; label.textContent = y === currentYear ? `${y} · this year` : String(y);
    const meta = document.createElement('span'); meta.className = 'year-meta';
    meta.textContent = `${r.stopCount} stops · ${fmtInt(r.totalKm)} km · ${(r.efficiency * 100).toFixed(1)}% of best plan${r.changes.length ? ` · ${r.changes.length} clock change${r.changes.length > 1 ? 's' : ''}` : ''}`;
    b.append(svg, label, meta);
    b.onclick = () => { setYear(y); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    yearsEl.appendChild(b);
    const o = document.createElement('option'); o.value = y; o.textContent = y === currentYear ? `${y} (this year)` : String(y); sel.appendChild(o);
  }
  sel.onchange = e => setYear(+e.target.value);

  // Viewer's offset on that year's Christmas Eve (not today's: DST may differ).
  const viewerOffset = () => -new Date(Date.UTC(year, 11, 24, 12)).getTimezoneOffset() / 60;
  const viewerZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();

  // ---------- mode + simulated clock ----------
  let mode = 'live';
  let simT = route.launch;
  let playing = false;
  let speed = 600; // simulated seconds per real second
  let lastTs = null, lastLiveRender = 0, lastLogKey = '';
  let view = 'map', lastT = null;

  const clamp = t => Math.min(route.home, Math.max(route.launch, t));
  const nowOnChristmasEve = () => {
    const n = new Date();
    const tod = n.getUTCHours() * HOUR + n.getUTCMinutes() * MIN + n.getUTCSeconds() * 1000;
    const c24 = Date.UTC(year, 11, 24) + tod, c25 = Date.UTC(year, 11, 25) + tod;
    if (c24 >= route.launch && c24 <= route.home) return c24;
    if (c25 >= route.launch && c25 <= route.home) return c25;
    return route.launch;
  };

  function setMode(m, t) {
    if (m === 'live' && year !== currentYear) applyYear(currentYear); // live only exists for this year's flight
    mode = m;
    document.body.dataset.mode = m;
    $('mode-live').classList.toggle('is-on', m === 'live'); $('mode-live').setAttribute('aria-selected', m === 'live');
    $('mode-preview').classList.toggle('is-on', m === 'preview'); $('mode-preview').setAttribute('aria-selected', m === 'preview');
    $('controls').hidden = m !== 'preview';
    playing = false; $('play').textContent = '▶ Play'; $('play').setAttribute('aria-pressed', 'false');
    if (m === 'preview') { simT = clamp(t ?? nowOnChristmasEve()); render(simT); syncUrl(); }
    else { history.replaceState(null, '', location.pathname); render(Date.now()); }
  }
  function setYear(y, t) {
    applyYear(y);
    if (y === currentYear && mode === 'live') render(Date.now());
    else setMode('preview', t);
  }
  function syncUrl() {
    if (mode !== 'preview') return;
    const iso = new Date(Math.round(simT / MIN) * MIN).toISOString().replace(/:00\.000Z$/, 'Z');
    history.replaceState(null, '', `${location.pathname}?t=${iso}`);
    $('permalink').href = `?t=${iso}`; $('permalink').textContent = `?t=${iso}`;
  }
  function setPlaying(p) {
    playing = p && mode === 'preview';
    if (playing && simT >= route.home) simT = route.launch;
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Play';
    $('play').setAttribute('aria-pressed', String(playing));
    if (!playing) syncUrl();
  }

  // ---------- render ----------
  function render(t) {
    const s = stateAt(route, t);
    const tel = telemetry(s);
    const past = year < currentYear;
    const is = past ? 'was' : 'is';
    const prefix = year !== currentYear ? `${year} · ` : '';

    // clocks
    if (mode === 'live') {
      $('clock-utc-label').textContent = 'UTC'; $('clock-utc').textContent = fmtClockUtc(t);
      $('clock-local-label').textContent = viewerZone ? `Your time · ${viewerZone.split('/').pop().replace('_', ' ')}` : 'Your time';
      $('clock-local').textContent = localFmtTime(t);
    } else {
      const word = past ? 'Archive' : 'Rehearsal';
      $('clock-utc-label').textContent = `${word} · UTC`;
      $('clock-utc').textContent = `Dec ${new Date(t).getUTCDate()}${past ? ' ' + year : ''} ${fmtClockUtc(t)}`;
      $('clock-local-label').textContent = `${word} · your time`;
      $('clock-local').textContent = `${localFmtDate(t)} ${localFmtTime(t)}`;
      $('scrub').value = t; $('scrub-time').textContent = utcStamp(t);
    }

    // headline
    const k = $('kicker'), h = $('headline'), sub = $('subline');
    k.className = 'kicker';
    if (s.phase === 'pre') {
      k.classList.add('pre'); k.textContent = prefix + 'LOADING BAY · THE WORKSHOP';
      h.textContent = past ? 'Santa was at the Workshop while the elves loaded the sleigh' : 'Santa is at the Workshop. The elves are loading the sleigh.';
      const launchLocal = `${localFmtDate(route.launch)} ${localFmtTime(route.launch)} your time`;
      sub.textContent = `Launch in ${fmtDuration(s.untilLaunchMs)} · ${utcStamp(route.launch)} (${launchLocal}). First stop: ${s.next.name}.`;
      $('hint').hidden = mode !== 'live';
    } else if (s.phase === 'done') {
      k.classList.add('done'); k.textContent = prefix + 'RUN COMPLETE · SLEIGH IN THE BARN';
      h.textContent = `Santa ${is} home. The elves ${past ? 'counted' : 'are counting'} the cookies.`;
      sub.textContent = `${route.stopCount} stops, ${big(route.totalPresents)} presents, ${fmtInt(route.totalKm)} km. The reindeer ${past ? 'slept well' : 'are asleep'}.`;
      $('hint').hidden = true;
    } else if (s.status === 'delivering') {
      k.textContent = prefix + 'ON THE ROOFTOPS';
      h.textContent = `Santa ${is} in ${s.at.name}, ${s.at.country}`;
      sub.textContent = `${localStamp(s.at)} · ${big(s.at.presents)} presents here · next: ${s.next.name} in ${fmtDuration(s.etaMs)}`;
      $('hint').hidden = true;
    } else {
      k.textContent = prefix + 'AIRBORNE · EN ROUTE';
      h.textContent = s.next.pole ? `Santa ${is} heading home to the North Pole` : `Santa ${is} on his way to ${s.next.name}, ${s.next.country}`;
      const from = s.at.pole ? 'the North Pole' : s.at.name;
      sub.textContent = `Left ${from} ${fmtDuration(t - s.at.depart)} ${past ? 'earlier' : 'ago'} · ${fmtInt(s.speedKmh)} km/h · arrives in ${fmtDuration(s.etaMs)}`;
      $('hint').hidden = true;
    }

    // map or Santa's view
    lastT = t;
    if (view === 'pov') renderPov(s, t, tel); else renderMap(s, t);

    // tiles
    $('t-presents').textContent = big(s.presents);
    $('t-presents-sub').textContent = `of ${big(route.totalPresents)} on the route`;
    $('t-stops').textContent = `${s.stopsDone} / ${route.stopCount}`;
    $('t-stops-sub').textContent = s.phase === 'flight' ? `${route.stopCount - s.stopsDone} to go` : s.phase === 'pre' ? 'route loaded' : 'all done';
    $('t-km').textContent = `${fmtInt(s.km)} km`;
    $('t-km-sub').textContent = `of ${fmtInt(route.totalKm)} km`;
    $('t-speed').textContent = fmtInt(s.speedKmh);
    $('t-speed-sub').textContent = s.phase !== 'flight' ? 'km/h · parked' : s.status === 'delivering' ? 'km/h · on the rooftops' : `km/h · Mach ${(s.speedKmh / 1235).toFixed(1)}`;
    if (s.next) {
      $('t-next').textContent = s.next.pole ? 'North Pole' : s.next.name;
      $('t-next-sub').textContent = s.next.pole ? `home in ${fmtDuration(s.etaMs)}` : `${s.next.country} · in ${fmtDuration(s.etaMs)} · ${localStamp(s.next)}`;
    } else { $('t-next').textContent = '—'; $('t-next-sub').textContent = 'mission complete'; }

    const off = viewerOffset();
    const you = arrivalForOffset(route, off);
    $('t-you-label').textContent = `Your time zone · ${fmtOffset(off)}`;
    if (s.phase === 'flight' && t >= you.arrive) {
      const after = t - you.arrive;
      $('t-you').textContent = after < 90 * MIN ? (past ? 'Santa was here' : 'Santa is here') : 'Santa has been by';
      $('t-you-sub').textContent = `reached ${fmtOffset(you.utc)} at ${localFmtTime(you.arrive)} your time`;
    } else {
      $('t-you').textContent = `${localFmtDate(you.arrive)} ${localFmtTime(you.arrive)}`;
      $('t-you-sub').textContent = `${you.exact ? 'Santa reaches' : 'nearest zone'} ${fmtOffset(you.utc)} · in ${fmtDuration(you.arrive - t)}`;
    }

    // systems
    $('s-alt').textContent = s.phase === 'flight' ? `${fmtInt(tel.altitudeM)} m` : 'on the ground';
    $('s-lead').textContent = tel.lead;
    $('s-cookies').textContent = `${fmtInt(tel.cookies)}`;
    $('s-milk').textContent = `${tel.milkL.toFixed(1)} L`;
    $('s-sack-bar').style.width = `${tel.sackPct.toFixed(1)}%`;
    $('s-sack').textContent = `${tel.sackPct.toFixed(1)}% full`;
    $('s-list').textContent = s.phase === 'pre' ? (workshopStatus(route, t).items[5].done ? 'final · synced' : 'first pass · syncing') : 'final · synced Dec 23';
    $('s-chimney').textContent = s.phase !== 'flight' ? '—' : s.status === 'delivering' ? (s.at.name === 'Prague' ? 'narrow (4B)' : 'nominal') : 'next one measured';

    // the elves
    const duty = elfOnDuty(t);
    $('elf-duty').textContent = `On duty: ${duty.name} (${duty.role}) until ${fmtClockUtc(duty.until)} UTC`;
    $('notice').textContent = notice(t);
    const ws = $('workshop');
    if (s.phase === 'pre') {
      const w = workshopStatus(route, t);
      ws.hidden = false;
      $('ws-wrapped').textContent = big(w.wrapped);
      $('ws-bar').style.width = `${(100 * w.wrapped / route.totalPresents).toFixed(2)}%`;
      $('ws-sub').textContent = `of ${big(route.totalPresents)} · ${(100 * w.wrapped / route.totalPresents).toFixed(1)}% · ${w.items.filter(i => i.done).length} of ${w.items.length} checks done · launch in ${fmtDuration(route.launch - t)}`;
      const wsKey = w.items.map(i => +i.done).join('');
      if (ws.dataset.key !== wsKey) {
        ws.dataset.key = wsKey; const ul = $('ws-list'); ul.textContent = '';
        for (const it of w.items) { const li = document.createElement('li'); li.className = it.done ? 'done' : ''; li.textContent = it.label; ul.appendChild(li); }
      }
    } else ws.hidden = true;

    // log (only rebuild when the set of arrivals changes)
    const logKey = `${year}:${s.phase}:${s.stopsDone}:${s.at && s.at.i}`;
    if (logKey !== lastLogKey) {
      lastLogKey = logKey;
      const items = missionLog(s, 8);
      const ol = $('log'); ol.textContent = '';
      if (!items.length) {
        const li = document.createElement('li'); li.className = 'muted';
        li.textContent = s.phase === 'pre' ? 'Nothing logged yet. Dispatch is wrapping.' : 'Airborne. First stop coming up. — dispatch';
        ol.appendChild(li);
      }
      for (const it of items) {
        const li = document.createElement('li');
        const when = document.createElement('span'); when.className = 'when'; when.textContent = `${fmtClockUtc(it.t)}Z`;
        const body = document.createElement('span');
        body.textContent = `${it.name}, ${it.country} · ${big(it.presents)} presents · `;
        const note = document.createElement('span'); note.className = 'note'; note.textContent = `${it.note} — ${it.by}`;
        body.appendChild(note); li.append(when, body); ol.appendChild(li);
      }
    }
  }

  const TRAIL_STEPS = [0.85, 0.6, 0.4, 0.25, 0.12]; // opacity per 30-minute slice behind the sleigh
  const trailEls = TRAIL_STEPS.map(o => { const p = el('path', { class: 'trail', opacity: o }); $('trail').appendChild(p); return p; });
  function renderMap(s, t) {
    $('night').setAttribute('d', polyline(nightPolygon(s.sun)) + 'Z');
    const mx = px({ lat: 0, lon: s.midnightLon })[0];
    $('midnight').setAttribute('x1', mx); $('midnight').setAttribute('x2', mx);
    trailEls.forEach((p, k) => p.setAttribute('d', s.phase === 'flight' ? polyline(track(route, t - (k + 1) * 30 * MIN, t - k * 30 * MIN)) : ''));
    const [sx, sy] = px(s);
    $('sleigh').setAttribute('transform', `translate(${sx.toFixed(1)} ${Math.max(16, sy).toFixed(1)})`);
    for (const [w, c] of stopEls) {
      c.classList.toggle('done', w.depart <= t || s.phase === 'done');
      c.classList.toggle('next', s.phase === 'flight' && s.next === w);
    }
  }

  function renderPov(s, t, tel) {
    if (GL) { const out = GL.render(s, t); setNextLabel(s, out ? out.label : null); hud(s, t, tel); return; }
    const cam = fpCamera(s);
    // sky: stars and the sun are directions at infinity; the ground is drawn over them
    let stars = '';
    for (const st of STARS) {
      const q = fpDir(cam, st.v); if (q[2] <= 0.05) continue;
      const [x, y] = fpProj(cam, q); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const r = 0.6 + st.m * 1.2;
      stars += `M${x.toFixed(1)} ${y.toFixed(1)}m-${r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    $('fp-stars').setAttribute('d', stars);
    const sunQ = fpDir(cam, toVec(s.sun));
    const sunUp = sunQ[2] > 0.02;
    $('fp-sun').setAttribute('visibility', sunUp ? 'visible' : 'hidden');
    if (sunUp) { const [x, y] = fpProj(cam, sunQ); $('fp-sun').setAttribute('cx', x.toFixed(1)); $('fp-sun').setAttribute('cy', y.toFixed(1)); }
    // the ground is everything inside the horizon circle
    const groundD = fpRingPath(cam, circleVecs(cam.p, cam.east, cam.north, cam.horizonAng, 2));
    $('fp-ground').setAttribute('d', groundD); $('fp-ground-clip').setAttribute('d', groundD); $('fp-horizon').setAttribute('d', groundD);
    // land: rings with a vertex inside the horizon are clipped to it; a ring with none but containing the
    // nadir means the whole view is inland, so it contributes the entire ground (even-odd handles holes)
    const here = s.lat > 89.99 ? { lat: 89.99, lon: 0 } : s;
    let land = '';
    landPolys.forEach((poly, pi) => poly.forEach((ring, ri) => {
      const vecs = landVecs[pi][ri];
      if (vecs.some(v => dot3(v, cam.p) >= cam.horizonCos)) land += fpGroundRing(cam, vecs);
      else if (pipLonLat(here.lon, here.lat, ring)) land += groundD;
    }));
    $('fp-land').setAttribute('d', land);
    // a faint 5° ground grid gives the curvature and the sense of speed
    let grid = '';
    const la0 = Math.round(here.lat / 5) * 5, lo0 = Math.round(here.lon / 5) * 5;
    for (let lon = lo0 - 30; lon <= lo0 + 30; lon += 5) { const line = []; for (let lat = Math.max(-90, la0 - 25); lat <= Math.min(90, la0 + 25); lat += 1) line.push({ lat, lon }); grid += fpPolyline(cam, line); }
    for (let lat = Math.max(-85, la0 - 25); lat <= Math.min(85, la0 + 25); lat += 5) { const line = []; for (let lon = lo0 - 30; lon <= lo0 + 30; lon += 1) line.push({ lat, lon }); grid += fpPolyline(cam, line); }
    $('fp-grid').setAttribute('d', grid);
    // night: the terminator is the great circle 90° from the sun. Clipped to the horizon it bounds the part of
    // the ground on the nadir's side of the line, so it is the night when the nadir is in night, else the day.
    const S = toVec(s.sun);
    let u = cross(S, [0, 0, 1]); u = Math.hypot(...u) < 1e-6 ? [1, 0, 0] : norm(u);
    let night = fpGroundRing(cam, circleVecs(S, u, cross(S, u), Math.PI / 2, 2));
    if (dot3(S, cam.p) >= 0) night += groundD;
    $('fp-night').setAttribute('d', night);
    $('fp-route').setAttribute('d', s.phase === 'done' ? '' : fpPolyline(cam, fullTrack));
    // city lights
    for (const [w, ce] of povStopEls) {
      const q = fpCam(cam, toVec(w), false);
      const ok = q[3] && q[2] > FP.near;
      ce.setAttribute('visibility', ok ? 'visible' : 'hidden');
      if (ok) { const [x, y] = fpProj(cam, q); ce.setAttribute('cx', x.toFixed(1)); ce.setAttribute('cy', y.toFixed(1)); ce.setAttribute('r', Math.min(9, Math.max(1.6, 0.45 / q[2])).toFixed(1)); }
      ce.classList.toggle('done', w.depart <= t || s.phase === 'done');
      ce.classList.toggle('next', s.phase === 'flight' && s.next === w);
    }
    let pos = null;
    if (s.next && !s.next.pole) { const q = fpCam(cam, toVec(s.next), false); if (q[3] && q[2] > FP.near) { const [x, y] = fpProj(cam, q); pos = { x, y }; } }
    setNextLabel(s, pos);
    hud(s, t, tel);
  }
  function setNextLabel(s, pos) {
    const lab = $('fp-next-label');
    if (pos) { lab.setAttribute('x', pos.x.toFixed(1)); lab.setAttribute('y', (pos.y - 12).toFixed(1)); lab.textContent = `${s.next.name} · ${fmtInt(haversineKm(s, s.next))} km`; }
    lab.setAttribute('visibility', pos ? 'visible' : 'hidden');
  }
  function hud(s, t, tel) {
    const hdg = s.next ? bearing(s, s.next) : 0;
    const nextName = s.next ? (s.next.pole ? 'the Workshop' : s.next.name) : '';
    let cap;
    if (s.phase === 'pre') cap = `Parked at the loading bay, nose toward ${s.next.name} · launch in ${fmtDuration(s.untilLaunchMs)} · drag to look around`;
    else if (s.phase === 'done') cap = 'Home. Reindeer unhitched, lights off, cookies under audit.';
    else if (s.status === 'delivering') cap = `On the rooftops of ${s.at.name} · next ${nextName}, ${fmtInt(haversineKm(s, s.next))} km, bearing ${hdg.toFixed(0)}°`;
    else cap = `Heading ${hdg.toFixed(0)}° ${compass(hdg)} · ${fmtInt(s.speedKmh)} km/h · ${nextName} ${fmtInt(haversineKm(s, s.next))} km ahead · ${fmtDuration(s.etaMs)}`;
    $('pov-caption').textContent = cap;
    $('pov-coords').textContent = `${Math.abs(s.lat).toFixed(1)}°${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lon).toFixed(1)}°${s.lon >= 0 ? 'E' : 'W'}`;
    $('fp-nose').setAttribute('visibility', s.phase === 'flight' ? 'visible' : 'hidden');
  }

  function setView(v) {
    view = v;
    $('map').toggleAttribute('hidden', v !== 'map'); $('povwrap').toggleAttribute('hidden', v !== 'pov'); // SVG elements have no .hidden property
    $('view-map').classList.toggle('is-on', v === 'map'); $('view-map').setAttribute('aria-pressed', String(v === 'map'));
    $('view-pov').classList.toggle('is-on', v === 'pov'); $('view-pov').setAttribute('aria-pressed', String(v === 'pov'));
    try { localStorage.setItem('santa_view', v); } catch { /* private window etc. */ }
    if (lastT != null) render(lastT);
  }

  // ---------- loop ----------
  function frame(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = (ts - lastTs) / 1000; lastTs = ts;
    if (mode === 'live') {
      if (ts - lastLiveRender >= 1000) {
        lastLiveRender = ts;
        if (missionYear(new Date()) !== currentYear) { location.reload(); return; } // the sleigh got home: new year, new archive
        render(Date.now());
      }
    } else if (playing) {
      simT += dt * speed * 1000;
      if (simT >= route.home) { simT = route.home; setPlaying(false); }
      render(simT);
    }
    requestAnimationFrame(frame);
  }

  // ---------- wiring ----------
  $('view-map').onclick = () => setView('map');
  $('view-pov').onclick = () => setView('pov');
  $('mode-live').onclick = () => setMode('live');
  $('mode-preview').onclick = () => setMode('preview');
  $('hint-preview').onclick = () => setMode('preview');
  $('play').onclick = () => setPlaying(!playing);
  $('speed').onchange = e => { speed = +e.target.value; };
  $('jump-now').onclick = () => { setPlaying(false); simT = nowOnChristmasEve(); render(simT); syncUrl(); };
  $('jump-me').onclick = () => { setPlaying(false); simT = clamp(arrivalForOffset(route, viewerOffset()).arrive - 2 * MIN); render(simT); syncUrl(); };
  $('jump-start').onclick = () => { setPlaying(false); simT = route.launch; render(simT); syncUrl(); };
  $('scrub').oninput = e => { playing = false; $('play').textContent = '▶ Play'; simT = +e.target.value; render(simT); };
  $('scrub').onchange = () => syncUrl();
  document.addEventListener('keydown', e => {
    if (mode !== 'preview' || e.target.closest('input,select,button,a,summary')) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      e.preventDefault(); setPlaying(false);
      simT = clamp(simT + (e.code === 'ArrowRight' ? 10 : -10) * MIN); render(simT); syncUrl();
    }
  });

  const params = new URLSearchParams(location.search);
  const tParam = params.get('t') ? Date.parse(params.get('t')) : NaN;
  const yParam = params.get('y') ? parseInt(params.get('y'), 10) : NaN;
  let savedView = null; try { savedView = localStorage.getItem('santa_view'); } catch { /* ignore */ }
  const wantView = params.get('view') || savedView;
  if (wantView === 'pov') { view = 'pov'; $('map').toggleAttribute('hidden', true); $('povwrap').toggleAttribute('hidden', false); $('view-map').classList.remove('is-on'); $('view-pov').classList.add('is-on'); $('view-pov').setAttribute('aria-pressed', 'true'); $('view-map').setAttribute('aria-pressed', 'false'); }
  if (!Number.isNaN(tParam)) { applyYear(new Date(tParam).getUTCFullYear()); setMode('preview', tParam); }
  else if (!Number.isNaN(yParam) && yParam !== currentYear) { setYear(yParam); }
  else { applyYear(currentYear); setMode(params.get('mode') === 'preview' ? 'preview' : 'live'); }
  requestAnimationFrame(frame);
})();
