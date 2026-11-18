// Bayu Heat — builds the three.js world of Teluk Bayu from city.js data:
// sky, buildings, pasar, port, beach, and Gunung Bayu with its trail.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, STREET_V } from './config.js';
import { terrainH, MOUNTAIN_ROAD, TRAIL, polylinePoint } from './city.js';
import { makeRng, clamp } from './rng.js';

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function mergeParts(parts) {
  const pos = [], nor = [], col = [], uv = [];
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    m.makeRotationFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0));
    if (p.sx || p.sy || p.sz) m.scale(new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1));
    m.setPosition(p.x || 0, p.y || 0, p.z || 0);
    const gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv;
    const c = new THREE.Color(p.color ?? 0xffffff);
    for (let i = 0; i < gp.count; i++) {
      v.fromBufferAttribute(gp, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(gn, i).transformDirection(m); nor.push(v.x, v.y, v.z);
      uv.push(gu ? gu.getX(i) : 0, gu ? gu.getY(i) : 0);
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
export const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

const texCache = new Map();
function facade(kind, tex, sign) {
  const key = `${kind}|${tex}|${sign || ''}`;
  if (texCache.has(key)) return texCache.get(key);
  let t;
  if (kind === 'office') {
    const bases = ['#3d4a63', '#54455e', '#63503f'];
    t = canvasTexture(256, 512, (g, w, h) => {
      g.fillStyle = bases[tex % 3]; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
        const lit = ((x * 7 + y * 13 + tex * 5) % 9) < 3;
        g.fillStyle = lit ? '#ffd98a' : 'rgba(190,215,240,0.5)';
        g.fillRect(10 + x * 30, 14 + y * 30, 20, 18);
      }
    });
  } else if (kind === 'house') {
    const walls = ['#f2d8b0', '#f2b8c6', '#b8e0c8', '#c6d8f2'];
    t = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = walls[tex % 4]; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5a4632'; g.fillRect(52, 62, 24, 66);
      g.fillStyle = '#ffe9a8'; g.fillRect(12, 30, 26, 26); g.fillRect(90, 30, 26, 26);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 118, w, 10);
    });
  } else {
    const styles = {
      ruko: ['#e8d3ae', '#d9e4ee', '#f0c8b8', '#cfe0c0'], garage: ['#c8ccd4'], polres: ['#dfe6f2'],
      hospital: ['#eef2f4'], mart: ['#f4f6ff'], hall: ['#e8c9a0'], warehouse: ['#b9bec6'], mosque: ['#eef4ea'],
    };
    const bands = { ruko: '#28418c', garage: '#b8302a', polres: '#1d3468', hospital: '#c8352e', mart: '#1256c8', hall: '#7a4a1e', warehouse: '#4a5560', mosque: '#1f7a5c' };
    const wall = (styles[kind] || ['#dddddd'])[tex % (styles[kind] || ['#dddddd']).length];
    t = canvasTexture(256, 160, (g, w, h) => {
      g.fillStyle = wall; g.fillRect(0, 0, w, h);
      g.fillStyle = bands[kind] || '#333'; g.fillRect(0, 0, w, 44);
      if (sign) {
        g.fillStyle = '#ffffff'; g.font = '900 25px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(sign, w / 2, 23, w - 12);
      }
      g.fillStyle = 'rgba(40,50,70,0.75)';
      for (let x = 0; x < 4; x++) { g.fillRect(16 + x * 60, 62, 34, 34); g.fillRect(16 + x * 60, 112, 34, 30); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 8, w, 8);
    });
  }
  texCache.set(key, t);
  return t;
}
const roofMats = new Map();
function roofMat(color) {
  if (!roofMats.has(color)) roofMats.set(color, new THREE.MeshLambertMaterial({ color }));
  return roofMats.get(color);
}

