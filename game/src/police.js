// police.js — the Teluk Bayu police: wanted stars that rise with Raka's
// crimes, patrol cars that spawn at the edge of the action and hunt him
// down, the bust meter that fills when they corner him, and the escape
// timer that bleeds the stars away once he breaks contact.

import * as THREE from "three";
import { makeCarMesh, makeCarObject, driveCar, steerToward } from "./vehicles.js";
import { ROAD_LINES, CITY_HALF, seededRandom } from "./world.js";

const POLICE_MODEL = { name: "Mobil Patroli", style: "police", topSpeed: 35, accel: 17 };
const MAX_POLICE = 6;
const BUST_TIME = 2.4; // seconds cornered before the arrest lands
const ESCAPE_TIME = 6.5; // seconds out of reach per star shed

export class PoliceSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    this.stars = 0;
    this.heat = 0; // 0..1 progress toward the next star
    this.escapeTimer = 0;
    this.bustedMeter = 0; // 0..1
    this.nearestDist = Infinity;
    this.time = 0;
    this.rand = seededRandom(90210);
    this.onBusted = null; // set by main.js
  }

  // Register a crime: amount 1.0 is a full star's worth of heat.
  addCrime(amount) {
    if (this.stars === 0 && amount > 0) this.escapeTimer = 0;
    this.heat += amount;
    while (this.heat >= 1 && this.stars < 5) {
      this.stars += 1;
      this.heat -= 1;
    }
    if (this.stars >= 5) this.heat = Math.min(this.heat, 0.99);
  }

  setWanted(stars) {
    this.stars = THREE.MathUtils.clamp(stars, 0, 5);
    this.heat = 0;
    this.escapeTimer = 0;
    this.bustedMeter = 0;
  }

  clearAll() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars = [];
    this.stars = 0;
    this.heat = 0;
    this.escapeTimer = 0;
    this.bustedMeter = 0;
    this.nearestDist = Infinity;
  }

  // Where a fresh patrol car rolls in: on an avenue, well away from Raka
  // but close enough to join the hunt quickly.
  spawnPoint(playerPos) {
    for (let tries = 0; tries < 12; tries++) {
      const vertical = this.rand() < 0.5;
      const line = ROAD_LINES[Math.floor(this.rand() * ROAD_LINES.length)];
      const along = THREE.MathUtils.clamp(
        (vertical ? playerPos.z : playerPos.x) + (this.rand() < 0.5 ? -1 : 1) * (95 + this.rand() * 45),
        -CITY_HALF + 12,
        CITY_HALF - 12
      );
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > 70) return { x, z };
    }
    return { x: ROAD_LINES[0], z: playerPos.z - 110 };
  }

  spawnCar(playerPos) {
    const at = this.spawnPoint(playerPos);
    const mesh = makeCarMesh(0xf2f2f2, "police");
    mesh.position.set(at.x, 0, at.z);
    this.scene.add(mesh);
    const car = makeCarObject(mesh, POLICE_MODEL, "police");
    car.driver = "ai";
    car.mode = "chase"; // 'chase' | 'leave'
    car.stuckTimer = 0;
    car.reverseTimer = 0;
    car.heading = Math.atan2(playerPos.x - at.x, playerPos.z - at.z);
    mesh.rotation.y = car.heading;
    this.cars.push(car);
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  // player: { pos: Vector3-like, speed: number (abs), inCar: boolean }
  update(dt, player) {
    this.time += dt;
    const wantCars = this.stars === 0 ? 0 : Math.min(MAX_POLICE, this.stars + 1);
    if (this.cars.length < wantCars) this.spawnCar(player.pos);

    this.nearestDist = Infinity;
    let anyClose = false;

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const p = car.mesh.position;
      const dist = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      this.nearestDist = Math.min(this.nearestDist, dist);
      if (dist < 85) anyClose = true;

      // Flash the light bar while hunting.
      const bar = car.mesh.userData.lightBar;
      if (bar) {
        const phase = Math.sin(this.time * 11 + i * 1.7) > 0;
        bar.red.visible = this.stars > 0 && phase;
        bar.blue.visible = this.stars > 0 && !phase;
      }

      if (this.stars === 0) car.mode = "leave";
      if (car.mode === "leave") {
        // Drive away from Raka and despawn once far off.
        const away = { x: p.x + (p.x - player.pos.x), z: p.z + (p.z - player.pos.z) };
        driveCar(car, steerToward(car, away.x, away.z, dt, 14), dt, this.colliders);
        if (dist > 190) this.removeCar(car);
        continue;
      }

      // A patrol car left far behind the hunt is quietly replaced by a
      // fresh one rolling in nearer — the pressure never fully lets up.
      if (car.mode === "chase" && dist > 300) {
        this.removeCar(car);
        this.spawnCar(player.pos);
        continue;
      }

      // Chase: aim at the player, with a stuck-escape reverse.
      let control;
      if (car.reverseTimer > 0) {
        car.reverseTimer -= dt;
        control = { throttle: -1, steer: car.steerVis >= 0 ? -1 : 1, handbrake: false };
      } else {
        control = steerToward(car, player.pos.x, player.pos.z, dt, 26 + this.stars * 2.2);
        if (Math.abs(car.speed) < 0.8 && control.throttle > 0.3) {
          car.stuckTimer += dt;
          if (car.stuckTimer > 1.4) {
            car.reverseTimer = 0.75;
            car.stuckTimer = 0;
          }
        } else {
          car.stuckTimer = 0;
        }
      }
      driveCar(car, control, dt, this.colliders);
    }

    // Escape: out of reach of every patrol car, the stars bleed away.
    if (this.stars > 0) {
      if (!anyClose) {
        this.escapeTimer += dt;
        if (this.escapeTimer >= ESCAPE_TIME) {
          this.stars -= 1;
          this.heat = 0;
          this.escapeTimer = 0;
        }
      } else {
        this.escapeTimer = 0;
      }
    }

    // The bust: cornered and slow with a patrol car on top of him.
    const bustRadius = player.inCar ? 7.5 : 5.2;
    const cornered = this.nearestDist < bustRadius && Math.abs(player.speed) < 2.1 && this.stars > 0;
    if (cornered) {
      this.bustedMeter += dt / BUST_TIME;
      if (this.bustedMeter >= 1) {
        this.bustedMeter = 0;
        if (this.onBusted) this.onBusted();
      }
    } else {
      this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.55);
    }
  }

  // 0..1 siren loudness for the audio engine: louder as the nearest patrol
  // car closes in, silent with no stars.
  sirenLevel() {
    if (this.stars === 0 || !isFinite(this.nearestDist)) return 0;
    return THREE.MathUtils.clamp(1.15 - this.nearestDist / 95, 0.08, 1);
  }

  // True while Raka is out of reach and the escape timer is running down.
  isEscaping() {
    return this.stars > 0 && this.escapeTimer > 0.75;
  }
}
