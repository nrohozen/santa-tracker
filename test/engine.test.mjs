import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STOPS, HOUR, MIN, buildRoute, stateAt, subsolarPoint, terminatorLat, nightPolygon, antisolarLon,
  slerp, haversineKm, decodeTopo, missionYear, arrivalForOffset, telemetry, missionLog, track, wrapLon,
  SKIPPED, stopsForYear, routeChanges, TZ_HISTORY, orderBand, hash32, mulberry32, ARCHIVE_YEARS,
} from '../src/engine.mjs';

const YEAR = 2026;
const route = buildRoute(YEAR);
const stops = route.waypoints.filter(w => !w.pole);

test('stops are unique and well-formed', () => {
  const names = new Set(STOPS.map(s => `${s.name}|${s.country}`));
  assert.equal(names.size, STOPS.length);
  for (const s of STOPS) {
    assert.ok(s.lat >= -90 && s.lat <= 90, s.name);
    assert.ok(s.lon >= -180 && s.lon <= 180, s.name);
    assert.ok(s.utc >= -12 && s.utc <= 14, s.name);
    assert.ok(s.pop >= 0, s.name);
  }
});

test('route runs east to west: Kiritimati first, UTC-11 last, pole at both ends', () => {
  assert.equal(route.waypoints[0].pole, true);
  assert.equal(route.waypoints.at(-1).pole, true);
  assert.equal(stops[0].name, 'Kiritimati');
  assert.equal(stops.at(-1).utc, -11);
  assert.equal(route.stopCount, STOPS.length);
});

test('arrival times strictly increase and launch/home bracket them by an hour', () => {
  for (let i = 1; i < route.waypoints.length; i++) assert.ok(route.waypoints[i].arrive > route.waypoints[i - 1].arrive);
  assert.equal(route.launch, stops[0].arrive - HOUR);
  assert.equal(route.home, stops.at(-1).arrive + HOUR);
  assert.equal(route.launch, Date.UTC(YEAR, 11, 24, 9, 0));
  assert.ok(route.home > Date.UTC(YEAR, 11, 25, 11, 30) && route.home <= Date.UTC(YEAR, 11, 25, 13, 0));
});

test('every city is visited within half an hour of its local midnight', () => {
  for (const s of stops) {
    const localMs = ((s.arrive + s.utc * HOUR) % 86_400_000 + 86_400_000) % 86_400_000;
    const minsFromMidnight = Math.min(localMs, 86_400_000 - localMs) / MIN;
    assert.ok(minsFromMidnight <= 30 + 1e-6, `${s.name} arrives ${minsFromMidnight.toFixed(1)} min from midnight`);
  }
});

test('dwell never exceeds the gap to the next stop', () => {
  for (let i = 0; i < route.waypoints.length - 1; i++) {
    const w = route.waypoints[i], n = route.waypoints[i + 1];
    assert.ok(w.depart >= w.arrive && w.depart < n.arrive, w.name);
  }
});

test('state before launch and after home is at the pole', () => {
  const pre = stateAt(route, route.launch - 1);
  assert.equal(pre.phase, 'pre'); assert.equal(pre.lat, 90); assert.equal(pre.presents, 0);
  assert.equal(pre.untilLaunchMs, 1);
  const done = stateAt(route, route.home);
  assert.equal(done.phase, 'done'); assert.equal(done.lat, 90);
  assert.equal(done.presents, route.totalPresents);
  assert.equal(done.stopsDone, route.stopCount);
  assert.ok(Math.abs(done.km - route.totalKm) < 1e-6);
});

test('at an arrival instant Santa is exactly at that city, then on the great circle to the next', () => {
  const tokyo = stops.find(s => s.name === 'Tokyo');
  const s0 = stateAt(route, tokyo.arrive);
  assert.equal(s0.status, 'delivering'); assert.equal(s0.lat, tokyo.lat); assert.equal(s0.lon, tokyo.lon);
  const next = route.waypoints[tokyo.i + 1];
  const mid = stateAt(route, (tokyo.depart + next.arrive) / 2);
  assert.equal(mid.status, 'enroute');
  const dA = haversineKm(mid, tokyo), dB = haversineKm(mid, next);
  assert.ok(Math.abs(dA - dB) < 1, 'midpoint is equidistant');
  assert.ok(Math.abs(dA + dB - tokyo.segKm) < 1, 'midpoint lies on the segment');
  assert.ok(mid.speedKmh > 0);
});

test('presents, distance and stops are monotone over the whole flight', () => {
  let prev = stateAt(route, route.launch);
  for (let t = route.launch; t <= route.home; t += 5 * MIN) {
    const s = stateAt(route, t);
    assert.ok(s.presents >= prev.presents, `presents dipped at ${new Date(t).toISOString()}`);
    assert.ok(s.km >= prev.km - 1e-6, 'km dipped');
    assert.ok(s.stopsDone >= prev.stopsDone, 'stopsDone dipped');
    assert.ok(Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180);
    prev = s;
  }
});

