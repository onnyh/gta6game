// main.js — Bayu Heat's game loop and glue: the renderer and late-afternoon
// light, Raka on foot and behind the wheel, the third-person camera, car
// theft and collision crimes, arrests and respawns, saving, pause — and the
// staging hooks that pose the game for its own screenshots.

import * as THREE from "three";
import {
  buildWorld, terrainHeight, collideCircle, WORLD_EDGE, MARKET_POS,
} from "./world.js";
import {
  spawnParkedCars, createTraffic, updateTraffic, driveCar,
} from "./vehicles.js";
import {
  makePlayerPerson, walkAnim, restPose, spawnPedestrians, updatePedestrians,
  knockDown, startlePeds,
} from "./people.js";
import { PoliceSystem } from "./police.js";
import { MissionChain } from "./missions.js";
import { Hud } from "./hud.js";
import { GameAudio } from "./audio.js";
import { Input } from "./input.js";

// ---- Renderer, scene, light ----------------------------------------------

const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc3e8);
scene.fog = new THREE.Fog(0xf2c99a, 320, 1150);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
sun.position.set(260, 300, 190);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -420;
sun.shadow.camera.right = 420;
sun.shadow.camera.top = 420;
sun.shadow.camera.bottom = -420;
sun.shadow.camera.far = 1100;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- World and cast --------------------------------------------------------

const world = buildWorld(scene);
const colliders = world.colliders;
const parkedCars = spawnParkedCars(scene);
const trafficCars = createTraffic(scene, 9);
const pedestrians = spawnPedestrians(scene, 26);
const police = new PoliceSystem(scene, colliders);
const hud = new Hud();
const audio = new GameAudio();
const input = new Input(canvas);

const person = makePlayerPerson();
scene.add(person.group);
const SPAWN = { x: MARKET_POS.x - 8, z: MARKET_POS.z - 14 };
person.group.position.set(SPAWN.x, 0, SPAWN.z);

const player = {
  yaw: 0, // facing -Z (into town) at spawn
  vy: 0,
  grounded: true,
  walkPhase: 0,
  speedNow: 0,
  inCar: null,
  crimeCd: 0,
};
let camYaw = player.yaw;
let camPitch = 0.34;
let carCamOrbit = 0;

// ---- Cash and saving -------------------------------------------------------

let cash = 1500;
try {
  const saved = Number(localStorage.getItem("bayuheat.cash"));
  if (Number.isFinite(saved) && saved >= 0) cash = Math.floor(saved);
} catch { /* private mode: play unsaved */ }
function saveCash() {
  try {
    localStorage.setItem("bayuheat.cash", String(Math.floor(cash)));
  } catch { /* ignore */ }
  hud.setCash(cash);
}

// ---- Missions ----------------------------------------------------------------

const missions = new MissionChain({
  summitPos: world.summitPos,
  hooks: {
    toast: (text, kind) => hud.toast(text, kind),
    reward: (amount, label) => {
      cash += amount;
      saveCash();
      hud.missionDone(`+Rp ${amount.toLocaleString("id-ID")} — ${label}`);
      audio.success();
    },
    objective: (html) => hud.setObjective(html),
    setWanted: (stars) => police.setWanted(stars),
    chainComplete: () => {
      hud.missionDone("UTANG LUNAS! 🎉 Teluk Bayu berterima kasih, Raka.");
    },
  },
});

// The objective beacon: a pillar of gold light over the current marker.
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(1.5, 1.5, 90, 12, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xffb340, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
  })
);
beacon.visible = false;
scene.add(beacon);

// ---- Game state --------------------------------------------------------------

let state = "menu"; // 'menu' | 'playing' | 'paused' | 'busted'
let bustedTimer = 0;
let menuOrbit = 0;
let hornTimer = 14;
const params = new URLSearchParams(window.location.search);
const shotMode = params.get("shot");

