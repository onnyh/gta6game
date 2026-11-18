// Bayu Heat — Gunung Bayu as an Indonesian hiking game: a basecamp with
// tents, a rumah singgah, a PENDAKI TERCEPAT leaderboard and a gear point;
// a bottle-and-torch trail with refill drums at every Pos, a torch-lit
// cave, a broken plank bridge over the gorge, rockfalls on the upper
// jalur, and fellow pendaki walking the same path. All original to Bayu.

import * as THREE from '../vendor/three.module.min.js';
import { BASECAMP, SUMMIT } from './config.js';
import { TRAIL, polylinePoint, terrainH } from './city.js';
import { mergeParts, vcMat, canvasTexture } from './world.js';
import { createHuman, HIKER_PALETTES, SKIN_TONES } from './actors.js';
import { makeRng, clamp } from './rng.js';

export const BRIDGE = { t0: 0.40, t1: 0.465 };
export const CAVE = { t0: 0.60, t1: 0.71 };
const POST_TS = [0.3, 0.55, 0.8];
const TOTAL = polylinePoint(TRAIL, 0).total;

const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);

// Dense trail samples for nearest-point maths (bridge, cave, hikers).
const SAMPLES = [];
for (let i = 0; i <= 250; i++) {
  const t = i / 250;
  const p = polylinePoint(TRAIL, t);
  SAMPLES.push({ t, x: p.x, z: p.z });
}
function nearestOnTrail(x, z) {
  let best = SAMPLES[0], bd = 1e18;
  for (const s of SAMPLES) {
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return { t: best.t, x: best.x, z: best.z, dist: Math.sqrt(bd) };
}
function trailDir(t) {
  const a = polylinePoint(TRAIL, Math.max(0, t - 0.012));
  const b = polylinePoint(TRAIL, Math.min(1, t + 0.012));
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
}
function at(t, lateral = 0) {
  const p = polylinePoint(TRAIL, t);
  const d = trailDir(t);
  return { x: p.x - d.z * lateral, z: p.z + d.x * lateral };
}

// ---- the broken bridge over the gorge --------------------------------
const B0 = polylinePoint(TRAIL, BRIDGE.t0);
const B1 = polylinePoint(TRAIL, BRIDGE.t1);
const BDIR = (() => { const dx = B1.x - B0.x, dz = B1.z - B0.z, l = Math.hypot(dx, dz); return { x: dx / l, z: dz / l, len: l }; })();
const BLAT = { x: -BDIR.z, z: BDIR.x };
const DECK0 = terrainH(B0.x, B0.z) + 0.55;
const DECK1 = terrainH(B1.x, B1.z) + 0.55;
const ROW_LEN = 0.62;
const ROWS = Math.ceil(BDIR.len / ROW_LEN);
const GAP_ROWS = { 4: 'R', 7: 'L', 11: 'R', 14: 'L' };   // missing half-planks
const deckYAt = (u) => DECK0 + (DECK1 - DECK0) * (u / BDIR.len) + Math.sin((u / BDIR.len) * Math.PI) * 0.35;

export function bridgeInfoAt(x, z) {
  const rx = x - B0.x, rz = z - B0.z;
  const u = rx * BDIR.x + rz * BDIR.z;
  const v = rx * BLAT.x + rz * BLAT.z;
  if (u < -0.4 || u > BDIR.len + 0.4 || Math.abs(v) > 1.75) return null;
  const row = clamp(Math.floor(u / ROW_LEN), 0, ROWS - 1);
  const gapSide = GAP_ROWS[row];
  const gap = (gapSide === 'L' && v < -0.12) || (gapSide === 'R' && v > 0.12);
  return { u, v, row, gap, deckY: deckYAt(clamp(u, 0, BDIR.len)) };
}
function bridgePoint(u, v) {
  return { x: B0.x + BDIR.x * u + BLAT.x * v, z: B0.z + BDIR.z * u + BLAT.z * v, deckY: deckYAt(u) };
}
export function gapTestPoint() {
  const row = 7; // a left-gap row
  return bridgePoint((row + 0.5) * ROW_LEN, -0.7);
}
export function caveAt(x, z) {
  const n = nearestOnTrail(x, z);
  if (n.dist > 3.4 || n.t < CAVE.t0 - 0.02 || n.t > CAVE.t1 + 0.02) return 0;
  const f = Math.min((n.t - (CAVE.t0 - 0.02)) / 0.045, ((CAVE.t1 + 0.02) - n.t) / 0.045, 1);
  return clamp(f, 0, 1);
}

// ---- small builders ----------------------------------------------------
function signMesh(lines, { w = 2.7, bg = '#f4f1e8', fg = '#8c1f28', sub = '#333333' } = {}) {
  const tex = canvasTexture(512, 256, (g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = fg; g.lineWidth = 14; g.strokeRect(10, 10, cw - 20, ch - 20);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 64px Arial';
    g.fillText(lines[0], cw / 2, lines[1] ? 84 : 128, cw - 50);
    if (lines[1]) { g.fillStyle = sub; g.font = '900 58px Arial'; g.fillText(lines[1], cw / 2, 172, cw - 50); }
  });
  const grp = new THREE.Group();
  const post = new THREE.Mesh(mergeParts([
    { geo: CYL(0.05, 0.06, 1.7), x: -w / 2 + 0.25, y: 0.85, color: 0x5a4632 },
    { geo: CYL(0.05, 0.06, 1.7), x: w / 2 - 0.25, y: 0.85, color: 0x5a4632 },
  ]), vcMat);
  post.castShadow = true;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshLambertMaterial({ map: tex }));
  board.position.y = 1.78;
  const back = new THREE.Mesh(mergeParts([{ geo: BOX(w, w / 2, 0.06), y: 1.78, color: 0x6a5138 }]), vcMat);
  grp.add(post, back, board);
  return grp;
}

