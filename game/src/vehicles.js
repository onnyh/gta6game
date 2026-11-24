// vehicles.js — Teluk Bayu's cars: the factory that builds them, the parked
// cars Raka can steal, the traffic that loops the avenues, and the arcade
// driving physics every car (player, traffic, police) shares.

import * as THREE from "three";
import { ROAD_LINES, ROAD_WIDTH, CITY_HALF, terrainHeight, collideCircle, seededRandom } from "./world.js";

// Fictional local model names — no real marques.
export const CAR_MODELS = [
  { name: "Rimba 1500", style: "sedan", topSpeed: 33, accel: 15 },
  { name: "Cakra City", style: "hatch", topSpeed: 29, accel: 14 },
  { name: "Pusaka Pickup", style: "pickup", topSpeed: 27, accel: 12 },
  { name: "Angkot Biru 07", style: "angkot", topSpeed: 24, accel: 10 },
  { name: "Lestari Sport", style: "sedan", topSpeed: 38, accel: 18 },
];

const PAINT = [0xd94f30, 0x2e7de8, 0xf2b13c, 0x39b56b, 0xe8e3d5, 0x8a5fc0, 0xe86aa2, 0x37b8b0, 0x555c66];

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1c20 });
const glassMat = new THREE.MeshPhongMaterial({ color: 0x22384a, shininess: 120, specular: 0x9fd0ff });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

// Build one car mesh facing +Z. Styles: sedan, hatch, pickup, angkot, police.
// The returned group has userData.wheels (spin/steer) and, for police cars,
// userData.lightBar = { red, blue } meshes for the flashing bar.
export function makeCarMesh(paintColor, style) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: paintColor });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2e33 });

  const body = new THREE.Mesh(boxGeo, paint);
  const isVan = style === "angkot";
  const isPickup = style === "pickup";
  body.scale.set(1.9, isVan ? 1.15 : 0.62, isVan ? 4.7 : 4.3);
  body.position.y = isVan ? 1.05 : 0.68;
  body.castShadow = true;
  car.add(body);

  if (isPickup) {
    const cab = new THREE.Mesh(boxGeo, paint);
    cab.scale.set(1.8, 0.62, 1.5);
    cab.position.set(0, 1.28, 1.15);
    cab.castShadow = true;
    car.add(cab);
    const cabGlass = new THREE.Mesh(boxGeo, glassMat);
    cabGlass.scale.set(1.7, 0.5, 1.3);
    cabGlass.position.set(0, 1.32, 1.15);
    car.add(cabGlass);
    const bed = new THREE.Mesh(boxGeo, dark);
    bed.scale.set(1.8, 0.3, 2.2);
    bed.position.set(0, 1.05, -1.0);
    car.add(bed);
  } else if (isVan) {
    const glassBand = new THREE.Mesh(boxGeo, glassMat);
    glassBand.scale.set(1.94, 0.55, 3.6);
    glassBand.position.set(0, 1.45, 0.2);
    car.add(glassBand);
    const stripe = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xf5f0e6 }));
    stripe.scale.set(1.94, 0.3, 4.72);
    stripe.position.set(0, 0.62, 0);
    car.add(stripe);
  } else {
    const cabin = new THREE.Mesh(boxGeo, style === "hatch" ? paint : glassMat);
    cabin.scale.set(1.66, 0.55, style === "hatch" ? 2.3 : 2.0);
    cabin.position.set(0, 1.22, style === "hatch" ? -0.35 : -0.15);
    cabin.castShadow = true;
    car.add(cabin);
    if (style === "hatch") {
      const glassBand = new THREE.Mesh(boxGeo, glassMat);
      glassBand.scale.set(1.7, 0.42, 2.0);
      glassBand.position.set(0, 1.24, -0.3);
      car.add(glassBand);
    }
  }

  // Police livery: white body comes from the caller; add black doors band
  // and the red/blue light bar.
  let lightBar = null;
  if (style === "police") {
    const band = new THREE.Mesh(boxGeo, dark);
    band.scale.set(1.94, 0.5, 4.32);
    band.position.set(0, 0.66, 0);
    car.add(band);
    const barBase = new THREE.Mesh(boxGeo, dark);
    barBase.scale.set(1.3, 0.12, 0.5);
    barBase.position.set(0, 1.62, -0.15);
    car.add(barBase);
    const red = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xff2a20 }));
    red.scale.set(0.55, 0.2, 0.44);
    red.position.set(-0.34, 1.76, -0.15);
    car.add(red);
    const blue = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.scale.set(0.55, 0.2, 0.44);
    blue.position.set(0.34, 1.76, -0.15);
    car.add(blue);
    lightBar = { red, blue };
  }

  // Headlights and tail lights.
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(boxGeo, lightMat);
    hl.scale.set(0.42, 0.18, 0.08);
    hl.position.set(sx, 0.72, (isVan ? 4.7 : 4.3) / 2 + 0.02);
    car.add(hl);
    const tl = new THREE.Mesh(boxGeo, tailMat);
    tl.scale.set(0.42, 0.16, 0.08);
    tl.position.set(sx, 0.78, -(isVan ? 4.7 : 4.3) / 2 - 0.02);
    car.add(tl);
  }

  const wheels = [];
  const wheelPos = [
    [-0.88, 1.38, true], [0.88, 1.38, true],
    [-0.88, -1.38, false], [0.88, -1.38, false],
  ];
  for (const [wx, wz, front] of wheelPos) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.37, wz);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.castShadow = true;
    pivot.add(wheel);
    car.add(pivot);
    wheels.push({ pivot, wheel, front });
  }

  car.userData.wheels = wheels;
  car.userData.lightBar = lightBar;
  return car;
}

