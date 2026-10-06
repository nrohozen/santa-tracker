// Scenery data layer — pure functions, no DOM, no Three.js.
// Decides what a city looks like from the sleigh: which regional kit of
// buildings and trees, what the December climate is, which landmark (if any)
// and a deterministic list of placed props. The Three.js builders consume
// `sceneSpec`; the tests consume the same thing.

import { hash32, mulberry32 } from './engine.mjs';

// FNV-1a 32-bit: a stable seed from a city name (stop indices shift between years).
export function strHash(str) {
  let h = 0x811C9DC5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const KITS = ['nordic', 'european', 'eastern', 'middle-east', 'south-asia', 'east-asia', 'tropical-asia', 'sahel', 'african', 'latin', 'north-american', 'island'];

export const REGION_COUNTRIES = {
  'nordic': ['Finland', 'Sweden', 'Norway', 'Denmark', 'Iceland', 'Greenland', 'Estonia', 'Latvia', 'Lithuania'],
  'european': ['United Kingdom', 'Ireland', 'France', 'Germany', 'Netherlands', 'Belgium', 'Luxembourg', 'Switzerland', 'Liechtenstein', 'Austria', 'Czechia', 'Poland', 'Slovakia', 'Hungary', 'Slovenia', 'Croatia', 'Bosnia and Herzegovina', 'Serbia', 'Montenegro', 'Kosovo', 'North Macedonia', 'Albania', 'Romania', 'Bulgaria', 'Greece', 'Italy', 'San Marino', 'Vatican City', 'Malta', 'Spain', 'Portugal', 'Andorra', 'Monaco', 'Azores', 'Cyprus'],
  'eastern': ['Russia', 'Ukraine', 'Belarus', 'Moldova', 'Georgia', 'Armenia'],
  'middle-east': ['UAE', 'Iran', 'Iraq', 'Türkiye', 'Egypt', 'Israel', 'Palestine', 'Jordan', 'Syria', 'Lebanon', 'Oman', 'Kuwait', 'Bahrain', 'Qatar', 'Azerbaijan', 'Turkmenistan', 'Uzbekistan', 'Kazakhstan', 'Kyrgyzstan', 'Algeria', 'Morocco', 'Tunisia'],
  'south-asia': ['India', 'Bangladesh', 'Nepal', 'Bhutan', 'Sri Lanka', 'Pakistan'],
  'east-asia': ['Japan', 'South Korea', 'China', 'Taiwan', 'Mongolia'],
  'tropical-asia': ['Vietnam', 'Thailand', 'Malaysia', 'Singapore', 'Indonesia', 'Philippines', 'Myanmar', 'Cambodia', 'Laos', 'Timor-Leste', 'Papua New Guinea', 'Guam'],
  'sahel': ['Niger', 'Mali', 'Burkina Faso', 'Senegal', 'Gambia', 'Sudan', 'Eritrea', 'Djibouti', 'Chad'],
  'african': ['Nigeria', 'DR Congo', 'Angola', 'Ghana', 'Ethiopia', 'Kenya', 'South Africa', 'South Sudan', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi', 'Mozambique', 'Zimbabwe', 'Zambia', 'Malawi', 'Botswana', 'Namibia', 'Lesotho', 'Eswatini', 'Guinea-Bissau', 'Guinea', 'Sierra Leone', 'Liberia', 'Togo', 'Benin', 'Cameroon', 'Central African Republic', 'Equatorial Guinea', 'Gabon', 'Republic of the Congo', 'Madagascar', "Côte d'Ivoire"],
  'latin': ['Mexico', 'Guatemala', 'Costa Rica', 'Honduras', 'El Salvador', 'Nicaragua', 'Panama', 'Belize', 'Colombia', 'Venezuela', 'Ecuador', 'Peru', 'Bolivia', 'Brazil', 'Paraguay', 'Uruguay', 'Argentina', 'Chile', 'Guyana', 'Suriname', 'Cuba', 'Jamaica', 'Haiti', 'Dominican Republic', 'Puerto Rico', 'Bahamas', 'Barbados', 'Trinidad and Tobago', 'St Vincent and the Grenadines', 'St Lucia', 'Dominica', 'St Kitts and Nevis', 'Grenada', 'Antigua and Barbuda'],
  'north-american': ['USA', 'Canada', 'Australia', 'New Zealand'],
  'island': ['Kiribati', 'Samoa', 'Tonga', 'Fiji', 'Marshall Islands', 'Solomon Islands', 'New Caledonia', 'Marquesas', 'French Polynesia', 'Cook Islands', 'American Samoa', 'Niue', 'Tuvalu', 'Nauru', 'Vanuatu', 'Micronesia', 'Palau', 'Mauritius', 'Comoros', 'Seychelles', 'Cabo Verde', 'São Tomé and Príncipe', 'Maldives'],
};
const COUNTRY_KIT = new Map();
for (const kit of KITS) for (const c of REGION_COUNTRIES[kit]) COUNTRY_KIT.set(c, kit);

export function regionFor(stop) {
  if (stop.country === 'Russia') return 'eastern';
  if (stop.country === 'Australia' || stop.country === 'New Zealand') return 'north-american';
  const k = COUNTRY_KIT.get(stop.country);
  if (k) return k;
  return Math.abs(stop.lat) < 23 ? 'island' : 'european';
}

export const COLD_CITIES = new Set(['Denver', 'Chicago', 'Boston', 'Columbus', 'New York', 'Halifax', 'Sapporo', 'Vladivostok', 'Almaty', 'Bishkek', 'Thimphu', 'Seoul', 'Yerevan', 'Bucharest', 'Sofia', 'Sarajevo', 'Belgrade', 'Pristina', 'Skopje', 'Andorra la Vella', 'Ulaanbaatar', 'North Pole']);
export const PALM_CITIES = new Set(['Los Angeles', 'Miami', 'Phoenix', 'Houston', 'Tijuana', 'Casablanca', 'Algiers', 'Tunis', 'Lisbon', 'Valletta', 'Athens', 'Cairo', 'Jerusalem', 'Bethlehem', 'Beirut', 'Damascus', 'Amman', 'Baghdad', 'Kuwait City', 'Perth', 'Sydney', 'Adelaide', 'Cape Town', 'Buenos Aires', 'Santiago', 'Montevideo', 'Nicosia']);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// December climate as the sleigh would see it. `dateUtc` is accepted so the
// signature is stable; snow is a northern-winter thing (Nov–Feb).
export function climateFor(stop, dateUtc = new Date(Date.UTC(2026, 11, 24))) {
  const month = new Date(dateUtc).getUTCMonth();
  const winter = month >= 10 || month <= 1;
  const snow = winter && stop.lat >= 0 && (stop.lat >= 45 || COLD_CITIES.has(stop.name));
  const palms = Math.abs(stop.lat) < 25 || PALM_CITIES.has(stop.name);
  const haze = clamp(0.4 + 0.12 * Math.log10(1 + (stop.pop || 0)) + (snow ? 0.1 : 0), 0.35, 0.8);
  return { snow, palms, haze };
}

// Landmarks by exact stop name. heightKm/footprintKm are the real things, roughly.
export const LANDMARKS = {
  'Moscow': { id: 'stbasil', label: "St Basil's", heightKm: 0.065, footprintKm: 0.3 },
  'Paris': { id: 'eiffel', label: 'the Eiffel Tower', heightKm: 0.33, footprintKm: 0.25 },
  'London': { id: 'bigben', label: 'Big Ben', heightKm: 0.096, footprintKm: 0.5 },
  'New York': { id: 'liberty', label: 'the Statue of Liberty', heightKm: 0.093, footprintKm: 0.9 },
  'Sydney': { id: 'opera', label: 'the Opera House', heightKm: 0.067, footprintKm: 0.8 },
  'Tokyo': { id: 'tokyotower', label: 'Tokyo Tower', heightKm: 0.333, footprintKm: 0.3 },
  'Cairo': { id: 'giza', label: 'the Pyramids', heightKm: 0.14, footprintKm: 1.2 },
  'Dubai': { id: 'burj', label: 'the Burj Khalifa', heightKm: 0.83, footprintKm: 0.6 },
  'Rio de Janeiro': { id: 'redeemer', label: 'Christ the Redeemer', heightKm: 0.74, footprintKm: 1.0 },
  'Rome': { id: 'colosseum', label: 'the Colosseum', heightKm: 0.048, footprintKm: 0.3 },
  'Vatican City': { id: 'stpeters', label: "St Peter's", heightKm: 0.137, footprintKm: 0.4 },
  'Kuala Lumpur': { id: 'petronas', label: 'the Petronas Towers', heightKm: 0.452, footprintKm: 0.3 },
  'Shanghai': { id: 'pearl', label: 'the Oriental Pearl', heightKm: 0.468, footprintKm: 0.5 },
  'San Francisco': { id: 'goldengate', label: 'the Golden Gate', heightKm: 0.227, footprintKm: 1.2 },
  'Toronto': { id: 'cntower', label: 'the CN Tower', heightKm: 0.553, footprintKm: 0.3 },
  'Istanbul': { id: 'hagiasophia', label: 'Hagia Sophia', heightKm: 0.055, footprintKm: 0.3 },
  'Beijing': { id: 'tiantan', label: 'the Temple of Heaven', heightKm: 0.038, footprintKm: 0.6 },
  'Athens': { id: 'parthenon', label: 'the Parthenon', heightKm: 0.17, footprintKm: 0.5 },
  'Columbus': { id: 'leveque', label: 'the LeVeque Tower', heightKm: 0.169, footprintKm: 0.4 },
  'Washington': { id: 'capitol', label: 'the Capitol', heightKm: 0.169, footprintKm: 1.2 },
  'Bethlehem': { id: 'nativity', label: 'the Church of the Nativity', heightKm: 0.03, footprintKm: 0.2 },
  'Seattle': { id: 'needle', label: 'the Space Needle', heightKm: 0.184, footprintKm: 0.25 },
  'Berlin': { id: 'brandenburg', label: 'the Brandenburg Gate', heightKm: 0.026, footprintKm: 0.3 },
  'Delhi': { id: 'indiagate', label: 'India Gate', heightKm: 0.042, footprintKm: 0.4 },
  'Chicago': { id: 'willis', label: 'the Willis Tower', heightKm: 0.527, footprintKm: 0.3 },
  'Seoul': { id: 'nseoul', label: 'N Seoul Tower', heightKm: 0.48, footprintKm: 0.5 },
  'Singapore': { id: 'mbs', label: 'Marina Bay Sands', heightKm: 0.2, footprintKm: 0.5 },
};
export const WORKSHOP_LANDMARK = { id: 'workshop', label: 'The Workshop', heightKm: 0.08, footprintKm: 0.5 };
export const WORKSHOP_STOP = { name: 'North Pole', country: 'Workshop', lat: 89.9, lon: 0, utc: 0, pop: 0.02 };

export function landmarkFor(stop) {
  if (stop.name === WORKSHOP_STOP.name) return WORKSHOP_LANDMARK;
  return LANDMARKS[stop.name] || null;
}

// Prop vocabulary. All sizes in km, origin at ground centre, +Y up.
export const PROP_TYPES = ['block', 'tower', 'house', 'spire', 'onion', 'minaret', 'dome', 'pagoda', 'stupa', 'chhatri', 'plaza', 'adobe', 'hut', 'stilt', 'pine', 'palm', 'baobab', 'acacia', 'water'];

// Height bands (km) per prop type; widths are derived in sceneSpec.
const SIZES = { // km, real-world-ish heights: the camera sits ~95 m up, so blocks stay below it and towers rise past it
  block: [0.02, 0.055], tower: [0.09, 0.28], house: [0.006, 0.011], spire: [0.035, 0.065], onion: [0.025, 0.045], minaret: [0.04, 0.07],
  dome: [0.02, 0.04], pagoda: [0.03, 0.05], stupa: [0.02, 0.04], chhatri: [0.01, 0.016], plaza: [0.028, 0.045], adobe: [0.005, 0.009],
  hut: [0.004, 0.007], stilt: [0.005, 0.008], pine: [0.012, 0.02], palm: [0.01, 0.016], baobab: [0.012, 0.02], acacia: [0.008, 0.012], water: [0.01, 0.01],
};
const recipe = (weights) => ({ weights, sizes: Object.fromEntries(Object.keys(weights).map(k => [k, SIZES[k]])) });
export const KIT_RECIPES = {
  'nordic': recipe({ house: 5, block: 2, spire: 1, pine: 6 }),
  'european': recipe({ house: 4, block: 4, spire: 2, tower: 1, pine: 1 }),
  'eastern': recipe({ block: 4, house: 3, onion: 3, tower: 1, pine: 3 }),
  'middle-east': recipe({ block: 3, adobe: 3, dome: 2, minaret: 2, tower: 1, palm: 3 }),
  'south-asia': recipe({ block: 3, house: 2, dome: 2, chhatri: 2, stupa: 1, tower: 1, palm: 2 }),
  'east-asia': recipe({ block: 4, tower: 3, pagoda: 2, house: 2, pine: 2 }),
  'tropical-asia': recipe({ block: 3, tower: 2, stilt: 3, stupa: 1, pagoda: 1, palm: 5, water: 1 }),
  'sahel': recipe({ adobe: 6, block: 1, minaret: 1, hut: 2, baobab: 2, acacia: 2 }),
  'african': recipe({ block: 3, house: 2, adobe: 2, hut: 2, tower: 1, acacia: 3, baobab: 1 }),
  'latin': recipe({ block: 3, house: 3, plaza: 2, tower: 1, palm: 3, water: 1 }),
  'north-american': recipe({ block: 3, tower: 3, house: 4, spire: 1, pine: 2 }),
  'island': recipe({ hut: 4, house: 2, stilt: 2, palm: 6, water: 2 }),
};
const CORE_TYPES = new Set(['tower', 'block', 'plaza', 'dome', 'minaret', 'spire', 'onion', 'pagoda', 'stupa', 'chhatri']);
const TREE_TYPES = new Set(['pine', 'palm', 'baobab', 'acacia']);
const WATER_KITS = new Set(['island', 'tropical-asia', 'latin']);

function pickWeighted(rnd, weights) {
  let total = 0; for (const k in weights) total += weights[k];
  let r = rnd() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

// A deterministic diorama plan for one city in one year.
export function sceneSpec(stop, year) {
  const rnd = mulberry32(hash32(year, strHash(stop.name)));
  const kit = stop === WORKSHOP_STOP || stop.name === WORKSHOP_STOP.name ? 'nordic' : regionFor(stop);
  const climate = climateFor(stop, new Date(Date.UTC(year, 11, 24)));
  const landmark = landmarkFor(stop);
  const popF = Math.min(1, Math.log10(1 + (stop.pop || 0)));
  const radiusKm = 6 + 10 * popF;
  const count = Math.min(600, 150 + Math.round(450 * popF)); // dense enough to feel like a city from 95 m up
  const exclusion = Math.max(0.4, landmark ? landmark.footprintKm : 0);
  const { weights, sizes } = KIT_RECIPES[kit];
  const w = { ...weights };
  if (climate.snow) { w.pine = (w.pine || 0) + 4; delete w.palm; } // snowy places get pines, never palms
  if (climate.palms && !climate.snow) { w.palm = (w.palm || 0) + 2; delete w.pine; }
  if (!WATER_KITS.has(kit)) delete w.water;
  const props = [];
  let guard = 0;
  while (props.length < count && guard++ < count * 4) {
    let type = pickWeighted(rnd, w);
    const ang = rnd() * Math.PI * 2;
    // core types cluster toward the centre, houses and trees spread outward
    const bias = CORE_TYPES.has(type) ? 1.6 : TREE_TYPES.has(type) ? 0.7 : 1.0;
    // a third of the town sits in a dense old-town ring (0.35-1.6 km) so the ground right under the sleigh is busy, the rest spreads out
    let r = (props.length % 3 === 0) ? 0.35 + 1.25 * Math.sqrt(rnd()) : radiusKm * Math.pow(rnd(), bias / 2);
    if (type === 'water') r = radiusKm * (0.75 + 0.2 * rnd());
    if (r < exclusion) r = exclusion + rnd() * 0.3;
    if (r > radiusKm) r = radiusKm;
    if (type === 'tower' && r > radiusKm * 0.45) type = 'block'; // no lone skyscrapers in the suburbs
    const [h0, h1] = sizes[type] || SIZES[type];
    const h = +(h0 + (h1 - h0) * rnd()).toFixed(4);
    const slim = type === 'minaret' || type === 'spire' || type === 'tower';
    const wide = type === 'water' || type === 'plaza' || type === 'acacia';
    const base = type === 'water' ? 0.8 + rnd() * 1.4 : wide ? h * 1.2 : slim ? h * 0.18 : h * (0.5 + rnd() * 0.5);
    props.push({
      type, x: +(Math.sin(ang) * r).toFixed(4), z: +(Math.cos(ang) * r).toFixed(4), rot: +(rnd() * Math.PI * 2).toFixed(4),
      w: +base.toFixed(4), h, d: +(base * (0.8 + rnd() * 0.4)).toFixed(4),
      snowcap: climate.snow && type !== 'water', variant: Math.floor(rnd() * 4),
    });
  }
  const water = props.filter(p => p.type === 'water');
  if (water.length > 3) { let keep = 3; for (let i = props.length - 1; i >= 0; i--) if (props[i].type === 'water') { if (keep > 0) keep--; else props.splice(i, 1); } }
  return { kit, climate, landmark, radiusKm, props };
}