const startScreen = document.getElementById("start-screen");
const bustedScreen = document.getElementById("busted-screen");
const pauseScreen = document.getElementById("pause-screen");

function startGame() {
  if (state !== "menu") return;
  state = "playing";
  startScreen.style.display = "none";
  hud.show();
  hud.setCash(cash);
  audio.ensure();
  missions.start();
  if (!shotMode && !input.usingTouch) canvas.requestPointerLock();
}

document.getElementById("start-btn").addEventListener("click", startGame);
canvas.addEventListener("click", () => {
  if (state === "playing" && !shotMode && !input.usingTouch && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
  if (state === "paused") resumeGame();
});
pauseScreen.addEventListener("click", resumeGame);

function resumeGame() {
  if (state !== "paused") return;
  state = "playing";
  pauseScreen.style.display = "none";
  audio.setMuted(false);
  if (!shotMode && !input.usingTouch) canvas.requestPointerLock();
}

document.addEventListener("pointerlockchange", () => {
  if (state === "playing" && !shotMode && !input.usingTouch && document.pointerLockElement !== canvas) {
    state = "paused";
    pauseScreen.style.display = "flex";
    audio.setMuted(true);
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" && state === "playing") {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else {
      state = "paused";
      pauseScreen.style.display = "flex";
      audio.setMuted(true);
    }
  }
  if (e.code === "KeyM" && state === "playing" && missions.done) missions.restart();
});

// ---- Arrests -------------------------------------------------------------------

police.onBusted = () => {
  if (state !== "playing") return;
  state = "busted";
  bustedTimer = 2.4;
  const fine = Math.min(cash, Math.max(500, Math.floor(cash * 0.2)));
  cash -= fine;
  saveCash();
  document.getElementById("busted-detail").textContent =
    `Polisi Teluk Bayu membawamu ke kantor. Uang sitaan: Rp ${fine.toLocaleString("id-ID")}.`;
  bustedScreen.style.display = "flex";
  audio.busted();
  audio.setEngine(false, 0);
  audio.setSiren(0);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  missions.notifyBusted();
};

function respawnAfterBust() {
  bustedScreen.style.display = "none";
  if (player.inCar) exitCar(true);
  police.clearAll();
  person.group.position.set(SPAWN.x, 0, SPAWN.z);
  person.group.visible = true;
  player.yaw = 0;
  camYaw = 0;
  state = "playing";
  if (!shotMode && !input.usingTouch) canvas.requestPointerLock();
}

// ---- Cars: getting in and out ----------------------------------------------------

function nearestStealableCar() {
  const p = person.group.position;
  let best = null;
  let bestDist = 4.2;
  for (const car of [...parkedCars, ...trafficCars]) {
    if (car.driver === "player") continue;
    const d = Math.hypot(car.mesh.position.x - p.x, car.mesh.position.z - p.z);
    if (d < bestDist) {
      best = car;
      bestDist = d;
    }
  }
  return best;
}

function enterCar(car) {
  player.inCar = car;
  car.driver = "player";
  person.group.visible = false;
  // A stolen traffic car leaves the traffic system and becomes "parked".
  const ti = trafficCars.indexOf(car);
  if (ti >= 0) {
    trafficCars.splice(ti, 1);
    parkedCars.push(car);
    car.kind = "parked";
  }
  if (!car.stolen) {
    car.stolen = true;
    police.addCrime(1.0);
    hud.toast(`Kamu mencuri ${car.name}!`, "bad");
    audio.blip(220, 0.2, "square", 0.12);
  } else {
    audio.blip(520, 0.08, "sine", 0.1);
  }
  carCamOrbit = 0;
}

function exitCar(silent = false) {
  const car = player.inCar;
  if (!car) return;
  player.inCar = null;
  car.driver = null;
  car.speed = 0;
  const p = car.mesh.position;
  const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
  person.group.position.set(p.x + side.x * 2.4, terrainHeight(p.x + side.x * 2.4, p.z + side.z * 2.4), p.z + side.z * 2.4);
  person.group.visible = true;
  player.yaw = car.heading + Math.PI;
  camYaw = player.yaw;
  if (!silent) audio.blip(440, 0.08, "sine", 0.1);
}

