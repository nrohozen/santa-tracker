# Third-party assets bundled into dist/index.html

| Asset | Source | License |
|---|---|---|
| `three.min.js` (r152) and `three-gltfloader.js` (GLTFLoader r152, transformed by `tools/prepare-assets.mjs`) | https://github.com/mrdoob/three.js | MIT (see THREE-LICENSE.txt) |
| `textures/earth_atmos_2048.jpg`, `textures/earth_lights_2048.png`, `textures/earth_specular_2048.jpg` | three.js examples; imagery from NASA Visible Earth (Blue Marble, Black Marble) https://visibleearth.nasa.gov | NASA imagery is public domain; the files are distributed with three.js (MIT) |
| `models/reindeer.glb` (animations reduced to Gallop, Idle, Idle_Headlow) | "Reindeer" by Quaternius, https://poly.pizza/m/tQdzbZ1Cmw | CC0 1.0 |
| `fonts/mountains-of-christmas-700-latin.woff2` (Latin subset) | Mountains of Christmas by Tart Workshop, https://fonts.google.com/specimen/Mountains+of+Christmas | Apache License 2.0 |
| `fonts/patrick-hand-400-latin.woff2` (Latin subset) | Patrick Hand by Patrick Wagesreiter, https://fonts.google.com/specimen/Patrick+Hand | SIL Open Font License 1.1 |
| `land-110m.json` (in `data/`) | Natural Earth via world-atlas, https://github.com/topojson/world-atlas | Public domain |

The sleigh, every landmark, every building and tree are procedural (built from Three.js primitives in the page's own code), so no model assets beyond the reindeer are used.
