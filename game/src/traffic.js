// Bayu Heat — the living street: angkot, sedans and pickups driving the grid
// on the left (this is Indonesia), braking for each other and for jaywalkers,

import * as THREE from '../vendor/three.module.min.js';
import { CITY } from './config.js';
import { nearestIntersection, routeBetween, collideCircle, groundH } from './city.js';
import { createVehicle, stepVehicle, updateVehicleVisual } from './vehicles.js';
import { createHuman, PED_PALETTES, SKIN_TONES } from './actors.js';
import { makeRng, clamp, angleDiff } from './rng.js';

const TRAFFIC_TYPES = ['bruma', 'angkot', 'duna', 'bruma', 'angkot', 'engkel', 'bruma', 'aleron', 'angkot', 'duna'];

export class Traffic {
  constructor(scene, layout, colliders, vehicles, hooks = {}) {
    this.scene = scene;
    this.colliders = colliders;
    this.vehicles = vehicles;          // shared master list (police add theirs too)
    this.hooks = hooks;
    this.rng = makeRng(1234);
    this.peds = [];

    for (const p of layout.parked) {
      const v = createVehicle(p.type, this.rng.int(0, 9));
      v.x = p.x; v.z = p.z; v.heading = p.heading; v.driver = 'none';
      v.y = groundH(p.x, p.z);
      scene.add(v.group);
      this.vehicles.push(v);
    }
    for (let i = 0; i < 13; i++) {
      const v = createVehicle(TRAFFIC_TYPES[i % TRAFFIC_TYPES.length], this.rng.int(0, 9));
      v.driver = 'traffic';
      v.cruiseSpeed = this.rng.range(8.5, 12.5);
      this.placeOnRoad(v, 40 + i * 22);
      scene.add(v.group);
      this.vehicles.push(v);
    }
    for (let i = 0; i < 16; i++) {
      const pal = PED_PALETTES[i % PED_PALETTES.length];
      const human = createHuman({
        skin: SKIN_TONES[i % SKIN_TONES.length], shirt: pal.shirt, pants: pal.pants,
        dress: i % 3 === 0 ? pal.shirt : 0, hair: i % 3 === 0 ? 0x241a12 : 0x14100c,
      });
      const ped = {
        human, x: 0, z: 0, heading: this.rng.range(0, 6.28), speed: 0,
        tx: 0, tz: 0, state: 'walk', hp: 30, fleeAt: -9, deadAt: 0, down: false,
      };
      this.respawnPed(ped, true);
      scene.add(human.group);
      this.peds.push(ped);
    }
  }

  placeOnRoad(v, distFromOrigin = 0) {
    const ix = this.rng.pick(CITY.roadX), iz = this.rng.pick(CITY.roadZ);
    v.x = ix; v.z = iz; v.vx = 0; v.vz = 0; v.speed = 0;
    v.heading = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    this.newRoute(v);
    v.y = groundH(v.x, v.z);
  }

  newRoute(v) {
    const from = nearestIntersection(v.x, v.z);
    let to = { x: this.rng.pick(CITY.roadX), z: this.rng.pick(CITY.roadZ) };
    if (to.x === from.x && to.z === from.z) to = { x: CITY.roadX[3], z: CITY.roadZ[3] };
    v.route = routeBetween(from, to, this.rng);
    v.routeIdx = v.route.length > 1 ? 1 : 0;
  }

  respawnPed(ped, anywhere = false) {
    const rx = this.rng.pick(CITY.roadX), rz = this.rng.pick(CITY.roadZ);
    ped.x = rx + this.rng.range(-30, 30); ped.z = rz + (this.rng.chance(0.5) ? 11.9 : -11.9);
    if (!anywhere) { ped.x = clamp(ped.x, 6, 446); ped.z = clamp(ped.z, 6, 382); }
    ped.down = false; ped.hp = 30; ped.state = 'walk';
    ped.human.setPose('stand');
    this.pickPedTarget(ped);
  }

  pickPedTarget(ped) {
    const along = this.rng.range(-46, 46);
    if (this.rng.chance(0.5)) { ped.tx = clamp(ped.x + along, 4, 450); ped.tz = ped.z + this.rng.pick([-2, 0, 2]); }
    else { ped.tz = clamp(ped.z + along, 4, 386); ped.tx = ped.x + this.rng.pick([-2, 0, 2]); }
  }

