// Bayu Heat — boot and conductor: wires every module together — player
// control, cameras, crime, missions, the summit, saving, title/pause flow.

import * as THREE from '../vendor/three.module.min.js';
import { G } from './state.js';
import { SUMMIT, BASECAMP, formatRp } from './config.js';
import { makeRng, clamp, angleLerp, angleDiff } from './rng.js';
import { Input } from './input.js';
import {
  buildCity, collideCircle, groundH, terrainGradient, TRAIL, polylinePoint,
} from './city.js';
import { buildWorld } from './world.js';
import { createVehicle, stepVehicle, damageVehicle, updateVehicleVisual } from './vehicles.js';
import { createHuman } from './actors.js';
import { GameAudio } from './audio.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { MissionRunner, MISSIONS, RATNA_POS, STASHES, PICKUPS } from './missions.js';
import { hasSave, saveGame, loadSave, applySave } from './save.js';
import { Hud } from './hud.js';
import { setupShots } from './shots.js';

const $ = (id) => document.getElementById(id);
const rng = makeRng(20261118);

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2400);
camera.position.set(120, 26, 300);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const layout = buildCity(7);
const world = buildWorld(scene, layout);
const footColliders = layout.colliders;
const carColliders = [...layout.colliders, { x0: 136, z0: -147, x1: 156, z1: -140.5 }];

const vehicles = [];
const player = {
  x: 104, z: 236, y: 0, heading: Math.PI, speed: 0,
  vehicle: null, onFoot: true, dead: false,
};
player.y = groundH(player.x, player.z);

if (hasSave()) { const d = loadSave(); if (d) applySave(d, player); }

const damar = createHuman({ skin: 0x96684a, shirt: 0xc23b2e, pants: 0x23262e, hair: 0x14100c });
scene.add(damar.group);

function standNpc(opts, x, z, heading) {
  const h = createHuman(opts);
  h.group.position.set(x, groundH(x, z), z);
  h.group.rotation.y = heading;
  scene.add(h.group);
  return { human: h, x, z, heading };
}
const ratna = standNpc({ skin: 0xa06844, shirt: 0x2e8f6e, pants: 0x2c3242, hair: 0x1c1410, dress: 0x2e8f6e }, RATNA_POS.x, RATNA_POS.z, 2.6);
const sari = standNpc({ skin: 0xbd8552, shirt: 0xe8a03c, pants: 0x3a3f4c, hair: 0x241a12, dress: 0xe8a03c }, 282, 292, 0.4);
const bimo = standNpc({ skin: 0x8a5a34, shirt: 0x3c78d8, pants: 0x23262e, hair: 0x14100c, cap: 0xd84040 }, 520, 332, -1.2);
const darto = standNpc({ skin: 0x8a5a34, shirt: 0x7a5aa8, pants: 0x4a4238, hair: 0x3a3a3a, cap: 0x2c2c30 }, BASECAMP.x + 7, BASECAMP.z + 3, -0.7);

const audio = new GameAudio();
const input = new Input(canvas);

const traffic = new Traffic(scene, layout, carColliders, vehicles, {
  onPedDown: (ped, v) => {
    if (v === player.vehicle) crime(30, true);
    audio.thud(0.4, 160, 0.2);
  },
  onHonk: () => {},
  onCrash: (v, impact) => { if (v === player.vehicle) crashHurt(impact); },
});

const police = new Police(scene, vehicles, carColliders, {
  onOfficerShoot: (officer, pl) => {
    const from = new THREE.Vector3(officer.x, (officer.y || groundH(officer.x, officer.z)) + 1.45, officer.z);
    const dmg = combat.npcShoot(from, pl, rng);
    audio.shot();
    if (dmg > 0 && combat.damagePlayer(dmg)) onWasted();
  },
  onRam: () => {},
  onSiren: (dist, active) => audio.siren(dist, active),
  onStars: () => {},
  onBustProgress: () => {},
  onHeliSpot: () => {},
});

const combat = new Combat(scene, {
  onHurt: () => { hud.flashDamage(); },
});

