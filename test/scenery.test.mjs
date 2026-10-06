import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { STOPS } from '../src/stops.mjs';
import {
  strHash, KITS, REGION_COUNTRIES, regionFor, climateFor, LANDMARKS, WORKSHOP_LANDMARK, WORKSHOP_STOP, landmarkFor,
  PROP_TYPES, KIT_RECIPES, sceneSpec,
} from '../src/scenery.mjs';

const byName = n => STOPS.find(s => s.name === n);

test('strHash is a stable 32-bit hash', () => {
  assert.equal(strHash('Moscow'), strHash('Moscow'));
  assert.notEqual(strHash('Moscow'), strHash('Paris'));
  assert.ok(strHash('Tokyo') >= 0 && strHash('Tokyo') <= 0xFFFFFFFF);
});

test('every stop resolves to a kit, and the country tables are consistent', () => {
  assert.equal(KITS.length, 12);
  for (const k of KITS) assert.ok(Array.isArray(REGION_COUNTRIES[k]) && REGION_COUNTRIES[k].length > 0, k);
  const unmapped = STOPS.filter(s => !Object.values(REGION_COUNTRIES).flat().includes(s.country)).map(s => s.country);
  assert.deepEqual([...new Set(unmapped)], [], 'countries without an explicit kit');
  for (const s of STOPS) assert.ok(KITS.includes(regionFor(s)), `${s.name}: ${regionFor(s)}`);
  assert.equal(regionFor(byName('Moscow')), 'eastern');
  assert.equal(regionFor(byName('Sydney')), 'north-american');
  assert.equal(regionFor(byName('Nairobi')), 'african');
  assert.equal(regionFor(byName('Ulaanbaatar')), 'east-asia');
  assert.equal(regionFor({ country: 'Nowhere', lat: 10 }), 'island');
  assert.equal(regionFor({ country: 'Nowhere', lat: 50 }), 'european');
});

test('climate: booleans, haze range, no snow south of the equator, the obvious cities', () => {
  for (const s of STOPS) {
    const c = climateFor(s);
    assert.equal(typeof c.snow, 'boolean'); assert.equal(typeof c.palms, 'boolean');
    assert.ok(c.haze >= 0.35 && c.haze <= 0.8, `${s.name} haze ${c.haze}`);
    if (s.lat < 0) assert.equal(c.snow, false, `${s.name} snows south of the equator`);
  }
  for (const n of ['Moscow', 'Ulaanbaatar', 'Reykjavík', 'Columbus']) assert.equal(climateFor(byName(n)).snow, true, n);
  for (const n of ['Honolulu', 'Singapore', 'Rio de Janeiro', 'Cairo']) assert.equal(climateFor(byName(n)).palms, true, n);
  assert.equal(climateFor(byName('Nairobi')).snow, false);
  assert.equal(climateFor(byName('Moscow'), new Date(Date.UTC(2026, 6, 1))).snow, false, 'no snow in July');
});

test('every landmark key is a real stop and the famous ones map correctly', () => {
  for (const name of Object.keys(LANDMARKS)) assert.ok(byName(name), `${name} is not a stop`);
  const want = { 'Moscow': 'stbasil', 'Paris': 'eiffel', 'Tokyo': 'tokyotower', 'Cairo': 'giza', 'Sydney': 'opera', 'Rio de Janeiro': 'redeemer', 'Columbus': 'leveque' };
  for (const [n, id] of Object.entries(want)) assert.equal(landmarkFor(byName(n)).id, id, n);
  assert.equal(landmarkFor(byName('Nairobi')), null);
  assert.equal(landmarkFor(byName('Ulaanbaatar')), null);
  for (const l of Object.values(LANDMARKS)) { assert.ok(l.heightKm > 0 && l.heightKm < 1); assert.ok(l.footprintKm >= 0.2 && l.footprintKm <= 1.2); assert.ok(l.label); }
  assert.equal(landmarkFor(WORKSHOP_STOP), WORKSHOP_LANDMARK);
});

