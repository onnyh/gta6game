// Coral Bay Heat — the city itself: generation, landmarks, and spatial queries.
// Coral Bay is a 7x7 grid of blocks in golden-hour pastel, with a boardwalk, a beach and
// the sea along its south edge. Generation is seeded, so the city is identical every visit.
// Everything the other systems need to know about the streets — where the roads run, what
// a circle would collide with, which named place is where — is answered here.
import { BLOCK, ROAD, GRID, CITY_SIZE, BEACH_DEPTH, WORLD_W, WORLD_H, SIDEWALK, WALL_PAINTS } from './config.js';
import { clamp } from './rng.js';

export const PITCH = BLOCK + ROAD; // one block plus one road
export const WATER_Y = CITY_SIZE + BEACH_DEPTH; // the sea starts here

/** Left edge of vertical road i (0..GRID). */
export const vRoadX = (i) => i * PITCH;
/** Centre line of vertical road i. */
export const vRoadCenter = (i) => i * PITCH + ROAD / 2;
/** Top edge of horizontal road j (0..GRID). */
export const hRoadY = (j) => j * PITCH;
/** Centre line of horizontal road j. */
export const hRoadCenter = (j) => j * PITCH + ROAD / 2;
/** Left edge of the block in column col (0..GRID-1). */
export const blockX = (col) => col * PITCH + ROAD;
/** Top edge of the block in row row (0..GRID-1). */
export const blockY = (row) => row * PITCH + ROAD;

// Named places the story visits. Block coordinates are (col, row).
const LANDMARK_BLOCKS = {
  garage: { col: 1, row: 5, name: "Rosa's Garage" },
  bank: { col: 3, row: 3, name: 'Coral Bay Trust' },
  hospital: { col: 5, row: 1, name: 'Coral Bay General' },
  warehouse: { col: 6, row: 0, name: 'North Warehouse' },
  hotel: { col: 2, row: 6, name: 'Hotel Palmera' },
  safehouse: { col: 4, row: 6, name: 'Ocean Drive Safehouse' },
};
const PARK_BLOCKS = new Set(['2,2', '5,4']);
const LOT_BLOCKS = { '6,5': 'Marina Parking', '3,1': 'Midtown Parking', '0,3': 'Old Port Docks' };

const DISTRICT_BY_REGION = [
  ['Old Port', 'Old Port', 'Coral Heights', 'Coral Heights', 'Northgate', 'Northgate', 'Northgate'],
  ['Old Port', 'The Flats', 'Downtown', 'Downtown', 'Downtown', 'University Hill', 'Marina District'],
  ['Portside', 'The Flats', 'Downtown', 'Downtown', 'Downtown', 'Marina District', 'Marina District'],
  ['Portside', 'Palm Row', 'Palm Row', 'Civic Centre', 'Palm Row', 'Palm Row', 'Marina District'],
  ['Ocean Drive', 'Ocean Drive', 'Ocean Drive', 'Ocean Drive', 'Ocean Drive', 'Ocean Drive', 'Ocean Drive'],
];

/** The district name at a world position, for the HUD's neighbourhood line. */
export function districtAt(x, y) {
  if (y >= CITY_SIZE) return 'Coral Beach';
  const col = Math.min(GRID - 1, Math.max(0, Math.floor(x / PITCH)));
  const row = Math.min(GRID - 1, Math.max(0, Math.floor(y / PITCH)));
  const band = row <= 1 ? 0 : row <= 3 ? 1 : row <= 5 ? (row === 4 ? 3 : 2) : 4;
  return DISTRICT_BY_REGION[Math.min(4, band)][col];
}

/**
 * Build the whole city from a seeded rng. Returns buildings (the colliders), props,
 * parking spots, landmarks with doorstep points, pickups and the special mission car spot.
 */