const missions = new MissionRunner({
  onBegin: (m) => { hud.toast(`MISSION — ${m.name}`, 'Follow the gold marker'); audio.jingle('mission'); },
  onStage: () => { audio.blip(920, 0.06, 0.1); },
  onComplete: (m) => onMissionComplete(m),
  onFail: () => { hud.banner('MISSION FAILED', 'Ratna will give you another chance', 2.4); audio.jingle('fail'); },
  onSetStars: (n) => { police.setStars(n); },
  onChasers: (n) => setChasers(n),
});

const hud = new Hud(layout, { onBlip: () => audio.blip() });

for (const v of vehicles) {
  if (v.type === 'aleron' && Math.hypot(v.x - 104, v.z - 230) < 26) v.owned = true;
}

const chasers = [];
let chaserWant = 0;
function spawnChaser() {
  const a = rng.range(0, Math.PI * 2);
  const v = createVehicle(rng.chance(0.5) ? 'bruma' : 'duna', rng.int(0, 9));
  v.x = clamp(player.x + Math.sin(a) * 95, 12, 480); v.z = clamp(player.z + Math.cos(a) * 95, 12, 400);
  v.heading = rng.range(0, 6.28); v.driver = 'chaser'; v.y = groundH(v.x, v.z);
  scene.add(v.group); vehicles.push(v); chasers.push(v);
}
function setChasers(n) {
  chaserWant = n;
  while (chasers.length > n) {
    const c = chasers.pop();
    scene.remove(c.group);
    const i = vehicles.indexOf(c); if (i >= 0) vehicles.splice(i, 1);
  }
  while (chasers.length < n) spawnChaser();
}
function updateChasers(dt) {
  for (let i = chasers.length - 1; i >= 0; i--) {
    const v = chasers[i];
    const d = Math.hypot(player.x - v.x, player.z - v.z);
    if (d > 170 || v.condition <= 0) {
      scene.remove(v.group);
      const vi = vehicles.indexOf(v); if (vi >= 0) vehicles.splice(vi, 1);
      chasers.splice(i, 1);
      if (chasers.length < chaserWant) spawnChaser();
      continue;
    }
    const want = Math.atan2(player.x - v.x, player.z - v.z);
    let steer = clamp(angleDiff(want, v.heading) * 1.6, -1, 1);
    const inp = { throttle: d > 7 ? 1 : 0.25, steer, handbrake: Math.abs(angleDiff(want, v.heading)) > 2.2 };
    const impact = stepVehicle(v, inp, dt, carColliders, vehicles);
    if (impact > 6 && player.vehicle && Math.hypot(player.x - v.x, player.z - v.z) < 7) crashHurt(impact * 0.7);
    updateVehicleVisual(v, dt, G.time);
  }
}

const pickupMeshes = [];
{
  const hpGeo = new THREE.BoxGeometry(0.8, 0.5, 0.8);
  for (const p of PICKUPS) {
    const mat = new THREE.MeshLambertMaterial({ color: p.kind === 'health' ? 0xe8e8e8 : 0x3c78d8 });
    const m = new THREE.Mesh(hpGeo, mat);
    m.position.set(p.x, groundH(p.x, p.z) + 0.8, p.z);
    scene.add(m);
    pickupMeshes.push({ ...p, mesh: m, takenAt: -99 });
  }
}
const stashMeshes = [];
{
  const sGeo = new THREE.BoxGeometry(0.7, 0.45, 0.5);
  const sMat = new THREE.MeshLambertMaterial({ color: 0x8a6d2f, emissive: 0x2a1f05 });
  for (const s of STASHES) {
    if (G.stashesFound.includes(s.id)) continue;
    const m = new THREE.Mesh(sGeo, sMat);
    m.position.set(s.x, groundH(s.x, s.z) + 0.6, s.z);
    scene.add(m);
    stashMeshes.push({ ...s, mesh: m });
  }
}

function witnessed(radius = 45) {
  for (const p of traffic.peds) if (!p.down && Math.hypot(p.x - player.x, p.z - player.z) < 24) return true;
  for (const u of police.units) if (Math.hypot(u.vehicle.x - player.x, u.vehicle.z - player.z) < radius) return true;
  if (police.heli.active && Math.hypot(police.heli.x - player.x, police.heli.z - player.z) < 60) return true;
  return false;
}
function crime(points, always = false) {
  if (always || witnessed()) police.addHeat(points, true);
}

