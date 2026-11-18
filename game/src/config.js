// Bayu Heat — tuning, names and world constants for Teluk Bayu.
// Everything the other modules agree on lives here: the road grid, the vehicle

export const CITY = {
  roadX: [0, 64, 128, 192, 256, 320, 384, 448],   // vertical road centre-lines (west -> east)
  roadZ: [0, 64, 128, 192, 256, 320, 384],        // horizontal road centre-lines (north -> south)
  roadHalf: 7,                                     // asphalt half-width
  walkHalf: 10.5,                                  // road + sidewalk half-width
  block: 64,
  beachX: 458,                                     // sand starts here
  waterX: 492,                                     // sea starts here
};

export const STREET_V = ['Jl. Cendana', 'Jl. Kenanga', 'Jl. Merdeka', 'Jl. Flamboyan', 'Jl. Pasar Baru', 'Jl. Pelabuhan', 'Jl. Melati', 'Jl. Pantai Raya'];
export const STREET_H = ['Jl. Kaki Gunung', 'Jl. Anggrek', 'Jl. Teratai', 'Jl. Samudra', 'Jl. Dermaga', 'Jl. Kenanga', 'Jl. Pantai Selatan'];

export const SUMMIT = { x: 215, z: -228 };
export const BASECAMP = { x: 146, z: -136 };

export const VEHICLES = {
  aleron:  { name: 'ALERON GT',  kind: 'car',  topSpeed: 52, accel: 17, grip: 3.4, radius: 2.1, seats: 1 },
  bruma:   { name: 'BRUMA',      kind: 'car',  topSpeed: 38, accel: 11, grip: 3.0, radius: 2.1, seats: 1 },
  engkel:  { name: 'ENGKEL',     kind: 'van',  topSpeed: 31, accel: 8,  grip: 2.6, radius: 2.7, seats: 1 },
  duna:    { name: 'DUNA',       kind: 'pickup', topSpeed: 36, accel: 10, grip: 2.8, radius: 2.3, seats: 1 },
  angkot:  { name: 'ANGKOT',     kind: 'van',  topSpeed: 30, accel: 8.5, grip: 2.7, radius: 2.6, seats: 1 },
  bebek:   { name: 'BEBEK',      kind: 'bike', topSpeed: 42, accel: 16, grip: 4.2, radius: 1.1, seats: 1 },
  cruiser: { name: 'POLRES PATROL', kind: 'car', topSpeed: 47, accel: 15, grip: 3.3, radius: 2.1, seats: 1 },
};

export const WANTED = {
  thresholds: [0, 40, 110, 210, 330, 460],   // heat points where stars 0..5 begin
  unitsByStar: [0, 2, 3, 4, 5, 7],
  heliStar: 4,
  roadblockStar: 4,
};

export const REP_LEVELS = [
  { at: 0,    title: 'NEW FACE' },
  { at: 300,  title: 'STREET RUNNER' },
  { at: 800,  title: 'WHEELMAN' },
  { at: 1600, title: 'BAYU HUSTLER' },
  { at: 2800, title: 'GHOST OF TELUK BAYU' },
  { at: 4500, title: 'LEGEND OF THE BAY' },
];

export const RADIO = {
  station: 'Tide 101.5 · Neon Coast',
  tracks: [
    { title: 'Neon Coastline', artist: 'The Pelabuhan Boys', bpm: 96,  root: 196.0, mode: [0, 3, 5, 7, 10] },
    { title: 'Salt & Static', artist: 'DJ Kala', bpm: 112, root: 174.6, mode: [0, 2, 3, 7, 9] },
    { title: 'Golden Hour Drive', artist: 'Sinta Marlina', bpm: 84, root: 220.0, mode: [0, 2, 4, 7, 9] },
    { title: 'Midnight Ferry', artist: 'Ombak Club', bpm: 102, root: 146.8, mode: [0, 3, 5, 8, 10] },
  ],
};

export const SIGNS = ['WARUNG KOPI', 'BENGKEL', 'BAYUMART', 'TOKO KELONTONG', 'WARUNG TEGAL', 'FOTO COPY', 'SALON CANTIK', 'TOKO BERAS', 'WARUNG PADANG', 'BENGKEL MOTOR', 'PANGKAS RAMBUT', 'TOKO OBAT'];

export function formatRp(n) {
  const neg = n < 0; let s = String(Math.abs(Math.round(n)));
  let out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  return (neg ? '-Rp ' : 'Rp ') + s + out;
}

export function repLevel(rep) {
  let lvl = 0;
  for (let i = 0; i < REP_LEVELS.length; i++) if (rep >= REP_LEVELS[i].at) lvl = i;
  const next = lvl + 1 < REP_LEVELS.length ? REP_LEVELS[lvl + 1].at : REP_LEVELS[lvl].at;
  return { level: lvl + 1, title: REP_LEVELS[lvl].title, at: REP_LEVELS[lvl].at, next, isMax: lvl === REP_LEVELS.length - 1 };
}