export function buildCity(rng) {
  const buildings = [];
  const props = [];
  const parkingSpots = [];
  const landmarks = {};
  const grounds = []; // per block: how the renderer should paint its ground

  const addBuilding = (x, y, w, h, height, wall, kind, name) => {
    const b = { x, y, w, h, height, wall, kind: kind || 'block', name: name || null, roof: null };
    buildings.push(b);
    return b;
  };

  for (let col = 0; col < GRID; col++) {
    for (let row = 0; row < GRID; row++) {
      const bx = blockX(col);
      const by = blockY(row);
      const key = `${col},${row}`;
      const inner = SIDEWALK + 8;

      // A landmark block gets one signature building and a doorstep on its south sidewalk.
      const landmarkKey = Object.keys(LANDMARK_BLOCKS).find((k) => LANDMARK_BLOCKS[k].col === col && LANDMARK_BLOCKS[k].row === row);
      if (landmarkKey) {
        const spec = LANDMARK_BLOCKS[landmarkKey];
        const wall = { garage: '#c96f4a', bank: '#466a8a', hospital: '#f0f0ea', warehouse: '#8a6f4d', hotel: '#e88bb0', safehouse: '#a8c8c0' }[landmarkKey];
        const height = landmarkKey === 'bank' ? 120 : landmarkKey === 'hotel' ? 95 : landmarkKey === 'hospital' ? 70 : 34;
        const b = addBuilding(bx + inner + 18, by + inner + 10, BLOCK - inner * 2 - 36, BLOCK - inner * 2 - 44, height, wall, 'landmark', spec.name);
        landmarks[landmarkKey] = {
          name: spec.name,
          building: b,
          door: { x: b.x + b.w / 2, y: b.y + b.h + 26 },
        };
        props.push({ kind: 'sign', x: b.x + b.w / 2, y: b.y - 6, text: spec.name });
        grounds.push({ c: col, r: row, kind: 'plaza' });
        continue;
      }

      if (PARK_BLOCKS.has(key)) {
        // A park: lawns, palms and benches, no buildings — a good place to lose the police.
        for (let i = 0; i < 9; i++) {
          props.push({ kind: 'palm', x: bx + rng.range(30, BLOCK - 30), y: by + rng.range(30, BLOCK - 30), s: rng.range(0.85, 1.25) });
        }
        for (let i = 0; i < 4; i++) props.push({ kind: 'bench', x: bx + rng.range(40, BLOCK - 40), y: by + rng.range(40, BLOCK - 40) });
        landmarks[key === '2,2' ? 'parkA' : 'parkB'] = { name: key === '2,2' ? 'Flamingo Park' : 'Jacaranda Green', door: { x: bx + BLOCK / 2, y: by + BLOCK + 16 } };
        grounds.push({ c: col, r: row, kind: 'park' });
        continue;
      }

      if (LOT_BLOCKS[key]) {
        // An open parking lot: rows of marked bays, some filled with stealable cars.
        for (let r = 0; r < 3; r++) {
          for (let s = 0; s < 5; s++) {
            parkingSpots.push({ x: bx + 42 + s * 44, y: by + 52 + r * 68, angle: Math.PI / 2, lot: true });
          }
        }
        props.push({ kind: 'sign', x: bx + BLOCK / 2, y: by + 14, text: LOT_BLOCKS[key] });
        if (key === '0,3') {
          for (let i = 0; i < 7; i++) props.push({ kind: 'crate', x: bx + rng.range(24, BLOCK - 24), y: by + rng.range(120, BLOCK - 24), s: rng.range(0.8, 1.4) });
          landmarks.docks = { name: 'Old Port Docks', door: { x: bx + BLOCK / 2, y: by + BLOCK / 2 } };
        }
        if (key === '6,5') landmarks.marina = { name: 'Marina Parking', door: { x: bx + BLOCK / 2, y: by + BLOCK + 16 } };
        grounds.push({ c: col, r: row, kind: 'lot' });
        continue;
      }

      // An ordinary block: one tower, or a cluster of smaller buildings with alleys between.
      const style = rng.next();
      if (style < 0.34) {
        const w = rng.range(120, 165);
        const h = rng.range(120, 165);
        addBuilding(bx + (BLOCK - w) / 2, by + (BLOCK - h) / 2, w, h, rng.range(60, 130), rng.pick(WALL_PAINTS), 'tower');
      } else {
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          const w = rng.range(64, 108);
          const h = rng.range(64, 108);
          const x = bx + inner + (i % 2) * (BLOCK / 2 - 6) + rng.range(0, 14);
          const y = by + inner + Math.floor(i / 2) * (BLOCK / 2 - 6) + rng.range(0, 14);
          addBuilding(x, y, Math.min(w, bx + BLOCK - inner - x), Math.min(h, by + BLOCK - inner - y), rng.range(16, 62), rng.pick(WALL_PAINTS), 'block');
        }
      }
      // Street furniture on the sidewalks.
      for (let i = 0; i < 3; i++) props.push({ kind: 'lamp', x: bx + rng.range(6, BLOCK - 6), y: by - 6 });
      if (rng.chance(0.7)) props.push({ kind: 'palm', x: bx + rng.range(10, 40), y: by + rng.range(10, 40), s: rng.range(0.9, 1.2) });
      if (rng.chance(0.4)) props.push({ kind: 'hydrant', x: bx + BLOCK - 8, y: by + rng.range(20, BLOCK - 20) });
      grounds.push({ c: col, r: row, kind: 'blocks' });
    }
  }

  // The boatyard sits on the sand at the east end of the beach; the lifeguard hut at the west.
  landmarks.boatyard = { name: 'Coral Bay Boatyard', door: { x: WORLD_W - 190, y: CITY_SIZE + 92 } };
  landmarks.lifeguard = { name: 'Lifeguard Station', door: { x: 190, y: CITY_SIZE + 92 } };
  for (let i = 0; i < 16; i++) props.push({ kind: 'palm', x: rng.range(30, WORLD_W - 30), y: CITY_SIZE + rng.range(28, 120), s: rng.range(0.9, 1.35) });
  for (let i = 0; i < 6; i++) props.push({ kind: 'umbrella', x: rng.range(60, WORLD_W - 60), y: CITY_SIZE + rng.range(130, BEACH_DEPTH - 30) });

  // Street parking along Ocean Drive and the avenue edges: more cars to steal.
  for (let i = 0; i < GRID; i++) {
    parkingSpots.push({ x: vRoadCenter(i) + 24, y: hRoadY(GRID) - 30, angle: 0, lot: false });
    parkingSpots.push({ x: vRoadX(i) + 14, y: blockY(rng.int(0, GRID - 1)) + BLOCK / 2, angle: Math.PI / 2, lot: false });
  }

  // Ten hidden cash stashes: alleys, parks, the beach — worth finding between missions.
  const stashSpots = [];
  const stashBlocks = [[0, 0], [2, 2], [4, 1], [6, 3], [1, 4], [3, 5], [5, 4], [0, 6], [6, 6]];
  for (const [c, r] of stashBlocks) {
    stashSpots.push({ x: blockX(c) + rng.range(24, BLOCK - 24), y: blockY(r) + rng.range(24, BLOCK - 24) });
  }
  stashSpots.push({ x: 420, y: CITY_SIZE + 170 }); // the tenth is buried on the sand

  const healthSpots = [
    { x: landmarks.hospital.door.x, y: landmarks.hospital.door.y + 8 },
    { x: landmarks.lifeguard.door.x, y: landmarks.lifeguard.door.y + 10 },
    { x: landmarks.parkA.door.x - 60, y: landmarks.parkA.door.y - 130 },
  ];

  // Index buildings by block so collision checks only look nearby.
  const byBlock = new Map();
  for (const b of buildings) {
    const c0 = Math.max(0, Math.floor((b.x - ROAD) / PITCH));
    const c1 = Math.min(GRID - 1, Math.floor((b.x + b.w - ROAD) / PITCH));
    const r0 = Math.max(0, Math.floor((b.y - ROAD) / PITCH));
    const r1 = Math.min(GRID - 1, Math.floor((b.y + b.h - ROAD) / PITCH));
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
      const k = `${c},${r}`;
      if (!byBlock.has(k)) byBlock.set(k, []);
      byBlock.get(k).push(b);
    }
  }

  return { buildings, props, parkingSpots, landmarks, stashSpots, healthSpots, byBlock, grounds };
}