function crashHurt(impact) {
  audio.crash(Math.min(1, impact / 14));
  if (impact > 9) {
    const dmg = (impact - 8) * 1.6;
    if (combat.damagePlayer(dmg) && player.onFoot) onWasted();
    if (player.vehicle) damageVehicle(player.vehicle, impact * 0.8);
  }
}

function onMissionComplete(m) {
  G.money += m.reward; G.rep += m.rep; G.stats.earned += m.reward; G.stats.missionsDone++;
  G.missionIndex++;
  if (G.missionIndex >= MISSIONS.length) G.storyDone = true;
  audio.jingle('mission');
  hud.banner('MISSION COMPLETE', `${m.name} — ${formatRp(m.reward)}`, 2.8);
  if (m.name === 'ANGKOT ANTICS') {
    G.hasPistol = true; G.ammo = 12; G.reserve = 36;
    hud.toast('PISTOL UNLOCKED', 'Press 2 to draw it — Ratna leaves it in the glovebox');
  }
  hud.showDialogue(m.outro, () => {});
  saveGame(player);
}

function onWasted() {
  if (G.mode !== 'playing') return;
  G.stats.deaths++;
  const bill = Math.min(250000, G.money);
  G.money -= bill;
  police.clear();
  if (missions.active) missions.fail();
  setChasers(0);
  exitVehicle(true);
  G.mode = 'banner';
  audio.jingle('fail');
  hud.banner('WASTED', `RS Bayu Medika bill — ${formatRp(bill)}`, 2.6, () => {
    player.x = 36; player.z = 296; player.heading = 0.6; player.speed = 0;
    G.health = 100; G.armour = 0; G.mode = 'playing';
    saveGame(player);
  });
}

function onBusted() {
  if (G.mode !== 'playing') return;
  G.stats.arrests++;
  const fine = Math.min(G.money, 150000 + G.stars * 100000);
  G.money -= fine;
  police.clear();
  if (missions.active) missions.fail();
  setChasers(0);
  exitVehicle(true);
  G.mode = 'banner';
  audio.jingle('fail');
  hud.banner('BUSTED', `POLRES TELUK BAYU — fine ${formatRp(fine)}`, 2.6, () => {
    player.x = 352; player.z = 236; player.heading = -0.8; player.speed = 0;
    G.health = Math.max(60, G.health); G.mode = 'playing';
    saveGame(player);
  });
}

