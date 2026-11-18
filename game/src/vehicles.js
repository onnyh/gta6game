// Bayu Heat — vehicle factory and arcade driving physics: low-poly box
// kitbashes — coupes, sedans, vans, pickups, angkots, bebeks, cruisers.

import * as THREE from '../vendor/three.module.min.js';
import { VEHICLES } from './config.js';
import { mergeParts, vcMat, canvasTexture } from './world.js';
import { groundH, collideCircle } from './city.js';
import { clamp } from './rng.js';

const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const wheelGeo = CYL(0.36, 0.36, 0.26, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1c20 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x22384a });

export const CAR_COLORS = [0xd84040, 0x3c78d8, 0xf2f2f2, 0x2c2c30, 0xe8a03c, 0x3ca864, 0xe83e8c, 0x7a5aa8, 0xb9bec6, 0x2aa8a0];
export const ANGKOT_SCHEMES = [
  { body: 0x2a7ad8, roof: 0xf2f2f2 }, { body: 0x3ca83c, roof: 0xf2e03c },
  { body: 0xe8762c, roof: 0xf2f2f2 }, { body: 0xd83c5c, roof: 0xbde8f2 },
];

const textPlate = (text, fg, bg, w = 256, h = 48) => canvasTexture(w, h, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = '900 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
});

let vehicleSeq = 0;

