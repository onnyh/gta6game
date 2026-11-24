// people.js — the blocky people of Teluk Bayu: one articulated low-poly
// figure factory (shared by Raka and every pedestrian), a simple walk-cycle
// animator, and the sidewalk crowd that strolls the avenues, turns at
// corners, and falls over when a car finds it.

import * as THREE from "three";
import { ROAD_LINES, ROAD_WIDTH, CITY_HALF, terrainHeight, seededRandom } from "./world.js";

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function box(mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A ~1.8-unit person facing +Z, built from boxes. Arms and legs hang from
// shoulder/hip pivots so walkAnim() can swing them. Colours are parameters
// so the crowd varies; a cap and a face come free.
export function makePerson({ shirt = 0x2e7de8, pants = 0x3a3f46, skin = 0xc98a5a, cap = null } = {}) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });

  const torso = box(shirtMat, 0.62, 0.62, 0.3, 0, 1.09, 0);
  group.add(torso);

  const head = box(skinMat, 0.36, 0.36, 0.36, 0, 1.58, 0);
  group.add(head);
  // Eyes on the +Z face.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1c1c20 });
  for (const sx of [-0.09, 0.09]) {
    const eye = box(eyeMat, 0.055, 0.07, 0.02, sx, 1.62, 0.19);
    eye.castShadow = false;
    group.add(eye);
  }
  if (cap !== null) {
    const capMat = new THREE.MeshLambertMaterial({ color: cap });
    group.add(box(capMat, 0.42, 0.12, 0.42, 0, 1.8, 0));
    group.add(box(capMat, 0.4, 0.05, 0.3, 0, 1.75, 0.32));
  }

  function limb(mat, w, len, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const seg = box(mat, w, len, w, 0, -len / 2, 0);
    pivot.add(seg);
    group.add(pivot);
    return pivot;
  }
  const armL = limb(shirtMat, 0.17, 0.62, -0.42, 1.36);
  const armR = limb(shirtMat, 0.17, 0.62, 0.42, 1.36);
  const legL = limb(pantsMat, 0.21, 0.78, -0.17, 0.78);
  const legR = limb(pantsMat, 0.21, 0.78, 0.17, 0.78);

  return { group, armL, armR, legL, legR, phase: Math.random() * 6 };
}

// Swing the limbs: phase advances with distance travelled, amount 0..1
// blends the swing in and out so standing figures rest naturally.
export function walkAnim(person, phase, amount) {
  const s = Math.sin(phase) * 0.62 * amount;
  person.legL.rotation.x = s;
  person.legR.rotation.x = -s;
  person.armL.rotation.x = -s * 0.8;
  person.armR.rotation.x = s * 0.8;
}

export function restPose(person) {
  person.legL.rotation.x = 0;
  person.legR.rotation.x = 0;
  person.armL.rotation.x = 0;
  person.armR.rotation.x = 0;
}

// Raka himself: teal shirt, red cap.
export function makePlayerPerson() {
  return makePerson({ shirt: 0x18a999, pants: 0x2f3542, skin: 0xa06a3c, cap: 0xe84f3d });
}

// ---- The crowd -----------------------------------------------------------

const SHIRTS = [0xe86a3d, 0x2e7de8, 0xf2d13c, 0x39b56b, 0xe8e3d5, 0xd957a2, 0x37b8b0, 0xf5f0e6, 0x8a5fc0];
const PANTS = [0x3a3f46, 0x5a4632, 0x2f4a6a, 0x6a6f76, 0x845ec2];
const SKINS = [0x8a5632, 0xa06a3c, 0xc98a5a, 0x6e4525, 0xdbac7c];

