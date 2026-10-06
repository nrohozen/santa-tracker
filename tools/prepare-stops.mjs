// Extend the curated stop list with Natural Earth populated places (public domain).
// Usage: node tools/prepare-stops.mjs [--min-pop=300000]
// Downloads ne_10m_populated_places.geojson (19 MB) into the OS temp dir (never into the repo), keeps places of
// at least --min-pop people outside the SKIPPED countries, derives each one's UTC offset on December 24 from its
// IANA time zone with Intl (nearest same-country neighbour when the zone is missing), drops near-duplicates of the
// curated stops, and writes the result into src/stops.mjs between the GENERATED markers.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, true]; }));
const MIN_POP = +(args['min-pop'] || 300000);
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson';
const cache = join(tmpdir(), 'ne_10m_populated_places.geojson');
if (!existsSync(cache)) {
  const res = await fetch(URL); if (!res.ok) throw new Error(`download failed: ${res.status}`);
  writeFileSync(cache, Buffer.from(await res.arrayBuffer()));
}
const { STOPS, SKIPPED } = await import('../src/stops.mjs');
const curated = STOPS.filter(s => !s.generated);
const skipped = new Set(SKIPPED.map(k => k.country));

// Natural Earth country names → the names the curated list and scenery.mjs use
const COUNTRY = {
  'United States of America': 'USA', 'United Arab Emirates': 'UAE', 'Turkey': 'Türkiye', 'Ivory Coast': "Côte d'Ivoire",
  'Congo (Kinshasa)': 'DR Congo', 'Democratic Republic of the Congo': 'DR Congo', 'Congo (Brazzaville)': 'Republic of the Congo',
  'Guinea Bissau': 'Guinea-Bissau', 'Hong Kong S.A.R.': 'China', 'Macau S.A.R': 'China', 'Macao S.A.R': 'China', 'Somaliland': 'Somalia',
  'Republic of Serbia': 'Serbia', 'United Republic of Tanzania': 'Tanzania', 'The Bahamas': 'Bahamas', 'The Gambia': 'Gambia',
  'Cape Verde': 'Cabo Verde', 'East Timor': 'Timor-Leste', 'Swaziland': 'Eswatini', 'eSwatini': 'Eswatini', 'Macedonia': 'North Macedonia',
  'Federated States of Micronesia': 'Micronesia', 'Saint Lucia': 'St Lucia', 'Saint Kitts and Nevis': 'St Kitts and Nevis',
  'Saint Vincent and the Grenadines': 'St Vincent and the Grenadines', 'Czech Republic': 'Czechia', 'Sao Tome and Principe': 'São Tomé and Príncipe',
  'Northern Cyprus': 'Cyprus', 'Western Sahara': 'Morocco', 'Brunei Darussalam': 'Brunei', 'Burma': 'Myanmar', 'Vatican (Holy See)': 'Vatican City',
};

const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const R = 6371, rad = d => d * Math.PI / 180;
const km = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const offsetCache = new Map();
function offsetFor(tz) {
  if (!tz) return null;
  if (offsetCache.has(tz)) return offsetCache.get(tz);
  let off = null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(Date.UTC(2026, 11, 24, 12)));
    const s = parts.find(p => p.type === 'timeZoneName').value; const m = s.match(/GMT([+-])(\d{2}):(\d{2})/);
    off = m ? (m[1] === '-' ? -1 : 1) * (+m[2] + m[3] / 60) : (s === 'GMT' ? 0 : null);
  } catch { off = null; }
  offsetCache.set(tz, off); return off;
}

const feats = JSON.parse(readFileSync(cache, 'utf8')).features;
const places = feats.map(f => { const p = f.properties; return { name: p.NAME, country: COUNTRY[p.ADM0NAME] || p.ADM0NAME, lat: +p.LATITUDE.toFixed(2), lon: +p.LONGITUDE.toFixed(2), pop: p.POP_MAX, tz: p.TIMEZONE, utc: offsetFor(p.TIMEZONE) }; });
const withTz = places.filter(p => p.utc !== null);
const big = places.filter(p => p.pop >= MIN_POP && !skipped.has(p.country));
const wrapLon = l => ((l + 540) % 360 + 360) % 360 - 180;
const implausible = p => p.utc !== null && Math.abs(wrapLon(p.lon - 15 * p.utc)) > 45; // e.g. Natural Earth gives Cardiff (Wales) an Australian zone
let borrowed = 0, corrected = 0;
for (const p of big) if (implausible(p)) { corrected++; p.utc = null; }
for (const p of big) if (p.utc === null) { let best = null; for (const q of withTz) { if (q === p || q.country !== p.country || implausible(q)) continue; const d = km(p, q); if (!best || d < best.d) best = { d, q }; } if (!best) for (const q of withTz) { if (q === p || implausible(q)) continue; const d = km(p, q); if (!best || d < best.d) best = { d, q }; } p.utc = best.q.utc; borrowed++; }

const curatedKeys = new Set(curated.map(s => fold(s.name) + '|' + s.country));
const added = [], seen = new Set();
for (const p of big.sort((a, b) => b.pop - a.pop)) {
  const key = fold(p.name) + '|' + p.country;
  if (curatedKeys.has(key) || seen.has(key)) continue;
  if (curated.some(s => km(s, p) < 25) || added.some(s => km(s, p) < 12)) continue; // the same metro, or a suburb
  seen.add(key);
  added.push({ name: p.name, country: p.country, lat: p.lat, lon: p.lon, utc: p.utc, pop: +(p.pop / 1e6).toFixed(3) });
}
const unknownCountries = [...new Set(added.map(a => a.country))].filter(c => !curated.some(s => s.country === c));

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = added.map(a => `  { name: '${esc(a.name)}', country: '${esc(a.country)}', lat: ${a.lat}, lon: ${a.lon}, utc: ${a.utc}, pop: ${a.pop}, generated: true },`);
const block = `  // <GENERATED by tools/prepare-stops.mjs: Natural Earth populated places with POP_MAX >= ${MIN_POP}, public domain; do not edit by hand>\n${lines.join('\n')}\n  // </GENERATED>\n`;
const src = readFileSync(join(root, 'src/stops.mjs'), 'utf8');
const start = src.indexOf('  // <GENERATED'), end = src.indexOf('  // </GENERATED>\n');
let out;
if (start >= 0 && end >= 0) out = src.slice(0, start) + block + src.slice(end + '  // </GENERATED>\n'.length);
else { const anchor = src.lastIndexOf('];', src.indexOf('export const SKIPPED')); out = src.slice(0, anchor) + block + src.slice(anchor); }
writeFileSync(join(root, 'src/stops.mjs'), out);
console.log(`Natural Earth places: ${feats.length}; >= ${MIN_POP}: ${big.length} (offset borrowed for ${borrowed}, corrected for ${corrected}); added ${added.length} to ${curated.length} curated = ${curated.length + added.length} stops`);
if (unknownCountries.length) console.log('countries new to the list:', unknownCountries.join(', '));
const bands = {}; for (const s of [...curated, ...added]) bands[s.utc] = (bands[s.utc] || 0) + 1;
console.log('largest bands:', Object.entries(bands).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u, n]) => `UTC${u >= 0 ? '+' : ''}${u}: ${n}`).join(', '));