export function buildWorld(scene, layout) {
  const rng = makeRng(99);
  const animated = { boats: [], clouds: [], sea: null, flag: null, flagPlanted: false };
  scene.fog = new THREE.Fog(0xe8935c, 170, 1150);

  const skyTex = canvasTexture(64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#3d2a63'); gr.addColorStop(0.42, '#8a4a7d'); gr.addColorStop(0.62, '#e86a5e');
    gr.addColorStop(0.74, '#ff9a4e'); gr.addColorStop(0.82, '#ffc978'); gr.addColorStop(1, '#ffe3ae');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 24, 14), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x5a4460, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb066, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
  sun.shadow.camera.far = 700; sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.62).normalize();
  animated.updateSun = (x, z) => {
    sun.position.set(x + SUN_DIR.x * 320, SUN_DIR.y * 320, z + SUN_DIR.z * 320);
    sun.target.position.set(x, 0, z);
  };
  animated.updateSun(160, 160);

  const groundTex = canvasTexture(2048, 2048, (g) => {
    const S = 2048 / 560;                       // world x -40..520, z -30..530 mapped below via plane UV
    const X = (x) => (x + 40) * S, Z = (z) => (z + 30) * S;
    g.fillStyle = '#77705f'; g.fillRect(0, 0, 2048, 2048);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) {
      const kind = ['alun', 'pasar'].includes('') ? '' : null;
      g.fillStyle = '#6f7d55';
      g.fillRect(X(i * 64 + 10), Z(j * 64 + 10), 44 * S, 44 * S);
    }
    g.fillStyle = '#8d8271';                    // alun-alun paving
    g.fillRect(X(138), Z(138), 44 * S, 44 * S);
    g.fillStyle = '#998b74';                    // pasar floor
    g.fillRect(X(202), Z(138), 108 * S, 44 * S);
    g.fillStyle = '#33363d';
    for (const rx of CITY.roadX) g.fillRect(X(rx - 7.5), Z(-8), 15 * S, 408 * S);
    for (const rz of CITY.roadZ) g.fillRect(X(-8), Z(rz - 7.5), 472 * S, 15 * S);
    g.fillStyle = '#c8c2b2';                    // sidewalks
    for (const rx of CITY.roadX) { g.fillRect(X(rx - 10.5), Z(-8), 2.6 * S, 408 * S); g.fillRect(X(rx + 7.9), Z(-8), 2.6 * S, 408 * S); }
    for (const rz of CITY.roadZ) { g.fillRect(X(-8), Z(rz - 10.5), 472 * S, 2.6 * S); g.fillRect(X(-8), Z(rz + 7.9), 472 * S, 2.6 * S); }
    g.fillStyle = '#e8c95a';
    for (const rx of CITY.roadX) for (let z = -4; z < 396; z += 12) g.fillRect(X(rx - 0.35), Z(z), 0.7 * S, 5.5 * S);
    for (const rz of CITY.roadZ) for (let x = -4; x < 460; x += 12) g.fillRect(X(x), Z(rz - 0.35), 5.5 * S, 0.7 * S);
    g.fillStyle = 'rgba(240,240,240,0.85)';
    for (const rx of CITY.roadX) for (const rz of CITY.roadZ) for (let k = -2; k <= 2; k++) {
      g.fillRect(X(rx + k * 2.6 - 0.9), Z(rz - 9.6), 1.8 * S, 3.4 * S);
      g.fillRect(X(rx - 9.6), Z(rz + k * 2.6 - 0.9), 3.4 * S, 1.8 * S);
    }
    const grad = g.createLinearGradient(X(452), 0, X(496), 0);
    grad.addColorStop(0, '#cbb27f'); grad.addColorStop(0.35, '#ecd49c'); grad.addColorStop(1, '#f4e3b0');
    g.fillStyle = grad; g.fillRect(X(452), Z(-8), 46 * S, 408 * S);
    g.fillStyle = '#8a6844';
    for (let z = -6; z < 398; z += 4) g.fillRect(X(457), Z(z), 5 * S, 1.1 * S);
    g.fillStyle = '#7d7468';                    // port apron
    g.fillRect(X(492), Z(262), 34 * S, 132 * S);
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(240, 0, 250);
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMats = new Map();
  const wallMat = (kind, tex, sign) => {
    const key = `${kind}|${tex}|${sign || ''}`;
    if (!wallMats.has(key)) wallMats.set(key, new THREE.MeshLambertMaterial({ map: facade(kind, tex, sign) }));
    return wallMats.get(key);
  };
  for (const b of layout.buildings) {
    if (b.kind === 'spbu') continue;                       // canopy built below
    const wm = wallMat(b.kind, b.tex, b.sign);
    const rm = roofMat(b.roof);
    const mesh = new THREE.Mesh(BOX(b.w, b.h, b.d), [wm, wm, rm, rm, wm, wm]);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = b.h > 6; mesh.receiveShadow = true;
    scene.add(mesh);
    if (b.kind === 'mosque') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(8.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2e9f7e }));
      dome.position.set(b.x, b.h, b.z); scene.add(dome);
      const drum = new THREE.Mesh(CYL(8.8, 8.8, 2.2, 18), new THREE.MeshLambertMaterial({ color: 0xeef4ea }));
      drum.position.set(b.x, b.h + 0.6, b.z); scene.add(drum);
      const minaret = new THREE.Group();
      const tower = new THREE.Mesh(CYL(1.1, 1.4, 21, 8), new THREE.MeshLambertMaterial({ color: 0xeef4ea }));
      tower.position.y = 10.5; minaret.add(tower);
      const cap = new THREE.Mesh(CYL(0.1, 1.9, 3.6, 8), new THREE.MeshLambertMaterial({ color: 0x2e9f7e }));
      cap.position.y = 22.6; minaret.add(cap);
      const balc = new THREE.Mesh(CYL(1.8, 1.8, 1, 8), new THREE.MeshLambertMaterial({ color: 0xd8e4d2 }));
      balc.position.y = 16.4; minaret.add(balc);
      minaret.position.set(b.x + 13.5, 0, b.z - 6);
      minaret.traverse((o) => { o.castShadow = true; });
      scene.add(minaret);
    }
  }

  {
    const grp = new THREE.Group();
    const canopy = new THREE.Mesh(BOX(20, 0.8, 13), new THREE.MeshLambertMaterial({ color: 0xd84040 }));
    canopy.position.y = 5.6; canopy.castShadow = true; grp.add(canopy);
    const band = new THREE.Mesh(BOX(20.4, 0.7, 13.4), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    band.position.y = 5.1; grp.add(band);
    for (const [px, pz] of [[-8, -5], [8, -5], [-8, 5], [8, 5]]) {
      const pil = new THREE.Mesh(CYL(0.32, 0.32, 5.4), vcMat.clone());
      pil.material = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
      pil.position.set(px, 2.7, pz); grp.add(pil);
    }
    for (const px of [-3.4, 3.4]) {
      const pump = new THREE.Mesh(BOX(1.1, 1.5, 0.7), new THREE.MeshLambertMaterial({ color: 0xd84040 }));
      pump.position.set(px, 0.75, 2); grp.add(pump);
    }
    const signTex = canvasTexture(128, 192, (g, w, h) => {
      g.fillStyle = '#d84040'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = '900 25px Arial'; g.textAlign = 'center';
      g.fillText('BAYU', w / 2, 52); g.fillText('PETROL', w / 2, 84);
      g.font = '700 17px Arial'; g.fillText('Pertamax', w / 2, 126); g.fillText('Rp 12.900', w / 2, 150);
    });
    const pole = new THREE.Mesh(CYL(0.18, 0.18, 7), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    pole.position.set(13, 3.5, -10); grp.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5), new THREE.MeshLambertMaterial({ map: signTex, side: THREE.DoubleSide }));
    board.position.set(13, 6.4, -10); grp.add(board);
    grp.position.set(352, 0, 284);
    scene.add(grp);
  }

  {
    const grp = new THREE.Group();
    const parts = [
      { geo: CYL(4.4, 5.2, 1.6, 18), y: 0.8, color: 0x9a8f7d },
      { geo: CYL(1.7, 2.7, 12.5, 14), y: 7.6, color: 0xf2ede2 },
      { geo: CYL(2.05, 2.3, 2.4, 14), y: 5.2, color: 0xd84040 },
      { geo: CYL(2.0, 2.15, 2.2, 14), y: 10.4, color: 0xd84040 },
      { geo: CYL(2.3, 2.3, 1.1, 14), y: 14.2, color: 0x3a3f4a },
      { geo: CYL(0.2, 2.2, 2.6, 14), y: 16, color: 0xd84040 },
    ];
    const m = new THREE.Mesh(mergeParts(parts), vcMat);
    m.castShadow = true; grp.add(m);
    const lampBall = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
    lampBall.position.y = 14.2; grp.add(lampBall);
    grp.position.set(160, 0, 160);
    scene.add(grp);
  }

  {
    const parts = [];
    const awnMats = new Map();
    for (const s of layout.stalls) {
      parts.push({ geo: BOX(4.6, 0.9, 3.2), x: s.x, y: 0.45, z: s.z, ry: s.rot, color: 0x8a6844 });
      for (let k = 0; k < 3; k++) parts.push({ geo: BOX(1.1, 0.7, 1.1), x: s.x - 1.4 + k * 1.4, y: 1.25, z: s.z, ry: s.rot, color: [0xe8a03c, 0x7ec84e, 0xe84a6a][k % 3] });
      for (const [px, pz] of [[-2.1, -1.4], [2.1, -1.4], [-2.1, 1.4], [2.1, 1.4]]) parts.push({ geo: CYL(0.06, 0.06, 2.6), x: s.x + px, y: 1.3, z: s.z + pz, color: 0x6a5138 });
      if (!awnMats.has(s.color)) {
        const c = '#' + s.color.toString(16).padStart(6, '0');
        awnMats.set(s.color, new THREE.MeshLambertMaterial({ map: canvasTexture(64, 64, (g, w, h) => {
          g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.85)';
          for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 8, h);
        }), side: THREE.DoubleSide }));
      }
      const awn = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 4.4), awnMats.get(s.color));
      awn.position.set(s.x, 2.75, s.z); awn.rotation.x = -Math.PI / 2 + 0.32; awn.rotation.z = s.rot;
      awn.castShadow = true;
      scene.add(awn);
    }
    const merged = new THREE.Mesh(mergeParts(parts), vcMat);
    merged.castShadow = true; scene.add(merged);
  }

  {
    const trunkGeo = mergeParts([
      { geo: CYL(0.13, 0.24, 4.8, 6), y: 2.4, rz: 0.07, color: 0x8a6a4a },
    ]);
    const frondGeo = mergeParts([0, 1, 2, 3, 4, 5].map((i) => ({
      geo: new THREE.PlaneGeometry(3.6, 0.85), x: Math.cos(i * 1.047) * 1.35, y: 4.95 + (i % 2) * 0.16, z: Math.sin(i * 1.047) * 1.35,
      rx: -Math.PI / 2 + 0.62, rz: -i * 1.047, color: i % 2 ? 0x3f8f3f : 0x4da34d,
    })));
    const frondMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const trunks = new THREE.InstancedMesh(trunkGeo, vcMat, layout.palms.length);
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, layout.palms.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3();
    layout.palms.forEach((p, i) => {
      E.set(0, (i * 2.39) % 6.28, 0); Q.setFromEuler(E);
      V.set(p.x, terrainH(p.x, p.z), p.z); SC.set(p.s, p.s, p.s);
      M.compose(V, Q, SC); trunks.setMatrixAt(i, M); fronds.setMatrixAt(i, M);
    });
    trunks.castShadow = true;
    scene.add(trunks); scene.add(fronds);

    const lampGeo = mergeParts([
      { geo: CYL(0.07, 0.09, 5.4), y: 2.7, color: 0x3c4148 },
      { geo: BOX(1.5, 0.09, 0.09), x: 0.7, y: 5.35, color: 0x3c4148 },
      { geo: BOX(0.55, 0.12, 0.24), x: 1.35, y: 5.3, color: 0xffe2a0 },
    ]);
    const lamps = new THREE.InstancedMesh(lampGeo, vcMat, layout.lamps.length);
    layout.lamps.forEach((l, i) => {
      E.set(0, (i % 4) * Math.PI / 2, 0); Q.setFromEuler(E);
      V.set(l.x, 0, l.z); SC.set(1, 1, 1);
      M.compose(V, Q, SC); lamps.setMatrixAt(i, M);
    });
    scene.add(lamps);
  }

  for (const s of layout.signs) {
    const name = STREET_V[Math.max(0, CITY.roadX.indexOf(Math.round((s.x - 9) / 64) * 64))] || 'Jl. Merdeka';
    const tex = canvasTexture(256, 48, (g, w, h) => {
      g.fillStyle = '#1d6a3c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = '700 27px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, w / 2, h / 2 + 1);
    });
    const pole = new THREE.Mesh(CYL(0.05, 0.05, 3), new THREE.MeshLambertMaterial({ color: 0x666c74 }));
    pole.position.set(s.x, 1.5, s.z); scene.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.68), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    board.position.set(s.x, 2.9, s.z); board.rotation.y = s.rot;
    scene.add(board);
  }

  const seaTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2b6f96'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,220,170,0.35)';
    const r = makeRng(5);
    for (let i = 0; i < 260; i++) g.fillRect(r.range(0, w), r.range(0, h), r.range(2, 9), 1.4);
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.repeat.set(10, 14);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(760, 980), new THREE.MeshLambertMaterial({ map: seaTex }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(492 + 380, -0.55, 200);
  scene.add(sea);
  animated.sea = seaTex;

  {
    const pier = new THREE.Mesh(BOX(64, 1.2, 128), new THREE.MeshLambertMaterial({ color: 0x7d7468 }));
    pier.position.set(524, 0.1, 322); pier.receiveShadow = true; scene.add(pier);
    const parts = [];
    const contColors = [0xd84a3c, 0x3c78d8, 0x3ca864, 0xe8a03c, 0x7a5aa8, 0x3ca8a8];
    for (let i = 0; i < 34; i++) {
      const cx = 500 + (i % 6) * 8.4, cz = 272 + Math.floor(i / 6) * 8.6, lvl = i % 5 === 0 ? 2 : 1;
      for (let l = 0; l < lvl; l++) parts.push({ geo: BOX(7.6, 2.6, 3.4), x: cx, y: 1.3 + l * 2.6 + 0.7, z: cz, ry: (i % 2) * 0.04, color: contColors[i % 6] });
    }
    for (const cz of [296, 348]) {
      for (const lx of [506, 540]) for (const lz of [cz - 9, cz + 9]) parts.push({ geo: BOX(1.4, 17, 1.4), x: lx, y: 9.2, z: lz, color: 0xe8762c });
      parts.push({ geo: BOX(38, 1.6, 1.6), x: 523, y: 17.6, z: cz - 9, color: 0xe8762c });
      parts.push({ geo: BOX(38, 1.6, 1.6), x: 523, y: 17.6, z: cz + 9, color: 0xe8762c });
      parts.push({ geo: BOX(1.6, 1.6, 19.6), x: 523, y: 17.6, z: cz, color: 0xf09a4a });
      parts.push({ geo: BOX(30, 1.3, 1.3), x: 530, y: 18.6, z: cz, rz: 0, color: 0xe8762c });
      parts.push({ geo: BOX(0.18, 7, 0.18), x: 542, y: 14.5, z: cz, color: 0x555555 });
      parts.push({ geo: BOX(3.4, 2.2, 2.4), x: 542, y: 10.4, z: cz, color: 0x3c78d8 });
    }
    const port = new THREE.Mesh(mergeParts(parts), vcMat);
    port.castShadow = true; scene.add(port);
    for (let i = 0; i < 5; i++) {
      const hull = mergeParts([
        { geo: BOX(7.6, 1.1, 1.9), y: 0.55, color: [0xd84a3c, 0x3ca8a8, 0xe8a03c, 0x4a7ad8, 0x7ec84e][i] },
        { geo: BOX(1.7, 0.8, 1.5), x: -3.9, y: 0.9, rz: 0.5, color: 0xd84a3c },
        { geo: BOX(2.2, 1.3, 1.6), x: 0.7, y: 1.6, color: 0xf2ede2 },
        { geo: CYL(0.05, 0.05, 4.6), x: -1.2, y: 2.6, color: 0x8a6a4a },
        { geo: BOX(0.14, 2.2, 3.4), x: -4.6, y: 1.1, color: 0x8a6a4a },
      ]);
      const boat = new THREE.Mesh(hull, vcMat);
      boat.position.set(512 + (i % 3) * 26, 0, 236 + i * 34);
      boat.rotation.y = 0.4 + i * 0.5;
      scene.add(boat);
      animated.boats.push({ mesh: boat, phase: i * 1.7, baseY: 0 });
    }
  }

  {
    const W = 700, D = 356, SX = 150, SZ = 76;
    const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const cGrass = new THREE.Color(0x55803e), cDry = new THREE.Color(0x8a9455), cRock = new THREE.Color(0x7d7268),
      cAsh = new THREE.Color(0x9d968c), cWhite = new THREE.Color(0xffffff), tmp = new THREE.Color();
    const r2 = makeRng(31);
    const speck = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) speck[i] = r2.next();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 215, z = p.getZ(i) - 178;
      const h = terrainH(x, z);
      p.setY(i, h); p.setX(i, x); p.setZ(i, z);
      const slope = Math.abs(terrainH(x + 2, z) - h) + Math.abs(terrainH(x, z + 2) - h);
      if (h > 84) tmp.copy(cAsh); else if (slope > 1.5) tmp.copy(cRock); else if (h > 34) tmp.copy(cDry); else tmp.copy(cGrass);
      if (h > 66 && h < 92 && slope < 1.1 && speck[i] > 0.86) tmp.copy(cWhite);   // edelweiss flecks
      tmp.offsetHSL(0, 0, (speck[i] - 0.5) * 0.045);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    terrain.receiveShadow = true;
    scene.add(terrain);

    const far = new THREE.Mesh(new THREE.PlaneGeometry(2400, 800), new THREE.MeshLambertMaterial({ color: 0x51683f }));
    far.rotation.x = -Math.PI / 2; far.position.set(215, -1.5, -740);
    scene.add(far);
    for (const [bx, bz, bh, br, name] of [[-90, -580, 250, 215], [215, -650, 300, 250], [520, -585, 262, 220]]) {
      const cone = new THREE.Mesh(CYL(6, br, bh, 24), new THREE.MeshLambertMaterial({ color: 0x6a7a68, flatShading: true }));
      cone.position.set(bx, bh / 2 - 4, bz);
      scene.add(cone);
      const cap = new THREE.Mesh(CYL(2, br * 0.24, bh * 0.2, 24), new THREE.MeshLambertMaterial({ color: 0xcfd4d8, flatShading: true }));
      cap.position.set(bx, bh * 0.9 - 4, bz);
      scene.add(cap);
    }

    const ribbon = (pts, width, color, lift) => {
      const samples = [];
      const total = polylinePoint(pts, 1).total;
      const n = Math.ceil(total / 3.5);
      for (let i = 0; i <= n; i++) samples.push(polylinePoint(pts, i / n));
      const verts = [], idx = [];
      samples.forEach((s, i) => {
        const nxt = samples[Math.min(i + 1, n)], prv = samples[Math.max(i - 1, 0)];
        let dx = nxt.x - prv.x, dz = nxt.z - prv.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const px = -dz, pz = dx;
        for (const side of [-1, 1]) {
          const vx = s.x + px * width * side / 2, vz = s.z + pz * width * side / 2;
          verts.push(vx, terrainH(vx, vz) + lift, vz);
        }
        if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g2.setIndex(idx); g2.computeVertexNormals();
      const mesh = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ color }));
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    ribbon(MOUNTAIN_ROAD, 7, 0x59504a, 0.14);
    ribbon(TRAIL, 1.7, 0xb59d72, 0.1);

    const pineGeo = mergeParts([
      { geo: CYL(0.14, 0.2, 1.6), y: 0.8, color: 0x6a5138 },
      { geo: CYL(0.1, 1.5, 3.4, 7), y: 3, color: 0x2e6a34 },
      { geo: CYL(0.08, 1.05, 2.6, 7), y: 4.9, color: 0x357a3a },
      { geo: CYL(0.02, 0.62, 2, 7), y: 6.5, color: 0x3f8a42 },
    ]);
    const spots = [];
    const rp = makeRng(77);
    for (let i = 0; i < 2600 && spots.length < 330; i++) {
      const x = rp.range(-110, 545), z = rp.range(-330, -12);
      const h = terrainH(x, z);
      if (h < 3 || h > 76) continue;
      const sl = Math.abs(terrainH(x + 2, z) - h) + Math.abs(terrainH(x, z + 2) - h);
      if (sl > 2.6) continue;
      let nearRoad = false;
      for (let t = 0; t <= 1.001; t += 0.05) { const rp2 = polylinePoint(MOUNTAIN_ROAD, t); if (Math.hypot(rp2.x - x, rp2.z - z) < 6.5) { nearRoad = true; break; } }
      if (nearRoad) continue;
      spots.push({ x, z, h, s: rp.range(0.8, 1.5) });
    }
    const pines = new THREE.InstancedMesh(pineGeo, vcMat, spots.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3();
    spots.forEach((s, i) => {
      E.set(0, i * 2.39, 0); Q.setFromEuler(E); V.set(s.x, s.h - 0.2, s.z); SC.set(s.s, s.s, s.s);
      M.compose(V, Q, SC); pines.setMatrixAt(i, M);
    });
    scene.add(pines);
    const rockGeo = mergeParts([{ geo: new THREE.DodecahedronGeometry(1), y: 0.4, color: 0x8a8478 }]);
    const rocks = new THREE.InstancedMesh(rockGeo, vcMat, 110);
    for (let i = 0; i < 110; i++) {
      const x = rp.range(-100, 540), z = rp.range(-320, -14), h = terrainH(x, z);
      E.set(rp.range(0, 3), rp.range(0, 3), 0); Q.setFromEuler(E); V.set(x, h, z);
      const s = rp.range(0.5, 2.4); SC.set(s, s * 0.75, s);
      M.compose(V, Q, SC); rocks.setMatrixAt(i, M);
    }
    scene.add(rocks);

    const cloudTex = canvasTexture(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,250,244,0.85)'); gr.addColorStop(1, 'rgba(255,250,244,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.55, depthWrite: false }));
      const a = i / 9 * Math.PI * 2;
      sp.position.set(215 + Math.cos(a) * 46, 88 + (i % 3) * 3.4, -228 + Math.sin(a) * 46);
      sp.scale.set(52, 17, 1);
      scene.add(sp);
      animated.clouds.push({ sp, a, r: 46 + (i % 4) * 5 });
    }

    const signTex = canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = '#4a3826'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffe9b0'; g.font = '900 44px Arial'; g.textAlign = 'center';
      g.fillText('BASECAMP BAYU', w / 2, 52);
      g.font = '700 24px Arial'; g.fillText('Kawasan Pegunungan Jawa Tengah', w / 2, 94);
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.9), new THREE.MeshLambertMaterial({ map: signTex, side: THREE.DoubleSide }));
    board.position.set(146, terrainH(146, -128) + 2.4, -128); board.rotation.y = 0.5;
    scene.add(board);
    for (const dx of [-3.4, 3.4]) {
      const post = new THREE.Mesh(CYL(0.09, 0.09, 2.6), new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
      post.position.set(146 + dx * Math.cos(0.5), terrainH(146, -128) + 1.3, -128 - dx * Math.sin(0.5));
      scene.add(post);
    }
    const tent = new THREE.Mesh(mergeParts([
      { geo: BOX(3.2, 0.14, 2.6), y: 0.07, color: 0x3a3f4a },
      { geo: BOX(3.4, 0.12, 2), y: 1.25, rz: 0.62, x: -0.75, color: 0xe8762c },
      { geo: BOX(3.4, 0.12, 2), y: 1.25, rz: -0.62, x: 0.75, color: 0xf09a4a },
    ]), vcMat);
    tent.position.set(133, terrainH(133, -142), -142); tent.rotation.y = 0.8;
    scene.add(tent);
  }

  const postTex = (label) => canvasTexture(128, 96, (g, w, h) => {
    g.fillStyle = '#5a4632'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe9b0'; g.font = '900 34px Arial'; g.textAlign = 'center'; g.fillText(label, w / 2, 44);
    g.font = '700 17px Arial'; g.fillText('GUNUNG BAYU', w / 2, 72);
  });
  [[0.3, 'POS 1'], [0.55, 'POS 2'], [0.8, 'POS 3']].forEach(([t, label]) => {
    const p = polylinePoint(TRAIL, t);
    const y = terrainH(p.x, p.z);
    const pole = new THREE.Mesh(CYL(0.06, 0.06, 1.9), new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
    pole.position.set(p.x + 1.4, y + 0.95, p.z); scene.add(pole);
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshLambertMaterial({ map: postTex(label), side: THREE.DoubleSide }));
    bd.position.set(p.x + 1.4, y + 1.9, p.z); bd.rotation.y = 0.7;
    scene.add(bd);
  });
  {
    const sy = terrainH(215, -228);
    const pole = new THREE.Mesh(CYL(0.07, 0.09, 5.6), new THREE.MeshLambertMaterial({ color: 0xb9bec6 }));
    pole.position.set(215, sy + 2.8, -228); pole.castShadow = true; scene.add(pole);
    const flagTex = canvasTexture(96, 64, (g, w, h) => {
      g.fillStyle = '#e70011'; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = '#ffffff'; g.fillRect(0, h / 2, w, h / 2);
    });
    const flagGeo = new THREE.PlaneGeometry(2.9, 1.9, 10, 5);
    flagGeo.translate(1.45, 0, 0);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide }));
    flag.position.set(215, sy + 4.6, -228);
    flag.scale.setScalar(0.001);
    scene.add(flag);
    animated.flag = flag;
    animated.flagBase = flagGeo.attributes.position.array.slice();
  }

  const beacon = new THREE.Mesh(
    CYL(2.4, 3.2, 70, 14),
    new THREE.MeshBasicMaterial({ color: 0xffc21f, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  );
  beacon.position.set(0, 35, 0); beacon.visible = false;
  scene.add(beacon);
  animated.beacon = beacon;

  animated.tick = (dt, t) => {
    seaTex.offset.y = t * 0.008; seaTex.offset.x = Math.sin(t * 0.05) * 0.02;
    for (const b of animated.boats) {
      b.mesh.position.y = b.baseY + Math.sin(t * 0.9 + b.phase) * 0.16;
      b.mesh.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
      b.mesh.rotation.x = Math.cos(t * 0.55 + b.phase) * 0.02;
    }
    for (const c of animated.clouds) {
      c.a += dt * 0.008;
      c.sp.position.x = 215 + Math.cos(c.a) * c.r;
      c.sp.position.z = -228 + Math.sin(c.a) * c.r;
    }
    if (animated.flag) {
      const target = animated.flagPlanted ? 1 : 0.001;
      const cur = animated.flag.scale.x + (target - animated.flag.scale.x) * Math.min(1, dt * 2.2);
      animated.flag.scale.setScalar(Math.max(0.001, cur));
      if (animated.flagPlanted) {
        const pos = animated.flag.geometry.attributes.position;
        const base = animated.flagBase;
        for (let i = 0; i < pos.count; i++) {
          const bx = base[i * 3];
          pos.setZ(i, Math.sin(bx * 2.4 - t * 7) * 0.13 * (bx / 2.9));
        }
        pos.needsUpdate = true;
      }
    }
    if (beacon.visible) beacon.material.opacity = 0.13 + Math.sin(t * 2.6) * 0.045;
  };

  return animated;
}
