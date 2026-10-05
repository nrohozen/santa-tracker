// Santa Tracker engine — pure functions, no DOM.
// Everything here is deterministic in (year, time), so the same instant always
// renders the same sleigh position, the same counters and the same log.

import { STOPS } from './stops.mjs';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const PRESENTS_PER_CAPITA = 0.25;     // roughly "children per resident"
export const MAX_DWELL = 6 * MIN;             // longest Santa lingers in one city
export const POLE = { name: 'North Pole', country: 'Workshop', lat: 90, lon: 0, utc: 0, pop: 0, pole: true };

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
export const wrapLon = lon => ((lon + 540) % 360 + 360) % 360 - 180;

// ---------- geometry ----------

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const toVec = p => {
  const la = rad(p.lat), lo = rad(p.lon);
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
};
const fromVec = ([x, y, z]) => ({ lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) });

// Great-circle interpolation, f in [0,1].
export function slerp(a, b, f) {
  if (f <= 0) return { lat: a.lat, lon: a.lon };
  if (f >= 1) return { lat: b.lat, lon: b.lon };
  const u = toVec(a), v = toVec(b);
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  const w = Math.acos(dot);
  if (w < 1e-9) return { lat: a.lat, lon: a.lon };
  const s = Math.sin(w), ka = Math.sin((1 - f) * w) / s, kb = Math.sin(f * w) / s;
  return fromVec([ka * u[0] + kb * v[0], ka * u[1] + kb * v[1], ka * u[2] + kb * v[2]]);
}

// ---------- the sun ----------

