// Coral Bay Heat — the main loop and the wiring. This module owns the game state
// (Dani, the city, the wanted level, the story), runs the fixed-step simulation,
// and calls the specialists: city for the streets, traffic for the crowds, police
// for the law, combat for the violence, missions for the story, render for the eye.
import { PLAYER_WALK, PLAYER_RUN, CITY_SIZE } from './config.js';
import { makeRng, clamp, dist } from './rng.js';
import { buildCity, collideCircle } from './city.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { spawnParkedCars, nearestCar, carRadius, stepCarPhysics } from './vehicles.js';
import { createTrafficCars, updateTraffic, createPeds, updatePeds, makePed } from './traffic.js';
import { createWanted, updateWanted, updatePolice, reportCrime, wreckCopCar } from './police.js';
import { spawnBullet, updateBullets, updateCollisions, tryPunch, tryShoot } from './combat.js';
import { buildMissions, createMissionState, updateMissions, advanceDialogue } from './missions.js';
import { loadSave, writeSave, clearSave, loadMuted, writeMuted } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new SoundEngine();

// ------------------------------------------------------------------ state

function freshPlayer(garageDoor) {
  return {
    x: garageDoor.x + 26,
    y: garageDoor.y + 10,
    angle: 0,
    faceAngle: -Math.PI / 2,
    hp: 100,
    money: 120,
    car: null,
    weapon: 'fist',
    hasPistol: false,
    speedNow: 0,
    walkPhase: 0,
    punchCd: 0,
    shootCd: 0,
    punchAnimT: 0,
    hurtT: 0,
    regenT: 0,
    knockT: 0,
  };
}

function buildWorld(game) {
  game.rng = makeRng(20261117);
  game.city = buildCity(game.rng);
  game.missions = buildMissions(game.city);
  game.cars = [...spawnParkedCars(game.city, game.rng), ...createTrafficCars(game.rng)];
  game.peds = createPeds(game.city, game.rng);
  game.bullets = [];
  game.particles = [];
  game.pickups = [
    ...game.city.stashSpots.map((s, i) => ({ kind: 'stash', id: i, x: s.x, y: s.y, taken: false })),
    ...game.city.healthSpots.map((s, i) => ({ kind: 'health', id: i, x: s.x, y: s.y, taken: false, respawnT: 0 })),
  ];
  game.wanted = createWanted();
  game.mission = createMissionState();
  game.player = freshPlayer(game.city.landmarks.garage.door);
  game.bustT = 0;
  game.stashesFound = 0;
  game.copSpawnT = 0;
  game.trafficSpawnT = 0;
  game.playT = 0;
  game.autosaveT = 20;
}

const game = {
  state: 'title',
  time: 0,
  playT: 0,
  camera: { x: CITY_SIZE / 2, y: CITY_SIZE / 2, zoom: 0.9 },
  shakeT: 0,
  shakeMag: 0,
  toasts: [],
  dialogueLock: false,
  titleSel: 0,
  titleItems: [],
  titleShowHelp: false,
  pauseSel: 0,
  pauseItems: [],
  wastedText: '',
  bustedText: '',
  pilot: null,
  sound,
  input,
  city: null,
  missions: [],
  cars: [],
  peds: [],
  bullets: [],
  particles: [],
  pickups: [],
  player: null,
  wanted: createWanted(),
  mission: createMissionState(),
  stashesFound: 0,
  bustT: 0,
  copSpawnT: 0,
  trafficSpawnT: 0,
  autosaveT: 20,
  rng: makeRng(1),
};

buildWorld(game);
game.player.money = 120;

// ------------------------------------------------------------------ helpers the modules call back into

game.collide = (x, y, r) => collideCircle(game.city, x, y, r);
game.toast = (text) => {
  game.toasts.push({ text, t: 0, max: 3.4 });
  if (game.toasts.length > 3) game.toasts.shift();
};
game.addShake = (mag) => {
  game.shakeMag = Math.max(game.shakeMag, mag);
  game.shakeT = 0.35;
};
game.spawnSparks = (x, y, n, color) => {
  for (let i = 0; i < n && game.particles.length < 420; i++) {
    const a = game.rng.range(0, Math.PI * 2);
    const sp = game.rng.range(24, 130);
    game.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: game.rng.range(0.2, 0.5), max: 0.5, size: game.rng.range(1.4, 2.8), color, smoke: false });
  }
};
game.spawnSmoke = (x, y, n) => {
  for (let i = 0; i < n && game.particles.length < 420; i++) {
    game.particles.push({ x: x + game.rng.range(-6, 6), y: y + game.rng.range(-6, 6), vx: game.rng.range(-8, 8), vy: game.rng.range(-34, -18), life: game.rng.range(0.7, 1.4), max: 1.4, size: game.rng.range(4, 8), color: '#55555e', smoke: true });
  }
};
game.spawnMuzzle = (x, y) => {
  game.particles.push({ x, y, vx: 0, vy: 0, life: 0.07, max: 0.07, size: 6, color: '#ffd83d', smoke: false });
  game.spawnSparks(x, y, 2, '#ffb340');
};
game.spawnBullet = (x, y, angle, speed, from, dmg) => spawnBullet(game, x, y, angle, speed, from, dmg);
game.onCopCarWrecked = (car) => wreckCopCar(game, car);

