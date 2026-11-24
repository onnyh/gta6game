// world.js — Teluk Bayu: the procedural city, beach, sea and Gunung Bayu.
//
// Everything in the world is generated from code at load time: a grid of
// palm-lined streets and colourful harbour-town buildings on flat ground to
// the south, the bay and its pier along the southern shore, and the great
// climbable cone of Gunung Bayu rising in the north-west, with a dirt spiral
// path winding to a flag on its summit. One height function,
// terrainHeight(), drives both the visible terrain mesh and the physics in
// main.js, so what you see is exactly what you walk and drive on.

import * as THREE from "three";

// ---- Shared layout constants -------------------------------------------

export const CITY_HALF = 300; // buildings and roads live in [-300, 300]^2
export const ROAD_LINES = [-240, -160, -80, 0, 80, 160, 240];
export const ROAD_WIDTH = 17;
export const BEACH_Z = 292; // sand starts here, running south
export const SEA_Z = 348; // open water starts here
export const WORLD_EDGE = 720; // playable clamp

export const MOUNTAIN = { x: -440, z: -440, r: 250, h: 98 };
export const HARBOUR_POS = { x: 176, z: 402 }; // end of the pier
export const MARKET_POS = { x: 24, z: 248 }; // Pak Haji Darma's fish market

// ---- Terrain height ------------------------------------------------------

// Height of the mountain alone (0 outside its skirt).
export function mountainHeight(x, z) {
  const dx = x - MOUNTAIN.x;
  const dz = z - MOUNTAIN.z;
  const d = Math.hypot(dx, dz);
  if (d >= MOUNTAIN.r) return 0;
  const t = 1 - d / MOUNTAIN.r; // 1 at the summit, 0 at the rim
  let h = MOUNTAIN.h * Math.pow(t, 1.45);
  // The dirt path spirals up the cone: in "turn space" the path is where the
  // fractional part of (angle + radial turns) passes 0. Blend the cone
  // height toward the path's steady ramp height near the path centreline so
  // the path is a walkable ramp instead of a cliff.
  let ang = Math.atan2(dz, dx);
  if (ang < 0) ang += Math.PI * 2;
  const turns = ang / (Math.PI * 2) + t * 2.3;
  const frac = turns - Math.floor(turns);
  const offTurns = Math.min(frac, 1 - frac);
  const offWorld = offTurns * 2 * Math.PI * Math.max(d, 24);
  const rampH = MOUNTAIN.h * t * 0.985;
  if (offWorld < 17) {
    const s = offWorld / 17;
    const blend = s * s * (3 - 2 * s);
    h = rampH * (1 - blend) + h * blend;
  }
  // Flatten the summit into a small plateau for the flag.
  if (d < 30) {
    const s = d / 30;
    h = MOUNTAIN.h * (1 - 0.05 * s * s) * (1 - s) + h * s;
  }
  return h;
}

// Height of the ground anywhere in the world.
export function terrainHeight(x, z) {
  return mountainHeight(x, z);
}

// Is a point on a road (used for traffic, pedestrians and the minimap)?
export function isOnRoad(x, z) {
  if (Math.abs(x) > CITY_HALF + 8 || Math.abs(z) > CITY_HALF + 8) return false;
  const half = ROAD_WIDTH / 2;
  for (const line of ROAD_LINES) {
    if (Math.abs(x - line) < half || Math.abs(z - line) < half) return true;
  }
  return false;
}

// ---- Small helpers -------------------------------------------------------

function makeCanvasTexture(draw, w = 128, h = 256) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Building facades: rows of windows, some lit, on a tinted wall. One
// texture is generated per paint colour (with a fixed seed, so the town is
// identical on every visit) and shared by every building of that colour —
// a dozen textures instead of hundreds.
const facadeCache = new Map();
function buildingTexture(baseColor) {
  if (facadeCache.has(baseColor)) return facadeCache.get(baseColor);
  const rand = seededRandom(baseColor.split("").reduce((a, c) => a + c.charCodeAt(0) * 131, 7));
  const tex = makeCanvasTexture((g, w, h) => {
    g.fillStyle = baseColor;
    g.fillRect(0, 0, w, h);
    const cols = 5;
    const rows = 9;
    const cw = w / cols;
    const ch = h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = rand() < 0.42;
        g.fillStyle = lit ? "#ffd98a" : "rgba(20, 28, 40, 0.75)";
        g.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.24, cw * 0.56, ch * 0.5);
      }
    }
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, h - ch * 0.9, w, ch * 0.9);
  });
  facadeCache.set(baseColor, tex);
  return tex;
}

