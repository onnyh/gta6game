// Bayu Heat — POLRES TELUK BAYU: a heat-based wanted system. Named units
// hunt by road, officers chase on foot, roadblocks close roads at 4 stars,

import * as THREE from '../vendor/three.module.min.js';
import { WANTED } from './config.js';
import { nearestIntersection, routeBetween, groundH, MOUNTAIN_ROAD, TRAIL, polylinePoint } from './city.js';
import { createVehicle, stepVehicle, updateVehicleVisual } from './vehicles.js';
import { createHuman } from './actors.js';
import { mergeParts, vcMat } from './world.js';
import { makeRng, clamp, angleDiff } from './rng.js';
import { G } from './state.js';

const CALLSIGNS = ['CAMAR-1', 'ELANG-2', 'RAJAWALI-3', 'CAMAR-4', 'ELANG-5', 'RAJAWALI-6', 'CAMAR-7'];
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

export class Police {
  constructor(scene, vehicles, colliders, hooks = {}) {
    this.scene = scene;
    this.vehicles = vehicles;
    this.colliders = colliders;
    this.hooks = hooks;
    this.rng = makeRng(555);
    this.units = [];            // {vehicle, callsign, mode:'car'|'foot', officer, route, routeIdx, repathAt}
    this.blocks = [];           // roadblock cruisers + officers
    this.blockCooldown = 0;
    this.spawnTick = 0;
    this.heli = null;
    this.buildHeli();
  }