export function createVehicle(type, colorIdx = 0) {
  const def = VEHICLES[type];
  const group = new THREE.Group();
  const wheels = [];
  let lightbar = null, driverFigure = null;
  const addWheels = (track, base, r = 0.36) => {
    for (const [wx, wz] of [[-track, base], [track, base], [-track, -base], [track, -base]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.scale.setScalar(r / 0.36);
      w.position.set(wx, r, wz);
      group.add(w); wheels.push(w);
    }
  };

  if (type === 'bebek') {
    const body = new THREE.Mesh(mergeParts([
      { geo: BOX(0.34, 0.5, 1.5), y: 0.62, z: 0.1, color: CAR_COLORS[colorIdx % CAR_COLORS.length] },
      { geo: BOX(0.3, 0.34, 0.7), y: 0.82, z: -0.55, color: 0x2c2c30 },
      { geo: BOX(0.4, 0.16, 0.5), y: 0.95, z: 0.62, color: 0x2c2c30 },
      { geo: BOX(0.06, 0.4, 0.06), y: 0.95, z: 0.95, rz: 0.4, color: 0x888888 },
      { geo: BOX(0.5, 0.05, 0.08), y: 1.12, z: 1.02, color: 0x444444 },
    ]), vcMat);
    body.castShadow = true; group.add(body);
    for (const wz of [0.95, -0.85]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.scale.set(0.5, 0.92, 0.92); w.position.set(0, 0.33, wz);
      group.add(w); wheels.push(w);
    }
  } else if (type === 'angkot') {
    const scheme = ANGKOT_SCHEMES[colorIdx % ANGKOT_SCHEMES.length];
    const body = new THREE.Mesh(mergeParts([
      { geo: BOX(1.95, 1.15, 4.6), y: 1.05, color: scheme.body },
      { geo: BOX(1.9, 0.62, 4.5), y: 1.95, color: scheme.roof },
      { geo: BOX(1.97, 0.5, 4.2), y: 1.78, color: 0x22384a },
      { geo: BOX(1.8, 0.3, 0.9), y: 0.62, z: 2.15, color: scheme.body },
      { geo: BOX(1.7, 0.34, 0.06), y: 0.95, z: 2.42, color: 0xd8ecff },
      { geo: BOX(0.9, 0.1, 0.5), y: 2.42, z: 0.4, color: 0xf2f2f2 },
    ]), vcMat);
    body.castShadow = true; group.add(body);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.3), new THREE.MeshLambertMaterial({ map: textPlate('ANGKOT', '#12325e', '#ffd83c'), side: THREE.DoubleSide }));
    plate.position.set(0, 2.42, 0.66); group.add(plate);
    const plate2 = plate.clone(); plate2.position.z = 0.14; plate2.rotation.y = Math.PI; group.add(plate2);
    addWheels(0.85, 1.5, 0.38);
  } else if (type === 'engkel') {
    const c = CAR_COLORS[colorIdx % CAR_COLORS.length];
    const body = new THREE.Mesh(mergeParts([
      { geo: BOX(2.0, 1.95, 3.6), y: 1.45, z: -0.7, color: 0xe8e8e8 },
      { geo: BOX(1.95, 1.05, 1.5), y: 0.95, z: 1.75, color: c },
      { geo: BOX(1.8, 0.5, 0.06), y: 1.25, z: 2.5, color: 0x22384a },
    ]), vcMat);
    body.castShadow = true; group.add(body);
    addWheels(0.88, 1.65, 0.4);
  } else if (type === 'duna') {
    const c = CAR_COLORS[colorIdx % CAR_COLORS.length];
    const body = new THREE.Mesh(mergeParts([
      { geo: BOX(1.95, 0.6, 4.5), y: 0.62, color: c },
      { geo: BOX(1.8, 0.62, 1.9), y: 1.2, z: 0.55, color: c },
      { geo: BOX(1.66, 0.5, 1.7), y: 1.24, z: 0.55, color: 0x22384a },
      { geo: BOX(1.85, 0.42, 1.7), y: 0.86, z: -1.35, color: 0x3a3f4a },
    ]), vcMat);
    body.castShadow = true; group.add(body);
    addWheels(0.88, 1.5, 0.4);
  } else if (type === 'cruiser') {
    const body = new THREE.Mesh(mergeParts([
      { geo: BOX(1.9, 0.62, 4.5), y: 0.62, color: 0xf4f6fa },
      { geo: BOX(1.92, 0.2, 4.52), y: 0.52, color: 0x2050b0 },
      { geo: BOX(1.7, 0.55, 2.1), y: 1.18, z: -0.2, color: 0xf4f6fa },
      { geo: BOX(1.74, 0.44, 1.9), y: 1.2, z: -0.2, color: 0x22384a },
      { geo: BOX(1.96, 0.3, 0.3), y: 0.55, z: 2.3, color: 0x2c2c30 },
    ]), vcMat);
    body.castShadow = true; group.add(body);
    const sideTex = textPlate('POLISI', '#ffffff', '#2050b0', 256, 40);
    for (const sx of [-0.97, 0.97]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.4), new THREE.MeshLambertMaterial({ map: sideTex }));
      p.position.set(sx, 0.78, 0); p.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(p);
    }
    lightbar = new THREE.Group();
    const lbBase = new THREE.Mesh(BOX(1.3, 0.1, 0.4), new THREE.MeshLambertMaterial({ color: 0x222228 }));
    lightbar.add(lbBase);
    const red = new THREE.Mesh(BOX(0.58, 0.2, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2a30 }));
    red.position.x = -0.33; lightbar.add(red);
    const blue = new THREE.Mesh(BOX(0.58, 0.2, 0.34), new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
    blue.position.x = 0.33; lightbar.add(blue);
    lightbar.position.set(0, 1.58, -0.2);
    group.add(lightbar);
    lightbar.userData = { red, blue };
    addWheels(0.86, 1.5);
  } else {
    const sport = type === 'aleron';
    const c = type === 'cruiser' ? 0xf4f6fa : CAR_COLORS[colorIdx % CAR_COLORS.length];
    const body = new THREE.Mesh(mergeParts([
      { geo: BOX(1.92, sport ? 0.5 : 0.62, 4.45), y: sport ? 0.55 : 0.62, color: c },
      { geo: BOX(1.7, sport ? 0.42 : 0.55, sport ? 1.9 : 2.1), y: sport ? 0.95 : 1.18, z: -0.25, color: c },
      { geo: BOX(1.74, sport ? 0.36 : 0.46, 1.7), y: sport ? 0.97 : 1.2, z: -0.25, color: 0x22384a },
      { geo: BOX(1.8, 0.14, 0.06), y: 0.72, z: 2.24, color: 0xfff2c0 },
      ...(sport ? [
        { geo: BOX(1.7, 0.07, 0.4), y: 1.02, z: -2.2, color: 0x1c1c20 },
        { geo: BOX(0.08, 0.22, 0.3), y: 0.86, z: -2.2, x: -0.7, color: 0x1c1c20 },
        { geo: BOX(0.08, 0.22, 0.3), y: 0.86, z: -2.2, x: 0.7, color: 0x1c1c20 },
        { geo: BOX(1.86, 0.16, 0.5), y: 0.4, z: 2.1, color: 0x1c1c20 },
      ] : []),
    ]), vcMat);
    body.castShadow = true; group.add(body);
    addWheels(0.86, 1.5);
  }

  if (def.kind !== 'bike') {
    driverFigure = new THREE.Mesh(mergeParts([
      { geo: BOX(0.52, 0.62, 0.3), y: 1.12, z: type === 'engkel' ? 1.6 : 0.15, color: 0x2a3040 },
      { geo: new THREE.SphereGeometry(0.17, 8, 6), y: 1.58, z: type === 'engkel' ? 1.6 : 0.15, color: 0xc89878 },
    ]), vcMat);
    group.add(driverFigure);
  }

  const v = {
    id: vehicleSeq++, type, def, group, wheels, lightbar, driverFigure,
    x: 0, z: 0, y: 0, heading: 0, vx: 0, vz: 0, speed: 0, steerVis: 0,
    condition: 100, driver: 'none', dead: false, honkAt: 0,
    route: null, routeIdx: 0, cruiseSpeed: 11, stuckAt: 0, lastX: 0, lastZ: 0,
  };
  group.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = true; });
  return v;
}