game.saveGame = () => {
  if (game.state === 'title') return;
  const p = game.player;
  writeSave({
    money: p.money,
    hp: Math.round(p.hp),
    x: Math.round(p.x),
    y: Math.round(p.y),
    missionIndex: game.mission.index,
    storyDone: game.mission.phase === 'done',
    hasPistol: p.hasPistol,
    stashes: game.pickups.filter((pk) => pk.kind === 'stash' && pk.taken).map((pk) => pk.id),
  });
};

game.onWasted = () => {
  if (game.state !== 'play') return;
  game.state = 'wasted';
  const fee = Math.min(200, game.player.money);
  game.player.money -= fee;
  game.wastedText = `Dani wakes up outside Coral Bay General. The hospital bill was $${fee}. The city kept everything else.`;
  sound.engine(false, 0);
  sound.siren(Infinity);
  sound.busted();
};

game.onBusted = () => {
  if (game.state !== 'play') return;
  game.state = 'busted';
  const fine = Math.min(250, game.player.money);
  game.player.money -= fine;
  game.bustedText = `The CBPD let Dani go with a $${fine} fine and a warning that is not really a warning.`;
  game.bustT = 0;
  sound.engine(false, 0);
  sound.siren(Infinity);
  sound.busted();
};

game.onStoryComplete = () => {
  game.state = 'complete';
  game.saveGame();
};

// ------------------------------------------------------------------ flow: title, respawn, save

function refreshTitleItems() {
  const items = [{ id: 'new', label: 'NEW GAME' }];
  if (loadSave()) items.push({ id: 'continue', label: 'CONTINUE' });
  items.push({ id: 'help', label: 'HOW TO PLAY' });
  items.push({ id: 'sound', label: sound.muted ? 'SOUND: OFF' : 'SOUND: ON' });
  game.titleItems = items;
  game.titleSel = Math.min(game.titleSel, items.length - 1);
}

function startNewGame() {
  clearSave();
  buildWorld(game);
  game.state = 'play';
  game.toast('Find Rosa at the gold marker — her garage, south-west');
  sound.unlock();
}

function startContinue() {
  const save = loadSave();
  buildWorld(game);
  if (save) {
    const p = game.player;
    p.money = save.money ?? p.money;
    p.hp = clamp(save.hp ?? 100, 20, 100);
    p.x = save.x ?? p.x;
    p.y = save.y ?? p.y;
    p.hasPistol = !!save.hasPistol;
    if (p.hasPistol) p.weapon = 'pistol';
    game.mission.index = clamp(save.missionIndex ?? 0, 0, game.missions.length);
    if (save.storyDone || game.mission.index >= game.missions.length) {
      game.mission.index = game.missions.length;
      game.mission.phase = 'done';
    }
    for (const id of save.stashes ?? []) {
      const pk = game.pickups.find((q) => q.kind === 'stash' && q.id === id);
      if (pk) {
        pk.taken = true;
        game.stashesFound++;
      }
    }
  }
  game.state = 'play';
  game.toast('Welcome back to Coral Bay');
  sound.unlock();
}

function respawn() {
  const p = game.player;
  const hospital = game.city.landmarks.hospital.door;
  if (p.car) p.car = null;
  p.x = hospital.x;
  p.y = hospital.y + 14;
  p.hp = 100;
  p.hurtT = 0;
  game.wanted.heat = 0;
  game.wanted.stars = 0;
  game.bustT = 0;
  // The law loses interest, and its cruisers and officers clear off.
  game.cars = game.cars.filter((c) => c.kind !== 'police');
  game.peds = game.peds.filter((q) => q.kind !== 'officer');
  game.state = 'play';
  game.saveGame();
}

// ------------------------------------------------------------------ controls