test('Santa rides the midnight line: during flight he stays near the antisolar meridian', () => {
  let worst = 0;
  for (const s of stops) {
    const st = stateAt(route, s.arrive);
    const gap = Math.abs(wrapLon(st.lon - st.midnightLon));
    worst = Math.max(worst, gap);
  }
  // Time zones are political, the sun is not: allow ~2.5 hours of longitude.
  assert.ok(worst < 40, `worst longitude gap from midnight meridian: ${worst.toFixed(1)}°`);
});

test('the sun: December solstice declination and noon subsolar longitude', () => {
  const dec21 = subsolarPoint(Date.UTC(2026, 11, 21, 12));
  assert.ok(Math.abs(dec21.lat + 23.44) < 0.1, `dec ${dec21.lat}`);
  assert.ok(Math.abs(dec21.lon) < 2, `noon subsolar lon ${dec21.lon}`);
  const jun21 = subsolarPoint(Date.UTC(2026, 5, 21, 12));
  assert.ok(Math.abs(jun21.lat - 23.44) < 0.1);
  const midnight = subsolarPoint(Date.UTC(2026, 11, 24, 0));
  assert.ok(Math.abs(Math.abs(midnight.lon) - 180) < 2, `midnight subsolar lon ${midnight.lon}`);
  assert.ok(Math.abs(antisolarLon(midnight)) < 2);
});

test('terminator and night polygon: in December the dark cap is the north pole', () => {
  const sun = subsolarPoint(Date.UTC(2026, 11, 24, 12));
  const noonLat = terminatorLat(sun, sun.lon);
  assert.ok(noonLat > 66 && noonLat < 67.5, `arctic circle edge ${noonLat}`);
  const poly = nightPolygon(sun);
  assert.ok(poly.some(p => p.lat === 90));
  assert.ok(!poly.some(p => p.lat === -90));
});

test('slerp endpoints and pole handling', () => {
  const a = { lat: 90, lon: 0 }, b = { lat: 1.87, lon: -157.4 };
  assert.deepEqual(slerp(a, b, 0), { lat: 90, lon: 0 });
  assert.deepEqual(slerp(a, b, 1), { lat: 1.87, lon: -157.4 });
  const m = slerp(a, b, 0.5);
  assert.ok(Math.abs(m.lon - b.lon) < 1e-6, 'descending the meridian of the target');
  assert.ok(m.lat > 40 && m.lat < 50);
});

test('land topology decodes into sane polygons', () => {
  const topo = JSON.parse(readFileSync(new URL('../data/land-110m.json', import.meta.url), 'utf8'));
  const polys = decodeTopo(topo, 'land');
  assert.ok(polys.length > 50, `only ${polys.length} polygons`);
  let pts = 0;
  for (const poly of polys) for (const ring of poly) for (const [lon, lat] of ring) {
    pts++;
    assert.ok(lon >= -180.01 && lon <= 180.01 && lat >= -90.01 && lat <= 90.01);
  }
  assert.ok(pts > 5000);
});

test('missionYear rolls over after the sleigh is home', () => {
  assert.equal(missionYear(new Date(Date.UTC(2026, 9, 5))), 2026);
  assert.equal(missionYear(new Date(Date.UTC(2026, 11, 25, 12, 59))), 2026);
  assert.equal(missionYear(new Date(Date.UTC(2026, 11, 25, 13))), 2027);
  assert.equal(missionYear(new Date(Date.UTC(2027, 0, 1))), 2027);
});

test('arrivalForOffset finds the viewer band', () => {
  const et = arrivalForOffset(route, -5);
  assert.equal(et.utc, -5); assert.equal(et.exact, true);
  assert.equal(et.arrive, Math.min(...stops.filter(s => s.utc === -5).map(s => s.arrive)));
  const odd = arrivalForOffset(route, 12.75);
  assert.ok([12, 13].includes(odd.utc)); assert.equal(odd.exact, false);
});

test('every country is on the route unless it is on the skip list', () => {
  const countries = new Set(STOPS.map(s => s.country));
  assert.ok(countries.size >= 190, `only ${countries.size} countries`);
  for (const k of SKIPPED) assert.ok(!countries.has(k.country), `${k.country} is both skipped and visited`);
  for (const must of ['Tuvalu', 'Vatican City', 'Palestine', 'Bhutan', 'Haiti', 'Guyana', 'Eritrea', 'Luxembourg']) assert.ok(countries.has(must), must);
  assert.ok(!countries.has('North Korea'));
});