// One pedestrian, walking a sidewalk line. axis 'x' means it walks along X
// at a fixed z (a horizontal avenue's sidewalk), and vice versa.
function makePedestrian(rand) {
  const person = makePerson({
    shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)],
    pants: PANTS[Math.floor(rand() * PANTS.length)],
    skin: SKINS[Math.floor(rand() * SKINS.length)],
    cap: rand() < 0.3 ? SHIRTS[Math.floor(rand() * SHIRTS.length)] : null,
  });
  const horizontal = rand() < 0.5;
  const line = ROAD_LINES[Math.floor(rand() * ROAD_LINES.length)];
  const side = rand() < 0.5 ? -1 : 1;
  const off = side * (ROAD_WIDTH / 2 + 2.3);
  const along = -CITY_HALF + 20 + rand() * (CITY_HALF * 2 - 40);
  const ped = {
    person,
    axis: horizontal ? "x" : "z",
    fixed: line + off,
    along,
    dir: rand() < 0.5 ? -1 : 1,
    speed: 1.5 + rand() * 1.3,
    state: "walk", // 'walk' | 'down'
    downTimer: 0,
    hurry: 0, // seconds of startled running left
    rand,
  };
  placePedestrian(ped);
  return ped;
}

function placePedestrian(ped) {
  const g = ped.person.group;
  if (ped.axis === "x") g.position.set(ped.along, 0, ped.fixed);
  else g.position.set(ped.fixed, 0, ped.along);
  g.position.y = terrainHeight(g.position.x, g.position.z);
}

// Knock a pedestrian down (a car did it). They lie still, then get back up.
export function knockDown(ped) {
  if (ped.state === "down") return false;
  ped.state = "down";
  ped.downTimer = 4.5;
  ped.person.group.rotation.x = -Math.PI / 2;
  ped.person.group.position.y += 0.25;
  return true;
}

export function spawnPedestrians(scene, count = 26) {
  const rand = seededRandom(31337);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const ped = makePedestrian(rand);
    scene.add(ped.person.group);
    peds.push(ped);
  }
  return peds;
}

// Startle everyone near a point (a car mounted the kerb, a horn, a crash):
// they break into a run for a couple of seconds, away from the noise.
export function startlePeds(peds, x, z, radius = 11) {
  for (const ped of peds) {
    if (ped.state !== "walk") continue;
    const g = ped.person.group;
    if (Math.hypot(g.position.x - x, g.position.z - z) < radius) {
      ped.hurry = 2.2;
      // Run along their sidewalk away from the threat.
      const alongPos = ped.axis === "x" ? g.position.x : g.position.z;
      const threatAlong = ped.axis === "x" ? x : z;
      ped.dir = alongPos >= threatAlong ? 1 : -1;
    }
  }
}

export function updatePedestrians(peds, dt) {
  for (const ped of peds) {
    const g = ped.person.group;
    if (ped.state === "down") {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = "walk";
        g.rotation.x = 0;
        placePedestrian(ped);
      }
      continue;
    }
    if (ped.hurry > 0) ped.hurry -= dt;
    const speedNow = ped.speed * (ped.hurry > 0 ? 2.2 : 1);
    ped.along += ped.dir * speedNow * dt;
    // Turn around at the ends of the promenade.
    if (ped.along > CITY_HALF - 6 || ped.along < -CITY_HALF + 6) {
      ped.dir *= -1;
      ped.along = THREE.MathUtils.clamp(ped.along, -CITY_HALF + 6, CITY_HALF - 6);
    }
    // At an intersection, sometimes turn onto the crossing sidewalk.
    const crossLine = ROAD_LINES.find((l) => Math.abs(ped.along - l) < 0.4);
    if (crossLine !== undefined && ped.rand() < 0.012) {
      const oldFixed = ped.fixed;
      ped.axis = ped.axis === "x" ? "z" : "x";
      ped.along = oldFixed;
      ped.fixed = crossLine + (ped.rand() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + 2.3);
      ped.dir = ped.rand() < 0.5 ? -1 : 1;
    }
    placePedestrian(ped);
    g.rotation.y = ped.axis === "x" ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : ped.dir > 0 ? 0 : Math.PI;
    ped.person.phase += dt * speedNow * 3.4;
    walkAnim(ped.person, ped.person.phase, 1);
  }
}
