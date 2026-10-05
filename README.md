# Santa Tracker

*The elves' own tracker. Not the one with the press office.*

A single-file Santa tracker framed as the North Pole's internal ops console,
mirrored to the web: where the sleigh is right now, the dress rehearsal for
Christmas Eve, a first-person 3D view from the sleigh, and ten years of past
runs. Live at **https://roho.foo/santa/**.

![Dress rehearsal, 01:10 UTC on Dec 25: Mission control with every delivered city lit, the sleigh over the Atlantic, the elf on duty and the dispatch log](docs/preview.png)

![From the sleigh, in 3D: over the rooftops of Tokyo, the lit skyline ahead, Sapporo labelled on the horizon](docs/santas-view.png)

![Parked at the Workshop: the candy-striped pole, the gingerbread hall, gumdrops and candy canes under the stars](docs/workshop-3d.png)

![Pre-flight: the Workshop board with wrapping progress and the pre-flight checklist](docs/workshop.png)

## What it does

- **The elves' framing.** Everything is written from inside the Workshop: a
  *Live feed* and a *Dress rehearsal* instead of a preview, a *Workshop board*
  before launch (presents wrapped so far and a pre-flight checklist that ticks
  itself off as the date approaches), an elf on duty with a four-hour shift
  roster, rotating notices from the departments, and a *Dispatch log* signed by
  whichever elf logged the stop. All of it is a deterministic function of the
  clock, so everyone sees the same elf and the same notice.
- **Live feed.** Before December 24 the sleigh is parked at the Workshop with
  a countdown to launch. During the flight it shows Santa's position, the city
  he is in or heading to, and the counters. After the flight: run complete.
