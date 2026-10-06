// Dev-only: fetch and prepare the vendored assets (run by hand: `npm run assets`).
// Node >= 20, no npm deps. Everything lands under vendor/ and is inlined by build.mjs.
//  - Earth textures (three.js examples, NASA imagery)
//  - Quaternius reindeer GLB (CC0), stripped to the three clips we use
//  - three r152 GLTFLoader transformed to a plain script that reads the global THREE
//  - Fonts, subset to Latin with pyftsubset when fontTools is available
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'vendor');
for (const d of ['textures', 'models', 'fonts']) mkdirSync(join(vendor, d), { recursive: true });
const kb = n => `${(n / 1024).toFixed(1)} KB`;

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (santa-tracker asset prep)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
async function download(url, dest, magic) {
  const buf = await fetchBytes(url);
  if (magic && !buf.subarray(0, magic.length).equals(Buffer.from(magic, 'latin1'))) throw new Error(`unexpected file signature for ${url}`);
  writeFileSync(dest, buf);
  console.log(`  ${dest.replace(root + '\\', '').replace(root + '/', '')}  ${kb(buf.length)}`);
  return buf;
}

// ---------- 1. Earth textures ----------
console.log('textures');
const TEX = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/';
await download(TEX + 'earth_atmos_2048.jpg', join(vendor, 'textures', 'earth_atmos_2048.jpg'), '\xFF\xD8');
await download(TEX + 'earth_lights_2048.png', join(vendor, 'textures', 'earth_lights_2048.png'), '\x89PNG');
await download(TEX + 'earth_specular_2048.jpg', join(vendor, 'textures', 'earth_specular_2048.jpg'), '\xFF\xD8');