  scare(x, z, radius = 22) {
    for (const p of this.peds) {
      if (p.down) continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) { p.state = 'flee'; p.fleeAt = performance.now() / 1000; p.fleeX = x; p.fleeZ = z; }
    }
  }

  update(dt, t, player) {
    const px = player.x, pz = player.z;
    for (const v of this.vehicles) {
      if (v.driver !== 'traffic' || v.dead) continue;
      const distP = Math.hypot(v.x - px, v.z - pz);
      if (distP > 320) { this.placeOnRoad(v); continue; }
      if (!v.route || v.routeIdx >= v.route.length) this.newRoute(v);
      const wp = v.route[v.routeIdx];
      const cur = v.route[Math.max(0, v.routeIdx - 1)] || v;
      let dx = wp.x - cur.x, dz = wp.z - cur.z;
      const segLen = Math.hypot(dx, dz) || 1; dx /= segLen; dz /= segLen;
      const tx = wp.x + dz * 3.3 - v.x, tz = wp.z - dx * 3.3 - v.z;
      const targetAngle = Math.atan2(tx, tz);
      const steer = clamp(angleDiff(v.heading, targetAngle) * 2.4, -1, 1);
      let want = v.cruiseSpeed;
      if (Math.abs(angleDiff(v.heading, targetAngle)) > 0.55) want = Math.min(want, 5);
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      let brake = false, honk = false;
      for (const o of this.vehicles) {
        if (o === v) continue;
        const ox = o.x - v.x, oz = o.z - v.z;
        const fwd = ox * fx + oz * fz, lat = Math.abs(ox * fz - oz * fx);
        if (fwd > 0 && fwd < 11 && lat < 2.3) { brake = true; if (fwd < 6) honk = true; }
      }
      const pdx = px - v.x, pdz = pz - v.z;
      const pFwd = pdx * fx + pdz * fz, pLat = Math.abs(pdx * fz - pdz * fx);
      if (pFwd > 0 && pFwd < 9 && pLat < 2.1) { brake = true; honk = pFwd < 5.5; }
      for (const p of this.peds) {
        if (p.down) continue;
        const ex = p.x - v.x, ez = p.z - v.z;
        const ef = ex * fx + ez * fz, el = Math.abs(ex * fz - ez * fx);
        if (ef > 0 && ef < 8 && el < 2) { brake = true; honk = true; }
      }
      let throttle = 0;
      if (brake) throttle = v.speed > 0.5 ? -0.7 : 0;
      else if (v.speed < want) throttle = 0.75;
      if (honk && t > v.honkAt && this.hooks.onHonk) { v.honkAt = t + 2.5; this.hooks.onHonk(v); }
      const impact = stepVehicle(v, { throttle, steer, handbrake: false }, dt, this.colliders, this.vehicles);
      if (impact > 6 && this.hooks.onCrash) this.hooks.onCrash(v, impact);
      if (Math.hypot(wp.x - v.x, wp.z - v.z) < 6) { v.routeIdx++; if (v.routeIdx >= v.route.length) this.newRoute(v); }
      if (Math.abs(v.speed) < 0.4) {
        if (t - (v.stuckAt || 0) > 4) {
          v.stuckAt = t;
          if (distP > 90) this.placeOnRoad(v); else this.newRoute(v);
        }
      } else v.stuckAt = t;
      updateVehicleVisual(v, dt, t);
    }
    for (const p of this.peds) {
      const h = p.human;
      if (p.down) {
        if (t - p.deadAt > 14) this.respawnPed(p);
        continue;
      }
      const distP = Math.hypot(p.x - px, p.z - pz);
      if (distP > 300) { this.respawnPed(p); continue; }
      let speed = 0;
      if (p.state === 'flee') {
        if (t - p.fleeAt > 3.2) p.state = 'walk';
        const ax = p.x - (p.fleeX || px), az = p.z - (p.fleeZ || pz);
        const l = Math.hypot(ax, az) || 1;
        p.tx = p.x + (ax / l) * 14; p.tz = p.z + (az / l) * 14;
        speed = 5.4;
      } else speed = 1.55;
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 1.2) { if (p.state === 'walk') this.pickPedTarget(p); }
      else {
        const targetAngle = Math.atan2(dx, dz);
        p.heading += clamp(angleDiff(p.heading, targetAngle), -dt * 6, dt * 6);
        let nx = p.x + Math.sin(p.heading) * speed * dt;
        let nz = p.z + Math.cos(p.heading) * speed * dt;
        const res = collideCircle(nx, nz, 0.45, this.colliders);
        nx = clamp(res.x, -6, 486); nz = clamp(res.z, -6, 398);
        p.x = nx; p.z = nz;
      }
      for (const v of this.vehicles) {
        if (Math.abs(v.speed) < 3.5) continue;
        if (Math.hypot(v.x - p.x, v.z - p.z) < v.def.radius + 0.5) {
          p.down = true; p.deadAt = t; h.setPose('down');
          h.group.position.set(p.x, groundH(p.x, p.z) + 0.25, p.z);
          if (this.hooks.onPedDown) this.hooks.onPedDown(p, v);
          break;
        }
      }
      if (!p.down) {
        h.group.position.set(p.x, groundH(p.x, p.z), p.z);
        h.group.rotation.y = p.heading;
        h.animate(dt, d > 1.2 ? speed : 0);
      }
    }
  }
}