function readControls() {
  if (game.pilot) return game.pilot(game);
  const k = input;
  const mx = (k.down('d', 'arrowright') ? 1 : 0) - (k.down('a', 'arrowleft') ? 1 : 0);
  const my = (k.down('s', 'arrowdown') ? 1 : 0) - (k.down('w', 'arrowup') ? 1 : 0);
  return {
    mx, my,
    run: k.down('shift'),
    throttle: (k.down('w', 'arrowup') ? 1 : 0) - (k.down('s', 'arrowdown') ? 1 : 0),
    steer: (k.down('d', 'arrowright') ? 1 : 0) - (k.down('a', 'arrowleft') ? 1 : 0),
    handbrake: k.down(' '),
  };
}

function mouseWorld() {
  const cam = game.camera;
  return {
    x: cam.x + (input.mouseX - renderer.w / 2) / cam.zoom,
    y: cam.y + (input.mouseY - renderer.h / 2) / cam.zoom,
  };
}

function enterExitCar() {
  const p = game.player;
  if (p.car) {
    const car = p.car;
    const side = car.angle + Math.PI / 2;
    const [nx, ny] = game.collide(car.x + Math.cos(side) * (carRadius(car) + 15), car.y + Math.sin(side) * (carRadius(car) + 15), 11);
    p.x = nx;
    p.y = ny;
    p.car = null;
    if (car.passenger) {
      // A story passenger climbs out too, on the other side.
      const guest = car.passenger;
      const [gx, gy] = game.collide(car.x - Math.cos(side) * (carRadius(car) + 15), car.y - Math.sin(side) * (carRadius(car) + 15), 11);
      guest.x = gx;
      guest.y = gy;
      guest.state = 'walk';
      guest.car = null;
      car.passenger = null;
    }
    car.doorOpenT = 0.3;
    sound.engine(false, 0);
    if (car.kind === 'traffic') car.kind = 'parked';
    if (car.kind === 'police') {
      car.kind = 'parked';
      car.paint = '#f2f2f0';
    }
    return;
  }
  const car = nearestCar(game, p.x, p.y, 48);
  if (!car || car.wrecked) return;
  const wasTraffic = car.kind === 'traffic';
  const wasPolice = car.kind === 'police';
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  car.doorOpenT = 0.3;
  sound.unlock();
  if (wasTraffic) {
    // The driver bails out and runs.
    const driver = makePed(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, game.rng, 'civilian');
    driver.panic = 3.2;
    driver.threatX = p.x;
    driver.threatY = p.y;
    game.peds.push(driver);
    reportCrime(game, 'theft', car.x, car.y);
    game.toast('Car stolen');
  } else if (wasPolice) {
    reportCrime(game, 'theft', car.x, car.y, true);
    game.toast('That is a police cruiser, Dani');
  } else if (car.kind === 'parked') {
    reportCrime(game, 'theft', car.x, car.y);
  }
}

// ------------------------------------------------------------------ the player

function updatePlayer(dt) {
  const p = game.player;
  const c = readControls();
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.punchAnimT = Math.max(0, p.punchAnimT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.knockT = Math.max(0, (p.knockT || 0) - dt);
  p.regenT += dt;
  if (p.regenT > 8 && p.hp > 0 && p.hp < 100) p.hp = Math.min(100, p.hp + 3.2 * dt);

  if (p.car) {
    const car = p.car;
    let throttle = c.throttle;
    let steer = c.steer;
    if (game.dialogueLock) {
      throttle = car.speed > 10 ? -0.5 : 0;
      steer = 0;
    }
    if (c.handbrake) {
      car.speed -= car.speed * 2.8 * dt;
      steer *= 1.3;
    }
    stepCarPhysics(game, car, throttle, steer, dt);
    p.x = car.x;
    p.y = car.y;
    p.faceAngle = car.angle;
    p.speedNow = Math.abs(car.speed);
    const revs = clamp(Math.abs(car.speed) / 480, 0, 1);
    sound.engine(true, throttle !== 0 ? Math.max(0.18, revs) : revs * 0.6);
    if (Math.abs(car.speed) > 240 && Math.abs(steer) > 0.7 && game.rng.chance(0.1)) sound.skid();
    return;
  }

  // On foot.
  sound.engine(false, 0);
  let vx = 0;
  let vy = 0;
  if (!game.dialogueLock && p.knockT <= 0) {
    const len = Math.hypot(c.mx, c.my);
    if (len > 0) {
      const speed = c.run ? PLAYER_RUN : PLAYER_WALK;
      vx = (c.mx / len) * speed;
      vy = (c.my / len) * speed;
      p.faceAngle = Math.atan2(vy, vx);
    }
  }
  p.speedNow = Math.hypot(vx, vy);
  if (p.speedNow > 4) p.walkPhase += dt * p.speedNow * 0.055;
  const [nx, ny] = game.collide(p.x + vx * dt, p.y + vy * dt, 11);
  p.x = nx;
  p.y = ny;
  // With the pistol out and a mouse to aim it, Dani faces the cursor when standing.
  if (p.weapon === 'pistol' && p.speedNow < 4) {
    const m = mouseWorld();
    p.faceAngle = Math.atan2(m.y - p.y, m.x - p.x);
  }
}

// ------------------------------------------------------------------ pickups and particles

function updatePickups(dt) {
  const p = game.player;
  for (const pk of game.pickups) {
    if (pk.kind === 'health' && pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.taken = false;
      continue;
    }
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 24) {
      if (pk.kind === 'stash') {
        pk.taken = true;
        game.stashesFound++;
        p.money += 100;
        sound.cash();
        game.toast(`Cash stash found — $100 (${game.stashesFound}/10)`);
        game.saveGame();
      } else if (pk.kind === 'health' && p.hp < 100) {
        pk.taken = true;
        pk.respawnT = 30;
        p.hp = Math.min(100, p.hp + 40);
        sound.pickup();
        game.toast('Patched up +40');
      }
    }
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const pt = game.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      game.particles.splice(i, 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.smoke) pt.vy -= 12 * dt;
    else pt.vy += 190 * dt;
  }
  // Wrecks and dying cars smoke.
  for (const car of game.cars) {
    if ((car.wrecked || car.hp < car.maxHp * 0.3) && game.rng.chance(0.25)) {
      game.spawnSmoke(car.x, car.y, 1);
    }
  }
}