// A car as the simulation sees it.
export function makeCarObject(mesh, model, kind) {
  return {
    mesh,
    model,
    kind, // 'parked' | 'traffic' | 'police'
    heading: mesh.rotation.y,
    speed: 0,
    steerVis: 0,
    driver: null, // null | 'player' | 'ai'
    name: model.name,
    topSpeed: model.topSpeed,
    accel: model.accel,
    stolen: false,
    crimeCooldown: 0,
  };
}

// ---- Parked cars ---------------------------------------------------------

export function spawnParkedCars(scene) {
  const rand = seededRandom(777);
  const cars = [];
  const spots = [];
  // Along the shore road and a few avenues, noses to the kerb.
  for (let i = 0; i < 18; i++) {
    const vertical = rand() < 0.5;
    const line = ROAD_LINES[Math.floor(rand() * ROAD_LINES.length)];
    const along = -CITY_HALF + 30 + rand() * (CITY_HALF * 2 - 60);
    const side = rand() < 0.5 ? -1 : 1;
    const off = side * (ROAD_WIDTH / 2 + 3.4);
    const x = vertical ? line + off : along;
    const z = vertical ? along : line + off;
    if (Math.hypot(x - 24, z - 248) < 16) continue; // keep the market clear
    spots.push({ x, z, heading: vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2) });
  }
  // One reliable car right by the market, where Raka starts.
  spots.push({ x: 40, z: 236, heading: Math.PI / 2 });
  for (const spot of spots) {
    const model = CAR_MODELS[Math.floor(rand() * CAR_MODELS.length)];
    const mesh = makeCarMesh(PAINT[Math.floor(rand() * PAINT.length)], model.style);
    mesh.position.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
    mesh.rotation.y = spot.heading;
    scene.add(mesh);
    const car = makeCarObject(mesh, model, "parked");
    car.heading = spot.heading;
    cars.push(car);
  }
  return cars;
}

// ---- Traffic -------------------------------------------------------------

// A traffic car follows a rectangular loop of avenues, right-hand side.
function makeLoop(rand) {
  const xs = [ROAD_LINES[Math.floor(rand() * 3)], ROAD_LINES[4 + Math.floor(rand() * 3)]];
  const zs = [ROAD_LINES[Math.floor(rand() * 3)], ROAD_LINES[4 + Math.floor(rand() * 3)]];
  const lane = 4.4;
  // Clockwise loop with a lane offset so opposing flows pass each other.
  return [
    { x: xs[0] + lane, z: zs[0] - lane },
    { x: xs[1] - lane, z: zs[0] - lane },
    { x: xs[1] - lane, z: zs[1] + lane },
    { x: xs[0] + lane, z: zs[1] + lane },
  ];
}

