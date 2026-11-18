// Bayu Heat — the shape of Teluk Bayu: districts, plots, the market, the
// port, Gunung Bayu's heightfield, road and trail. Pure data and maths.

import { CITY, SIGNS, SUMMIT, BASECAMP, STREET_V, STREET_H } from './config.js';
import { makeRng, clamp } from './rng.js';

function terrainBase(x, z) {
  if (z >= -4) return 0;
  let h = 0;
  const t = Math.min(1, (-z - 4) / 70);
  h += 7 * t * t;                                            // foothill rise
  h += (Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.017) + Math.sin((x + z) * 0.011)) * 1.7 * Math.min(1, -z / 60);
  const dx = x - SUMMIT.x, dz = z - SUMMIT.z;
  const d = Math.hypot(dx, dz);
  if (d < 175) h += 104 * Math.pow(Math.max(0, 1 - d / 168), 1.5);   // Gunung Bayu cone
  if (d < 22) h = Math.min(h, 103 + d * 0.14);                        // summit plateau
  return h;
}
const BASE_H = terrainBase(BASECAMP.x, BASECAMP.z);
export function terrainH(x, z) {
  let h = terrainBase(x, z);
  const bd = Math.hypot(x - BASECAMP.x, z - BASECAMP.z);
  if (bd < 20) { const s = clamp((bd - 7) / 13, 0, 1); h = BASE_H * (1 - s) + h * s; }  // basecamp pad
  return h;
}
export function terrainGradient(x, z) {
  const e = 1.2;
  return {
    gx: (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e),
    gz: (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e),
  };
}
export const groundH = (x, z) => (z < -4 ? terrainH(x, z) : 0);

export const MOUNTAIN_ROAD = [
  [192, 6], [188, -26], [152, -50], [170, -82], [130, -102], [138, -124], [146, -136],
];
export const TRAIL = [
  [146, -140], [168, -152], [148, -168], [182, -182], [164, -200], [198, -212], [215, -224],
];
export function polylinePoint(pts, t) {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens[lens.length - 1];
  let d = clamp(t, 0, 1) * total;
  let i = 1; while (i < lens.length - 1 && lens[i] < d) i++;
  const seg = lens[i] - lens[i - 1] || 1, f = (d - lens[i - 1]) / seg;
  return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f, total };
}

const BLOCK_KIND = [
  ['houses', 'houses', 'ruko',   'houses', 'houses', 'mosque',  'beachpark'],
  ['office', 'office', 'ruko',   'ruko',   'houses', 'houses',  'beachpark'],
  ['office', 'office', 'alun',   'pasar',  'pasar',  'ruko',    'houses'],
  ['houses', 'bengkel', 'ruko',  'ruko',   'houses', 'polres',  'houses'],
  ['hospital', 'houses', 'ruko', 'houses', 'bayumart', 'spbu',  'houses'],
  ['houses', 'houses', 'ruko',   'houses', 'houses', 'ruko',    'portyard'],
];

export const PLACES = [
  { name: 'PASAR BARU', x: 250, z: 160 }, { name: 'ALUN-ALUN · TUGU BAYU', x: 160, z: 160 },
  { name: 'PELABUHAN', x: 520, z: 322 }, { name: 'BENGKEL RATNA', x: 96, z: 232 },
  { name: 'POLRES TELUK BAYU', x: 352, z: 224 }, { name: 'RS BAYU SEHAT', x: 32, z: 288 },
  { name: 'BAYUMART', x: 288, z: 288 }, { name: 'BAYUPETROL', x: 352, z: 288 },
  { name: 'PANTAI BAYU', x: 470, z: 120 }, { name: 'BASECAMP BAYU', x: BASECAMP.x, z: BASECAMP.z },
  { name: 'PUNCAK GUNUNG BAYU', x: SUMMIT.x, z: SUMMIT.z },
];