// ---- Per-frame updates --------------------------------------------------------------

const clock = new THREE.Clock();
const tmpVec = new THREE.Vector3();

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateOnFoot(dt) {
  const move = input.moveInput();
  const look = input.consumeLook();
  camYaw -= look.dx * 0.0026;
  camPitch = THREE.MathUtils.clamp(camPitch + look.dy * 0.0022, -0.18, 1.15);
  player.yaw = camYaw;

  const fx = -Math.sin(camYaw);
  const fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw);
  const rz = -Math.sin(camYaw);
  let wx = fx * move.z + rx * move.x;
  let wz = fz * move.z + rz * move.x;
  const wlen = Math.hypot(wx, wz);
  const moving = wlen > 0.05;
  if (moving) {
    wx /= wlen;
    wz /= wlen;
  }
  const speed = input.sprint() ? 11.2 : 6.8;
  const p = person.group.position;
  if (moving) {
    p.x += wx * speed * dt;
    p.z += wz * speed * dt;
    const faceYaw = Math.atan2(wx, wz);
    person.group.rotation.y = lerpAngle(person.group.rotation.y, faceYaw, Math.min(1, dt * 14));
    player.walkPhase += dt * speed * 1.55;
    walkAnim(person, player.walkPhase, Math.min(1, speed / 8));
    player.speedNow = speed;
  } else {
    restPose(person);
    player.speedNow = 0;
  }

  // Gravity and the ground (the mountain path included).
  player.vy -= 24 * dt;
  p.y += player.vy * dt;
  const ground = terrainHeight(p.x, p.z);
  if (p.y <= ground) {
    p.y = ground;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }
  if (input.consumeJump() && player.grounded) {
    player.vy = 8.6;
    player.grounded = false;
  } else {
    input.consumeJump();
  }

  collideCircle(colliders, p, 0.75);
  p.x = THREE.MathUtils.clamp(p.x, -WORLD_EDGE, WORLD_EDGE);
  p.z = THREE.MathUtils.clamp(p.z, -WORLD_EDGE, WORLD_EDGE);
  p.y = Math.max(p.y, terrainHeight(p.x, p.z));

  // Interaction prompt / entry.
  const near = nearestStealableCar();
  if (near) {
    hud.setPrompt(`Tekan <b>E</b> — curi ${near.name}`);
    if (input.consumeInteract()) enterCar(near);
  } else {
    hud.setPrompt(null);
    input.consumeInteract();
  }
  hud.setSpeed(null);
}

function updateDriving(dt) {
  const car = player.inCar;
  const move = input.moveInput();
  const look = input.consumeLook();
  carCamOrbit -= look.dx * 0.0032;
  carCamOrbit = THREE.MathUtils.clamp(carCamOrbit, -1.2, 1.2);
  camPitch = THREE.MathUtils.clamp(camPitch + look.dy * 0.0022, -0.1, 1.0);

  const impact = driveCar(car, {
    throttle: move.z,
    steer: -move.x,
    handbrake: input.isDown("Space"),
  }, dt, colliders);
  player.speedNow = car.speed;
  if (impact > 7) {
    audio.crash();
    startlePeds(pedestrians, car.mesh.position.x, car.mesh.position.z, 13);
    if (impact > 10 && player.crimeCd <= 0) {
      police.addCrime(0.35);
      player.crimeCd = 3;
    }
  }

  // Ramming traffic and pedestrians is very much a crime here.
  const cp = car.mesh.position;
  for (const other of trafficCars) {
    const op = other.mesh.position;
    if (Math.hypot(op.x - cp.x, op.z - cp.z) < 3.3 && Math.abs(car.speed) > 5) {
      audio.crash();
      if (player.crimeCd <= 0) {
        police.addCrime(0.6);
        player.crimeCd = 3;
      }
      other.speed = car.speed * 0.4;
      car.speed *= 0.45;
    }
  }
  if (Math.abs(car.speed) > 4) {
    for (const ped of pedestrians) {
      const pp = ped.person.group.position;
      if (Math.hypot(pp.x - cp.x, pp.z - cp.z) < 1.9) {
        if (knockDown(ped)) {
          audio.crash();
          police.addCrime(1.0);
          car.speed *= 0.5;
        }
      }
    }
  }

  hud.setPrompt(Math.abs(car.speed) < 11 ? "Tekan <b>E</b> — keluar mobil" : null);
  if (input.consumeInteract() && Math.abs(car.speed) < 11) exitCar();
  hud.setSpeed(car.speed * 3.6);
  audio.setEngine(true, Math.abs(car.speed) / car.topSpeed);
}