export function createTraffic(scene, count = 9) {
  const rand = seededRandom(4242);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const model = CAR_MODELS[Math.floor(rand() * CAR_MODELS.length)];
    const mesh = makeCarMesh(PAINT[Math.floor(rand() * PAINT.length)], model.style);
    scene.add(mesh);
    const car = makeCarObject(mesh, model, "traffic");
    car.driver = "ai";
    car.loop = makeLoop(rand);
    car.wp = Math.floor(rand() * 4);
    const start = car.loop[car.wp];
    mesh.position.set(start.x, 0, start.z);
    car.heading = rand() * Math.PI * 2;
    cars.push(car);
  }
  return cars;
}

// Steer a car toward a point; returns the control for driveCar().
export function steerToward(car, tx, tz, dt, cruiseSpeed) {
  const p = car.mesh.position;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
  const throttle = dist > 4 ? (cruiseSpeed > car.speed ? 0.75 : -0.4) : 0.25;
  return { throttle, steer, handbrake: false, arrived: dist < 7 };
}

// Advance every traffic car: follow the loop, brake for the player and for
// the car ahead, and report the strongest impact (for crime detection).
export function updateTraffic(cars, dt, colliders, playerPos) {
  let impact = 0;
  for (const car of cars) {
    const target = car.loop[car.wp];
    const control = steerToward(car, target.x, target.z, dt, 10.5);
    if (control.arrived) car.wp = (car.wp + 1) % car.loop.length;
    // Courtesy braking: stop when the player is just ahead.
    const p = car.mesh.position;
    const dx = playerPos.x - p.x;
    const dz = playerPos.z - p.z;
    const distP = Math.hypot(dx, dz);
    if (distP < 9) {
      const ahead = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / (distP || 1);
      if (ahead > 0.45) {
        control.throttle = car.speed > 0.5 ? -0.9 : 0;
      }
    }
    impact = Math.max(impact, driveCar(car, control, dt, colliders));
  }
  return impact;
}

// ---- Shared driving physics ----------------------------------------------

// Advance one car by dt under control {throttle, steer, handbrake}.
// Returns the impact speed when the car struck a building this step (0 else).
export function driveCar(car, control, dt, colliders) {
  const maxReverse = -9;
  const accel = control.throttle > 0 ? car.accel : car.accel * 0.7;
  if (control.throttle !== 0) {
    car.speed += control.throttle * accel * dt;
  } else {
    // Gentle rolling drag.
    car.speed -= car.speed * 0.55 * dt;
    if (Math.abs(car.speed) < 0.04) car.speed = 0;
  }
  if (control.handbrake) car.speed -= car.speed * 3.2 * dt;
  car.speed = THREE.MathUtils.clamp(car.speed, maxReverse, car.topSpeed);

  const speedFactor = THREE.MathUtils.clamp(Math.abs(car.speed) / 7, 0, 1);
  const dirSign = car.speed >= 0 ? 1 : -1;
  car.heading += control.steer * 1.75 * speedFactor * dirSign * dt;
  car.steerVis += (control.steer * 0.5 - car.steerVis) * Math.min(1, dt * 9);

  const p = car.mesh.position;
  const nx = p.x + Math.sin(car.heading) * car.speed * dt;
  const nz = p.z + Math.cos(car.heading) * car.speed * dt;
  // Cars stay off the mountain cone and out of the sea.
  let impact = 0;
  if (terrainHeight(nx, nz) <= 4 && nz < 344) {
    p.x = nx;
    p.z = nz;
  } else {
    impact = Math.abs(car.speed);
    car.speed *= 0.25;
  }
  const probe = { x: p.x, z: p.z, y: 0 };
  if (collideCircle(colliders, probe, 1.7)) {
    impact = Math.max(impact, Math.abs(car.speed));
    p.x = probe.x;
    p.z = probe.z;
    car.speed *= 0.3;
  }
  p.y = terrainHeight(p.x, p.z);
  car.mesh.rotation.y = car.heading;

  // Wheels: front pair steers, all four spin with travel.
  const spin = (car.speed * dt) / 0.37;
  for (const w of car.mesh.userData.wheels) {
    if (w.front) w.pivot.rotation.y = car.steerVis;
    w.wheel.rotation.x += spin;
  }
  return impact;
}