test('kit recipes only use known prop types and have positive weights', () => {
  assert.equal(PROP_TYPES.length, 19);
  for (const k of KITS) {
    const r = KIT_RECIPES[k];
    assert.ok(r, k);
    const total = Object.values(r.weights).reduce((a, b) => a + b, 0);
    assert.ok(total > 0, k);
    for (const t of Object.keys(r.weights)) { assert.ok(PROP_TYPES.includes(t), `${k}: ${t}`); assert.ok(r.sizes[t][0] > 0 && r.sizes[t][1] >= r.sizes[t][0]); }
  }
});

test('sceneSpec is deterministic, bounded, and respects the exclusion zone', () => {
  for (const n of ['Moscow', 'Tokyo', 'Nairobi', 'Honolulu', 'Funafuti', 'Cairo']) {
    const s = byName(n);
    const a = sceneSpec(s, 2026), b = sceneSpec(s, 2026);
    assert.deepEqual(a, b, `${n} deterministic`);
    assert.notDeepEqual(a.props, sceneSpec(s, 2025).props, `${n} differs by year`);
    assert.ok(a.props.length >= 40 && a.props.length <= 650, `${n} ${a.props.length} props`);
    assert.ok(a.radiusKm >= 6 && a.radiusKm <= 16);
    const excl = Math.max(0.4, a.landmark ? a.landmark.footprintKm : 0);
    for (const p of a.props) {
      assert.ok(PROP_TYPES.includes(p.type), p.type);
      const r = Math.hypot(p.x, p.z);
      assert.ok(r <= a.radiusKm + 1e-6, `${n} prop outside radius`);
      assert.ok(r >= excl - 1e-6, `${n} ${p.type} inside the exclusion zone (${r} < ${excl})`);
      assert.ok(p.w > 0 && p.h > 0 && p.d > 0 && p.h <= 1.2, `${n} sizes`);
      assert.ok(Number.isInteger(p.variant) && p.variant >= 0 && p.variant <= 3);
      if (!a.climate.snow) assert.equal(p.snowcap, false);
      if (p.type === 'water') assert.equal(p.snowcap, false);
    }
    if (a.climate.snow) { assert.ok(a.props.some(p => p.type === 'pine'), `${n} snowy but no pines`); assert.ok(!a.props.some(p => p.type === 'palm'), `${n} snowy with palms`); }
    if (a.climate.palms && !a.climate.snow) assert.ok(a.props.some(p => p.type === 'palm'), `${n} tropical but no palms`);
    assert.ok(a.props.filter(p => p.type === 'water').length <= 3);
  }
  assert.equal(sceneSpec(byName('Tokyo'), 2026).props.length, Math.min(600, 150 + Math.round(450 * Math.min(1, Math.log10(1 + 37)))));
  assert.ok(!sceneSpec(byName('Moscow'), 2026).props.some(p => p.type === 'water'), 'inland kit has no water');
});

test('the Workshop spec', () => {
  const w = sceneSpec(WORKSHOP_STOP, 2026);
  assert.equal(w.kit, 'nordic');
  assert.deepEqual(w.landmark, { id: 'workshop', label: 'The Workshop', heightKm: 0.08, footprintKm: 0.5 });
  assert.equal(w.climate.snow, true);
  assert.ok(w.props.length >= 40);
});

test('every landmark id has a Three.js builder', (t) => {
  const file = new URL('../src/three-scenery.js', import.meta.url);
  if (!existsSync(file)) { t.skip('src/three-scenery.js not written yet'); return; }
  const src = readFileSync(file, 'utf8');
  const builders = new Set([...src.matchAll(/B\.(\w+)\s*=/g)].map(m => m[1]));
  const ids = [...new Set([...Object.values(LANDMARKS).map(l => l.id), 'workshop'])];
  for (const id of ids) assert.ok(builders.has(id), `no builder for landmark '${id}'`);
});