/** Buildings near a point (its own block and the neighbours), for collision and bullets. */
export function buildingsNear(city, x, y) {
  const c = Math.floor((x - ROAD) / PITCH);
  const r = Math.floor((y - ROAD) / PITCH);
  const out = [];
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
    const list = city.byBlock.get(`${c + dc},${r + dr}`);
    if (list) out.push(...list);
  }
  return out;
}

/**
 * Push a circle (centre x, y, radius r) out of every building it overlaps and keep it
 * inside the world and out of the sea. Returns the resolved [x, y].
 */
export function collideCircle(city, x, y, r) {
  x = clamp(x, r, WORLD_W - r);
  y = clamp(y, r, WATER_Y - r + 6);
  const near = buildingsNear(city, x, y);
  for (let pass = 0; pass < 2; pass++) {
    for (const b of near) {
      const nx = clamp(x, b.x, b.x + b.w);
      const ny = clamp(y, b.y, b.y + b.h);
      let dx = x - nx;
      let dy = y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // Centre is inside the building: leave by the shallowest side.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return [x, y];
}

/** True when the segment a->b crosses no building (a cheap line of sight for police and guns). */
export function lineOfSight(city, x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 26);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    const near = buildingsNear(city, x, y);
    for (const b of near) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return false;
    }
  }
  return true;
}

/** Is this point on a road (either direction)? Traffic and spawn logic live by this. */
export function isOnRoad(x, y) {
  if (y > CITY_SIZE) return false;
  const lx = ((x % PITCH) + PITCH) % PITCH;
  const ly = ((y % PITCH) + PITCH) % PITCH;
  return lx < ROAD || ly < ROAD;
}

/** Is this point on sand (slow going) or in the sea (impassable)? */
export function terrainAt(x, y) {
  if (y >= WATER_Y) return 'sea';
  if (y >= CITY_SIZE) return 'sand';
  return 'city';
}