  buildHeli() {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(mergeParts([
      { geo: BOX(2.2, 1.9, 5.6), y: 0, z: 0.4, color: 0xf4f6fa },
      { geo: BOX(2.24, 0.5, 3.4), y: -0.5, z: 0.6, color: 0x2050b0 },
      { geo: BOX(0.5, 0.5, 4.6), y: 0.25, z: -4.4, color: 0xd8dde6 },
      { geo: BOX(0.16, 1.1, 0.9), y: 0.5, z: -6.5, color: 0x2050b0 },
      { geo: BOX(1.9, 0.8, 1.6), y: 0.25, z: 2.6, color: 0x22384a },
      { geo: BOX(2.6, 0.14, 0.5), y: -1.15, z: 0.4, color: 0x333a44 },
    ]), vcMat);
    body.castShadow = true; grp.add(body);
    const rotor = new THREE.Mesh(BOX(10.6, 0.06, 0.5), new THREE.MeshLambertMaterial({ color: 0x22242a }));
    rotor.position.y = 1.25; grp.add(rotor);
    const tail = new THREE.Mesh(BOX(0.08, 1.4, 0.34), new THREE.MeshLambertMaterial({ color: 0x22242a }));
    tail.position.set(0.3, 0.35, -6.6); grp.add(tail);
    const spot = new THREE.SpotLight(0xfff2cc, 0, 160, 0.32, 0.5, 0.6);
    grp.add(spot); grp.add(spot.target);
    const cone = new THREE.Mesh(CYL(0.6, 13, 42, 14),
      new THREE.MeshBasicMaterial({ color: 0xffedb5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    cone.position.y = -21; grp.add(cone);
    grp.visible = false;
    this.scene.add(grp);
    this.heli = { group: grp, rotor, tail, spot, cone, active: false, angle: 0, x: 0, z: 0, y: 60 };
  }

  addHeat(points, witnessed = true) {
    if (G.stars >= 5 && points > 0) points *= 0.5;
    G.heat = clamp(G.heat + (witnessed ? points : points * 0.45), 0, 560);
    this.syncStars();
  }
  setStars(n) {
    G.heat = WANTED.thresholds[clamp(n, 0, 5)] + 1;
    this.syncStars();
  }
  syncStars() {
    let s = 0;
    WANTED.thresholds.forEach((th, i) => { if (G.heat >= th) s = i; });
    if (s !== G.stars) { G.stars = s; if (this.hooks.onStars) this.hooks.onStars(s); }
  }
  clear() {
    G.heat = 0; G.stars = 0; G.bustMeter = 0;
    for (const u of this.units) this.removeUnit(u);
    this.units = [];
    for (const b of this.blocks) { this.scene.remove(b.vehicle.group); this.removeFromList(b.vehicle); if (b.officer) this.scene.remove(b.officer.human.group); }
    this.blocks = [];
    this.heli.active = false; this.heli.group.visible = false;
  }
  removeFromList(v) { const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); }
  removeUnit(u) {
    this.scene.remove(u.vehicle.group);
    this.removeFromList(u.vehicle);
    if (u.officer) this.scene.remove(u.officer.human.group);
  }

  spawnUnit(px, pz) {
    let best = null, bd = -1;
    for (let tries = 0; tries < 14; tries++) {
      const ix = this.rng.pick([0, 64, 128, 192, 256, 320, 384, 448]);
      const iz = this.rng.pick([0, 64, 128, 192, 256, 320, 384]);
      const d = Math.hypot(ix - px, iz - pz);
      if (d > 85 && d < 190 && d > bd) { bd = d; best = { x: ix, z: iz }; }
    }
    if (!best) best = { x: 64, z: 64 };
    const v = createVehicle('cruiser', 0);
    v.x = best.x; v.z = best.z; v.driver = 'police';
    v.heading = this.rng.range(0, 6.28);
    v.y = groundH(v.x, v.z);
    this.scene.add(v.group);
    this.vehicles.push(v);
    const used = new Set(this.units.map((u) => u.callsign));
    const callsign = CALLSIGNS.find((c) => !used.has(c)) || 'CAMAR-9';
    const u = { vehicle: v, callsign, mode: 'car', officer: null, route: null, routeIdx: 0, repathAt: 0, trailT: 0 };
    this.units.push(u);
    return u;
  }

  makeOfficer(x, z) {
    const human = createHuman({ skin: 0xa06844, shirt: 0x1d3468, pants: 0x16283f, cap: 0x1d3468, hair: 0x14100c, police: true });
    human.group.position.set(x, groundH(x, z), z);
    this.scene.add(human.group);
    return { human, x, z, heading: 0, shootAt: 0, speed: 6.1, hp: 40, dead: false, y: 0, h: 1.75, r: 0.55, officer: true };
  }

  targets() {
    const out = [];
    for (const u of this.units) if (u.officer && !u.officer.dead) { u.officer.y = groundH(u.officer.x, u.officer.z); out.push(u.officer); }
    for (const b of this.blocks) if (b.officer && !b.officer.dead) { b.officer.y = groundH(b.officer.x, b.officer.z); out.push(b.officer); }
    return out;
  }

  update(dt, t, player) {
    const px = player.x, pz = player.z;
    const inMountains = pz < -8;
    if (G.stars > 0 && t - G.lastSeenAt > 5) {
      const rate = (inMountains && !this.heli.active) ? 11 : 5;
      G.heat = Math.max(0, G.heat - rate * dt);
      this.syncStars();
    }
    const want = WANTED.unitsByStar[G.stars];
    this.spawnTick -= dt;
    if (this.units.length < want && this.spawnTick <= 0) { this.spawnUnit(px, pz); this.spawnTick = 1.6; }
    if (this.units.length > want) { const u = this.units.pop(); this.removeUnit(u); }

    let seen = false;
    for (let ui = this.units.length - 1; ui >= 0; ui--) {
      const u = this.units[ui];
      if (u.officer && u.officer.dead) {           // a downed officer's unit stands down
        this.units.splice(ui, 1);
        this.removeFromList(u.vehicle);
        u.vehicle.driver = 'none';
        continue;
      }
      const v = u.vehicle;
      const dPlayer = Math.hypot(v.x - px, v.z - pz);
      if (dPlayer > 340) { // recycle far-away units back into the hunt
        const spot = nearestIntersection(px + this.rng.range(-120, 120), pz + this.rng.range(-120, 120));
        v.x = spot.x; v.z = spot.z; v.vx = v.vz = 0; u.mode = 'car';
        if (u.officer) { this.scene.remove(u.officer.human.group); u.officer = null; }
      }
      if (u.mode === 'car') {
        if (dPlayer < 48) seen = true;
        this.driveUnit(u, dt, t, player, inMountains);
        if (player.onFoot && dPlayer < 10 && G.stars >= 1 && Math.abs(player.speed) < 4.5) {
          u.mode = 'foot';
          u.officer = this.makeOfficer(v.x + 1.6, v.z);
          v.driver = 'police-parked'; v.vx = v.vz = 0; v.speed = 0;
        }
      } else {
        const o = u.officer;
        if (Math.hypot(o.x - px, o.z - pz) < 42) seen = true;
        if (u.trailMode) this.trailOfficer(u, dt, t, player);
        else {
          this.moveOfficer(u, dt, t, player, inMountains);
          if ((!player.onFoot || Math.hypot(o.x - px, o.z - pz) > 60) && !inMountains) {
            const back = Math.hypot(o.x - v.x, o.z - v.z);
            if (back < 2.4) {
              this.scene.remove(o.human.group); u.officer = null; u.mode = 'car'; v.driver = 'police';
            } else this.walkOfficer(o, v.x, v.z, dt, 6.4);
          }
        }
      }
      updateVehicleVisual(v, dt, t);
    }
    this.blockCooldown -= dt;
    if (G.stars >= WANTED.roadblockStar && !player.onFoot && this.blockCooldown <= 0 && this.blocks.length === 0) {
      this.placeRoadblock(player);
      this.blockCooldown = 26;
    }
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (Math.hypot(b.vehicle.x - px, b.vehicle.z - pz) < 46) seen = true;
      if (Math.hypot(b.vehicle.x - px, b.vehicle.z - pz) > 150) {
        this.scene.remove(b.vehicle.group); this.removeFromList(b.vehicle);
        if (b.officer) this.scene.remove(b.officer.human.group);
        this.blocks.splice(i, 1);
      }
      updateVehicleVisual(b.vehicle, dt, t);
    }
    const heliWanted = G.stars >= WANTED.heliStar;
    if (heliWanted && !this.heli.active) { this.heli.active = true; this.heli.group.visible = true; this.heli.x = px + 60; this.heli.z = pz - 60; }
    if (!heliWanted && this.heli.active) { this.heli.active = false; this.heli.group.visible = false; }
    if (this.heli.active) {
      const h = this.heli;
      h.angle += dt * 0.42;
      const tx = px + Math.cos(h.angle) * 24, tz = pz + Math.sin(h.angle) * 24;
      h.x += (tx - h.x) * Math.min(1, dt * 1.4);
      h.z += (tz - h.z) * Math.min(1, dt * 1.4);
      h.y = groundH(h.x, h.z) + 42;
      h.group.position.set(h.x, h.y, h.z);
      h.group.rotation.y = Math.atan2(px - h.x, pz - h.z);
      h.rotor.rotation.y += dt * 28; h.tail.rotation.x += dt * 30;
      const dH = Math.hypot(h.x - px, h.z - pz);
      if (dH < 34) seen = true;
      h.spot.intensity = 900; h.spot.position.set(0, -1, 0);
      h.spot.target.position.set(px - h.x, -h.y + groundH(px, pz), pz - h.z);
      h.cone.material.opacity = 0.05 + Math.sin(t * 9) * 0.012;
      h.cone.position.y = -21; h.cone.rotation.x = Math.atan2(px - h.x, pz - h.z) * 0.2;
      if (this.hooks.onHeliSpot) this.hooks.onHeliSpot(dH < 34);
    }
    G.seenByPolice = seen && G.stars > 0;
    if (G.seenByPolice) { G.lastSeenAt = t; G.lastKnownX = px; G.lastKnownZ = pz; }
    let nearest = 1e9;
    for (const u of this.units) nearest = Math.min(nearest, Math.hypot(u.vehicle.x - px, u.vehicle.z - pz));
    if (this.hooks.onSiren) this.hooks.onSiren(nearest, G.stars > 0);
  }

  driveUnit(u, dt, t, player, inMountains) {
    const v = u.vehicle;
    let target = null, direct = false;
    if (inMountains) {
      if (!u.onRoad) {
        if (!u.route || t > u.repathAt) {
          u.route = routeBetween(nearestIntersection(v.x, v.z), { x: 192, z: 0 }, this.rng);
          u.routeIdx = u.route.length > 1 ? 1 : 0;
          u.repathAt = t + 2;
        }
        target = u.route[Math.min(u.routeIdx, u.route.length - 1)];
        if (Math.hypot(target.x - v.x, target.z - v.z) < 8) u.routeIdx++;
        if (Math.hypot(192 - v.x, 0 - v.z) < 10) { u.onRoad = true; u.roadIdx = 0; }
      } else {
        if (!u.roadPts) u.roadPts = MOUNTAIN_ROAD.map(([x, z]) => ({ x, z }));
        const idx = u.roadIdx || 0;
        target = u.roadPts[Math.min(idx, u.roadPts.length - 1)];
        if (Math.hypot(target.x - v.x, target.z - v.z) < 9 && idx < u.roadPts.length - 1) u.roadIdx = idx + 1;
        if (idx >= u.roadPts.length - 1 && Math.hypot(target.x - v.x, target.z - v.z) < 12) {
          if (G.stars >= 2 && !u.officer) { u.mode = 'foot'; u.trailMode = true; u.officer = this.makeOfficer(v.x + 1.5, v.z); u.trailT = 0; v.driver = 'police-parked'; }
          v.vx *= 0.8; v.vz *= 0.8; v.speed *= 0.8;
          return;
        }
        direct = true;
      }
    } else {
      u.roadPts = null; u.roadIdx = 0; u.onRoad = false;
      const dP = Math.hypot(player.x - v.x, player.z - v.z);
      if (dP < 17) { target = { x: player.x, z: player.z }; direct = true; }
      else {
        if (!u.route || t > u.repathAt) {
          const from = nearestIntersection(v.x, v.z);
          const to = nearestIntersection(G.lastKnownX || player.x, G.lastKnownZ || player.z);
          u.route = routeBetween(from, to, this.rng);
          u.routeIdx = u.route.length > 1 ? 1 : 0;
          u.repathAt = t + 1.4;
        }
        target = u.route[Math.min(u.routeIdx, u.route.length - 1)];
        if (Math.hypot(target.x - v.x, target.z - v.z) < 7) { u.routeIdx++; }
      }
    }
    const targetAngle = Math.atan2(target.x - v.x, target.z - v.z);
    const steer = clamp(angleDiff(v.heading, targetAngle) * 2.6, -1, 1);
    let throttle = 1;
    const dT = Math.hypot(target.x - v.x, target.z - v.z);
    if (!direct && dT < 8) throttle = 0.4;
    const impact = stepVehicle(v, { throttle, steer, handbrake: false }, dt, this.colliders, this.vehicles);
    if (impact > 7 && this.hooks.onRam) this.hooks.onRam(v, impact);
    if (Math.abs(v.speed) < 0.3) {
      u.stuckAt = (u.stuckAt || 0) + dt;
      if (u.stuckAt > 2.6) { // reverse out of trouble
        stepVehicle(v, { throttle: -1, steer: -steer, handbrake: false }, dt * 2, this.colliders, this.vehicles);
        if (u.stuckAt > 3.4) u.stuckAt = 0;
      }
    } else u.stuckAt = 0;
  }

  walkOfficer(o, tx, tz, dt, speed) {
    const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz);
    if (d > 0.4) {
      o.heading = Math.atan2(dx, dz);
      o.x += Math.sin(o.heading) * speed * dt;
      o.z += Math.cos(o.heading) * speed * dt;
    }
    o.human.group.position.set(o.x, groundH(o.x, o.z), o.z);
    o.human.group.rotation.y = o.heading;
    o.human.animate(dt, d > 0.4 ? speed : 0);
    o.human.group.position.y = groundH(o.x, o.z) + o.human.bobY;
    return d;
  }