// Deterministic pseudo-random from a seed, so the city is the same on every
// visit (and in every screenshot).
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---- World construction --------------------------------------------------

const BUILDING_COLORS = [
  "#e8e3d5", "#f2b879", "#e88f6a", "#9fc6e8", "#f5eeda", "#d96f5a",
  "#a8d5a2", "#f0d060", "#e8a2c0", "#7fc4bd", "#f7f3e8", "#c9a86a",
];

export function buildWorld(scene) {
  const rand = seededRandom(20261124);
  const colliders = []; // {minX, maxX, minZ, maxZ, top} for buildings
  const animated = []; // functions(dt, elapsed) for sea, flag, lamps

  // -- Ground base: scrubland around everything. It stops at the waterline
  //    so the lower sea surface is never buried beneath it.
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 1560),
    new THREE.MeshLambertMaterial({ color: 0x77875f })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, -0.08, SEA_Z - 780);
  base.receiveShadow = true;
  scene.add(base);

  // -- City slab.
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 60, CITY_HALF * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x9a958a })
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = -0.02;
  slab.receiveShadow = true;
  scene.add(slab);

  // -- Roads: dark asphalt strips with dashed centre lines.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363c });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76a });
  const dashGeo = new THREE.PlaneGeometry(4.6, 0.55);
  const dashes = [];
  for (const line of ROAD_LINES) {
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 40, ROAD_WIDTH), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.02, line);
    hRoad.receiveShadow = true;
    scene.add(hRoad);
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, CITY_HALF * 2 + 40), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(line, 0.02, 0);
    vRoad.receiveShadow = true;
    scene.add(vRoad);
    for (let p = -CITY_HALF; p <= CITY_HALF; p += 16) {
      dashes.push([p, line, 0]);
      dashes.push([line, p, Math.PI / 2]);
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  {
    // Each dash: translate, spin in the ground plane (Y), then lay flat (X).
    const flat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const spin = new THREE.Matrix4();
    const place = new THREE.Matrix4();
    dashes.forEach(([x, z, rot], i) => {
      spin.makeRotationY(rot);
      place.makeTranslation(x, 0.045, z);
      place.multiply(spin).multiply(flat);
      dashMesh.setMatrixAt(i, place);
    });
    dashMesh.instanceMatrix.needsUpdate = true;
  }
  scene.add(dashMesh);

  // -- Sidewalks: pale strips edging each road.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xbdb6a6 });
  for (const line of ROAD_LINES) {
    for (const side of [-1, 1]) {
      const off = line + side * (ROAD_WIDTH / 2 + 1.6);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 40, 3.2), walkMat);
      h.rotation.x = -Math.PI / 2;
      h.position.set(0, 0.03, off);
      h.receiveShadow = true;
      scene.add(h);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(3.2, CITY_HALF * 2 + 40), walkMat);
      v.rotation.x = -Math.PI / 2;
      v.position.set(off, 0.03, 0);
      v.receiveShadow = true;
      scene.add(v);
    }
  }

  // -- Buildings: one or two per block face, harbour-town colours.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let bx = 0; bx < ROAD_LINES.length - 1; bx++) {
    for (let bz = 0; bz < ROAD_LINES.length - 1; bz++) {
      const x0 = ROAD_LINES[bx] + ROAD_WIDTH / 2 + 3;
      const x1 = ROAD_LINES[bx + 1] - ROAD_WIDTH / 2 - 3;
      const z0 = ROAD_LINES[bz] + ROAD_WIDTH / 2 + 3;
      const z1 = ROAD_LINES[bz + 1] - ROAD_WIDTH / 2 - 3;
      const perBlock = 2 + Math.floor(rand() * 2);
      for (let k = 0; k < perBlock; k++) {
        const w = 16 + rand() * 16;
        const d = 16 + rand() * 16;
        const hgt = 12 + rand() * rand() * 38;
        const cx = x0 + w / 2 + rand() * Math.max(1, x1 - x0 - w);
        const cz = z0 + d / 2 + rand() * Math.max(1, z1 - z0 - d);
        const color = BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)];
        if (!facadeCache.has(`mat:${color}`)) {
          facadeCache.set(`mat:${color}`, new THREE.MeshLambertMaterial({ map: buildingTexture(color) }));
        }
        const b = new THREE.Mesh(boxGeo, facadeCache.get(`mat:${color}`));
        b.scale.set(w, hgt, d);
        b.position.set(cx, hgt / 2, cz);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top: hgt });
        // A flat roof cap in a darker tone.
        const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a3a }));
        roof.scale.set(w + 0.7, 0.7, d + 0.7);
        roof.position.set(cx, hgt + 0.35, cz);
        scene.add(roof);
      }
    }
  }

  // -- The fish market: stalls with striped awnings near the shore road.
  const awningColors = [0xe84f3d, 0x2e9e6b, 0xf2b13c, 0x3d7de8];
  for (let i = 0; i < 6; i++) {
    const sx = MARKET_POS.x - 30 + i * 12;
    const sz = MARKET_POS.z;
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
    counter.scale.set(7, 1.6, 3.4);
    counter.position.y = 0.8;
    stall.add(counter);
    const awning = new THREE.Mesh(
      boxGeo,
      new THREE.MeshLambertMaterial({ color: awningColors[i % awningColors.length] })
    );
    awning.scale.set(8, 0.35, 4.6);
    awning.position.set(0, 3.1, 0);
    awning.rotation.x = 0.16;
    stall.add(awning);
    for (const [px, pz] of [[-3.6, -2], [3.6, -2], [-3.6, 2], [3.6, 2]]) {
      const post = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
      post.scale.set(0.3, 3.1, 0.3);
      post.position.set(px, 1.55, pz);
      stall.add(post);
    }
    stall.position.set(sx, 0, sz);
    stall.traverse((o) => { o.castShadow = true; });
    scene.add(stall);
    colliders.push({ minX: sx - 3.5, maxX: sx + 3.5, minZ: sz - 1.7, maxZ: sz + 1.7, top: 3.2 });
  }

  // -- Beach and sea.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, SEA_Z - BEACH_Z + 24),
    new THREE.MeshLambertMaterial({ color: 0xe6cf9a })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.0, (BEACH_Z + SEA_Z) / 2 + 6);
  sand.receiveShadow = true;
  scene.add(sand);

  const seaMat = new THREE.MeshPhongMaterial({
    color: 0x155f8f, shininess: 90, specular: 0x6fb7e8, transparent: true, opacity: 0.96,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 900, 48, 12), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.5, SEA_Z + 420);
  scene.add(sea);
  const seaBase = sea.geometry.attributes.position.array.slice();
  animated.push((dt, t) => {
    // After the -90° X rotation the plane lies in XZ and height is Y.
    const pos = sea.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = seaBase[i * 3];
      const z = seaBase[i * 3 + 2];
      pos.setY(i, Math.sin(x * 0.02 + t * 1.1) * 0.55 + Math.cos(z * 0.03 + t * 0.8) * 0.45);
    }
    pos.needsUpdate = true;
  });

  // -- The pier: planks running out to the harbour marker.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const pier = new THREE.Mesh(boxGeo, pierMat);
  pier.scale.set(9, 1.2, 130);
  pier.position.set(HARBOUR_POS.x, 0.4, (SEA_Z + HARBOUR_POS.z) / 2 + 16);
  pier.castShadow = true;
  pier.receiveShadow = true;
  scene.add(pier);
  for (let pz = SEA_Z + 6; pz < HARBOUR_POS.z; pz += 14) {
    for (const px of [-4, 4]) {
      const pile = new THREE.Mesh(boxGeo, pierMat);
      pile.scale.set(0.9, 3.4, 0.9);
      pile.position.set(HARBOUR_POS.x + px, -0.8, pz);
      scene.add(pile);
    }
  }

  // -- Gunung Bayu: displaced terrain mesh with vertex colours.
  const seg = 120;
  const mGeo = new THREE.PlaneGeometry(MOUNTAIN.r * 2 + 90, MOUNTAIN.r * 2 + 90, seg, seg);
  mGeo.rotateX(-Math.PI / 2);
  {
    const pos = mGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(0x5d7d43);
    const rock = new THREE.Color(0x8d8578);
    const dirt = new THREE.Color(0xa9825a);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = lx + MOUNTAIN.x;
      const wz = lz + MOUNTAIN.z;
      const h = mountainHeight(wx, wz);
      pos.setY(i, h);
      // Colour: dirt on the path, grass low, rock high.
      const d = Math.hypot(wx - MOUNTAIN.x, wz - MOUNTAIN.z);
      let ang = Math.atan2(wz - MOUNTAIN.z, wx - MOUNTAIN.x);
      if (ang < 0) ang += Math.PI * 2;
      const t = 1 - Math.min(1, d / MOUNTAIN.r);
      const turns = ang / (Math.PI * 2) + t * 2.3;
      const frac = turns - Math.floor(turns);
      const offWorld = Math.min(frac, 1 - frac) * 2 * Math.PI * Math.max(d, 24);
      if (offWorld < 9 && d < MOUNTAIN.r - 4) tmp.copy(dirt);
      else if (h > MOUNTAIN.h * 0.55) tmp.copy(rock).lerp(grass, 0.25);
      else tmp.copy(grass).offsetHSL(0, 0, (rand() - 0.5) * 0.03);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    mGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    mGeo.computeVertexNormals();
  }
  const mountain = new THREE.Mesh(
    mGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  mountain.position.set(MOUNTAIN.x, 0, MOUNTAIN.z);
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  scene.add(mountain);

  // -- Summit: platform, pole and a waving flag.
  const summitY = mountainHeight(MOUNTAIN.x, MOUNTAIN.z);
  const summitPos = new THREE.Vector3(MOUNTAIN.x, summitY, MOUNTAIN.z);
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 12.5, 1.4, 8),
    new THREE.MeshLambertMaterial({ color: 0x9a958a })
  );
  platform.position.copy(summitPos).y += 0.4;
  platform.castShadow = true;
  scene.add(platform);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 })
  );
  pole.position.copy(summitPos).y += 5.4;
  scene.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 3.2, 8, 1),
    new THREE.MeshLambertMaterial({ color: 0xe84f3d, side: THREE.DoubleSide })
  );
  flag.position.copy(summitPos);
  flag.position.y += 8.4;
  flag.position.x += 2.8;
  scene.add(flag);
  const flagBase = flag.geometry.attributes.position.array.slice();
  animated.push((dt, t) => {
    const pos = flag.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = flagBase[i * 3];
      pos.setZ(i, Math.sin(x * 1.6 + t * 6) * 0.32 * (x / 5.4 + 0.5));
    }
    pos.needsUpdate = true;
  });

  // -- Palm trees: bent trunks and frond crowns along the beach and the
  //    shore road, instanced so hundreds cost two draw calls.
  {
    const spots = [];
    for (let x = -320; x <= 320; x += 26) {
      spots.push([x + (rand() - 0.5) * 8, BEACH_Z + 12 + rand() * 22]);
      if (rand() < 0.7) spots.push([x + (rand() - 0.5) * 10, BEACH_Z - 16]);
    }
    for (const line of [-80, 80]) {
      for (let p = -280; p <= 280; p += 56) spots.push([line + 13, p + (rand() - 0.5) * 6]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 7.5, 6);
    trunkGeo.translate(0, 3.75, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
    const frondGeo = new THREE.ConeGeometry(3.4, 1.6, 7);
    frondGeo.translate(0, 7.6, 0);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7d33 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach(([x, z], i) => {
      e.set((rand() - 0.5) * 0.16, rand() * Math.PI * 2, (rand() - 0.5) * 0.16);
      q.setFromEuler(e);
      const s = 0.85 + rand() * 0.5;
      m.compose(new THREE.Vector3(x, terrainHeight(x, z), z), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      fronds.setMatrixAt(i, m);
    });
    trunks.castShadow = true;
    scene.add(trunks);
    scene.add(fronds);
  }

  // -- Street lamps along the main avenues (heads glow at all hours in the
  //    late sun; the emissive reads as harbour-town polish).
  {
    const spots = [];
    for (const line of ROAD_LINES) {
      for (let p = -CITY_HALF + 30; p <= CITY_HALF - 20; p += 60) {
        spots.push([line + ROAD_WIDTH / 2 + 2.4, p]);
        spots.push([p, line - ROAD_WIDTH / 2 - 2.4]);
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.6, 6);
    poleGeo.translate(0, 2.8, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
    headGeo.translate(0, 5.7, 0);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 0, z);
      poles.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    scene.add(poles);
    scene.add(heads);
  }

  return { colliders, summitPos, animated };
}

// Push a circle (x, z, radius) out of every building AABB it overlaps.
// Returns true when a push happened (a collision).
export function collideCircle(colliders, pos, radius) {
  let hit = false;
  for (const c of colliders) {
    if (pos.y !== undefined && pos.y > c.top + 1.5) continue;
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const left = pos.x - c.minX;
        const right = c.maxX - pos.x;
        const near = pos.z - c.minZ;
        const far = c.maxZ - pos.z;
        const min = Math.min(left, right, near, far);
        if (min === left) pos.x = c.minX - radius;
        else if (min === right) pos.x = c.maxX + radius;
        else if (min === near) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}
