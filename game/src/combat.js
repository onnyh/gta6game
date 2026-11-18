// Bayu Heat — fists and the pistol: hitscan shots with tracers and muzzle
// flash, melee swings, and the health/armour damage model for Damar.

import * as THREE from '../vendor/three.module.min.js';
import { G } from './state.js';

export class Combat {
  constructor(scene, hooks = {}) {
    this.scene = scene;
    this.hooks = hooks;
    this.fx = [];   // {line, life}
    this.flash = new THREE.PointLight(0xffc266, 0, 18, 1.6);
    scene.add(this.flash);
    this.flashAt = 0;
  }

  tracer(from, to, color = 0xffe9a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.fx.push({ line, life: 0.09 });
  }

  muzzle(pos) {
    this.flash.position.copy(pos);
    this.flash.intensity = 26;
    this.flashAt = performance.now() / 1000;
  }

  update(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      f.line.material.opacity = Math.max(0, f.life / 0.09) * 0.9;
      if (f.life <= 0) { this.scene.remove(f.line); f.line.geometry.dispose(); f.line.material.dispose(); this.fx.splice(i, 1); }
    }
    if (this.flash.intensity > 0) this.flash.intensity = Math.max(0, this.flash.intensity - dt * 260);
  }

  shoot(camera, targets, originPos) {
    const from = new THREE.Vector3();
    camera.getWorldPosition(from);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let best = null, bestT = 95;
    const tmp = new THREE.Vector3();
    for (const tg of targets) {
      if (tg.dead || tg.hp <= 0) continue;
      tmp.set(tg.x - from.x, (tg.y + tg.h * 0.62) - from.y, tg.z - from.z);
      const along = tmp.dot(dir);
      if (along < 1 || along > bestT) continue;
      const perp = tmp.clone().addScaledVector(dir, -along).length();
      if (perp < tg.r + 0.35) { best = tg; bestT = along; }
    }
    const end = from.clone().addScaledVector(dir, best ? bestT : 70);
    if (originPos) { this.tracer(originPos, end); this.muzzle(originPos); }
    else this.tracer(from.clone().addScaledVector(dir, 1.2), end);
    return best;
  }

  npcShoot(fromPos, player, rng) {
    const d = Math.hypot(player.x - fromPos.x, player.z - fromPos.z);
    const to = new THREE.Vector3(player.x, (player.y || 0) + 1.25, player.z);
    const jitter = rng.range(-1, 1) * (0.4 + d * 0.02);
    to.x += jitter; to.z += rng.range(-1, 1) * (0.4 + d * 0.02);
    this.tracer(fromPos, to, 0xff9a7a);
    this.muzzle(fromPos);
    const pHit = Math.max(0.08, 0.52 - d * 0.008 - Math.abs(player.speed) * 0.012);
    if (rng.next() < pHit) return rng.range(5, 11);
    return 0;
  }

  punch(player, targets) {
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    for (const tg of targets) {
      if (tg.dead || tg.hp <= 0) continue;
      const dx = tg.x - player.x, dz = tg.z - player.z;
      if (Math.hypot(dx, dz) < 2.4 && dx * fx + dz * fz > 0.2) return tg;
    }
    return null;
  }

  damagePlayer(amount) {
    if (G.health <= 0) return false;
    let rest = amount;
    if (G.armour > 0) {
      const soaked = Math.min(G.armour, amount * 0.55);
      G.armour -= soaked;
      rest = amount - soaked;
    }
    G.health = Math.max(0, G.health - rest);
    if (this.hooks.onHurt) this.hooks.onHurt();
    return G.health <= 0;
  }
}