// ------------------------------------------------------------------ input handling per state

function handlePresses() {
  const presses = input.takePresses();
  const clicks = input.takeClicks();
  for (const key of presses) {
    if (key === 'm') {
      sound.setMuted(!sound.muted);
      writeMuted(sound.muted);
      refreshTitleItems();
      continue;
    }
    if (game.state === 'title') {
      sound.unlock();
      if (game.titleShowHelp) {
        if (key === 'enter' || key === 'escape') game.titleShowHelp = false;
        continue;
      }
      if (key === 'w' || key === 'arrowup') game.titleSel = (game.titleSel + game.titleItems.length - 1) % game.titleItems.length;
      if (key === 's' || key === 'arrowdown') game.titleSel = (game.titleSel + 1) % game.titleItems.length;
      if (key === 'enter' || key === ' ') {
        const item = game.titleItems[game.titleSel];
        if (item?.id === 'new') startNewGame();
        else if (item?.id === 'continue') startContinue();
        else if (item?.id === 'help') game.titleShowHelp = true;
        else if (item?.id === 'sound') {
          sound.setMuted(!sound.muted);
          writeMuted(sound.muted);
          refreshTitleItems();
        }
      }
      continue;
    }
    if (game.state === 'pause') {
      if (key === 'w' || key === 'arrowup') game.pauseSel = (game.pauseSel + game.pauseItems.length - 1) % game.pauseItems.length;
      if (key === 's' || key === 'arrowdown') game.pauseSel = (game.pauseSel + 1) % game.pauseItems.length;
      if (key === 'p' || key === 'escape') game.state = 'play';
      if (key === 'enter') {
        const item = game.pauseItems[game.pauseSel];
        if (item?.id === 'resume') game.state = 'play';
        else if (item?.id === 'title') {
          game.saveGame();
          game.state = 'title';
          refreshTitleItems();
        } else if (item?.id === 'restart') startNewGame();
        else if (item?.id === 'sound') {
          sound.setMuted(!sound.muted);
          writeMuted(sound.muted);
          refreshPauseItems();
        }
      }
      continue;
    }
    if (game.state === 'wasted' || game.state === 'busted') {
      if (key === 'enter') respawn();
      continue;
    }
    if (game.state === 'complete') {
      if (key === 'enter') {
        game.state = 'play';
        game.toast('Free roam — Coral Bay is yours');
      }
      continue;
    }
    // Play state.
    if (key === 'p' || key === 'escape') {
      refreshPauseItems();
      game.pauseSel = 0;
      game.state = 'pause';
      game.saveGame();
      continue;
    }
    if (game.dialogueLock) {
      if (key === 'e' || key === 'enter' || key === ' ') advanceDialogue(game);
      continue;
    }
    if (key === 'f') enterExitCar();
    if (key === ' ') tryPunch(game);
    if (key === '1') game.player.weapon = 'fist';
    if (key === '2' && game.player.hasPistol) game.player.weapon = 'pistol';
  }
  for (const click of clicks) {
    void click;
    sound.unlock();
    if (game.state !== 'play') continue;
    if (game.dialogueLock) {
      advanceDialogue(game);
      continue;
    }
    const p = game.player;
    if (!p.car) {
      if (p.weapon === 'pistol') {
        const m = mouseWorld();
        tryShoot(game, m.x, m.y);
      } else {
        const m = mouseWorld();
        p.faceAngle = Math.atan2(m.y - p.y, m.x - p.x);
        tryPunch(game);
      }
    }
  }
  // Held mouse fire.
  if (game.state === 'play' && !game.dialogueLock && input.mouseDown && !game.player.car && game.player.weapon === 'pistol') {
    const m = mouseWorld();
    tryShoot(game, m.x, m.y);
  }
}

