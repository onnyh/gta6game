// Bayu Heat — staged screenshot scenes. Loading the game with ?shot=<name>
// arranges one deterministic scene (the same seed-7 city every time) and

import { MISSIONS } from './missions.js';
import { createVehicle } from './vehicles.js';
import { groundH } from './city.js';

export function setupShots(ctx) {
  const name = new URLSearchParams(location.search).get('shot');
  if (!name) return;
  const { G, player, police, missions, hud, vehicles, startGame, openPause, camera } = ctx;
  const ready = (ms) => setTimeout(() => {
    if (ctx.refreshHud) ctx.refreshHud();
    setTimeout(() => { document.title = `SHOT READY ${name}`; }, 350);
  }, ms);

  if (name === 'title') { ready(1400); return; }

  if (name === 'chase') {
    startGame(true);
    G.money = 4875000; G.rep = 1450; G.hasPistol = true; G.ammo = 9; G.reserve = 24; G.weapon = 2;
    G.health = 82; G.armour = 45; G.clockMin = 17 * 60 + 41;
    G.missionIndex = 5;
    missions.active = MISSIONS[5]; missions.stageIdx = 1; missions.timer = 134;
    const hero = vehicles.find((v) => v.type === 'aleron' && v.owned) || vehicles.find((v) => v.type === 'aleron');
    hero.x = 448; hero.z = 252; hero.heading = Math.PI; hero.driver = 'player';
    player.vehicle = hero; player.onFoot = false;
    player.x = hero.x; player.z = hero.z; player.heading = Math.PI;
    const cruisers = [];
    for (let i = 0; i < 3; i++) {
      const c = createVehicle('cruiser', 0);
      c.driver = 'police'; c.heading = Math.PI;
      ctx.scene.add(c.group);
      vehicles.push(c); cruisers.push(c);
    }
    ctx.damar.group.visible = false;
    police.setStars(4);
    const pin = setInterval(() => {
      hero.x = 448; hero.z = 252; hero.heading = Math.PI;
      hero.vx = 0; hero.vz = -30; hero.speed = 30; hero.y = 0;
      player.x = 448; player.z = 252; player.heading = Math.PI; player.speed = 30;
      const spots = [[441, 231, Math.PI - 0.35], [455.5, 225, Math.PI + 0.35], [452, 270, Math.PI]];
      cruisers.forEach((c, i) => {
        c.x = spots[i][0]; c.z = spots[i][1]; c.heading = spots[i][2];
        c.vx = Math.sin(c.heading) * -29; c.vz = Math.cos(c.heading) * -29; c.speed = 29; c.y = 0;
      });
      G.lastSeenAt = G.time; G.lastKnownX = player.x; G.lastKnownZ = player.z;
    }, 50);
    setTimeout(() => clearInterval(pin), 6400);
    ready(5800);
    return;
  }

  if (name === 'foot') {
    startGame(true);
    G.money = 1625000; G.rep = 320; G.health = 100; G.clockMin = 17 * 60 + 52;
    player.x = 258; player.z = 158; player.heading = 2.9; player.y = groundH(player.x, player.z);
    ctx.setCamYaw(2.9);
    const angkot = vehicles.find((v) => v.type === 'angkot');
    if (angkot) { angkot.x = 251; angkot.z = 138; angkot.heading = 0.35; angkot.y = groundH(angkot.x, angkot.z); }
    hud.showDialogue([
      ['RATNA SARI', 'Damar, the Pasar Baru crates move at maghrib. Be there — and jangan telat, the tide will not wait.'],
      ['DAMAR', 'I am never late, Ratna. I am dramatically timed.'],
    ], () => {});
    ready(4200);
    return;
  }

  if (name === 'map') {
    startGame(true);
    G.money = 3210000; G.rep = 980; G.missionIndex = 3; G.summit = true; G.stats.summits = 1;
    G.stats.missionsDone = 3; G.stats.stolen = 4; G.stats.earned = 4750000; G.stats.topSpeed = 148;
    G.stashesFound = ['dermaga', 'pasar', 'alun'];
    player.x = 210; player.z = 176; player.y = groundH(player.x, player.z);
    openPause('map');
    ready(1400);
    return;
  }

  ready(800);
  void camera;
}