export function buildCity(seed = 7) {
  const rng = makeRng(seed);
  const buildings = [];   // {x,z,w,d,h,kind,tex,sign,roof}
  const colliders = [];   // {x0,z0,x1,z1}
  const stalls = [];      // {x,z,rot,color}
  const palms = [];       // {x,z,s}
  const lamps = [];       // {x,z}
  const parked = [];      // {x,z,heading,type}
  const signs = [];       // {x,z,rot,text}
  const addB = (b) => { buildings.push(b); colliders.push({ x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2 }); };
  const palm = (x, z) => palms.push({ x: x + rng.range(-1.5, 1.5), z: z + rng.range(-1.5, 1.5), s: rng.range(0.85, 1.25) });

  for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) {
    const cx = i * 64 + 32, cz = j * 64 + 32, kind = BLOCK_KIND[j][i];
    if (kind === 'office') {
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) addB({ x: cx + (k % 2 ? 12 : -12) + rng.range(-2, 2), z: cz + (k < 2 ? -11 : 12), w: rng.range(15, 19), d: rng.range(14, 18), h: rng.range(26, 52), kind: 'office', tex: rng.int(0, 2), roof: 0x2c3242 });
    } else if (kind === 'ruko') {
      for (let e = 0; e < 2; e++) {                       // rows along the north & south street edges
        const rz = cz + (e ? 17.5 : -17.5);
        for (let k = 0; k < 4; k++) addB({ x: cx - 16.5 + k * 11, z: rz, w: 10.4, d: 11, h: rng.range(7.5, 11), kind: 'ruko', tex: rng.int(0, 3), sign: rng.pick(SIGNS), roof: 0x8a4a3a });
      }
      if (rng.chance(0.6)) palm(cx - 20, cz); if (rng.chance(0.6)) palm(cx + 20, cz);
    } else if (kind === 'houses') {
      for (let k = 0; k < 5; k++) addB({ x: cx - 15 + (k % 3) * 15 + rng.range(-1.5, 1.5), z: cz + (k < 3 ? -11 : 11) + rng.range(-1.5, 1.5), w: rng.range(8, 10.5), d: rng.range(7.5, 9.5), h: rng.range(3.8, 5.6), kind: 'house', tex: rng.int(0, 3), roof: rng.pick([0xb8503c, 0x3c78b8, 0x4aa864, 0xc7a23a, 0x7a5aa8]) });
      palm(cx + rng.range(-18, 18), cz + rng.range(-18, 18));
    } else if (kind === 'pasar') {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const sx = cx - 16.5 + c * 11, sz = cz - 13 + r * 12;
        stalls.push({ x: sx, z: sz, rot: rng.range(-0.06, 0.06), color: rng.pick([0xe84a3c, 0xf2a03c, 0x3ca8e8, 0x4ec84e, 0xe83e8c, 0xf2e03c]) });
        colliders.push({ x0: sx - 2.4, z0: sz - 1.8, x1: sx + 2.4, z1: sz + 1.8 });
      }
      addB({ x: cx, z: cz + 19, w: 38, d: 9, h: 6.5, kind: 'hall', tex: 1, sign: 'PASAR BARU', roof: 0x9a4a30 });
    } else if (kind === 'alun') {
      colliders.push({ x0: cx - 3.4, z0: cz - 3.4, x1: cx + 3.4, z1: cz + 3.4 });   // Tugu Bayu base
      palm(cx - 19, cz - 19); palm(cx + 19, cz - 19); palm(cx - 19, cz + 19); palm(cx + 19, cz + 19);
    } else if (kind === 'mosque') {
      buildings.push({ x: cx - 4, z: cz - 6, w: 24, d: 18, h: 8, kind: 'mosque', tex: 0, roof: 0x2e8f76 });
      colliders.push({ x0: cx - 16, z0: cz - 15, x1: cx + 8, z1: cz + 3 });
      addB({ x: cx + 12, z: cz + 13, w: 9, d: 8, h: 4.6, kind: 'house', tex: 2, roof: 0xb8503c });
    } else if (kind === 'bengkel') {
      addB({ x: cx - 4, z: cz - 12, w: 32, d: 15, h: 7, kind: 'garage', tex: 0, sign: 'BENGKEL RATNA', roof: 0x555c66 });
      parked.push({ x: cx - 10, z: cz + 8, heading: 0.4, type: 'aleron' });
      parked.push({ x: cx + 8, z: cz + 10, heading: -0.3, type: 'bruma' });
    } else if (kind === 'polres') {
      addB({ x: cx, z: cz - 8, w: 27, d: 14, h: 10, kind: 'polres', tex: 1, sign: 'POLRES TELUK BAYU', roof: 0x33415e });
      parked.push({ x: cx - 8, z: cz + 10, heading: 0, type: 'cruiser' });
    } else if (kind === 'hospital') {
      addB({ x: cx, z: cz - 6, w: 28, d: 16, h: 12, kind: 'hospital', tex: 2, sign: 'RS BAYU SEHAT', roof: 0xd8d8d8 });
    } else if (kind === 'bayumart') {
      addB({ x: cx - 4, z: cz - 8, w: 21, d: 12, h: 6, kind: 'mart', tex: 0, sign: 'BAYUMART', roof: 0x2050a8 });
      parked.push({ x: cx + 6, z: cz + 10, heading: 1.57, type: 'bebek' });
      parked.push({ x: cx + 10, z: cz + 10, heading: 1.57, type: 'bebek' });
    } else if (kind === 'spbu') {
      buildings.push({ x: cx, z: cz - 4, w: 20, d: 13, h: 5.6, kind: 'spbu', tex: 0, sign: 'BAYUPETROL', roof: 0xd84040 });
      colliders.push({ x0: cx - 3, z0: cz + 6, x1: cx + 3, z1: cz + 10 });        // pump island
      addB({ x: cx + 13, z: cz + 12, w: 7, d: 5, h: 3.4, kind: 'house', tex: 1, roof: 0x8a4a3a });
    } else if (kind === 'beachpark') {
      for (let k = 0; k < 6; k++) palm(cx + rng.range(-19, 19), cz + rng.range(-19, 19));
      stalls.push({ x: cx - 8, z: cz + 6, rot: 0.4, color: 0xf2a03c });
    } else if (kind === 'portyard') {
      addB({ x: cx - 6, z: cz - 12, w: 34, d: 17, h: 9, kind: 'warehouse', tex: 2, sign: 'GUDANG PELABUHAN', roof: 0x6a7078 });
    }
  }

  for (let z = 8; z < 392; z += 15) palm(464, z);
  for (const rx of CITY.roadX) for (let z = 16; z < 392; z += 32) lamps.push({ x: rx + (Math.round(z / 32) % 2 ? 8.6 : -8.6), z });
  for (const rz of CITY.roadZ) for (let x = 16; x < 448; x += 32) lamps.push({ x, z: rz + (Math.round(x / 32) % 2 ? 8.6 : -8.6) });

  const signSpots = [[128, 0], [128, 128], [192, 192], [256, 128], [320, 256], [448, 64], [448, 256], [64, 320], [192, 384], [384, 128]];
  for (const [sx, sz] of signSpots) signs.push({ x: sx + 9, z: sz + 9, rot: Math.PI / 4, text: '' });

  const extraParked = [
    { x: 250, z: 118, heading: 0, type: 'angkot' }, { x: 262, z: 118, heading: 0, type: 'angkot' },
    { x: 500, z: 300, heading: -1.57, type: 'engkel' }, { x: 506, z: 330, heading: 1.57, type: 'duna' },
    { x: 452, z: 96, heading: 3.14, type: 'bebek' }, { x: 120, z: 52, heading: 0.2, type: 'bruma' },
    { x: 330, z: 180, heading: -0.2, type: 'duna' }, { x: 60, z: 300, heading: 0.9, type: 'bruma' },
    { x: BASECAMP.x - 8, z: BASECAMP.z + 4, heading: 0.7, type: 'angkot' }, { x: BASECAMP.x + 9, z: BASECAMP.z + 6, heading: -0.5, type: 'angkot' },
    { x: 408, z: 40, heading: 2.8, type: 'aleron' },
  ];
  parked.push(...extraParked);

  return { buildings, colliders, stalls, palms, lamps, parked, signs };
}