function refreshPauseItems() {
  game.pauseItems = [
    { id: 'resume', label: 'RESUME' },
    { id: 'title', label: 'SAVE & TITLE' },
    { id: 'restart', label: 'RESTART STORY' },
    { id: 'sound', label: sound.muted ? 'SOUND: OFF' : 'SOUND: ON' },
  ];
}

// ------------------------------------------------------------------ the step

function step(dt) {
  game.time += dt;
  handlePresses();

  if (game.state === 'title') {
    // A slow sunset drift over the city behind the title.
    game.camera.x = CITY_SIZE / 2 + Math.sin(game.time * 0.045) * 620;
    game.camera.y = CITY_SIZE / 2 + Math.cos(game.time * 0.032) * 480;
    game.camera.zoom = 0.82;
    updateTraffic(game, dt);
    updatePeds(game, dt);
    updateParticles(dt);
    return;
  }
  if (game.state !== 'play') return;

  game.playT += dt;
  game.shakeT = Math.max(0, game.shakeT - dt);
  if (game.shakeT === 0) game.shakeMag = 0;
  for (const toast of game.toasts) toast.t += dt;
  game.toasts = game.toasts.filter((t) => t.t < t.max);

  updatePlayer(dt);
  updateTraffic(game, dt);
  updatePeds(game, dt);
  // Pedestrian walk cycles.
  for (const ped of game.peds) {
    if (ped.speed > 4) ped.walkPhase = (ped.walkPhase || 0) + dt * ped.speed * 0.055;
    if (ped.state === 'down' && ped.downT > 8 && ped.kind === 'civilian') {
      // The street clears its own tragedies, eventually.
      ped.state = 'walk';
      ped.hp = 60;
      ped.x = game.player.x + 900;
      ped.y = game.player.y;
      ped.downT = 0;
    }
  }
  updateWanted(game, dt);
  updatePolice(game, dt);
  updateMissions(game, dt);
  updateBullets(game, dt);
  updateCollisions(game, dt);
  updatePickups(dt);
  updateParticles(dt);

  // Camera: follow Dani (or the car), leaning into the motion.
  const p = game.player;
  const focus = p.car || p;
  const lead = p.car ? 0.34 : 0.12;
  const tx = focus.x + (p.car ? Math.cos(p.car.angle) * p.car.speed * lead : 0);
  const ty = focus.y + (p.car ? Math.sin(p.car.angle) * p.car.speed * lead : 0);
  game.camera.x += (tx - game.camera.x) * Math.min(1, dt * 5.2);
  game.camera.y += (ty - game.camera.y) * Math.min(1, dt * 5.2);
  const targetZoom = p.car ? clamp(1.02 - Math.abs(p.car.speed) / 1600, 0.78, 1.02) : 1.04;
  game.camera.zoom += (targetZoom - game.camera.zoom) * Math.min(1, dt * 3);

  game.autosaveT -= dt;
  if (game.autosaveT <= 0) {
    game.autosaveT = 20;
    game.saveGame();
  }
}

// ------------------------------------------------------------------ boot

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize();
}
window.addEventListener('resize', resize);
resize();

sound.setMuted(loadMuted());
refreshTitleItems();
refreshPauseItems();

const params = new URLSearchParams(window.location.search);
if (params.has('shot')) {
  // Screenshot mode: stage the scene, run it forward deterministically, draw once.
  const staged = stageShot(game, params.get('shot') || 'cover');
  game.pilot = staged.pilot;
  game.state = 'play';
  for (let i = 0; i < staged.steps; i++) step(1 / 30);
  game.pilot = null;
  // Settle the camera on the staged action for the still.
  const focus = game.player.car || game.player;
  game.camera.x = focus.x;
  game.camera.y = focus.y;
  game.camera.zoom = game.player.car ? 0.94 : 1.05;
  renderer.draw(game);
  document.title = 'Coral Bay Heat — shot ready';
} else {
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    acc += Math.min(0.12, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    renderer.draw(game);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
