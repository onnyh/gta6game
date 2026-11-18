// Bayu Heat — low-poly people: Damar, the warga of Teluk Bayu and POLRES
// officers, all kitbashed from boxes with swinging limbs and a few poses

import * as THREE from '../vendor/three.module.min.js';
import { mergeParts, vcMat } from './world.js';

const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function part(geoParts, px, py, pz) {
  const m = new THREE.Mesh(mergeParts(geoParts), vcMat);
  m.position.set(px, py, pz);
  m.castShadow = true;
  return m;
}

export function createHuman({ skin = 0xa06844, shirt = 0x2e8f6e, pants = 0x2c3242, hair = 0x14100c, cap = 0, dress = 0 } = {}) {
  const g = new THREE.Group();
  const torso = part([{ geo: BOX(0.56, 0.68, 0.3), y: -0.34, color: shirt }, ...(dress ? [{ geo: BOX(0.6, 0.4, 0.36), y: -0.78, color: dress }] : [])], 0, 1.42, 0);
  const head = part([
    { geo: BOX(0.34, 0.38, 0.34), y: 0.05, color: skin },
    { geo: BOX(0.37, 0.13, 0.37), y: 0.27, color: hair },
    ...(cap ? [{ geo: BOX(0.38, 0.07, 0.38), y: 0.3, color: cap }, { geo: BOX(0.36, 0.05, 0.24), y: 0.27, z: 0.26, color: cap }] : []),
  ], 0, 1.62, 0);
  const armGeo = (side) => [{ geo: BOX(0.15, 0.62, 0.17), y: -0.28, color: shirt }, { geo: BOX(0.13, 0.2, 0.15), y: -0.66, color: skin }];
  const armL = part(armGeo(), -0.37, 1.38, 0);
  const armR = part(armGeo(), 0.37, 1.38, 0);
  const legGeo = [{ geo: BOX(0.19, 0.78, 0.21), y: -0.39, color: pants }, { geo: BOX(0.2, 0.1, 0.3), y: -0.78, z: 0.04, color: 0x222222 }];
  const legL = part(legGeo, -0.15, 0.8, 0);
  const legR = part(legGeo, 0.15, 0.8, 0);
  const gun = part([{ geo: BOX(0.07, 0.16, 0.3), y: -0.62, z: 0.1, color: 0x18181c }], 0.37, 1.38, 0);
  gun.visible = false;
  g.add(torso, head, armL, armR, legL, legR, gun);
  const h = {
    group: g, parts: { torso, head, armL, armR, legL, legR, gun },
    phase: Math.random() * 6,
    pose: 'stand',
    setPose(p) {
      this.pose = p;
      gun.visible = p === 'aim';
      if (p === 'aim') { armR.rotation.x = -Math.PI / 2; armL.rotation.x = -Math.PI / 2.4; legL.rotation.x = 0.14; legR.rotation.x = -0.18; }
      else if (p === 'sit') { legL.rotation.x = legR.rotation.x = -Math.PI / 2.1; armL.rotation.x = armR.rotation.x = -0.72; }
      else if (p === 'down') { g.rotation.x = -Math.PI / 2; }
      else { armL.rotation.x = armR.rotation.x = 0; legL.rotation.x = legR.rotation.x = 0; g.rotation.x = 0; }
    },
    animate(dt, speed) {
      if (this.pose === 'aim' || this.pose === 'sit' || this.pose === 'down') return;
      this.phase += dt * (4 + Math.abs(speed) * 1.9);
      const sw = Math.sin(this.phase) * Math.min(0.75, Math.abs(speed) * 0.16 + 0.04);
      legL.rotation.x = sw; legR.rotation.x = -sw;
      armL.rotation.x = -sw * 0.8; armR.rotation.x = sw * 0.8;
      g.position.y = Math.abs(Math.cos(this.phase)) * 0.05 * Math.min(1, Math.abs(speed));
    },
  };
  return h;
}

export const PED_PALETTES = [
  { shirt: 0xe84a3c, pants: 0x2c3242 }, { shirt: 0xf2e03c, pants: 0x4a6a8a }, { shirt: 0x3ca8e8, pants: 0x2c2c30 },
  { shirt: 0xf2f2f2, pants: 0x8a6a4a }, { shirt: 0xe83e8c, pants: 0x2c3242 }, { shirt: 0x4ec84e, pants: 0x5a4632 },
  { shirt: 0xff8c42, pants: 0x33415e }, { shirt: 0x9a6ae8, pants: 0x2c2c30 },
];
export const SKIN_TONES = [0x8a5a34, 0xa06844, 0xbd8552, 0x96684a];