function updateCamera(dt) {
  let target;
  let dist;
  let height;
  if (player.inCar) {
    const car = player.inCar;
    target = car.mesh.position;
    const wantYaw = car.heading + Math.PI + carCamOrbit;
    camYaw = lerpAngle(camYaw, wantYaw, Math.min(1, dt * 3.2));
    carCamOrbit *= Math.pow(0.25, dt); // drift back behind the car
    dist = 11.5;
    height = 3.4;
  } else {
    target = person.group.position;
    dist = 8;
    height = 2.6;
  }
  const fx = -Math.sin(camYaw);
  const fz = -Math.cos(camYaw);
  const cx = target.x - fx * Math.cos(camPitch) * dist;
  const cz = target.z - fz * Math.cos(camPitch) * dist;
  const cy = target.y + height + Math.sin(camPitch) * dist;
  tmpVec.set(cx, Math.max(cy, terrainHeight(cx, cz) + 0.7), cz);
  camera.position.lerp(tmpVec, Math.min(1, dt * 10));
  camera.lookAt(target.x + fx * 6, target.y + 1.6, target.z + fz * 6);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  for (const fn of world.animated) fn(dt, t);

  if (state === "menu") {
    menuOrbit += dt * 0.045;
    const r = 300;
    camera.position.set(Math.sin(menuOrbit) * r, 105, Math.cos(menuOrbit) * r);
    camera.lookAt(-60, 10, -40);
  } else if (state === "playing" || state === "busted") {
    if (state === "busted") {
      bustedTimer -= dt;
      if (bustedTimer <= 0) respawnAfterBust();
    } else if (player.inCar) {
      updateDriving(dt);
    } else {
      updateOnFoot(dt);
    }

    const focus = player.inCar ? player.inCar.mesh.position : person.group.position;
    updateTraffic(trafficCars, dt, colliders, focus);
    updatePedestrians(pedestrians, dt);
    police.update(dt, {
      pos: focus,
      speed: player.speedNow,
      inCar: Boolean(player.inCar),
    });
    if (state === "playing") {
      missions.update(dt, {
        playerPos: focus,
        inCar: Boolean(player.inCar),
        stars: police.stars,
      });
    }
    if (player.crimeCd > 0) player.crimeCd -= dt;

    // Objective beacon follows the mission marker.
    const marker = missions.currentMarker();
    if (marker && state === "playing") {
      beacon.visible = true;
      beacon.position.set(marker.x, terrainHeight(marker.x, marker.z) + 44, marker.z);
      beacon.material.opacity = 0.22 + Math.sin(t * 3) * 0.08;
    } else {
      beacon.visible = false;
    }

    // A ferry horn drifts in from the bay now and then.
    hornTimer -= dt;
    if (hornTimer <= 0) {
      audio.horn();
      hornTimer = 35 + Math.random() * 45;
    }

    // HUD + audio beds.
    hud.setStars(police.stars, police.isEscaping());
    hud.setBusted(police.bustedMeter > 0.02 ? police.bustedMeter : null);
    hud.drawMinimap({
      playerPos: focus,
      playerHeading: player.inCar ? player.inCar.heading : person.group.rotation.y,
      police: police.cars.map((c) => c.mesh.position),
      traffic: trafficCars.map((c) => c.mesh.position),
      marker,
    });
    if (!player.inCar) audio.setEngine(false, 0);
    audio.setSiren(police.sirenLevel());
    sun.position.set(focus.x + 260, 300, focus.z + 190);
    sun.target.position.set(focus.x, 0, focus.z);

    updateCamera(dt);
  }
  renderer.render(scene, camera);
}