- **Christmas Eve preview** (the challenge's required "as if it were December
  24–25" mode). The same code with a simulated clock: a scrubber across the
  whole 27-hour flight, play at 1 minute to 1 hour per second, *Now, on
  Christmas Eve* (today's time of day, dropped onto the big night), and *My
  midnight* (jump to when Santa reaches your time zone). Any instant can be
  deep-linked with `?t=2026-12-24T18:00Z`.
- **Two views.** *Mission control* is the whole world on an equirectangular
  map: a short fading tail behind the sleigh and every delivered city lit
  green, so the picture fills up as the night goes on. *From the sleigh* is
  Santa's point of view in real 3D: a WebGL globe (Three.js, vendored into the
  single file) with a chase camera just behind the sleigh looking along the
  heading. The night side comes from the real sun direction in the fragment
  shader with a warm band along the terminator, there is an atmosphere rim,
  a seeded starfield, the sun where it actually is, cities as lights with
  clamped point sizes, the dashed route ahead and the gold tail behind, the
  Workshop at the pole (a candy-striped pole with a lamp, a gingerbread hall,
  gumdrops and candy canes), toy-scale skylines for every city (a cluster of
  lit boxes sized by population: gold once delivered, dim before, red for the
  next stop; the camera swoops down behind the sleigh while Santa is on the
  rooftops so the skyline fills the view), and the reindeer team in the
  foreground with Rudolph's nose on. Drag to look around, scroll to climb,
  double-click to reset. When
  WebGL is unavailable the same view falls back to an SVG perspective
  renderer (azimuthal projection around the nadir, Sutherland–Hodgman against
  the horizon circle, near-plane clip). The choice sticks (`localStorage`) and
  `?view=pov` deep-links it.
- **Efficient routes.** Santa is all about efficiency. Inside each time zone
  the order is a travelling-salesman plan: nearest-neighbour tours from the
  cities closest to where the sleigh is coming from, polished with 2-opt
  until no two legs cross. The elves accept any plan within 6 % of the best
  one found, and the year's seed picks among those, so every year is a
  different route and every route is tight (about 320,000 km, each year
  within ~1 % of the best plan; the archive cards show the figure). Every
  route starts and ends at the Workshop.
- **A real map.** Natural Earth coastlines (110 m, embedded as TopoJSON and
  decoded in the page), the flown track in gold, upcoming stops dotted, and
  the **actual day/night terminator** computed from the sun's position for the
  instant on the clock. In December the entire Arctic sits in polar night, and
  Santa hugs the dashed solar-midnight line all the way around.
- **Telemetry.** Presents delivered, stops, distance, ground speed (Mach
  number included), next stop with ETA, when Santa reaches *your* time zone
  (computed from your browser's clock, using the December offset rather than
  today's), plus altitude, lead reindeer, cookie and milk intake, sack level,
  and a mission log with one deadpan note per city.
- **Every country.** 252 stops in 197 countries and territories: every country
  where someone is waiting up, one city each where only a capital was missing
  (Bethlehem stands in for Palestine, and yes, Vatican City gets a stop). Ten
  countries are left to sleep because public Christmas celebration there is
  banned or essentially absent; the list and the reason for each line are in
  `src/stops.mjs` (`SKIPPED`), where they can be argued with.
- **Flight archive.** The last ten Christmases, 2016 to 2026, as clickable
  mini-maps. Each year's plan is seeded by the year, so Santa never flies the
  same scribble twice and 2019 looks the same for everyone, forever. The stop
  list also carries real time-zone history (below), so when a country moved
  its clocks, its place in that year's route moved too. Past years render in
  the past tense with that year's real sun.
- **Dressed for the season.** Candy-cane stripes on every card, a string of
  twinkling lights and holly on the status card, gumdrop-glossy buttons,
  peppermint progress bars, a gingerbread Workshop board with icing and
  gumdrop checklist bullets, and gentle snowfall (an off switch lives in the
  footer, and it stays off; it also respects reduced-motion).
- **Self-contained and private.** One HTML file (about 790 KB, of which
  Three.js is 620 KB), no external requests after load, no analytics, no
  geolocation.

## How the route works

Santa delivers at local midnight, so he must sweep westward one time zone per
hour. The cities are grouped by their UTC offset on December 24 of the flight's
year (standard time in the north, summer time where the south observes it).
Zones run from UTC+14 (Kiritimati, 10:00 UTC Dec 24) to UTC−11 (Pago Pago and
Niue, 11:00 UTC Dec 25). Inside a zone the cities are spread evenly across that
zone's hour, so every city is reached within 30 minutes of its midnight; the
*order* inside the zone is the year's plan (`orderBand`): candidate tours are
nearest-neighbour from each of the four cities closest to where Santa is
coming from (the Workshop for the first zone) plus a few seeded starts, each
improved with 2-opt (`twoOpt`), and the seeded PRNG (`hash32(year,
zoneIndex)` → mulberry32) picks among the candidates within `PLAN_TOLERANCE`
(6 %) of the shortest. `route.efficiency` is best ÷ chosen over all zones.
Dwell per city is 30 % of the gap to the next one, capped at six minutes; in
between, the sleigh flies the great circle. Launch is one hour before the
first stop, home one hour after the last.

**Time-zone history** (`TZ_HISTORY` in `src/engine.mjs`): Samoa observed
summer time through 2020 (UTC+14 on Christmas Eve), Tonga tried it once in
2016, Fiji kept it through 2021, Brazil's summer time ended with 2018 (São
Paulo, Rio, Brasília on UTC−2 before that), Morocco was UTC+0 in winter
through 2017, Sudan was UTC+3 through 2016 and South Sudan through 2020,
Jordan and Syria changed their clocks through 2021 (UTC+2 in December),
Greenland was UTC−3 through 2022, and Kazakhstan's Almaty was UTC+6 through
2023. `routeChanges(year)` reports what moved versus the year before and the
page prints it under the archive.

The sun is the low-precision USNO algorithm (declination and subsolar point
from days since J2000, good to a hundredth of a degree). The terminator at
longitude λ is `atan(−cos(λ − λ_sun) / tan(δ))`; the dark polar cap is the
north one whenever δ < 0.

Everything is a pure function of `(year, time)`, which is what makes the
preview honest: it is not a demo reel, it is the live tracker with a different
clock. The year rolls over to the next Christmas once the sleigh is home.

## Layout

```
src/stops.mjs     252 cities (197 countries): lat, lon, UTC offset on Dec 24, metro population; SKIPPED list
src/engine.mjs    pure engine: route per year (seeded order + TZ history), position at time t, sun/terminator, telemetry, log, TopoJSON decoder
src/ui.js         DOM + SVG rendering, modes, year select + archive grid, scrubber, keyboard, ?t= / ?y= / ?view= deep links
src/three-view.js the 3D sleigh view (Three.js): globe shader, lights, route, chase camera, drag/zoom
vendor/           three.min.js r152 (MIT) + license, inlined by the build
src/style.css     dark "ops dashboard" theme, phone-friendly
src/template.html page skeleton with /*__TOKENS__*/
data/land-110m.json  Natural Earth land, 110 m, from world-atlas@2 (public domain)
build.mjs         inlines everything into dist/index.html (~110 KB)
test/             node:test suite for the engine
```

```
npm test              # 26 engine tests
node build.mjs        # writes dist/index.html
```

Deploy = copy `dist/index.html` to `santa/index.html` in the roho.foo site
repo (GitHub Pages serves it as a static file).

## Origin

Built for my employer's quarterly "build an application from scratch with AI"
challenge (Q4 2026 theme: a Santa tracker; required feature: a mode that shows
Santa's location as if the date were December 24–25). Designed and written in
conversation with Claude (Claude Code), including the tests and this README.
The twist (ride the real midnight line, shade the real night) was chosen so
that the preview mode falls out of the physics instead of being a canned
animation.

Not affiliated with NORAD, Google, or the North Pole.

## License

MIT. Map data: Natural Earth (public domain) via
[world-atlas](https://github.com/topojson/world-atlas). 3D rendering:
[Three.js](https://threejs.org) r152 (MIT), vendored in `vendor/`.
