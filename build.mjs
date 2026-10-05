// Santa Tracker build — inlines map data + engine + ui + style into a single
// self-contained dist/index.html (no imports, no external requests).
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');

const topo = JSON.parse(read('data/land-110m.json'));
const dataJs = `const LAND_TOPO=${JSON.stringify(topo)};`;

// strip ESM syntax so the modules run as one plain inline script
const stripEsm = src => src
  .replace(/^import\s[^\n]*\n/gm, '')
  .replace(/^export\s+(async\s+)?(function|const|let|var|class)/gm, '$1$2')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

const engineJs = stripEsm(read('src/stops.mjs')) + '\n' + stripEsm(read('src/engine.mjs'));
const uiJs = read('src/ui.js');
const view3dJs = read('src/three-view.js');
const styleCss = read('src/style.css');
// vendored Three.js (MIT); drop the UMD-deprecation console.warn on its first line
const threeJs = read('vendor/three.min.js').replace(/^console\.warn\([^\n]*\n/, '');
if (!/THREE/.test(threeJs.slice(0, 2000))) throw new Error('vendor/three.min.js does not look like Three.js');

let html = read('src/template.html')
  .replace('/*__STYLE__*/', () => styleCss)
  .replace('/*__DATA__*/', () => dataJs)
  .replace('/*__ENGINE__*/', () => engineJs)
  .replace('/*__THREE__*/', () => threeJs)
  .replace('/*__VIEW3D__*/', () => view3dJs)
  .replace('/*__UI__*/', () => uiJs);

if (/\/\*__[A-Z]+__\*\//.test(html)) throw new Error('unreplaced template token');
if (/^\s*(import|export)\s/m.test(html)) throw new Error('module syntax leaked into dist');

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'index.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KiB)`);
