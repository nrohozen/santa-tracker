// Santa Tracker UI — drives the page from the pure engine.
// Globals from the build: LAND_TOPO (TopoJSON) and everything exported by engine.mjs.
(() => {
  const $ = id => document.getElementById(id);
  const W = 1000, H = 500;
  const px = p => [(p.lon + 180) / 360 * W, (90 - p.lat) / 180 * H];
  const SVG = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

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

  $('land').appendChild(el('path', { id: 'land-path', d: ringsToPath(decodeTopo(LAND_TOPO, 'land')), 'fill-rule': 'evenodd' }));
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
  const stopEls = [];
  function applyRouteDom() {
    const g = $('stops'); g.textContent = ''; stopEls.length = 0;
    for (const w of route.waypoints) {
      if (w.pole) continue;
      const [cx, cy] = px(w);
      const c = el('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), class: 'stop' });
      const title = el('title');
      title.textContent = `${w.name}, ${w.country} (${fmtOffset(w.utc)}) · arrives ${localStamp(w)} (${fmtClockUtc(w.arrive)} UTC) · ${big(w.presents)} presents`;
      c.appendChild(title);
      g.appendChild(c); stopEls.push([w, c]);
    }
    $('route-future').setAttribute('d', polyline(track(route, route.launch, route.home)));
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
    meta.textContent = `${r.stopCount} stops · ${fmtInt(r.totalKm)} km${r.changes.length ? ` · ${r.changes.length} clock change${r.changes.length > 1 ? 's' : ''}` : ''}`;
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

    // map
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
  if (!Number.isNaN(tParam)) { applyYear(new Date(tParam).getUTCFullYear()); setMode('preview', tParam); }
  else if (!Number.isNaN(yParam) && yParam !== currentYear) { setYear(yParam); }
  else { applyYear(currentYear); setMode(params.get('mode') === 'preview' ? 'preview' : 'live'); }
  requestAnimationFrame(frame);
})();
