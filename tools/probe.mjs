// Probe the built page in headless Edge with software WebGL and assert on SantaGL.debug(), not on pixels.
// Usage: node tools/probe.mjs [--t=2026-12-24T20:45:30Z | --live] [--expect-landmark=stbasil] [--expect-city=Moscow]
// Writes an instrumented copy of dist/index.html to the OS temp dir (never into the repo), dumps the DOM after
// the virtual-time budget, and checks: the WebGL path is active (not the SVG fallback), the diorama for the city
// is attached, the landmark id, fog, camera altitude, near plane, draw calls and the reindeer team.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const inject = `<script>window.__log=[];['error','warn'].forEach(k=>{const o=console[k].bind(console);console[k]=(...a)=>{window.__log.push(k+': '+a.map(x=>x&&x.message?x.message:String(x)).join(' ').slice(0,300));o(...a);};});window.addEventListener('error',e=>window.__log.push('uncaught: '+e.message+' @'+e.lineno));
setTimeout(()=>{ try { const gl=document.getElementById('gl'); const d=window.SantaGL&&SantaGL.debug?SantaGL.debug():{}; document.body.dataset.probe=JSON.stringify(Object.assign({gl: !!gl && !gl.hasAttribute('hidden'), svgFallback: !document.getElementById('pov').hasAttribute('hidden'), log: window.__log.slice(0,6)}, d)); } catch(e){ document.body.dataset.probe=JSON.stringify({error:String(e)}); } }, 6500);</script>`;
const dir = join(tmpdir(), 'santa-probe'); mkdirSync(dir, { recursive: true });
const file = join(dir, 'probe.html'); writeFileSync(file, html.replace('<head>', '<head>' + inject));
const q = args.live ? 'view=pov' : `t=${args.t || '2026-12-24T20:45:30Z'}&view=pov`;
const url = pathToFileURL(file).href + '?' + q;
const out = execFileSync(EDGE, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=9000', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const m = out.match(/data-probe="([^"]*)"/);
if (!m) { console.error('no probe output'); process.exit(2); }
const probe = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
console.log(JSON.stringify(probe, null, 1));
const fails = [];
const must = (cond, msg) => { if (!cond) fails.push(msg); };
must(probe.gl === true && probe.svgFallback === false, 'WebGL path active (not the SVG fallback)');
must(!probe.log || probe.log.length === 0, 'no console errors: ' + JSON.stringify(probe.log));
must(probe.passes === 3, 'three render passes');
must(probe.earthTextures && probe.earthTextures[0] && probe.earthTextures[1], 'earth day + lights textures loaded');
must(probe.reindeer >= 5, 'reindeer attached (' + probe.reindeer + ')');
must(probe.mixersRunning, 'animation mixers running');
if (args['expect-city']) must(probe.city === args['expect-city'] && probe.dioramas.includes(args['expect-city']), `city diorama ${args['expect-city']} attached`);
if (args['expect-landmark']) must(probe.landmark === args['expect-landmark'], `landmark ${args['expect-landmark']} (got ${probe.landmark})`);
if (!args.live) { must(probe.fogDensity > 100, 'fog present at the rooftops'); must(probe.camAltKm > 0.04 && probe.camAltKm < 2.5, 'camera at sleigh height (' + probe.camAltKm + ' km)'); }
must(probe.drawCalls < 160, 'draw calls < 160 (' + probe.drawCalls + ')');
if (fails.length) { console.error('\nPROBE FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('\nprobe ok');