export function collideCircle(x, z, r, colliders) {
  let px = x, pz = z;
  for (const c of colliders) {
    const nx = clamp(px, c.x0, c.x1), nz = clamp(pz, c.z0, c.z1);
    const dx = px - nx, dz = pz - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); px = nx + (dx / d) * r; pz = nz + (dz / d) * r; }
      else { // centre inside the box: push out along the smallest penetration
        const l = px - c.x0, rt = c.x1 - px, tp = pz - c.z0, bt = c.z1 - pz;
        const m = Math.min(l, rt, tp, bt);
        if (m === l) px = c.x0 - r; else if (m === rt) px = c.x1 + r; else if (m === tp) pz = c.z0 - r; else pz = c.z1 + r;
      }
    }
  }
  return { x: px, z: pz };
}

export function nearestIntersection(x, z) {
  let bx = CITY.roadX[0], bz = CITY.roadZ[0], bd = 1e9;
  for (const rx of CITY.roadX) for (const rz of CITY.roadZ) {
    const d = Math.hypot(x - rx, z - rz);
    if (d < bd) { bd = d; bx = rx; bz = rz; }
  }
  return { x: bx, z: bz };
}

export function routeBetween(a, b, rng) {
  const pts = [{ x: a.x, z: a.z }];
  const xFirst = rng ? rng.chance(0.5) : true;
  if (xFirst) { if (b.x !== a.x) pts.push({ x: b.x, z: a.z }); }
  else if (b.z !== a.z) pts.push({ x: a.x, z: b.z });
  pts.push({ x: b.x, z: b.z });
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.z !== pts[i - 1].z);
}

export function streetNameAt(x, z) {
  if (z < -130) return 'Jalur Pendakian Gunung Bayu';
  if (z < -8) return 'Jl. Kaki Gunung';
  if (x > CITY.waterX - 6) return 'Pelabuhan Teluk Bayu';
  if (x > CITY.beachX) return 'Pantai Bayu';
  let best = null, bd = 1e9;
  CITY.roadX.forEach((rx, i) => { const d = Math.abs(x - rx); if (d < bd) { bd = d; best = STREET_V[i]; } });
  CITY.roadZ.forEach((rz, i) => { const d = Math.abs(z - rz); if (d < bd) { bd = d; best = STREET_H[i]; } });
  return best || 'Teluk Bayu';
}

export function placeNameAt(x, z) {
  if (z < -160) return 'GUNUNG BAYU';
  if (z < -8) return 'PEGUNUNGAN JAWA TENGAH';
  if (x > CITY.beachX) return 'TELUK BAYU';
  return 'TELUK BAYU';
}