// ---------- 2. Reindeer GLB, stripped to Gallop / Idle / Idle_Headlow ----------
console.log('reindeer');
const KEEP_CLIPS = new Set(['Gallop', 'Idle', 'Idle_Headlow']);
function parseGlb(buf) {
  if (buf.toString('latin1', 0, 4) !== 'glTF') throw new Error('not a GLB');
  const total = buf.readUInt32LE(8);
  let off = 12; const chunks = [];
  while (off < total) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) });
    off += 8 + len;
  }
  const json = JSON.parse(chunks.find(c => c.type === 0x4E4F534A).data.toString('utf8'));
  const bin = (chunks.find(c => c.type === 0x004E4942) || { data: Buffer.alloc(0) }).data;
  return { json, bin };
}
function writeGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - js.length % 4, 0x20)]);
  if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - bin.length % 4, 0)]);
  const header = Buffer.alloc(12); header.write('glTF', 0, 'latin1'); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.writeUInt32LE(0x4E4F534A, 4);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(bin.length, 0); h2.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([header, h1, js, h2, bin]);
}
function stripAnimations(buf) {
  const { json, bin } = parseGlb(buf);
  const kept = (json.animations || []).filter(a => KEEP_CLIPS.has(a.name));
  if (kept.length !== KEEP_CLIPS.size) throw new Error(`expected clips ${[...KEEP_CLIPS]} but found ${kept.map(a => a.name)}`);
  json.animations = kept;
  // which accessors are still referenced
  const usedAcc = new Set();
  for (const m of json.meshes) for (const p of m.primitives) {
    for (const v of Object.values(p.attributes)) usedAcc.add(v);
    if (p.indices !== undefined) usedAcc.add(p.indices);
    for (const t of p.targets || []) for (const v of Object.values(t)) usedAcc.add(v);
  }
  for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
  for (const a of json.animations) for (const s of a.samplers) { usedAcc.add(s.input); usedAcc.add(s.output); }
  // remap accessors and the buffer views they use (plus image buffer views, if any)
  const accMap = new Map(); const newAcc = [];
  json.accessors.forEach((a, i) => { if (usedAcc.has(i)) { accMap.set(i, newAcc.length); newAcc.push(a); } });
  const usedBv = new Set();
  for (const a of newAcc) { if (a.bufferView !== undefined) usedBv.add(a.bufferView); if (a.sparse) { usedBv.add(a.sparse.indices.bufferView); usedBv.add(a.sparse.values.bufferView); } }
  for (const im of json.images || []) if (im.bufferView !== undefined) usedBv.add(im.bufferView);
  const bvMap = new Map(); const newBv = []; const parts = []; let offset = 0;
  json.bufferViews.forEach((bv, i) => {
    if (!usedBv.has(i)) return;
    const start = bv.byteOffset || 0, data = bin.subarray(start, start + bv.byteLength);
    const nb = { ...bv, byteOffset: offset, buffer: 0 };
    bvMap.set(i, newBv.length); newBv.push(nb); parts.push(data); offset += data.length;
    if (offset % 4) { const pad = Buffer.alloc(4 - offset % 4); parts.push(pad); offset += pad.length; }
  });
  for (const a of newAcc) { if (a.bufferView !== undefined) a.bufferView = bvMap.get(a.bufferView); if (a.sparse) { a.sparse.indices.bufferView = bvMap.get(a.sparse.indices.bufferView); a.sparse.values.bufferView = bvMap.get(a.sparse.values.bufferView); } }
  for (const im of json.images || []) if (im.bufferView !== undefined) im.bufferView = bvMap.get(im.bufferView);
  const re = i => { const n = accMap.get(i); if (n === undefined) throw new Error('dangling accessor ' + i); return n; };
  for (const m of json.meshes) for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = re(p.attributes[k]);
    if (p.indices !== undefined) p.indices = re(p.indices);
    for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = re(t[k]);
  }
  for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = re(s.inverseBindMatrices);
  for (const a of json.animations) for (const s of a.samplers) { s.input = re(s.input); s.output = re(s.output); }
  json.accessors = newAcc; json.bufferViews = newBv;
  const newBin = Buffer.concat(parts);
  json.buffers = [{ byteLength: newBin.length }];
  return writeGlb(json, newBin);
}
const fullDeer = await fetchBytes('https://static.poly.pizza/a9c69fbc-bf7c-4585-9a49-a82e0be1ac6b.glb');
console.log(`  original reindeer.glb  ${kb(fullDeer.length)} (not kept)`);
const deer = stripAnimations(fullDeer);
const deerPath = join(vendor, 'models', 'reindeer.glb');
writeFileSync(deerPath, deer);
{ // verify by re-parsing
  const { json, bin } = parseGlb(deer);
  const tris = json.meshes.reduce((a, m) => a + m.primitives.reduce((b, p) => b + (p.indices !== undefined ? json.accessors[p.indices].count / 3 : 0), 0), 0);
  for (const a of json.accessors) { const bv = json.bufferViews[a.bufferView]; if (bv.byteOffset + bv.byteLength > bin.length) throw new Error('buffer view out of range'); }
  console.log(`  vendor/models/reindeer.glb  ${kb(deer.length)}  meshes ${json.meshes.length}  skins ${(json.skins || []).length}  tris ${tris}  clips ${json.animations.map(a => a.name).join(', ')}`);
  if (deer.length > 450 * 1024) console.warn('  WARNING: stripped reindeer is larger than the 450 KB target');
}

// ---------- 3. GLTFLoader as a plain script ----------
console.log('gltfloader');
const loaderSrc = (await fetchBytes('https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js')).toString('utf8');
const utilsSrc = (await fetchBytes('https://unpkg.com/three@0.152.2/examples/jsm/utils/BufferGeometryUtils.js')).toString('utf8');
{
  const im = loaderSrc.match(/import \{([^}]*)\} from 'three';/s);
  if (!im) throw new Error('GLTFLoader: three import not found');
  let src = loaderSrc.replace(im[0], `const {${im[1]}} = THREE;`);
  src = src.replace(/import \{\s*toTrianglesDrawMode\s*\} from '\.\.\/utils\/BufferGeometryUtils\.js';/, '');
  if (!/export \{ GLTFLoader \};/.test(src)) throw new Error('GLTFLoader: export not found');
  src = src.replace(/export \{ GLTFLoader \};/, 'window.GLTFLoader = GLTFLoader; THREE.GLTFLoader = GLTFLoader;');
  const helperMatch = utilsSrc.match(/function toTrianglesDrawMode\([\s\S]*?\n\}\n/);
  if (!helperMatch) throw new Error('toTrianglesDrawMode not found in BufferGeometryUtils');
  let helper = helperMatch[0];
  for (const n of ['TriangleStripDrawMode', 'TriangleFanDrawMode', 'TrianglesDrawMode', 'BufferAttribute']) helper = helper.replace(new RegExp(`\\b${n}\\b`, 'g'), `THREE.${n}`);
  const out = `// three.js r152 GLTFLoader (MIT) transformed to use the global THREE; generated by tools/prepare-assets.mjs\n(function(){\n${helper}\n${src}\n})();\n`;
  if (/^import /m.test(out) || /^export /m.test(out)) throw new Error('GLTFLoader transform left module syntax');
  new Function(out); // parse check
  writeFileSync(join(vendor, 'three-gltfloader.js'), out);
  console.log(`  vendor/three-gltfloader.js  ${kb(out.length)}`);
}

