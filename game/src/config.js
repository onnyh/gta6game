// Coral Bay Heat — shared tuning, palette and world geometry constants.
// Every other module reads its numbers from here so the game's feel lives in one place.

// ---------------------------------------------------------------- world geometry
// The city is a grid: square blocks of BLOCK pixels separated by roads of ROAD pixels,
// GRID blocks across and down. South of the grid a boardwalk, a beach and the sea.
export const BLOCK = 250;
export const ROAD = 76;
export const GRID = 7;
export const CITY_SIZE = GRID * BLOCK + (GRID + 1) * ROAD; // 2558
export const BEACH_DEPTH = 300; // sand between Ocean Drive and the water
export const WORLD_W = CITY_SIZE;
export const WORLD_H = CITY_SIZE + BEACH_DEPTH + 420; // city + beach + sea

export const SIDEWALK = 14; // pavement rim around every block
export const LANE = 17; // traffic lane offset from a road's centre line

// ---------------------------------------------------------------- player and cars
export const PLAYER_RADIUS = 11;
export const PLAYER_WALK = 128; // px per second on foot
export const PLAYER_RUN = 218;
export const PLAYER_MAX_HP = 100;

export const CAR_TYPES = {
  sedan: { name: 'Marina Sedan', w: 46, h: 21, accel: 210, top: 330, grip: 3.4, hp: 130 },
  taxi: { name: 'Sun Cab Taxi', w: 46, h: 21, accel: 215, top: 335, grip: 3.4, hp: 130 },
  coupe: { name: 'Vireo Coupe', w: 45, h: 20, accel: 320, top: 470, grip: 4.1, hp: 120 },
  sport: { name: 'Katana GT', w: 47, h: 20, accel: 380, top: 540, grip: 4.4, hp: 125 },
  van: { name: 'Hauler Van', w: 52, h: 24, accel: 165, top: 280, grip: 2.9, hp: 190 },
  truck: { name: 'Dune Pickup', w: 50, h: 23, accel: 195, top: 310, grip: 3.1, hp: 170 },
  police: { name: 'CBPD Interceptor', w: 47, h: 21, accel: 345, top: 500, grip: 4.2, hp: 210 },
};

export const CAR_PAINTS = ['#e8e4da', '#c33d2e', '#2e6fc2', '#39a06b', '#e0a51f', '#7a4fa3', '#e2703a', '#3fb7c9', '#565d66', '#e88bb0', '#8a6f4d', '#274156'];

// ---------------------------------------------------------------- wanted and police
export const MAX_STARS = 5;
export const HEAT_PER_STAR = 100; // heat points per star
export const HEAT_DECAY = 4.2; // per second while no officer can see the player
export const HEAT_SIGHT_RANGE = 430; // an officer inside this with a clear run keeps heat up

// How many police cars the city fields at each wanted level, and how keen they are.
export const COP_CARS_BY_STARS = [0, 1, 2, 3, 4, 6];
export const COP_FOOT_BY_STARS = [0, 0, 1, 2, 3, 4];

// ---------------------------------------------------------------- palette (golden-hour Coral Bay)
// Warm sunset light: peach sky-glow at the edges, teal sea, pastel towers, neon signs.
export const COLORS = {
  sea: '#1d7f8c',
  seaDeep: '#14616e',
  sand: '#ecd29a',
  boardwalk: '#c9a06b',
  grass: '#69a854',
  park: '#5d9c4a',
  sidewalk: '#cfc4ae',
  sidewalkEdge: '#b3a78d',
  road: '#3d3f45',
  roadLine: '#e8c95a',
  roadEdge: '#2c2e33',
  plaza: '#d9c9a3',
  roofDark: '#8d8578',
  shadow: 'rgba(46, 26, 40, 0.30)',
  neonPink: '#ff5d8f',
  neonCyan: '#39e6d4',
  neonAmber: '#ffb340',
};

// Building wall colours: sun-bleached pastels with a few glass towers mixed in.
export const WALL_PAINTS = [
  '#f2d5b6', '#eec39f', '#f7e8c9', '#e8a798', '#d98e73', '#a8c8c0', '#7fb3c8',
  '#5d84a6', '#466a8a', '#c9b8d9', '#f0f0ea', '#e5b8c8', '#98c9a3', '#d9d3c3',
];

// ---------------------------------------------------------------- save
export const SAVE_KEY = 'coral-bay-heat.save.v1';
export const SETTINGS_KEY = 'coral-bay-heat.settings.v1';
