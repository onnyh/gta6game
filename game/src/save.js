// Coral Bay Heat — the save game, in the browser's localStorage.
// What persists: money, story progress, health, where Dani is standing, which cash
// stashes are already looted, and whether the pistol has been earned. Settings
// (mute) live under their own key. Every access is guarded: a browser that refuses
// storage simply plays without saving.
import { SAVE_KEY, SETTINGS_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: play on unsaved */
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function loadMuted() {
  try {
    return window.localStorage.getItem(SETTINGS_KEY) === 'muted';
  } catch {
    return false;
  }
}

export function writeMuted(muted) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, muted ? 'muted' : 'sound');
  } catch {
    /* ignore */
  }
}
