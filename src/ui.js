// Santa Tracker UI — drives the page from the pure engine.
// Globals from the build: LAND_TOPO (TopoJSON) and everything exported by engine.mjs.
(() => {
  const $ = id => document.getElementById(id);
  const W = 1000, H = 500;
  const px = p => [(p.lon + 180) / 360 * W, (90 - p.lat) / 180 * H];
  const SVG = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const rad = d => d * Math.PI / 180;

  // ---------- Santa's view: an orthographic globe centred on the sleigh, north up ----------
  const PR = 560, PCX = 500, PCY = 250; // globe radius and centre inside the 1000×500 box
  function ortho(c, p) {
    const la = rad(p.lat), lo = rad(p.lon - c.lon), la0 = rad(c.lat);
    const x = Math.cos(la) * Math.sin(lo);
    const y = Math.cos(la0) * Math.sin(la) - Math.sin(la0) * Math.cos(la) * Math.cos(lo);
    const z = Math.sin(la0) * Math.sin(la) + Math.cos(la0) * Math.cos(la) * Math.cos(lo);
    return { x: PCX + PR * x, y: PCY - PR * y, vis: z > 0 };
  }
  const clampRim = q => { const dx = q.x - PCX, dy = q.y - PCY, L = Math.hypot(dx, dy) || 1; return { x: PCX + dx / L * PR, y: PCY + dy / L * PR }; };
  const pt = q => q.x.toFixed(1) + ' ' + q.y.toFixed(1);
  // Polygons as rings of [lon, lat]. Hidden vertices are pushed to the horizon so partly visible shapes still fill.
  function orthoRings(c, polys) {
    let d = '';
    for (const poly of polys) for (const ring of poly) {
      let any = false, s = '';
      ring.forEach(([lon, lat], i) => { const q = ortho(c, { lat, lon }); any = any || q.vis; s += (i ? 'L' : 'M') + pt(q.vis ? q : clampRim(q)); });
      if (any) d += s + 'Z';
    }
    return d;
  }
  function orthoLine(c, pts) {
    let d = '', pen = false;
    for (const p of pts) { const q = ortho(c, p); if (!q.vis) { pen = false; continue; } d += (pen ? 'L' : 'M') + pt(q); pen = true; }
    return d;
  }
  const toVec = p => { const la = rad(p.lat), lo = rad(p.lon); return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
  const fromVec = ([x, y, z]) => ({ lat: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, lon: Math.atan2(y, x) * 180 / Math.PI });
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const L = Math.hypot(...a); return [a[0] / L, a[1] / L, a[2] / L]; };
  // The night side as seen from c. The terminator is the great circle 90° from the sun; with hidden
  // vertices clamped to the horizon, the polygon is the visible night when the night's centre is in
  // view and the visible day otherwise, in which case we take the complement (evenodd with the disk).
  function orthoNight(c, sun) {
    const S = toVec(sun);
    let u = cross(S, [0, 0, 1]); u = Math.hypot(...u) < 1e-6 ? [1, 0, 0] : norm(u);
    const v = cross(S, u);
    let d = '';
    for (let a = 0; a <= 360; a += 2) {
      const r = rad(a), p = fromVec([Math.cos(r) * u[0] + Math.sin(r) * v[0], Math.cos(r) * u[1] + Math.sin(r) * v[1], Math.cos(r) * u[2] + Math.sin(r) * v[2]]);
      const q = ortho(c, p); d += (a ? 'L' : 'M') + pt(q.vis ? q : clampRim(q));
    }
    d += 'Z';
    const anti = { lat: -sun.lat, lon: wrapLon(sun.lon + 180) };
    if (!ortho(c, anti).vis) d += `M${PCX - PR} ${PCY}a${PR} ${PR} 0 1 0 ${2 * PR} 0a${PR} ${PR} 0 1 0 ${-2 * PR} 0Z`;
    return d;
  }
  const graticuleLines = (() => {
    const lines = [];
    for (let lon = -180; lon < 180; lon += 30) { const l = []; for (let lat = -90; lat <= 90; lat += 5) l.push({ lat, lon }); lines.push(l); }
    for (let lat = -60; lat <= 60; lat += 30) { const l = []; for (let lon = -180; lon <= 180; lon += 5) l.push({ lat, lon }); lines.push(l); }
    return lines;
  })();

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
      const pc = el('circle', { class: 'stop', visibility: 'hidden' });
      const pTitle = el('title'); pTitle.textContent = label; pc.appendChild(pTitle);
      pg.appendChild(pc); povStopEls.push([w, pc]);
    }
    fullTrack = track(route, route.launch, route.home);
    $('route-future').setAttribute('d', polyline(fullTrack));
    $('scrub').min = route.launch; $('scrub').max = route.home; $('scrub').value = route.launch;
    $('scrub-min').textContent = `Launch · ${utcStamp(route.launch)}`;
    $('scrub-max').textContent = `Home · ${utcStamp(route.home)}`;
    $('how-totals').textContent = `In ${route.year} that is ${route.stopCount} stops, about ${fmtInt(route.totalKm)} km, in ${fmtDuration(route.home - route.launch)}.`;
    $('how-countries').textContent = `The route touches ${countryCount()} countries and territories: every country where someone is waiting up, one city each where only a capital was missing. ${SKIPPED.length} are left to sleep because public Christmas celebration there is banned or essentially absent: ${SKIPPED.map(k => `${k.country} (${k.why})`).join(', ')}. The list lives in the source, where it can be argued with.`;
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
      const word = past ? 'Archive' : 'Simulated';
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
      k.classList.add('pre'); k.textContent = prefix + 'PRE-FLIGHT · NORTH POLE';
      h.textContent = `Santa ${is} at the North Pole, loading the sleigh`;
      const launchLocal = `${localFmtDate(route.launch)} ${localFmtTime(route.launch)} your time`;
      sub.textContent = `Launch in ${fmtDuration(s.untilLaunchMs)} · ${utcStamp(route.launch)} (${launchLocal}). First stop: ${s.next.name}.`;
      $('hint').hidden = mode !== 'live';
    } else if (s.phase === 'done') {
      k.classList.add('done'); k.textContent = prefix + 'MISSION COMPLETE';
      h.textContent = `Santa ${is} home at the North Pole`;
      sub.textContent = `${route.stopCount} stops, ${big(route.totalPresents)} presents, ${fmtInt(route.totalKm)} km. The reindeer ${past ? 'slept well' : 'are asleep'}.`;
      $('hint').hidden = true;
    } else if (s.status === 'delivering') {
      k.textContent = prefix + 'IN FLIGHT · ON THE ROOFTOPS';
      h.textContent = `Santa ${is} in ${s.at.name}, ${s.at.country}`;
      sub.textContent = `${localStamp(s.at)} · ${big(s.at.presents)} presents here · next: ${s.next.name} in ${fmtDuration(s.etaMs)}`;
      $('hint').hidden = true;
    } else {
      k.textContent = prefix + 'IN FLIGHT · EN ROUTE';
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

    // log (only rebuild when the set of arrivals changes)
    const logKey = `${year}:${s.phase}:${s.stopsDone}:${s.at && s.at.i}`;
    if (logKey !== lastLogKey) {
      lastLogKey = logKey;
      const items = missionLog(s, 8);
      const ol = $('log'); ol.textContent = '';
      if (!items.length) {
        const li = document.createElement('li'); li.className = 'muted';
        li.textContent = s.phase === 'pre' ? 'Nothing yet. The elves are still wrapping.' : 'Airborne. First stop coming up.';
        ol.appendChild(li);
      }
      for (const it of items) {
        const li = document.createElement('li');
        const when = document.createElement('span'); when.className = 'when'; when.textContent = `${fmtClockUtc(it.t)}Z`;
        const body = document.createElement('span');
        body.textContent = `${it.name}, ${it.country} · ${big(it.presents)} presents · `;
        const note = document.createElement('span'); note.className = 'note'; note.textContent = it.note;
        body.appendChild(note); li.append(when, body); ol.appendChild(li);
      }
    }
  }

  function renderMap(s, t) {
    $('night').setAttribute('d', polyline(nightPolygon(s.sun)) + 'Z');
    const mx = px({ lat: 0, lon: s.midnightLon })[0];
    $('midnight').setAttribute('x1', mx); $('midnight').setAttribute('x2', mx);
    $('route-past').setAttribute('d', s.phase === 'flight' ? polyline(track(route, route.launch, t)) : '');
    const [sx, sy] = px(s);
    $('sleigh').setAttribute('transform', `translate(${sx.toFixed(1)} ${Math.max(16, sy).toFixed(1)})`);
    for (const [w, c] of stopEls) {
      c.classList.toggle('done', w.depart <= t || s.phase === 'done');
      c.classList.toggle('next', s.phase === 'flight' && s.next === w);
    }
  }

  function renderPov(s, t, tel) {
    const c = { lat: s.lat, lon: s.lat > 89.99 ? 0 : s.lon };
    $('pov-land').setAttribute('d', orthoRings(c, landPolys));
    $('pov-grat').setAttribute('d', graticuleLines.map(l => orthoLine(c, l)).join(''));
    $('pov-night').setAttribute('d', orthoNight(c, s.sun));
    const mer = []; for (let lat = -90; lat <= 90; lat += 3) mer.push({ lat, lon: s.midnightLon });
    $('pov-midnight').setAttribute('d', orthoLine(c, mer));
    $('pov-future').setAttribute('d', orthoLine(c, fullTrack));
    $('pov-past').setAttribute('d', s.phase === 'flight' ? orthoLine(c, track(route, route.launch, t)) : '');
    const home = ortho(c, { lat: 89.5, lon: c.lon }); // the Workshop sits on the pole; show it when it is over the horizon
    $('pov-home').setAttribute('visibility', home.vis ? 'visible' : 'hidden');
    $('pov-home').setAttribute('transform', `translate(${home.x.toFixed(1)} ${home.y.toFixed(1)})`);
    for (const [w, ce] of povStopEls) {
      const q = ortho(c, w);
      ce.setAttribute('visibility', q.vis ? 'visible' : 'hidden');
      if (q.vis) { ce.setAttribute('cx', q.x.toFixed(1)); ce.setAttribute('cy', q.y.toFixed(1)); }
      ce.classList.toggle('done', w.depart <= t || s.phase === 'done');
      ce.classList.toggle('next', s.phase === 'flight' && s.next === w);
    }
    const hdg = s.next ? bearing(s, s.next) : 0;
    const flying = s.phase === 'flight' && s.status === 'enroute';
    $('pov-heading').setAttribute('transform', `rotate(${hdg.toFixed(0)})`);
    $('pov-heading').setAttribute('visibility', flying ? 'visible' : 'hidden');
    const nextName = s.next ? (s.next.pole ? 'the Workshop' : s.next.name) : '';
    const nextKm = s.next ? `${fmtInt(haversineKm(s, s.next))} km` : '';
    let cap;
    if (s.phase === 'pre') cap = `Over the Workshop · ${fmtDuration(s.untilLaunchMs)} to launch · first stop ${s.next.name}, ${nextKm} due south`;
    else if (s.phase === 'done') cap = 'Home. Looking down at the Workshop; the lights are off.';
    else if (s.status === 'delivering') cap = `On the rooftops of ${s.at.name} · next ${nextName}, ${nextKm}, bearing ${hdg.toFixed(0)}°`;
    else cap = `Heading ${hdg.toFixed(0)}° at ${fmtInt(tel.altitudeM)} m · ${nextName} ${nextKm} ahead · ${fmtInt(s.speedKmh)} km/h`;
    $('pov-caption').textContent = cap;
    $('pov-coords').textContent = `${Math.abs(s.lat).toFixed(1)}°${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lon).toFixed(1)}°${s.lon >= 0 ? 'E' : 'W'}`;
  }

  function setView(v) {
    view = v;
    $('map').hidden = v !== 'map'; $('pov').hidden = v !== 'pov';
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
  if (wantView === 'pov') { view = 'pov'; $('map').hidden = true; $('pov').hidden = false; $('view-map').classList.remove('is-on'); $('view-pov').classList.add('is-on'); $('view-pov').setAttribute('aria-pressed', 'true'); $('view-map').setAttribute('aria-pressed', 'false'); }
  if (!Number.isNaN(tParam)) { applyYear(new Date(tParam).getUTCFullYear()); setMode('preview', tParam); }
  else if (!Number.isNaN(yParam) && yParam !== currentYear) { setYear(yParam); }
  else { applyYear(currentYear); setMode(params.get('mode') === 'preview' ? 'preview' : 'live'); }
  requestAnimationFrame(frame);
})();