function nearestVehicle(maxD) {
  let best = null, bd = maxD;
  for (const v of vehicles) {
    if (v.dead || v.driver === 'traffic' || v.driver === 'police') continue;
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function enterVehicle(v) {
  player.vehicle = v; player.onFoot = false;
  v.driver = 'player';
  damar.group.visible = false;
  audio.radioStart();
  if (!v.owned && !v.stolen) {
    v.stolen = true;
    G.stats.stolen++;
    crime(25);
    traffic.scare(v.x, v.z, 16);
    hud.toast('VEHICLE STOLEN', v.def.name);
  }
}

function exitVehicle(silent = false) {
  const v = player.vehicle;
  if (!v) { player.onFoot = true; return; }
  v.driver = v.driver === 'player' ? 'none' : v.driver;
  player.vehicle = null; player.onFoot = true;
  const side = v.heading + Math.PI / 2;
  player.x = v.x + Math.sin(side) * (v.def.radius + 0.9);
  player.z = v.z + Math.cos(side) * (v.def.radius + 0.9);
  const fixed = collideCircle(player.x, player.z, 0.55, footColliders);
  player.x = fixed.x; player.z = fixed.z;
  player.y = groundH(player.x, player.z);
  player.heading = v.heading;
  damar.group.visible = true;
  audio.radioStop();
  audio.engine(false, 0, false);
  if (!silent) audio.blip(500, 0.05, 0.08);
}

let fireCooldown = 0;
function combatTargets() {
  const out = [...police.targets()];
  for (const p of traffic.peds) {
    if (p.down) continue;
    out.push({ x: p.x, z: p.z, y: groundH(p.x, p.z), h: 1.7, r: 0.5, hp: p.hp, dead: false, ped: p });
  }
  return out;
}
function applyHit(tg, dmg) {
  G.stats.hitsLanded++;
  if (tg.ped) {
    tg.ped.hp -= dmg;
    crime(tg.ped.hp <= 0 ? 60 : 30);
    if (tg.ped.hp <= 0 && !tg.ped.down) {
      tg.ped.down = true; tg.ped.deadAt = G.time; tg.ped.human.setPose('down');
    } else traffic.scare(player.x, player.z, 20);
    return;
  }
  tg.hp -= dmg;
  crime(tg.hp <= 0 ? 90 : 50, true);
  if (tg.hp <= 0 && !tg.dead) { tg.dead = true; tg.human.setPose('down'); }
}
function tryShoot() {
  if (G.weapon !== 2 || !G.hasPistol) return;
  if (G.ammo <= 0) { audio.blip(240, 0.05, 0.1); reload(); return; }
  G.ammo--; G.stats.shotsFired++;
  audio.shot();
  crime(witnessed() ? 12 : 4, true);
  traffic.scare(player.x, player.z, 18);
  const origin = new THREE.Vector3(
    player.x + Math.sin(player.heading) * 0.45, player.y + 1.42,
    player.z + Math.cos(player.heading) * 0.45,
  );
  const hit = combat.shoot(camera, combatTargets(), origin);
  if (hit) applyHit(hit, 22);
  if (G.ammo === 0) reload();
}
function reload() {
  if (G.reserve <= 0 || G.ammo >= 12) return;
  const take = Math.min(12 - G.ammo, G.reserve);
  G.ammo += take; G.reserve -= take;
  audio.blip(660, 0.05, 0.09);
}
function tryPunch() {
  audio.punch();
  const hit = combat.punch(player, combatTargets());
  if (hit) { applyHit(hit, 12); audio.thud(0.3, 200, 0.12); }
}

let sideSummit = false;         // Pak Darto's photo job
const postsPassed = new Set();
const POSTS = [0.3, 0.55, 0.8];
function updateMountain(dt) {
  if (player.onFoot && player.z < -100) {
    POSTS.forEach((tt, i) => {
      if (postsPassed.has(i)) return;
      const p = polylinePoint(TRAIL, tt);
      if (Math.hypot(player.x - p.x, player.z - p.z) < 9) {
        postsPassed.add(i);
        hud.toast(`POS ${i + 1}`, i === 2 ? 'Thin air now. The puncak is close.' : 'Jalur pendakian Gunung Bayu');
        audio.blip(840, 0.06, 0.09);
      }
    });
  }
  if (player.z > -60) postsPassed.clear();
  if (!G.summit && player.onFoot && Math.hypot(player.x - SUMMIT.x, player.z - SUMMIT.z) < 9) {
    G.summit = true; G.stats.summits = 1;
    world.flagPlanted = true;
    G.money += 500000; G.rep += 150; G.stats.earned += 500000;
    audio.jingle('summit');
    let sub = 'Summit Bonus — Rp 500.000 · REP +150';
    if (sideSummit) {
      sideSummit = false;
      G.money += 750000; G.rep += 200; G.stats.earned += 750000;
      sub = 'Summit Bonus Rp 500.000 + Photo Bonus Rp 750.000 — Pak Darto will love these';
    }
    hud.banner('PUNCAK — GUNUNG BAYU', sub, 3.4);
    saveGame(player);
  }
  void dt;
}

function updateInteractions(pressE, pressF) {
  let prompt = '';
  if (player.onFoot && !hud.dialogueOpen) {
    if (missions.offerAvailable() && Math.hypot(player.x - RATNA_POS.x, player.z - RATNA_POS.z) < 3.6) {
      prompt = '<b>E</b> — Talk to Ratna Sari';
      if (pressE) {
        const m = MISSIONS[G.missionIndex];
        hud.showDialogue(m.intro, () => missions.begin());
      }
    }
    if (!prompt && !G.summit && Math.hypot(player.x - darto.x, player.z - darto.z) < 3.6) {
      prompt = sideSummit ? 'Pak Darto is waiting for summit photos' : '<b>E</b> — Talk to Pak Darto';
      if (pressE && !sideSummit) {
        hud.showDialogue([
          ['PAK DARTO', 'Kamu anak kota ya? Gunung Bayu itu bukan bukit, nak. Tapi pemandangannya… kota, laut, semua Teluk Bayu.'],
          ['DAMAR', 'You want something from the top, Pak?'],
          ['PAK DARTO', 'Foto dari puncak! Plant the flag, take the view in. I pay Rp 750.000 for a summit story at my warung.'],
        ], () => { sideSummit = true; hud.toast('SIDE JOB — SUMMIT PHOTOS', 'Reach the puncak of Gunung Bayu'); });
      }
    }
    if (!prompt) {
      const v = nearestVehicle(3.4);
      if (v) {
        prompt = `<b>F</b> — ${v.owned ? 'Drive' : 'Steal'} the ${v.def.name}`;
        if (pressF) enterVehicle(v);
      }
    }
  }
  hud.setPrompt(prompt);
}

let camYaw = Math.PI, camPitch = 0.16, carCamHeading = Math.PI;
let exhausted = false;
function updateOnFoot(dt) {
  const look = input.takeLook();
  if (input.locked || shotMode) {
    camYaw -= look.x * 0.0024;
    camPitch = clamp(camPitch + look.y * 0.0021, -0.5, 0.95);
  }
  const f = (input.down('w', 'arrowup') ? 1 : 0) - (input.down('s', 'arrowdown') ? 1 : 0);
  const r = (input.down('d', 'arrowright') ? 1 : 0) - (input.down('a', 'arrowleft') ? 1 : 0);
  let mx = 0, mz = 0;
  if (f || r) {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    mx = fx * f + rx * r; mz = fz * f + rz * r;
    const len = Math.hypot(mx, mz) || 1; mx /= len; mz /= len;
    player.heading = Math.atan2(mx, mz);
  }
  const grad = terrainGradient(player.x, player.z);
  const uphill = grad.x * mx + grad.z * mz;
  let speed = 5.6;
  if (uphill > 0.02) speed *= clamp(1 - uphill * 1.15, 0.34, 1);
  if (uphill < -0.05) speed *= 1.3; // descending is faster
  const climbing = player.z < -4 && uphill > 0.1 && (f || r);
  if (climbing && !exhausted) {
    G.stamina = Math.max(0, G.stamina - (uphill > 0.25 ? 6 : 2.5) * dt);
    if (G.stamina <= 0) exhausted = true; // crawl until 25 comes back
  } else {
    G.stamina = Math.min(100, G.stamina + 10 * dt);
    if (exhausted && G.stamina >= 25) exhausted = false;
  }
  if (exhausted) speed = Math.min(speed, 1.1);
  const moving = (f || r) && speed > 0;
  player.speed = moving ? speed : 0;
  if (moving) {
    const nx = player.x + mx * speed * dt;
    const nz = player.z + mz * speed * dt;
    const fixed = collideCircle(nx, nz, 0.55, footColliders);
    player.x = clamp(fixed.x, -120, 545);
    player.z = clamp(fixed.z, -320, 408);
    if (player.x > 490 && !(player.z > 258 && player.z < 392)) player.x = 490; // the sea
    player.y = groundH(player.x, player.z);
  }
  damar.group.position.set(player.x, player.y, player.z);
  damar.group.rotation.y = player.heading;
  damar.setPose(G.weapon === 2 && input.mouseDown ? 'aim' : 'stand');
  damar.animate(dt, player.speed);
  fireCooldown -= dt;
  if (input.mouseDown && fireCooldown <= 0) {
    fireCooldown = 0.22;
    if (G.weapon === 2) tryShoot(); else tryPunch();
  }
  for (const p of pickupMeshes) {
    p.mesh.rotation.y += dt * 1.4;
    p.mesh.visible = G.time - p.takenAt > 45;
    if (p.mesh.visible && Math.hypot(player.x - p.x, player.z - p.z) < 1.8) {
      if (p.kind === 'health' && G.health < 100) { G.health = Math.min(100, G.health + 40); p.takenAt = G.time; audio.jingle('pickup'); hud.toast('FIRST AID', 'Health restored'); }
      if (p.kind === 'armour' && G.armour < 100) { G.armour = 100; p.takenAt = G.time; audio.jingle('pickup'); hud.toast('BODY ARMOUR', 'Picked up at the bengkel'); }
    }
  }
  for (let i = stashMeshes.length - 1; i >= 0; i--) {
    const s = stashMeshes[i];
    s.mesh.rotation.y += dt * 1.1;
    if (Math.hypot(player.x - s.x, player.z - s.z) < 2) {
      G.stashesFound.push(s.id);
      G.money += 150000; G.rep += 25; G.stats.earned += 150000;
      scene.remove(s.mesh); stashMeshes.splice(i, 1);
      audio.jingle('pickup');
      hud.toast('HIDDEN STASH', `Rp 150.000 — ${G.stashesFound.length}/8 found`);
      saveGame(player);
    }
  }
}

function updateDriving(dt) {
  const v = player.vehicle;
  const inp = {
    throttle: (input.down('w', 'arrowup') ? 1 : 0) - (input.down('s', 'arrowdown') ? 1 : 0),
    steer: (input.down('a', 'arrowleft') ? 1 : 0) - (input.down('d', 'arrowright') ? 1 : 0),
    handbrake: input.down(' '),
  };
  if (v.z < -4) {
    const grad = terrainGradient(v.x, v.z);
    const uphill = grad.x * Math.sin(v.heading) + grad.z * Math.cos(v.heading);
    if (uphill > 0.42 && inp.throttle > 0) inp.throttle = 0;
  }
  const impact = stepVehicle(v, inp, dt, carColliders, vehicles);
  if (impact > 5) crashHurt(impact);
  player.x = v.x; player.z = v.z; player.y = v.y; player.heading = v.heading;
  player.speed = v.speed;
  G.stats.topSpeed = Math.max(G.stats.topSpeed, Math.abs(v.speed) * 3.6);
  audio.engine(true, clamp(Math.abs(v.speed) / v.def.topSpeed, 0, 1.2), v.def.kind === 'bike');
  updateVehicleVisual(v, dt, G.time);
}

const projV = new THREE.Vector3();
function projectToScreen(tp) {
  if (!tp) return null;
  projV.set(tp.x, groundH(tp.x, tp.z) + 6, tp.z).project(camera);
  if (projV.z > 1 || projV.z < -1) return null;
  return { x: (projV.x * 0.5 + 0.5) * 100, y: (-projV.y * 0.5 + 0.5) * 100 };
}
function updateCamera(dt) {
  if (player.vehicle) {
    const v = player.vehicle;
    carCamHeading = angleLerp(carCamHeading, v.heading, Math.min(1, dt * (Math.abs(v.speed) > 14 ? 5.5 : 3.2)));
    const dist = 8.5 + Math.abs(v.speed) * 0.09;
    const bx = v.x - Math.sin(carCamHeading) * dist;
    const bz = v.z - Math.cos(carCamHeading) * dist;
    const by = Math.max(groundH(bx, bz) + 3.1, v.y + 2.6);
    camera.position.lerp(new THREE.Vector3(bx, by, bz), Math.min(1, dt * 10));
    camera.lookAt(v.x + Math.sin(carCamHeading) * 7, v.y + 1.5, v.z + Math.cos(carCamHeading) * 7);
  } else {
    const dist = 6.8;
    const cx = player.x - Math.sin(camYaw) * Math.cos(camPitch) * dist;
    const cz = player.z - Math.cos(camYaw) * Math.cos(camPitch) * dist;
    const cy = player.y + 1.7 + Math.sin(camPitch) * dist;
    camera.position.lerp(new THREE.Vector3(cx, Math.max(cy, groundH(cx, cz) + 0.5), cz), Math.min(1, dt * 14));
    camera.lookAt(
      player.x + Math.sin(camYaw) * 5, player.y + 1.55 - Math.sin(camPitch) * 2,
      player.z + Math.cos(camYaw) * 5,
    );
    if (input.locked) player.heading = camYaw;
  }
}

const titleScreen = $('titleScreen'), pauseScreen = $('pauseScreen');
const shotMode = new URLSearchParams(location.search).has('shot');
let started = false;

function showTitle() {
  G.mode = 'title';
  $('hud').classList.add('hidden');
  titleScreen.classList.remove('hidden');
  pauseScreen.classList.add('hidden');
  $('btnContinue').style.display = hasSave() ? '' : 'none';
}
function startGame(fresh) {
  audio.ensure();
  if (fresh) {
    try { localStorage.removeItem('bayuheat-save-v1'); } catch (e) { /* private mode */ }
    Object.assign(G, {
      money: 250000, rep: 0, health: 100, armour: 0, stamina: 100,
      hasPistol: false, ammo: 0, reserve: 0, weapon: 1, heat: 0, stars: 0,
      bustMeter: 0, missionIndex: 0, storyDone: false, summit: false, stashesFound: [],
      clockMin: 17 * 60 + 24, dow: 5,
    });
    G.stats = { earned: 0, stolen: 0, topSpeed: 0, arrests: 0, deaths: 0, missionsDone: 0, playSeconds: 0, shotsFired: 0, hitsLanded: 0, summits: 0 };
    player.x = 104; player.z = 236; player.heading = Math.PI; camYaw = Math.PI;
    exitVehicle(true);
    for (let i = stashMeshes.length - 1; i >= 0; i--) scene.remove(stashMeshes[i].mesh);
    stashMeshes.length = 0;
  } else {
    const data = loadSave();
    if (data) applySave(data, player);
    if (G.summit) world.flagPlanted = true;
    camYaw = player.heading;
  }
  started = true;
  G.mode = 'playing';
  $('hud').classList.remove('hidden');
  titleScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  if (!shotMode) canvas.requestPointerLock?.();
  hud.toast('TELUK BAYU', 'Ratna Sari is waiting at Bengkel Ratna — Jl. Pantai Raya');
}
function openPause(tab = 'map') {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  document.exitPointerLock?.();
  pauseScreen.classList.remove('hidden');
  hud.setPauseTab(tab);
  hud.drawMap(player, currentTarget());
  hud.fillStats();
  audio.engine(false, 0, false);
}
function closePause() {
  if (G.mode !== 'paused') return;
  G.mode = 'playing';
  pauseScreen.classList.add('hidden');
  saveGame(player);
  if (!shotMode) canvas.requestPointerLock?.();
}

$('btnNew').addEventListener('click', () => startGame(true));
$('btnContinue').addEventListener('click', () => startGame(false));
$('btnControls').addEventListener('click', () => { showTitle(); openControls(); });
$('btnResume').addEventListener('click', closePause);
$('btnSave').addEventListener('click', () => { saveGame(player); hud.toast('SAVED', 'Progress written to this browser'); });
$('btnQuit').addEventListener('click', () => { saveGame(player); pauseScreen.classList.add('hidden'); showTitle(); });
for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    hud.setPauseTab(b.dataset.tab);
    if (b.dataset.tab === 'map') hud.drawMap(player, currentTarget());
    if (b.dataset.tab === 'stats') hud.fillStats();
  });
}
function openControls() {
  G.mode = 'paused';
  pauseScreen.classList.remove('hidden');
  titleScreen.classList.add('hidden');
  hud.setPauseTab('controls');
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.mode === 'playing' && started && !shotMode) openPause('map');
});
canvas.addEventListener('click', () => {
  if (G.mode === 'playing' && !input.locked && !shotMode) canvas.requestPointerLock?.();
});

