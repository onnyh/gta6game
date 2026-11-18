// Bayu Heat — the save game: one localStorage slot holding Damar's money,
// REP, story progress, the pistol, the summit flag, stashes and statistics.

import { G } from './state.js';

const KEY = 'bayuheat-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function saveGame(player) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: G.money, rep: G.rep, missionIndex: G.missionIndex, storyDone: G.storyDone,
      hasPistol: G.hasPistol, ammo: G.ammo, reserve: G.reserve,
      health: G.health, armour: G.armour, summit: G.summit,
      stashesFound: G.stashesFound, stats: G.stats,
      clockMin: G.clockMin, dow: G.dow,
      px: player.x, pz: player.z, heading: player.heading,
    }));
    return true;
  } catch { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function applySave(data, player) {
  if (!data) return;
  G.money = data.money; G.rep = data.rep; G.missionIndex = data.missionIndex;
  G.storyDone = data.storyDone; G.hasPistol = data.hasPistol;
  G.ammo = data.ammo; G.reserve = data.reserve;
  G.health = data.health; G.armour = data.armour || 0;
  G.summit = !!data.summit; G.stashesFound = data.stashesFound || [];
  Object.assign(G.stats, data.stats || {});
  G.clockMin = data.clockMin || G.clockMin; G.dow = data.dow ?? G.dow;
  player.x = data.px; player.z = data.pz; player.heading = data.heading || 0;
}
