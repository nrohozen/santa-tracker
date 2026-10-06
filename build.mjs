// Santa Tracker build — inlines map data + engine + Three.js + loader + assets + fonts + ui + style
// into a single self-contained dist/index.html (no imports, no external requests).
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');
const has = p => existsSync(join(root, p));
const bytes = p => readFileSync(join(root, p));
const magic = (buf, sig, what) => { if (!buf.subarray(0, sig.length).equals(Buffer.from(sig, 'latin1'))) throw new Error(`${what}: unexpected file signature`); return buf; };

const topo = JSON.parse(read('data/land-110m.json'));
const dataJs = `const LAND_TOPO=${JSON.stringify(topo)};`;

// strip ESM syntax so the modules run as one plain inline script
const stripEsm = src => src
  .replace(/^import\s[^\n]*\n/gm, '')
  .replace(/^export\s+(async\s+)?(function|const|let|var|class)/gm, '$1$2')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

let engineJs = stripEsm(read('src/stops.mjs')) + '\n' + stripEsm(read('src/engine.mjs'));
if (has('src/scenery.mjs')) engineJs += '\n' + stripEsm(read('src/scenery.mjs'));
const uiJs = read('src/ui.js');
const view3dJs = read('src/three-view.js');
const sceneryJs = has('src/three-scenery.js') ? read('src/three-scenery.js') : '/* three-scenery.js pending */';
const sleighJs = has('src/three-sleigh.js') ? read('src/three-sleigh.js') : '/* three-sleigh.js pending */';
const audioJs = has('src/audio.js') ? read('src/audio.js') : '/* audio.js pending */';
const styleCss = read('src/style.css');

// vendored Three.js (MIT); drop the UMD-deprecation console.warn on its first line
const threeJs = read('vendor/three.min.js').replace(/^console\.warn\([^\n]*\n/, '');
if (!/THREE/.test(threeJs.slice(0, 2000))) throw new Error('vendor/three.min.js does not look like Three.js');
const gltfLoaderJs = read('vendor/three-gltfloader.js');
if (!/GLTFLoader/.test(gltfLoaderJs)) throw new Error('vendor/three-gltfloader.js does not look like the loader');

// fonts → @font-face with base64 data URIs (see vendor/LICENSES.md)
const fontFace = (family, weight, file) => {
  const buf = magic(bytes(`vendor/fonts/${file}`), 'wOF2', file);
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${buf.toString('base64')}) format("woff2");}`;
};
const fontsCss = fontFace('Mountains of Christmas', 700, 'mountains-of-christmas-700-latin.woff2') + '\n' + fontFace('Patrick Hand', 400, 'patrick-hand-400-latin.woff2');

// binary assets → base64 constants
const assetsJs = `const ASSETS = {
  earthDay: 'data:image/jpeg;base64,${magic(bytes('vendor/textures/earth_atmos_2048.jpg'), '\xFF\xD8', 'earth day').toString('base64')}',
  earthLights: 'data:image/png;base64,${magic(bytes('vendor/textures/earth_lights_2048.png'), '\x89PNG', 'earth lights').toString('base64')}',
  earthSpecular: 'data:image/jpeg;base64,${magic(bytes('vendor/textures/earth_specular_2048.jpg'), '\xFF\xD8', 'earth specular').toString('base64')}',
  reindeer: '${magic(bytes('vendor/models/reindeer.glb'), 'glTF', 'reindeer').toString('base64')}',
};`;

const tokens = {
  '/*__FONTS__*/': fontsCss,
  '/*__STYLE__*/': styleCss,
  '/*__DATA__*/': dataJs,
  '/*__ENGINE__*/': engineJs,
  '/*__THREE__*/': threeJs,
  '/*__GLTFLOADER__*/': gltfLoaderJs,
  '/*__ASSETS__*/': assetsJs,
  '/*__SCENERY__*/': sceneryJs,
  '/*__SLEIGH__*/': sleighJs,
  '/*__AUDIO__*/': audioJs,
  '/*__VIEW3D__*/': view3dJs,
  '/*__UI__*/': uiJs,
};
let html = read('src/template.html');
const missing = [];
for (const [tok, value] of Object.entries(tokens)) {
  if (!html.includes(tok)) { missing.push(tok); continue; }
  html = html.replace(tok, () => value);
}
if (missing.length) console.warn(`warning: template is missing tokens: ${missing.join(' ')}`);

if (/\/\*__[A-Z0-9]+__\*\//.test(html)) throw new Error('unreplaced template token');
if (/^\s*(import|export)\s/m.test(html)) throw new Error('module syntax leaked into dist');

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'index.html');
writeFileSync(out, html);
const size = Buffer.byteLength(html);
console.log(`wrote ${out} (${(size / 1024).toFixed(1)} KiB)`);
if (size > 3.5 * 1024 * 1024) throw new Error(`dist is ${(size / 1024 / 1024).toFixed(2)} MiB, over the 3.5 MiB ceiling`);