export function stepVehicle(v, input, dt, colliders, others) {
  const def = v.def;
  const top = def.topSpeed * (v.condition <= 0 ? 0.22 : v.condition < 35 ? 0.6 : 1);
  const fwdX = Math.sin(v.heading), fwdZ = Math.cos(v.heading);
  let fwdSpeed = v.vx * fwdX + v.vz * fwdZ;

  if (input.throttle > 0) fwdSpeed += def.accel * input.throttle * dt * (fwdSpeed < 0 ? 2.4 : 1);
  else if (input.throttle < 0) {
    if (fwdSpeed > 0.6) fwdSpeed -= 24 * dt;
    else fwdSpeed = Math.max(fwdSpeed + def.accel * 0.55 * input.throttle * dt, -top * 0.32);
  }
  fwdSpeed -= fwdSpeed * 0.32 * dt;
  if (!input.throttle) fwdSpeed -= Math.sign(fwdSpeed) * Math.min(Math.abs(fwdSpeed), 1.1 * dt);
  fwdSpeed = clamp(fwdSpeed, -top * 0.32, top);

  const turnAuthority = clamp(fwdSpeed / 8, -1, 1) / (1 + Math.max(0, Math.abs(fwdSpeed) - 20) * 0.014);
  v.heading += input.steer * turnAuthority * (def.kind === 'bike' ? 2.5 : 1.85) * dt * (input.handbrake ? 1.45 : 1);
  v.steerVis += ((input.steer * 0.45) - v.steerVis) * Math.min(1, dt * 9);

  const nfx = Math.sin(v.heading), nfz = Math.cos(v.heading);
  const latX = v.vx - nfx * fwdSpeed, latZ = v.vz - nfz * fwdSpeed;
  const grip = input.handbrake ? 1.1 : def.grip;
  const latDecay = Math.exp(-grip * dt);
  v.vx = nfx * fwdSpeed + latX * latDecay;
  v.vz = nfz * fwdSpeed + latZ * latDecay;
  v.speed = fwdSpeed;

  let nx = v.x + v.vx * dt, nz = v.z + v.vz * dt;
  let impact = 0;
  const resolved = collideCircle(nx, nz, def.radius, colliders);
  if (resolved.x !== nx || resolved.z !== nz) {
    const into = Math.abs(v.vx * (nx - resolved.x) + v.vz * (nz - resolved.z)) / Math.max(dt, 0.001) * 0.14;
    impact = Math.max(impact, Math.min(into, Math.abs(fwdSpeed)));
    v.vx *= 0.35; v.vz *= 0.35;
    nx = resolved.x; nz = resolved.z;
  }
  for (const o of others) {
    if (o === v || o.dead) continue;
    const dx = nx - o.x, dz = nz - o.z, rr = def.radius + o.def.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 0.01) {
      const d = Math.sqrt(d2), push = (rr - d) / 2;
      nx += (dx / d) * push; nz += (dz / d) * push;
      const rel = Math.abs((v.vx - o.vx) * (dx / d) + (v.vz - o.vz) * (dz / d));
      if (rel > 3.4) { impact = Math.max(impact, rel); damageVehicle(v, (rel - 3) * 1.5); damageVehicle(o, (rel - 3) * 1.5); }
      v.vx = v.vx * 0.6 + o.vx * 0.4; v.vz = v.vz * 0.6 + o.vz * 0.4;
    }
  }
  if (nz < -4 && Math.abs(v.speed) > 0.1) { /* mountain: free */ }
  nx = clamp(nx, -130, 560);
  nz = clamp(nz, -330, 415);
  if (nx > 490 && !(nz > 258 && nz < 392)) { nx = Math.min(nx, 490); v.vx = Math.min(v.vx, 0); }
  v.x = nx; v.z = nz;
  return impact;
}

export function damageVehicle(v, amount) {
  v.condition = Math.max(0, v.condition - amount);
}

export function updateVehicleVisual(v, dt, t) {
  const g = v.group;
  const gy = groundH(v.x, v.z);
  v.y += (gy - v.y) * Math.min(1, dt * 14);
  g.position.set(v.x, v.y, v.z);
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const hF = groundH(v.x + fx * 1.7, v.z + fz * 1.7), hB = groundH(v.x - fx * 1.7, v.z - fz * 1.7);
  const hL = groundH(v.x + fz * 1.1, v.z - fx * 1.1), hR = groundH(v.x - fz * 1.1, v.z + fx * 1.1);
  g.rotation.set(0, 0, 0);
  g.rotation.order = 'YXZ';
  g.rotation.y = v.heading;
  g.rotation.x = -Math.atan2(hF - hB, 3.4) * (v.z < -4 || hF !== hB ? 1 : 0);
  g.rotation.z = Math.atan2(hL - hR, 2.2) * (v.z < -4 || hL !== hR ? 1 : 0);
  const spin = v.speed * dt / 0.36;
  v.wheels.forEach((w, i) => {
    w.rotation.x += spin;
    if (v.def.kind !== 'bike' && i < 2) w.rotation.y = v.steerVis;
    else if (v.def.kind === 'bike') w.rotation.y = v.steerVis * 0.7;
  });
  if (v.lightbar) {
    const phase = Math.floor(t * 2.6) % 2;
    v.lightbar.userData.red.material.color.setHex(phase ? 0xff2a30 : 0x661014);
    v.lightbar.userData.blue.material.color.setHex(phase ? 0x0d2a66 : 0x2a6aff);
  }
  if (v.driverFigure) v.driverFigure.visible = v.driver !== 'player';
}