  moveOfficer(u, dt, t, player, inMountains) {
    const o = u.officer;
    if (!o) return;
    if (inMountains) return; // trailOfficer takes over
    const d = Math.hypot(player.x - o.x, player.z - o.z);
    o.human.setPose(G.stars >= 3 && d < 40 && d > 11 ? 'aim' : 'stand');
    if (G.stars >= 3 && d >= 11 && d < 40 && player.onFoot) {
      o.human.group.position.set(o.x, groundH(o.x, o.z), o.z);
      o.human.group.rotation.y = Math.atan2(player.x - o.x, player.z - o.z);
      if (t > o.shootAt) {
        o.shootAt = t + this.rng.range(1.3, 2.3);
        if (this.hooks.onOfficerShoot) this.hooks.onOfficerShoot(o, player);
      }
      return;
    }
    this.walkOfficer(o, player.x, player.z, dt, o.speed);
    if (player.onFoot && d < 2.3 && Math.abs(player.speed) < 1.3) {
      G.bustMeter += dt;
      if (this.hooks.onBustProgress) this.hooks.onBustProgress(G.bustMeter / 2.4);
    }
  }

  trailOfficer(u, dt, t, player) {
    const o = u.officer;
    if (!o) return;
    let bestT = 0, bd = 1e9;
    for (let tt = 0; tt <= 1.001; tt += 0.04) {
      const p = polylinePoint(TRAIL, tt);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < bd) { bd = d; bestT = tt; }
    }
    const CAP = 0.45;
    const headHome = () => {
      u.trailT = Math.max(0, u.trailT - dt * 0.05);
      const p = polylinePoint(TRAIL, u.trailT);
      this.walkOfficer(o, p.x, p.z, dt, 5.4);
      if (u.trailT <= 0.01) { u.mode = 'car'; u.trailMode = false; u.vehicle.driver = 'police'; this.scene.remove(o.human.group); u.officer = null; }
    };
    if (player.z >= -8) { headHome(); return; } // suspect fled downhill
    if (bestT > CAP + 0.1) {
      u.giveUp = (u.giveUp || 0) + dt;
      if (u.giveUp > 4) { headHome(); return; }
    } else u.giveUp = 0;
    const goalT = Math.min(bestT, CAP);
    const dir = Math.sign(goalT - u.trailT) || 1;
    u.trailT = clamp(u.trailT + dir * dt * 0.028, 0, 1);
    const p = polylinePoint(TRAIL, u.trailT);
    this.walkOfficer(o, p.x, p.z, dt, 5.4);
    if (Math.hypot(o.x - player.x, o.z - player.z) < 2.3 && Math.abs(player.speed) < 1.3) {
      G.bustMeter += dt;
      if (this.hooks.onBustProgress) this.hooks.onBustProgress(G.bustMeter / 2.4);
    }
  }

  placeRoadblock(player) {
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    const ahead = nearestIntersection(player.x + fx * 78, player.z + fz * 78);
    if (Math.hypot(ahead.x - player.x, ahead.z - player.z) < 34) return;
    const across = Math.abs(fx) > Math.abs(fz); // player runs along x -> block across x
    for (const off of [-3.4, 3.4]) {
      const v = createVehicle('cruiser', 0);
      v.x = ahead.x + (across ? 0 : off); v.z = ahead.z + (across ? off : 0);
      v.heading = across ? 0.5 : Math.PI / 2 + 0.5;
      v.driver = 'police-parked'; v.y = groundH(v.x, v.z);
      this.scene.add(v.group);
      this.vehicles.push(v);
      const officer = this.makeOfficer(v.x + 2.4, v.z + 1.4);
      officer.human.setPose('aim');
      this.blocks.push({ vehicle: v, officer });
    }
  }

  responseList(player) {
    const rows = [];
    for (const u of this.units) {
      const src = u.mode === 'foot' && u.officer ? u.officer : u.vehicle;
      const dist = Math.hypot(src.x - player.x, src.z - player.z);
      let state = 'SEARCHING';
      if (G.seenByPolice) state = dist < 17 ? 'RAMMING' : 'CHASING';
      if (u.mode === 'foot') state = G.seenByPolice ? 'IN SIGHT' : 'SEARCHING';
      rows.push({ callsign: u.callsign, dist, state, heli: false });
    }
    rows.sort((a, b) => a.dist - b.dist);
    const out = rows.slice(0, 4);
    if (this.heli.active) out.push({ callsign: 'GARUDA-1', dist: Math.hypot(this.heli.x - player.x, this.heli.z - player.z), state: G.seenByPolice ? 'SPOTLIGHT ON YOU' : 'SEARCHING', heli: true });
    return out;
  }
}
