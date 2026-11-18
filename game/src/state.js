// Bayu Heat — the one shared game state object. Every module imports this
// singleton and reads/writes its fields; main.js owns the loop that drives it.

export const G = {
  mode: 'title',            // title | playing | paused | banner
  time: 0,                  // seconds since boot
  clockMin: 17 * 60 + 24,   // in-game clock, minutes; starts FRI 17:24
  dow: 5,                   // 0=MON .. 6=SUN; starts Friday
  money: 250000,
  rep: 0,
  health: 100,
  armour: 0,
  stamina: 100,
  hasPistol: false,
  ammo: 0,                  // rounds in the pistol
  reserve: 0,               // spare rounds
  weapon: 1,                // 1 fists, 2 pistol
  heat: 0,
  stars: 0,
  seenByPolice: false,
  lastSeenAt: -99,          // G.time when police last had eyes on the player
  lastKnownX: 0, lastKnownZ: 0,
  bustMeter: 0,
  missionIndex: 0,          // next mission to offer (== MISSIONS.length when story done)
  storyDone: false,
  summit: false,
  stashesFound: [],
  stats: {
    earned: 0, stolen: 0, topSpeed: 0, arrests: 0, deaths: 0,
    missionsDone: 0, playSeconds: 0, shotsFired: 0, hitsLanded: 0, summits: 0,
  },
  settings: { muted: false },
};

export const DOW_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function clockText() {
  const m = Math.floor(G.clockMin) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return { dow: DOW_NAMES[G.dow % 7], time: `${hh}:${mm}` };
}