// Subsolar point (where the sun is straight overhead) at a given instant.
// Low-precision solar position (USNO "Approximate Solar Coordinates"), good to ~0.01°.
export function subsolarPoint(time) {
  const d = (+time - Date.UTC(2000, 0, 1, 12)) / 86_400_000; // days since J2000.0
  const g = rad(((357.529 + 0.98560028 * d) % 360 + 360) % 360);
  const q = ((280.459 + 0.98564736 * d) % 360 + 360) % 360;
  const L = rad(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
  const e = rad(23.439 - 0.00000036 * d);
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = deg(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)));
  const gmst = ((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360;
  return { lat: deg(dec), lon: wrapLon(ra - gmst) };
}

// Latitude of the day/night line at longitude `lon` for a given subsolar point.
export function terminatorLat(sun, lon) {
  const H = rad(lon - sun.lon);
  const dec = rad(sun.lat);
  if (Math.abs(dec) < 1e-6) return 0;
  return deg(Math.atan(-Math.cos(H) / Math.tan(dec)));
}

// Polygon (array of {lat,lon}) covering the night side on an equirectangular map.
// The dark polar cap is the north one when the sun is south of the equator.
export function nightPolygon(sun, step = 2) {
  const pts = [];
  for (let lon = -180; lon <= 180; lon += step) pts.push({ lat: terminatorLat(sun, lon), lon });
  const capLat = sun.lat < 0 ? 90 : -90;
  pts.push({ lat: capLat, lon: 180 }, { lat: capLat, lon: -180 });
  return pts;
}

// The "midnight meridian": the longitude where local solar time is 00:00.
export const antisolarLon = sun => wrapLon(sun.lon + 180);

// ---------- the route ----------

// Which Christmas Eve are we tracking? The current year's until the sleigh is
// home (Dec 25 ~12:15 UTC; cutoff 13:00), then next year's.
export function missionYear(now = new Date()) {
  const y = now.getUTCFullYear();
  return +now < Date.UTC(y, 11, 25, 13) ? y : y + 1;
}

// Santa delivers at local midnight, so he sweeps westward one time zone per hour:
// UTC+14 first (Dec 24 10:00 UTC), UTC−11 last (Dec 25 11:00 UTC). Inside a zone
// the cities are visited in a north–south serpentine spread across the hour.
export function buildRoute(year, stops = STOPS) {
  const midnightUtc = Date.UTC(year, 11, 25, 0, 0, 0);
  const bands = new Map();
  for (const s of stops) {
    if (!bands.has(s.utc)) bands.set(s.utc, []);
    bands.get(s.utc).push(s);
  }
  const offsets = [...bands.keys()].sort((a, b) => b - a);
  const timed = [];
  offsets.forEach((utc, bi) => {
    const group = bands.get(utc).slice().sort((a, b) => (bi % 2 ? a.lat - b.lat : b.lat - a.lat));
    const base = midnightUtc - utc * HOUR;
    const n = group.length;
    group.forEach((s, i) => timed.push({ ...s, t: base - 30 * MIN + (i + 0.5) * (60 * MIN / n) }));
  });
  timed.sort((a, b) => a.t - b.t);

  const launch = timed[0].t - 60 * MIN;
  const home = timed[timed.length - 1].t + 60 * MIN;
  const waypoints = [{ ...POLE, t: launch }, ...timed, { ...POLE, t: home }];

  let km = 0, presents = 0;
  waypoints.forEach((w, i) => {
    const next = waypoints[i + 1];
    w.i = i;
    w.arrive = w.t;
    w.depart = next ? w.t + Math.min(MAX_DWELL, (next.t - w.t) * 0.3) : w.t;
    w.segKm = next ? haversineKm(w, next) : 0;
    w.presents = Math.round((w.pop || 0) * 1e6 * PRESENTS_PER_CAPITA);
    w.cumKm = km;
    km += w.segKm;
    presents += w.presents;
    w.cumPresents = presents;
    w.localArrive = w.arrive + w.utc * HOUR; // ms "as if UTC" — format with getUTC*
  });
  return { year, launch, home, waypoints, totalKm: km, totalPresents: presents, stopCount: timed.length };
}

// ---------- state at an instant ----------

export function stateAt(route, time) {
  const t = +time;
  const W = route.waypoints;
  const sun = subsolarPoint(t);
  const base = { route, t, sun, midnightLon: antisolarLon(sun) };

  if (t < route.launch) {
    return { ...base, phase: 'pre', lat: 90, lon: 0, at: W[0], next: W[1], stopsDone: 0,
      presents: 0, km: 0, speedKmh: 0, etaMs: W[1].arrive - t, untilLaunchMs: route.launch - t };
  }
  if (t >= route.home) {
    return { ...base, phase: 'done', lat: 90, lon: 0, at: W[W.length - 1], next: null, stopsDone: route.stopCount,
      presents: route.totalPresents, km: route.totalKm, speedKmh: 0, etaMs: 0 };
  }

  let i = 0;
  while (i < W.length - 2 && W[i + 1].arrive <= t) i++;
  const w = W[i], n = W[i + 1];
  const prevCum = i > 0 ? W[i - 1].cumPresents : 0;
  const stopsDone = Math.max(0, w.pole ? 0 : i); // pole is index 0; stop k has index k
  if (t < w.depart) {
    const f = (t - w.arrive) / Math.max(1, w.depart - w.arrive);
    return { ...base, phase: 'flight', status: 'delivering', lat: w.lat, lon: w.lon, at: w, next: n, stopsDone,
      presents: Math.round(prevCum + f * w.presents), km: w.cumKm, speedKmh: 0, etaMs: n.arrive - t, segF: 0 };
  }
  const f = (t - w.depart) / (n.arrive - w.depart);
  const p = slerp(w, n, f);
  const hours = (n.arrive - w.depart) / HOUR;
  return { ...base, phase: 'flight', status: 'enroute', lat: p.lat, lon: p.lon, at: w, next: n, stopsDone,
    presents: w.cumPresents, km: w.cumKm + f * w.segKm, speedKmh: w.segKm / hours, etaMs: n.arrive - t, segF: f };
}

// Sample the sleigh's track between two instants (for drawing the flown path).
export function track(route, from, to, stepMs = 90 * MIN / 60) {
  const pts = [];
  const a = Math.max(from, route.launch), b = Math.min(to, route.home);
  if (b < a) return pts;
  for (let t = a; t < b; t += stepMs) { const s = stateAt(route, t); pts.push({ lat: s.lat, lon: s.lon }); }
  const s = stateAt(route, b); pts.push({ lat: s.lat, lon: s.lon });
  return pts;
}

// When does Santa reach a viewer's time zone? Nearest band by UTC offset.
export function arrivalForOffset(route, offsetHours) {
  const stops = route.waypoints.filter(w => !w.pole);
  let best = null;
  for (const s of stops) {
    const d = Math.abs(s.utc - offsetHours);
    if (!best || d < best.d || (d === best.d && s.arrive < best.s.arrive)) best = { d, s };
  }
  const bandStart = Math.min(...stops.filter(s => s.utc === best.s.utc).map(s => s.arrive));
  return { utc: best.s.utc, arrive: bandStart, exact: best.d === 0, example: best.s };
}

// Fun but deterministic telemetry derived from the state.
export function telemetry(state) {
  const t = state.t / 1000;
  const wobble = (k, amp) => amp * Math.sin(t / k) * Math.cos(t / (k * 1.7));
  const flying = state.phase === 'flight' && state.status === 'enroute';
  const altitudeM = flying ? Math.round(1800 + wobble(53, 400) + wobble(11, 60)) : state.phase === 'flight' ? 12 : 0;
  const cookies = Math.round(state.stopsDone * 2.4);
  const milkL = +(state.stopsDone * 0.18).toFixed(1);
  const reindeer = ['Dasher', 'Dancer', 'Prancer', 'Vixen', 'Comet', 'Cupid', 'Donner', 'Blitzen', 'Rudolph'];
  const lead = state.phase === 'pre' ? 'Rudolph (warming up)' : reindeer[(state.stopsDone * 7 + 3) % reindeer.length];
  const sackPct = state.route.totalPresents ? Math.max(0, 100 - 100 * state.presents / state.route.totalPresents) : 100;
  return { altitudeM, cookies, milkL, lead, sackPct };
}

// Mission log: one line per completed arrival, newest first.
const NOTES = [
  'rooftop frost: minor', 'chimney clearance: nominal', 'cookies: above average',
  'one dog awake, negotiated', 'reindeer morale: high', 'carrots accepted', 'left before the cat noticed',
  'tree lights still on, approved', 'fog, flew by nose', 'milk slightly warm', 'all stockings accounted for',
  'elf audit passed', 'wind from the east', 'sleigh bells muted per request', 'cocoa, two marshmallows',
];
export function missionLog(state, limit = 6) {
  const done = state.route.waypoints.filter(w => !w.pole && w.arrive <= state.t);
  return done.slice(-limit).reverse().map(w => ({
    t: w.arrive, name: w.name, country: w.country, presents: w.presents,
    note: NOTES[(w.i * 5 + w.name.length) % NOTES.length],
  }));
}

// ---------- map data ----------

// Minimal TopoJSON decoder: returns polygons as arrays of rings of [lon, lat].
export function decodeTopo(topo, objName) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
  });
  const ring = idxs => {
    const pts = [];
    for (const i of idxs) {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      pts.push(...(pts.length ? a.slice(1) : a));
    }
    return pts;
  };
  const polys = [];
  for (const g of topo.objects[objName].geometries) {
    if (g.type === 'Polygon') polys.push(g.arcs.map(ring));
    else if (g.type === 'MultiPolygon') for (const p of g.arcs) polys.push(p.map(ring));
  }
  return polys;
}

// ---------- formatting helpers (shared by UI and tests) ----------

export const fmtInt = n => Math.round(n).toLocaleString('en-US');
export function fmtDuration(ms) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / 86_400_000), h = Math.floor(ms / HOUR) % 24, m = Math.floor(ms / MIN) % 60, s = Math.floor(ms / 1000) % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
export const fmtClockUtc = t => {
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
export const fmtOffset = h => `UTC${h >= 0 ? '+' : '−'}${Math.abs(h) % 1 ? Math.abs(h).toFixed(h % 1 === 0.75 || h % 1 === -0.75 ? 2 : 1) : Math.abs(h)}`;

export { STOPS };