// ---- Screenshot staging (?shot=...) and debug hooks -------------------------
//
// The maker's own screenshots are staged by posing the live game: each mode
// below starts play and arranges a real scene — a real chase, a real
// delivery in progress, a real summit — which the screenshot script then
// photographs. Nothing here draws or fakes a frame.

function beginPlay(withMissions) {
  state = "playing";
  startScreen.style.display = "none";
  hud.show();
  hud.setCash(cash);
  audio.ensure();
  if (withMissions) missions.start();
}

function marketCar() {
  let best = null;
  let bestDist = Infinity;
  for (const car of parkedCars) {
    const d = Math.hypot(car.mesh.position.x - 40, car.mesh.position.z - 236);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

function stageShot(mode) {
  if (mode === "cover") {
    beginPlay(true);
    person.group.position.set(64, 0, 168);
    person.group.rotation.y = -2.59;
    camYaw = 0.55;
    player.yaw = camYaw;
  } else if (mode === "chase") {
    beginPlay(true);
    const car = marketCar();
    car.mesh.position.set(0, 0, 64);
    car.heading = Math.PI;
    car.mesh.rotation.y = Math.PI;
    car.speed = 13;
    enterCar(car);
    police.setWanted(3);
    // Two patrol cars already on his tail, lights going.
    for (let i = 0; i < 2; i++) {
      police.spawnCar(car.mesh.position);
      const cop = police.cars[police.cars.length - 1];
      cop.mesh.position.set(i === 0 ? -3.5 : 3.5, 0, 64 + 19 + i * 11);
      cop.heading = Math.PI;
      cop.mesh.rotation.y = Math.PI;
      cop.speed = 16;
    }
    camYaw = 0;
  } else if (mode === "mission") {
    beginPlay(true);
    const car = marketCar();
    car.mesh.position.set(118, 0, 292);
    car.heading = 0.49;
    car.mesh.rotation.y = 0.49;
    car.speed = 12;
    enterCar(car);
    police.clearAll(); // the delivery run starts with a clean record
    missions.step = "deliver";
    missions.timer = 118;
    camYaw = car.heading + Math.PI;
  } else if (mode === "summit") {
    beginPlay(false);
    const s = world.summitPos;
    person.group.position.set(s.x + 9, terrainHeight(s.x + 9, s.z + 9), s.z + 9);
    person.group.rotation.y = Math.PI / 4;
    camYaw = Math.PI + Math.PI / 4;
    player.yaw = camYaw;
  }
}

if (shotMode) stageShot(shotMode);

// Hooks for the maker's smoke test: read state, warp, and enter a car
// without a human at the keyboard.
window.__bayu = {
  get state() { return state; },
  get cash() { return cash; },
  player,
  police,
  missions,
  start: () => startGame(),
  pos() {
    const p = person.group.position;
    return { x: p.x, y: p.y, z: p.z, inCar: Boolean(player.inCar) };
  },
  teleport(x, z) {
    person.group.position.set(x, terrainHeight(x, z), z);
  },
  enterNearest() {
    const car = nearestStealableCar();
    if (car) enterCar(car);
    return Boolean(car);
  },
};

hud.setCash(cash);
animate();
