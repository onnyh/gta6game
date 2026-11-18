// Bayu Heat — blocky toy people: Damar, the warga of Teluk Bayu, POLRES
// officers and the pendaki of Gunung Bayu, all built from chunky boxes with
// a smiling canvas-drawn face, swinging arms and legs, and flat bright
// outfit colours per role. A generic toy-block look, made from boxes only.

import * as THREE from '../vendor/three.module.min.js';
import { mergeParts, vcMat, canvasTexture } from './world.js';

const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function part(geoParts, px, py, pz) {
  const m = new THREE.Mesh(mergeParts(geoParts), vcMat);
  m.position.set(px, py, pz);
  m.castShadow = true;
  return m;
}

// One smiling toy face per skin tone, drawn once and reused.
const faceTexCache = new Map();
function faceTexture(skin) {
  if (faceTexCache.has(skin)) return faceTexCache.get(skin);
  const hex = '#' + skin.toString(16).padStart(6, '0');
  const t = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,120,110,0.4)';                       // rosy cheeks
    g.beginPath(); g.arc(26, 82, 11, 0, 7); g.arc(102, 82, 11, 0, 7); g.fill();
    g.fillStyle = '#191008';                                     // eyes
    for (const ex of [40, 88]) {
      g.beginPath();
      g.ellipse(ex, 56, 7.5, 11, 0, 0, 7);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(43, 51, 2.6, 0, 7); g.arc(91, 51, 2.6, 0, 7); g.fill();
    g.strokeStyle = '#191008'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(64, 78, 17, Math.PI * 0.18, Math.PI * 0.82); g.stroke();   // smile
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(30, 38); g.lineTo(50, 35); g.stroke();                 // brows
    g.beginPath(); g.moveTo(78, 35); g.lineTo(98, 38); g.stroke();
  });
  faceTexCache.set(skin, t);
  return t;
}

const skinMatCache = new Map();
function skinMat(skin) {
  if (!skinMatCache.has(skin)) skinMatCache.set(skin, new THREE.MeshLambertMaterial({ color: skin }));
  return skinMatCache.get(skin);
}

// "POLISI" chest plate for officers: navy plate, reflective stripe, white type.
let polisiTex = null;
function polisiTexture() {
  if (polisiTex) return polisiTex;
  polisiTex = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#16294d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d7dee8'; g.fillRect(0, 14, w, 16);
    g.fillStyle = '#ffd83c'; g.fillRect(0, 96, w, 12);
    g.fillStyle = '#ffffff'; g.font = '900 62px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('POLISI', w / 2, 62);
  });
  return polisiTex;
}

export function createHuman({ skin = 0xa06844, shirt = 0x2e8f6e, pants = 0x2c3242, hair = 0x14100c, cap = 0, dress = 0, police = false, vest = 0, backpack = 0 } = {}) {
  const g = new THREE.Group();
  const torsoParts = [
    { geo: BOX(0.66, 0.7, 0.36), y: -0.35, color: shirt },
    ...(dress ? [{ geo: BOX(0.72, 0.44, 0.42), y: -0.86, color: dress }] : []),
    ...(vest ? [{ geo: BOX(0.7, 0.52, 0.4), y: -0.3, color: vest }] : []),
    ...(backpack ? [{ geo: BOX(0.5, 0.56, 0.24), y: -0.34, z: -0.31, color: backpack }, { geo: BOX(0.4, 0.2, 0.26), y: -0.06, z: -0.31, color: backpack }] : []),
  ];
  const torso = part(torsoParts, 0, 1.5, 0);
  if (police) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.28),
      new THREE.MeshLambertMaterial({ map: polisiTexture() }),
    );
    plate.position.set(0, -0.3, 0.215);
    torso.add(plate);
  }
  const sm = skinMat(skin);
  const head = new THREE.Mesh(BOX(0.56, 0.54, 0.56), [sm, sm, sm, sm, new THREE.MeshLambertMaterial({ map: faceTexture(skin) }), sm]);
  head.position.set(0, 1.79, 0);
  head.castShadow = true;
  const hairSlab = part([
    { geo: BOX(0.6, 0.15, 0.6), y: 0.32, color: hair },
    { geo: BOX(0.6, 0.18, 0.12), y: 0.2, z: -0.25, color: hair },
    ...(cap ? [{ geo: BOX(0.62, 0.09, 0.62), y: 0.34, color: cap }, { geo: BOX(0.5, 0.05, 0.3), y: 0.31, z: 0.42, color: cap }] : []),
  ], 0, 1.79, 0);
  const armGeo = (sleeve) => [{ geo: BOX(0.2, 0.6, 0.22), y: -0.26, color: sleeve }, { geo: BOX(0.18, 0.18, 0.2), y: -0.64, color: skin }];
  const armL = part(armGeo(shirt), -0.44, 1.46, 0);
  const armR = part(armGeo(shirt), 0.44, 1.46, 0);
  const legGeo = [{ geo: BOX(0.24, 0.74, 0.26), y: -0.37, color: pants }, { geo: BOX(0.26, 0.12, 0.38), y: -0.78, z: 0.05, color: 0x222222 }];
  const legL = part(legGeo, -0.17, 0.82, 0);
  const legR = part(legGeo, 0.17, 0.82, 0);
  const gun = part([{ geo: BOX(0.07, 0.16, 0.3), y: -0.62, z: 0.1, color: 0x18181c }], 0.44, 1.46, 0);
  gun.visible = false;
  g.add(torso, head, hairSlab, armL, armR, legL, legR, gun);
  const h = {
    group: g, parts: { torso, head, armL, armR, legL, legR, gun },
    phase: Math.random() * 6,
    bobY: 0,
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
      if (this.pose === 'aim' || this.pose === 'sit' || this.pose === 'down') { this.bobY = 0; return; }
      this.phase += dt * (4 + Math.abs(speed) * 1.9);
      const sw = Math.sin(this.phase) * Math.min(0.8, Math.abs(speed) * 0.17 + 0.04);
      legL.rotation.x = sw; legR.rotation.x = -sw;
      armL.rotation.x = -sw * 0.85; armR.rotation.x = sw * 0.85;
      // The bob is exposed so callers on real terrain can anchor the group
      // at ground height + bobY (city callers stand on y=0 and just take it).
      this.bobY = Math.abs(Math.cos(this.phase)) * 0.055 * Math.min(1, Math.abs(speed));
      g.position.y = this.bobY;
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

export const HIKER_PALETTES = [
  { shirt: 0xff5a3c, pants: 0x2c3242, pack: 0x2050b0 }, { shirt: 0x25c2a0, pants: 0x4a4238, pack: 0xe83e3e },
  { shirt: 0xffc21f, pants: 0x33415e, pack: 0x2e8f6e }, { shirt: 0x7a5af8, pants: 0x2c2c30, pack: 0xf2780c },
  { shirt: 0x3ca8e8, pants: 0x5a4632, pack: 0xd6336c }, { shirt: 0x8dd94e, pants: 0x2c3242, pack: 0x7048e8 },
];