function tentMesh(color) {
  const m = new THREE.Mesh(mergeParts([
    { geo: BOX(2.6, 0.12, 3.2), y: 0.06, color: 0x4a4238 },
    { geo: BOX(2.1, 0.09, 3.2), x: -0.58, y: 0.82, rz: 0.66, color },
    { geo: BOX(2.1, 0.09, 3.2), x: 0.58, y: 0.82, rz: -0.66, color },
    { geo: BOX(0.14, 0.14, 3.2), y: 1.32, color: 0x333333 },
    { geo: BOX(1.1, 0.8, 0.08), y: 0.4, z: -1.56, color },
  ]), vcMat);
  m.castShadow = true;
  return m;
}

let glowTex = null;
function flameSprite() {
  if (!glowTex) {
    glowTex = canvasTexture(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(255,230,170,1)');
      gr.addColorStop(0.35, 'rgba(255,160,60,0.75)');
      gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc37a, transparent: true, depthWrite: false }));
  s.scale.setScalar(1.15);
  return s;
}

const BOARD_NAMES = [
  ['Sinta Prameswari', 95], ['Bagas Nugroho', 112], ['Raka Aditya', 130],
  ['Dewi Lestari', 153], ['Yoga Saputra', 185],
];
export const fmtClimb = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export function buildMountain(scene, colliders) {
  const rng = makeRng(4242);
  const M = { rocks: [], refills: [], hikers: [] };
  const flames = [];
  const addCollider = (x, z, w, d) => colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
  const groundY = (x, z) => terrainH(x, z);

  // ---------- BASECAMP: rumah singgah ----------
  {
    const hx = 126, hz = -122, rot = Math.atan2(BASECAMP.x - hx, BASECAMP.z - hz);
    const house = new THREE.Group();
    const body = new THREE.Mesh(mergeParts([
      { geo: BOX(6.4, 0.3, 5.4), y: 0.15, color: 0x8a6d4a },
      { geo: BOX(6.4, 2.6, 0.25), y: 1.45, z: -2.6, color: 0xe8dcc2 },
      { geo: BOX(0.25, 2.6, 5.4), x: -3.1, y: 1.45, color: 0xe0d2b2 },
      { geo: BOX(0.25, 2.6, 5.4), x: 3.1, y: 1.45, color: 0xe0d2b2 },
      { geo: BOX(6.4, 0.5, 0.25), y: 2.5, z: 2.6, color: 0xe8dcc2 },
      { geo: BOX(0.22, 2.6, 0.22), x: -2.9, y: 1.3, z: 2.55, color: 0x6a5138 },
      { geo: BOX(0.22, 2.6, 0.22), x: 2.9, y: 1.3, z: 2.55, color: 0x6a5138 },
      { geo: BOX(7.4, 0.14, 3.6), y: 3.35, z: -1.35, rx: 0.52, color: 0x9a4a30 },
      { geo: BOX(7.4, 0.14, 3.6), y: 3.35, z: 1.35, rx: -0.52, color: 0x9a4a30 },
      { geo: BOX(3.4, 0.9, 0.5), y: 0.75, z: -2.1, color: 0x7a5aa8 },   // bench + gear pile inside
      { geo: BOX(1.1, 0.7, 0.7), x: -1.6, y: 0.65, z: -2.0, color: 0xd84040 },
      { geo: BOX(1.1, 0.7, 0.7), x: 1.7, y: 0.65, z: -2.0, color: 0x2050b0 },
    ]), vcMat);
    body.castShadow = true;
    house.add(body);
    const sign = signMesh(['RUMAH', 'SINGGAH'], { w: 2.2, bg: '#2e5d43', fg: '#ffe9b0', sub: '#ffffff' });
    sign.position.set(0, 2.2, 2.75); sign.scale.setScalar(0.62);
    house.add(sign);
    house.position.set(hx, groundY(hx, hz), hz);
    house.rotation.y = rot;
    scene.add(house);
    addCollider(hx, hz, 7, 6);
  }

  // ---------- BASECAMP: leaderboard ----------
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 512; boardCanvas.height = 340;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  let playerBest = null;
  function drawBoard() {
    const g = boardCanvas.getContext('2d');
    g.fillStyle = '#1d3a24'; g.fillRect(0, 0, 512, 340);
    g.strokeStyle = '#c9a24a'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 324);
    g.textAlign = 'center';
    g.fillStyle = '#ffd83c'; g.font = '900 40px Arial';
    g.fillText('PENDAKI TERCEPAT', 256, 56);
    g.fillStyle = '#bfe3c8'; g.font = '700 21px Arial';
    g.fillText('GUNUNG BAYU · 2.847 MDPL', 256, 88);
    g.font = '700 25px Arial'; g.textAlign = 'left';
    const rows = BOARD_NAMES.map(([name, sec]) => ({ name, sec, you: false }));
    if (playerBest != null) rows.push({ name: 'DAMAR (KAMU)', sec: playerBest, you: true });
    rows.sort((a, b) => a.sec - b.sec);
    rows.slice(0, 5).forEach((r, i) => {
      g.fillStyle = r.you ? '#ffd83c' : '#f2f2f2';
      g.fillText(`${i + 1}. ${r.name}`, 36, 138 + i * 38);
      g.textAlign = 'right'; g.fillText(fmtClimb(r.sec), 476, 138 + i * 38); g.textAlign = 'left';
    });
    g.fillStyle = '#9fc7a8'; g.font = 'italic 700 20px Arial'; g.textAlign = 'center';
    if (playerBest == null) g.fillText('Rekor kamu: — taklukkan puncak dulu!', 256, 322);
    else if (!rows.slice(0, 5).some((r) => r.you)) g.fillText(`Rekor kamu: ${fmtClimb(playerBest)} — belum masuk 5 besar!`, 256, 322);
    boardTex.needsUpdate = true;
  }
  drawBoard();
  {
    const bx = 138, bz = -126.5, rot = Math.atan2(BASECAMP.x - bx, BASECAMP.z - bz);
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(mergeParts([
      { geo: CYL(0.07, 0.08, 2.9), x: -1.8, y: 1.45, color: 0x5a4632 },
      { geo: CYL(0.07, 0.08, 2.9), x: 1.8, y: 1.45, color: 0x5a4632 },
      { geo: BOX(4.1, 2.6, 0.09), y: 1.95, color: 0x6a5138 },
      { geo: BOX(4.3, 0.18, 0.3), y: 3.32, color: 0x9a4a30 },
    ]), vcMat);
    frame.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.45), new THREE.MeshLambertMaterial({ map: boardTex }));
    face.position.set(0, 1.95, 0.06);
    grp.add(frame, face);
    grp.position.set(bx, groundY(bx, bz), bz);
    grp.rotation.y = rot;
    scene.add(grp);
    addCollider(bx, bz, 4, 1);
  }
  M.board = {
    recordTime(sec) {
      if (playerBest == null || sec < playerBest) playerBest = sec;
      drawBoard();
      const rows = BOARD_NAMES.map(([, s]) => s).concat([playerBest]).sort((a, b) => a - b);
      return rows.indexOf(playerBest) + 1;
    },
    setPlayerBest(sec) { playerBest = sec; drawBoard(); },
    hasPlayer() { return playerBest != null; },
    reset() { playerBest = null; drawBoard(); },
  };

  // ---------- BASECAMP: tents + gear point ----------
  const tentDefs = [
    { x: 166, z: -142, rot: 0.5, color: 0xe86a2a },
    { x: 128, z: -146, rot: -0.4, color: 0x2a6ae8 },
  ];
  for (const td of tentDefs) {
    const t = tentMesh(td.color);
    t.position.set(td.x, groundY(td.x, td.z), td.z);
    t.rotation.y = td.rot;
    scene.add(t);
    addCollider(td.x, td.z, 3, 3.4);
  }
  {
    const tx = 157, tz = -139;
    const table = new THREE.Mesh(mergeParts([
      { geo: BOX(2.8, 0.12, 1.2), y: 0.95, color: 0x8a6d4a },
      { geo: BOX(0.14, 0.95, 0.14), x: -1.25, y: 0.48, z: -0.45, color: 0x5a4632 },
      { geo: BOX(0.14, 0.95, 0.14), x: 1.25, y: 0.48, z: -0.45, color: 0x5a4632 },
      { geo: BOX(0.14, 0.95, 0.14), x: -1.25, y: 0.48, z: 0.45, color: 0x5a4632 },
      { geo: BOX(0.14, 0.95, 0.14), x: 1.25, y: 0.48, z: 0.45, color: 0x5a4632 },
    ]), vcMat);
    table.castShadow = true;
    table.position.set(tx, groundY(tx, tz), tz);
    scene.add(table);
    addCollider(tx, tz, 3, 1.6);
    const sign = signMesh(['AMBIL', 'PERLENGKAPAN'], { w: 2.3, bg: '#274b73', fg: '#ffffff', sub: '#ffd83c' });
    sign.position.set(tx + 1.5, groundY(tx + 1.5, tz + 1.6), tz + 1.6);
    sign.rotation.y = Math.atan2(BASECAMP.x - (tx + 1.5), BASECAMP.z - (tz + 1.6));
    scene.add(sign);
    const ty = groundY(tx, tz) + 1.01;
    const bottle = new THREE.Group();
    const bBody = new THREE.Mesh(mergeParts([
      { geo: CYL(0.1, 0.11, 0.36, 10), y: 0.18, color: 0x7ec8f2 },
      { geo: CYL(0.05, 0.05, 0.09, 8), y: 0.4, color: 0x2050b0 },
      { geo: CYL(0.115, 0.115, 0.1, 10), y: 0.2, color: 0xffffff },
    ]), vcMat);
    bottle.add(bBody);
    bottle.position.set(tx - 0.65, ty, tz);
    scene.add(bottle);
    const torch = new THREE.Group();
    const tBody = new THREE.Mesh(mergeParts([
      { geo: CYL(0.045, 0.05, 0.34, 8), y: 0.1, rz: 1.25, color: 0x2c2c30 },
      { geo: BOX(0.13, 0.13, 0.16), y: 0.28, z: 0.02, color: 0xffc21f },
    ]), vcMat);
    torch.add(tBody);
    const tGlow = flameSprite(); tGlow.scale.setScalar(0.5); tGlow.position.set(0, 0.3, 0);
    torch.add(tGlow); flames.push(tGlow);
    torch.position.set(tx + 0.65, ty, tz);
    scene.add(torch);
    M.gearBottle = { x: tx - 0.65, z: tz, mesh: bottle };
    M.gearTorch = { x: tx + 0.65, z: tz, mesh: torch };
  }
  M.resetGear = () => { M.gearBottle.mesh.visible = true; M.gearTorch.mesh.visible = true; };

  // ---------- refill drums: basecamp + every Pos ----------
  const drumAt = (x, z) => {
    const drum = new THREE.Mesh(mergeParts([
      { geo: CYL(0.55, 0.55, 1.15, 12), y: 0.58, color: 0x2050b0 },
      { geo: CYL(0.57, 0.57, 0.16, 12), y: 0.88, color: 0xffffff },
      { geo: BOX(0.2, 0.2, 0.2), y: 0.42, z: 0.55, color: 0xc0c8d0 },
    ]), vcMat);
    drum.castShadow = true;
    drum.position.set(x, groundY(x, z), z);
    scene.add(drum);
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.45),
      new THREE.MeshLambertMaterial({ map: canvasTexture(128, 72, (g, w, h) => { g.fillStyle = '#2050b0'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AIR', w / 2, h / 2 + 2); }) }),
    );
    tag.position.set(x, groundY(x, z) + 1.5, z);
    scene.add(tag);
    M.refills.push({ x, z, tag });
    addCollider(x, z, 1.2, 1.2);
  };
  drumAt(143, -131);
  for (const t of POST_TS) { const p = at(t, 2.4); drumAt(p.x, p.z); }

  // ---------- torches along the jalur ----------
  {
    const poleParts = [];
    const torchTs = [0.05, 0.13, 0.21, 0.29, 0.37, 0.395, 0.47, 0.56, 0.635, 0.685, 0.75, 0.83, 0.9, 0.96];
    torchTs.forEach((t, i) => {
      const p = at(t, i % 2 ? 1.8 : -1.8);
      const y = groundY(p.x, p.z);
      poleParts.push({ geo: CYL(0.05, 0.07, 1.6, 7), x: p.x, y: y + 0.8, z: p.z, color: 0x4a3826 });
      poleParts.push({ geo: BOX(0.2, 0.16, 0.2), x: p.x, y: y + 1.62, z: p.z, color: 0x2c2c30 });
      const f = flameSprite();
      f.position.set(p.x, y + 1.85, p.z);
      scene.add(f);
      flames.push(f);
    });
    const poles = new THREE.Mesh(mergeParts(poleParts), vcMat);
    poles.castShadow = true;
    scene.add(poles);
  }

  // ---------- the cave ----------
  {
    const parts = [];
    const rockCols = [0x5a4a42, 0x6a584c, 0x4a3e38, 0x655248];
    for (let t = CAVE.t0 - 0.015; t <= CAVE.t1 + 0.016; t += 0.011) {
      const p = polylinePoint(TRAIL, t);
      const d = trailDir(t);
      const head = Math.atan2(d.x, d.z);
      const base = groundY(p.x, p.z);
      for (const side of [-1, 1]) {
        const wx = p.x - d.z * side * 2.6, wz = p.z + d.x * side * 2.6;
        parts.push({ geo: BOX(1.6, 5.2, 3.1), x: wx, y: base + 1.7, z: wz, ry: head, color: rockCols[Math.floor(rng.range(0, 4))] });
      }
      parts.push({ geo: BOX(7.2, 1.3, 3.2), x: p.x, y: base + 4.6, z: p.z, ry: head, color: rockCols[Math.floor(rng.range(0, 4))] });
      if (rng.chance(0.5)) parts.push({ geo: BOX(0.5, 1.1, 0.5), x: p.x + rng.range(-1, 1), y: base + 3.7, z: p.z + rng.range(-1, 1), color: 0x4a3e38 });
    }
    const cave = new THREE.Mesh(mergeParts(parts), vcMat);
    cave.castShadow = true;
    scene.add(cave);
  }

  // ---------- the broken bridge ----------
  {
    const heading = Math.atan2(BDIR.x, BDIR.z);
    const plankParts = [];
    for (let row = 0; row < ROWS; row++) {
      const u = (row + 0.5) * ROW_LEN;
      for (const side of [-1, 1]) {
        if (GAP_ROWS[row] === (side < 0 ? 'L' : 'R')) continue;
        const c = bridgePoint(u, side * 0.68);
        plankParts.push({ geo: BOX(1.28, 0.13, ROW_LEN - 0.07), x: c.x, y: c.deckY - 0.07, z: c.z, ry: heading, color: row % 2 ? 0x8a6d4a : 0x9a7a52 });
      }
    }
    for (const end of [0, BDIR.len]) {
      const c = bridgePoint(end, 0);
      plankParts.push({ geo: BOX(2.9, 0.3, 0.5), x: c.x, y: deckYAt(end) - 0.2, z: c.z, ry: heading, color: 0x6a5138 });
    }
    const planks = new THREE.Mesh(mergeParts(plankParts), vcMat);
    planks.castShadow = true;
    scene.add(planks);
    const pitch = -Math.atan2(DECK1 - DECK0, BDIR.len);
    const midY = (DECK0 + DECK1) / 2 + 0.17;
    for (const side of [-1, 1]) {
      const c = bridgePoint(BDIR.len / 2, side * 1.32);
      for (const [dy, thick, col] of [[-0.42, 0.16, 0x6a5138], [0.78, 0.05, 0xc8b088]]) {
        const beam = new THREE.Mesh(BOX(thick, thick, BDIR.len + 0.6), new THREE.MeshLambertMaterial({ color: col }));
        beam.rotation.order = 'YXZ';
        beam.rotation.y = heading; beam.rotation.x = pitch;
        beam.position.set(c.x, midY + dy, c.z);
        scene.add(beam);
      }
      for (const end of [0, BDIR.len]) {
        const pc = bridgePoint(end, side * 1.32);
        const post = new THREE.Mesh(CYL(0.07, 0.08, 1.5, 7), new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
        post.position.set(pc.x, deckYAt(end) + 0.4, pc.z);
        scene.add(post);
      }
    }
    // the gorge below: dark floor and fallen rock
    const mid = bridgePoint(BDIR.len / 2, 0);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, BDIR.len + 9), new THREE.MeshLambertMaterial({ color: 0x2c2622 }));
    floor.rotation.x = -Math.PI / 2; floor.rotation.z = -heading;
    floor.position.set(mid.x, Math.min(DECK0, DECK1) - 6.5, mid.z);
    scene.add(floor);
    for (let i = 0; i < 6; i++) {
      const rr = bridgePoint(rng.range(0, BDIR.len), rng.range(-4.5, 4.5));
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rng.range(0.7, 1.6), 0), new THREE.MeshLambertMaterial({ color: 0x55483e }));
      rock.position.set(rr.x, Math.min(DECK0, DECK1) - 6.2 + rng.range(0, 1.2), rr.z);
      rock.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
      scene.add(rock);
    }
    for (const endT of [BRIDGE.t0 - 0.012, BRIDGE.t1 + 0.012]) {
      const p = at(endT, 2.6);
      const s = signMesh(['HATI-HATI', 'JEMBATAN RUSAK']);
      s.position.set(p.x, groundY(p.x, p.z), p.z);
      const d = trailDir(endT);
      const faceDir = endT < BRIDGE.t0 ? { x: -d.x, z: -d.z } : d;
      s.rotation.y = Math.atan2(faceDir.x, faceDir.z);
      scene.add(s);
    }
  }

  // ---------- rockfall zone dressing ----------
  {
    const p = at(0.72, 2.4);
    const s = signMesh(['AWAS', 'LONGSOR BATU'], { bg: '#f7c948', fg: '#7a4a00', sub: '#7a4a00' });
    s.position.set(p.x, groundY(p.x, p.z), p.z);
    const d = trailDir(0.72);
    s.rotation.y = Math.atan2(-d.x, -d.z);
    scene.add(s);
    for (const t of [0.78, 0.86, 0.93]) {
      const bp = at(t, -3.1);
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 0), new THREE.MeshLambertMaterial({ color: 0x6f6156 }));
      b.position.set(bp.x, groundY(bp.x, bp.z) + 0.7, bp.z);
      b.rotation.set(0.4, rng.range(0, 3), 0.2);
      b.castShadow = true;
      scene.add(b);
    }
  }
  const rockGeo = new THREE.DodecahedronGeometry(0.62, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x776552 });
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    M.rocks.push({ mesh, active: false, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 0.75, life: 0 });
  }
  let rockTimer = 7;
  M.triggerRockfall = (atT) => {
    const baseT = atT ?? rng.range(0.76, 0.93);
    let n = 0;
    for (const rock of M.rocks) {
      if (rock.active) continue;
      const t = clamp(baseT + (n - 1) * 0.014, 0.72, 0.97);
      const p = at(t, 5.4);
      rock.x = p.x; rock.z = p.z; rock.y = groundY(p.x, p.z) + 4.6;
      const d = trailDir(t);
      rock.vx = d.z * 5.2 + rng.range(-0.8, 0.8);
      rock.vz = -d.x * 5.2 + rng.range(-0.8, 0.8);
      rock.vy = 0; rock.life = 5; rock.active = true;
      rock.mesh.visible = true;
      if (++n >= 3) break;
    }
  };

  // ---------- summit board + photo spot ----------
  {
    const sx = SUMMIT.x - 3.6, sz = SUMMIT.z + 3.8;
    const tex = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#3a2c1e'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c9a24a'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
      g.textAlign = 'center';
      g.fillStyle = '#ffd83c'; g.font = '900 52px Arial';
      g.fillText('PUNCAK GUNUNG BAYU', w / 2, 92);
      g.fillStyle = '#ffffff'; g.font = '900 64px Arial';
      g.fillText('2.847 MDPL', w / 2, 168);
      g.fillStyle = '#d8c9a8'; g.font = '700 24px Arial';
      g.fillText('Di atas awan Teluk Bayu — selamat, pendaki!', w / 2, 216);
    });
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(mergeParts([
      { geo: CYL(0.07, 0.08, 2.6), x: -1.6, y: 1.3, color: 0x5a4632 },
      { geo: CYL(0.07, 0.08, 2.6), x: 1.6, y: 1.3, color: 0x5a4632 },
      { geo: BOX(3.7, 1.95, 0.09), y: 1.75, color: 0x54402a },
    ]), vcMat);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.55, 1.8), new THREE.MeshLambertMaterial({ map: tex }));
    face.position.set(0, 1.75, 0.06);
    grp.add(frame, face);
    grp.position.set(sx, groundY(sx, sz), sz);
    grp.rotation.y = Math.atan2(198 - sx, -212 - sz);
    scene.add(grp);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.4, 28), new THREE.MeshBasicMaterial({ color: 0xffc21f, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(SUMMIT.x + 1.8, groundY(SUMMIT.x + 1.8, SUMMIT.z + 1.5) + 0.06, SUMMIT.z + 1.5);
    scene.add(ring);
    const spot = signMesh(['SPOT', 'FOTO'], { w: 1.5, bg: '#274b73', fg: '#ffffff', sub: '#ffd83c' });
    spot.scale.setScalar(0.8);
    spot.position.set(SUMMIT.x + 3.4, groundY(SUMMIT.x + 3.4, SUMMIT.z + 2.6), SUMMIT.z + 2.6);
    spot.rotation.y = Math.atan2(198 - (SUMMIT.x + 3.4), -212 - (SUMMIT.z + 2.6));
    scene.add(spot);
  }

  // ---------- fellow pendaki ----------
  const BARKS = [
    'Semangat, dikit lagi!', 'Airnya jangan lupa diisi.', 'Hati-hati di jembatan, bolong!',
    'Puncak tinggal sebentar lagi!', 'Jangan lupa foto di puncak ya!', 'Isi botol di Pos, airnya segar!',
  ];
  let barkCd = 4;
  const mkHiker = (i) => {
    const pal = HIKER_PALETTES[i % HIKER_PALETTES.length];
    const human = createHuman({
      skin: SKIN_TONES[i % SKIN_TONES.length], shirt: pal.shirt, pants: pal.pants,
      hair: 0x1c1410, cap: i % 2 ? pal.pack : 0, backpack: pal.pack,
    });
    scene.add(human.group);
    return human;
  };
  const walkerDefs = [
    { t: 0.12, dir: 1, speed: 1.5, lane: 0.55 }, { t: 0.34, dir: -1, speed: 1.35, lane: -0.55 },
    { t: 0.52, dir: 1, speed: 1.65, lane: 0.5 }, { t: 0.68, dir: -1, speed: 1.45, lane: -0.5 },
    { t: 0.86, dir: 1, speed: 1.25, lane: 0.55 },
  ];
  walkerDefs.forEach((def, i) => {
    M.hikers.push({ human: mkHiker(i), kind: 'walk', ...def, restT: 0, restCd: rng.range(4, 20) });
  });
  // resters at Pos 2 and Pos 3, and two pendaki hanging around basecamp
  const pos2 = at(0.55, -3.2);
  const restTent = tentMesh(0x4ec84e);
  restTent.position.set(pos2.x, groundY(pos2.x, pos2.z), pos2.z);
  restTent.rotation.y = 0.7;
  scene.add(restTent);
  const r1 = mkHiker(5);
  M.hikers.push({ human: r1, kind: 'rest', x: pos2.x + 1.8, z: pos2.z + 1.2, heading: 2.4, pose: 'stand' });
  const pos3 = at(0.8, 2.6);
  const r2 = mkHiker(3);
  r2.setPose('sit');
  M.hikers.push({ human: r2, kind: 'rest', x: pos3.x, z: pos3.z, heading: -0.8, pose: 'sit' });
  const c1 = mkHiker(1);
  M.hikers.push({ human: c1, kind: 'camp', x: 143.5, z: -128.5, heading: 2.5, pose: 'stand' });
  const c2 = mkHiker(4);
  M.hikers.push({ human: c2, kind: 'camp', x: 152, z: -133.5, heading: -1.9, pose: 'stand' });

  let freeze = 0;
  M.stageShot = (name) => {
    freeze = 9;
    if (name === 'mountain') {
      const spots = [[0.375, 1], [0.44, 1], [0.52, -1]];
      M.hikers.filter((h) => h.kind === 'walk').forEach((h, i) => {
        if (spots[i]) { h.t = spots[i][0]; h.dir = spots[i][1]; h.restT = 0; }
      });
    }
  };

  M.update = (dt, t, playerPos, hooks = {}) => {
    for (const f of flames) {
      const s = 1 + Math.sin(t * 11 + f.position.x) * 0.16 + Math.sin(t * 23 + f.position.z) * 0.08;
      f.scale.setScalar(f === M.gearTorch.mesh.children[1] ? 0.5 * s : 1.15 * s);
    }
    for (const r of M.refills) if (r.tag) r.tag.rotation.y = Math.atan2(playerPos.x - r.x, playerPos.z - r.z);
    freeze = Math.max(0, freeze - dt);
    barkCd -= dt;
    for (const h of M.hikers) {
      if (h.kind !== 'walk') {
        h.human.animate(dt, 0);
        h.human.group.position.set(h.x, groundY(h.x, h.z) + h.human.bobY, h.z);
        h.human.group.rotation.y = h.heading;
        continue;
      }
      if (freeze <= 0) {
        h.restCd -= dt;
        if (h.restT > 0) h.restT -= dt;
        else {
          h.t += (h.dir * h.speed * dt) / TOTAL;
          if (h.t > 0.985) { h.t = 0.985; h.dir = -1; }
          if (h.t < 0.015) { h.t = 0.015; h.dir = 1; }
          if (h.restCd <= 0 && POST_TS.some((pt) => Math.abs(h.t - pt) < 0.004)) { h.restT = rng.range(6, 12); h.restCd = 30; }
        }
      }
      const walking = h.restT <= 0;
      const p = at(h.t, h.lane);
      const bi = bridgeInfoAt(p.x, p.z);
      const y = bi ? bi.deckY : groundY(p.x, p.z);
      const d = trailDir(h.t);
      h.human.animate(dt, walking ? h.speed : 0);
      h.human.group.position.set(p.x, y + h.human.bobY, p.z);
      h.human.group.rotation.y = Math.atan2(d.x * h.dir, d.z * h.dir);
      if (playerPos && barkCd <= 0 && Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 7.5) {
        barkCd = 11;
        if (hooks.onBark) hooks.onBark(BARKS[Math.floor(rng.range(0, BARKS.length))]);
      }
    }
    // rockfalls: only while a player is up on the jalur
    if (playerPos) {
      const n = nearestOnTrail(playerPos.x, playerPos.z);
      if (n.dist < 6 && n.t > 0.6 && n.t < 0.99) {
        rockTimer -= dt;
        if (rockTimer <= 0) {
          rockTimer = rng.range(7, 14);
          M.triggerRockfall();
          if (hooks.onRumble) hooks.onRumble();
        }
      }
    }
    for (const rock of M.rocks) {
      if (!rock.active) continue;
      rock.life -= dt;
      rock.vy -= 22 * dt;
      rock.x += rock.vx * dt; rock.y += rock.vy * dt; rock.z += rock.vz * dt;
      const floor = groundY(rock.x, rock.z) + rock.r * 0.7;
      const bi = bridgeInfoAt(rock.x, rock.z);
      const fl = bi ? Math.max(floor, bi.deckY + rock.r * 0.7) : floor;
      if (rock.y < fl) {
        rock.y = fl;
        rock.vy = Math.abs(rock.vy) > 2 ? -rock.vy * 0.38 : 0;
        rock.vx *= 0.72; rock.vz *= 0.72;
      }
      rock.mesh.position.set(rock.x, rock.y, rock.z);
      rock.mesh.rotation.x += dt * 3; rock.mesh.rotation.z += dt * 2;
      if (rock.life <= 0) { rock.active = false; rock.mesh.visible = false; }
    }
  };

  M.bridgeInfoAt = bridgeInfoAt;
  M.bridgePointAt = (t, v = 0) => bridgePoint(clamp((t - BRIDGE.t0) / (BRIDGE.t1 - BRIDGE.t0), 0, 1) * BDIR.len, v);
  M.bridgeHeading = Math.atan2(BDIR.x, BDIR.z);
  M.caveAt = caveAt;
  M.trailDist = (x, z) => nearestOnTrail(x, z).dist;
  M.nearestT = (x, z) => nearestOnTrail(x, z).t;
  M.gapTestPoint = gapTestPoint;
  return M;
}