// ---------- 4. Fonts ----------
console.log('fonts');
const FONTS = [
  { url: 'https://fonts.gstatic.com/s/mountainsofchristmas/v24/3y9z6a4zcCnn5X0FDyrKi2ZRUBIy8uxoUo7eBGqJJPxIOw.woff2', out: 'mountains-of-christmas-700-latin.woff2' },
  { url: 'https://fonts.gstatic.com/s/patrickhand/v25/LDI1apSQOAYtSuYWp8ZhfYe8XsLL.woff2', out: 'patrick-hand-400-latin.woff2' },
];
const haveFontTools = spawnSync('python', ['-c', 'import fontTools, brotli'], { encoding: 'utf8' }).status === 0
  || spawnSync('python', ['-m', 'pip', 'install', '--quiet', 'fonttools', 'brotli'], { encoding: 'utf8', stdio: 'inherit' }).status === 0;
for (const f of FONTS) {
  const raw = join(vendor, 'fonts', f.out + '.full');
  const buf = await download(f.url, raw, 'wOF2');
  const dest = join(vendor, 'fonts', f.out);
  if (haveFontTools) {
    const r = spawnSync('python', ['-m', 'fontTools.subset', raw, '--unicodes=U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-2019,U+201C-201D,U+2026,U+2212', '--flavor=woff2', '--layout-features=*', `--output-file=${dest}`], { encoding: 'utf8' });
    if (r.status !== 0) { console.warn('  pyftsubset failed, keeping the full file:\n' + r.stderr); writeFileSync(dest, buf); }
    unlinkSync(raw);
  } else { console.warn('  fontTools unavailable, keeping the unsubsetted file'); writeFileSync(dest, buf); unlinkSync(raw); }
  if (readFileSync(dest).toString('latin1', 0, 4) !== 'wOF2') throw new Error('font output is not woff2: ' + dest);
  console.log(`  vendor/fonts/${f.out}  ${kb(statSync(dest).size)}${haveFontTools ? ' (subset)' : ''}`);
}

// ---------- 5. Licenses ----------
writeFileSync(join(vendor, 'LICENSES.md'), `# Third-party assets bundled into dist/index.html

| Asset | Source | License |
|---|---|---|
| \`three.min.js\` (r152) and \`three-gltfloader.js\` (GLTFLoader r152, transformed by \`tools/prepare-assets.mjs\`) | https://github.com/mrdoob/three.js | MIT (see THREE-LICENSE.txt) |
| \`textures/earth_atmos_2048.jpg\`, \`textures/earth_lights_2048.png\`, \`textures/earth_specular_2048.jpg\` | three.js examples; imagery from NASA Visible Earth (Blue Marble, Black Marble) https://visibleearth.nasa.gov | NASA imagery is public domain; the files are distributed with three.js (MIT) |
| \`models/reindeer.glb\` (animations reduced to Gallop, Idle, Idle_Headlow) | "Reindeer" by Quaternius, https://poly.pizza/m/tQdzbZ1Cmw | CC0 1.0 |
| \`fonts/mountains-of-christmas-700-latin.woff2\` (Latin subset) | Mountains of Christmas by Tart Workshop, https://fonts.google.com/specimen/Mountains+of+Christmas | Apache License 2.0 |
| \`fonts/patrick-hand-400-latin.woff2\` (Latin subset) | Patrick Hand by Patrick Wagesreiter, https://fonts.google.com/specimen/Patrick+Hand | SIL Open Font License 1.1 |
| \`land-110m.json\` (in \`data/\`) | Natural Earth via world-atlas, https://github.com/topojson/world-atlas | Public domain |

The sleigh, every landmark, every building and tree are procedural (built from Three.js primitives in the page's own code), so no model assets beyond the reindeer are used.
`);
console.log('vendor/LICENSES.md written');
console.log('done');