function currentTarget() {
  const t = missions.targetPos();
  if (t) return t;
  if (missions.offerAvailable()) return { x: RATNA_POS.x, z: RATNA_POS.z };
  if (sideSummit && !G.summit) return { x: SUMMIT.x, z: SUMMIT.z };
  return null;
}

let lastNow = performance.now();
let clockAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  if (G.mode === 'paused' || G.mode === 'title') dt = 0;
  G.time += dt;
  const t = G.time;

  const presses = input.takePresses();
  const clicks = input.takeClicks();

  if (G.mode === 'title') {
    const a = t * 0.05;
    camera.position.set(300 + Math.cos(a) * 150, 42 + Math.sin(t * 0.11) * 6, 260 + Math.sin(a) * 120);
    camera.lookAt(240, 4, 190);
    if (presses.includes('enter')) startGame(!hasSave());
  } else if (G.mode === 'playing' || G.mode === 'banner') {
    const playing = G.mode === 'playing';
    if (hud.dialogueOpen) {
      if (presses.includes('e') || presses.includes('enter') || clicks.length) hud.advanceDialogue();
    } else if (playing) {
      if (presses.includes('p') || presses.includes('escape')) { openPause('map'); }
      if (presses.includes('1')) G.weapon = 1;
      if (presses.includes('2') && G.hasPistol) G.weapon = 2;
      if (presses.includes('r')) reload();
      if (presses.includes('n') && player.vehicle) audio.nextTrack();
      if (presses.includes('m')) { audio.setMuted(!G.settings.muted); G.settings.muted = !G.settings.muted; }
      let pressF = presses.includes('f');
      if (pressF && player.vehicle) { exitVehicle(); pressF = false; }
      const pressE = presses.includes('e');
      if (!player.vehicle) updateOnFoot(dt); else updateDriving(dt);
      updateInteractions(pressE, pressF);
      missions.update(dt, { player, pressE, dialogueOpen: hud.dialogueOpen });
      if (G.bustMeter >= 2.4) { G.bustMeter = 0; onBusted(); }
    }
    if (dt > 0) {
      traffic.update(dt, t, player);
      police.update(dt, t, player);
      updateChasers(dt);
      combat.update(dt);
      updateMountain(dt);
      for (const v of vehicles) if (v !== player.vehicle && !chasers.includes(v)) updateVehicleVisual(v, dt, t);
      clockAcc += dt;
      while (clockAcc > 1.2) {
        clockAcc -= 1.2;
        G.clockMin++;
        if (G.clockMin >= 1440) { G.clockMin = 0; G.dow = (G.dow + 1) % 7; }
      }
      G.stats.playSeconds += dt;
      for (const n of [ratna, sari, bimo, darto]) n.human.animate(dt * 0.4, 0.2);
    }
    updateCamera(dt);
    const tp = currentTarget();
    if (tp) {
      world.beacon.visible = true;
      world.beacon.position.set(tp.x, groundH(tp.x, tp.z) + 35, tp.z);
    } else world.beacon.visible = false;
    world.updateSun(player.x, player.z);
  } else if (G.mode === 'paused') {
    if (presses.includes('p') || presses.includes('escape')) closePause();
    camera.position.lerp(new THREE.Vector3(player.x - Math.sin(camYaw) * 7, player.y + 3, player.z - Math.cos(camYaw) * 7), 0.08);
    camera.lookAt(player.x, player.y + 1.4, player.z);
  }

  world.tick(dt, t);
  const target = currentTarget();
  hud.update(dt, {
    player, missions, police, camera, audio,
    targetPos: G.mode === 'playing' || G.mode === 'banner' ? target : null,
    project: projectToScreen,
  });
  renderer.render(scene, camera);
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'setMute') { G.settings.muted = e.target.checked; audio.setMuted(e.target.checked); }
  if (e.target.id === 'setShadows') renderer.shadowMap.enabled = e.target.checked;
});

showTitle();
if (G.summit) world.flagPlanted = true;
window.BAYU = {
  G, player, vehicles, police, missions, traffic, scene, camera, renderer,
  startGame, openPause, hud, world,
};
setupShots({
  G, player, police, missions, hud, world, vehicles, scene, damar,
  startGame, openPause, setChasers, camera,
  setCamYaw: (v) => { camYaw = v; },
  refreshHud: () => hud.update(0.5, {
    player, missions, police, camera, audio,
    targetPos: currentTarget(), project: projectToScreen,
  }),
});
requestAnimationFrame(frame);
