# Santa Tracker

*Santa rides the midnight line.*

A single-file Santa tracker: where the sleigh is right now, and, any day of
the year, where it will be on Christmas Eve. Live at **https://roho.foo/santa/**.

![Christmas Eve preview, 23:40 UTC: Santa over West Africa, the night side of Earth shaded from the real sun position](docs/preview.png)

## What it does

- **Live mode.** Before December 24 the sleigh is parked at the North Pole with
  a countdown to launch. During the flight it shows Santa's position, the city
  he is in or heading to, and the counters. After the flight: mission complete.
- **Christmas Eve preview** (the challenge's required "as if it were December
  24–25" mode). The same code with a simulated clock: a scrubber across the
  whole 27-hour flight, play at 1 minute to 1 hour per second, *Now, on
  Christmas Eve* (today's time of day, dropped onto the big night), and *My
  midnight* (jump to when Santa reaches your time zone). Any instant can be
  deep-linked with `?t=2026-12-24T18:00Z`.
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
- **Self-contained and private.** One HTML file, no external requests after
  load, no analytics, no geolocation.

## How the route works

Santa delivers at local midnight, so he must sweep westward one time zone per
hour. The 157 cities are grouped by their UTC offset on December 24 (standard
time in the north, summer time where the south observes it, with 2024's
Kazakhstan and Paraguay changes applied). Zones run from UTC+14 (Kiritimati,
10:00 UTC Dec 24) to UTC−11 (Pago Pago and Niue, 11:00 UTC Dec 25). Inside a
zone the cities are visited in a north–south serpentine spread across that
zone's hour, so every city is reached within 30 minutes of its midnight;
adjacent zones alternate direction so the path does not jump pole to pole.
Dwell per city is 30 % of the gap to the next one, capped at six minutes; in
between, the sleigh flies the great circle. Launch is one hour before the first
stop, home one hour after the last: 09:00 UTC Dec 24 to 12:15 UTC Dec 25.

The sun is the low-precision USNO algorithm (declination and subsolar point
from days since J2000, good to a hundredth of a degree). The terminator at
longitude λ is `atan(−cos(λ − λ_sun) / tan(δ))`; the dark polar cap is the
north one whenever δ < 0.

Everything is a pure function of `(year, time)`, which is what makes the
preview honest: it is not a demo reel, it is the live tracker with a different
clock. The year rolls over to the next Christmas once the sleigh is home.

## Layout

```
src/stops.mjs     157 cities: lat, lon, UTC offset on Dec 24, metro population
src/engine.mjs    pure engine: route, position at time t, sun/terminator, telemetry, log, TopoJSON decoder
src/ui.js         DOM + SVG rendering, modes, scrubber, keyboard, ?t= deep links
src/style.css     dark "ops dashboard" theme, phone-friendly
src/template.html page skeleton with /*__TOKENS__*/
data/land-110m.json  Natural Earth land, 110 m, from world-atlas@2 (public domain)
build.mjs         inlines everything into dist/index.html (~110 KB)
test/             node:test suite for the engine
```

```
npm test              # 16 engine tests
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
[world-atlas](https://github.com/topojson/world-atlas).