test('historical offsets: Samoa, Fiji, Brazil, Kazakhstan, Jordan, Sudan', () => {
  const by = (y, n) => stopsForYear(y).find(s => s.name === n).utc;
  assert.equal(by(2020, 'Apia'), 14); assert.equal(by(2021, 'Apia'), 13);
  assert.equal(by(2021, 'Suva'), 13); assert.equal(by(2022, 'Suva'), 12);
  assert.equal(by(2018, 'São Paulo'), -2); assert.equal(by(2019, 'São Paulo'), -3);
  assert.equal(by(2023, 'Almaty'), 6); assert.equal(by(2024, 'Almaty'), 5);
  assert.equal(by(2021, 'Amman'), 2); assert.equal(by(2022, 'Amman'), 3);
  assert.equal(by(2016, 'Khartoum'), 3); assert.equal(by(2017, 'Khartoum'), 2);
  assert.equal(by(2016, "Nuku'alofa"), 14); assert.equal(by(2017, "Nuku'alofa"), 13);
  for (const h of TZ_HISTORY) assert.ok(STOPS.some(s => s.name === h.name), `${h.name} is a real stop`);
});

test('routeChanges reports exactly the cities whose clocks moved', () => {
  const c2019 = routeChanges(2019);
  assert.deepEqual(c2019.map(c => c.name).sort(), ['Brasília', 'Rio de Janeiro', 'São Paulo']);
  assert.equal(c2019[0].from, -2); assert.equal(c2019[0].to, -3); assert.match(c2019[0].why, /Brazil/);
  assert.deepEqual(routeChanges(2020), []);
  assert.deepEqual(routeChanges(2024).map(c => c.name), ['Almaty']);
  assert.deepEqual(routeChanges(2022).map(c => c.name).sort(), ['Amman', 'Damascus', 'Suva']);
});

test('every archive year builds a valid, distinct, deterministic route', () => {
  const seen = new Set();
  for (let y = YEAR - ARCHIVE_YEARS; y <= YEAR; y++) {
    const r1 = buildRoute(y), r2 = buildRoute(y);
    assert.deepEqual(r1.waypoints.map(w => w.name), r2.waypoints.map(w => w.name), `${y} deterministic`);
    const key = r1.waypoints.map(w => w.name).join('>');
    assert.ok(!seen.has(key), `${y} route repeats an earlier year`);
    seen.add(key);
    assert.equal(r1.stopCount, STOPS.length);
    for (let i = 1; i < r1.waypoints.length; i++) assert.ok(r1.waypoints[i].arrive > r1.waypoints[i - 1].arrive, `${y} order`);
    for (const s of r1.waypoints.filter(w => !w.pole)) {
      const localMs = ((s.arrive + s.utc * HOUR) % 86_400_000 + 86_400_000) % 86_400_000;
      assert.ok(Math.min(localMs, 86_400_000 - localMs) / MIN <= 30 + 1e-6, `${y} ${s.name} off midnight`);
    }
    let prev = stateAt(r1, r1.launch);
    for (let t = r1.launch; t <= r1.home; t += 15 * MIN) {
      const s = stateAt(r1, t);
      assert.ok(s.presents >= prev.presents && s.km >= prev.km - 1e-6, `${y} monotone`);
      prev = s;
    }
    assert.equal(stateAt(r1, r1.home).presents, r1.totalPresents);
  }
});

test('clock changes move a city in the order: São Paulo leaves the UTC-2 slot in 2019', () => {
  const r18 = buildRoute(2018), r19 = buildRoute(2019);
  const w = (r, n) => r.waypoints.find(x => x.name === n);
  assert.ok(w(r18, 'São Paulo').arrive < w(r18, 'Buenos Aires').arrive - 25 * MIN, '2018: São Paulo a band ahead of Buenos Aires');
  assert.equal(w(r19, 'São Paulo').utc, w(r19, 'Buenos Aires').utc, '2019: same band');
});

test('orderBand strategies and the seeded PRNG are stable', () => {
  const a = mulberry32(hash32(2019, 3)), b = mulberry32(hash32(2019, 3));
  assert.equal(a(), b());
  assert.notEqual(hash32(2019, 3), hash32(2020, 3));
  const group = STOPS.filter(s => s.utc === 1);
  const o = orderBand(group, 2019, 7, null);
  assert.equal(o.order.length, group.length);
  assert.equal(new Set(o.order.map(s => s.name)).size, group.length);
  assert.ok(['nearest', 'north-south', 'south-north', 'east-west'].includes(o.strategy));
});

test('telemetry, log and track are deterministic and bounded', () => {
  const t = stops.find(s => s.name === 'Paris').arrive + 20 * 1000; // the UTC+1 band is dense: ~80 s per city
  const a = telemetry(stateAt(route, t)), b = telemetry(stateAt(route, t));
  assert.deepEqual(a, b);
  assert.ok(a.sackPct >= 0 && a.sackPct <= 100);
  const log = missionLog(stateAt(route, t));
  assert.equal(log.length, 6); assert.equal(log[0].name, 'Paris');
  const pts = track(route, route.launch, t);
  assert.ok(pts.length > 100);
  assert.equal(pts[0].lat, 90);
});
