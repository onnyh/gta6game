// Coral Bay Heat — the renderer: a golden-hour top-down city with pseudo-3D towers,
// plus the HUD, the minimap, the dialogue box and every menu screen. Everything is
// drawn with canvas paths from the game state; there are no image assets at all.
import { COLORS, WORLD_W, WORLD_H, CITY_SIZE, ROAD, BLOCK } from './config.js';
import { PITCH, WATER_Y, vRoadX, hRoadY, blockX, blockY, districtAt } from './city.js';
import { carSpec } from './vehicles.js';
import { currentObjective } from './missions.js';
import { clamp, dist } from './rng.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this.vignette = null;
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    const g = this.ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.42, this.w / 2, this.h / 2, this.h * 0.95);
    g.addColorStop(0, 'rgba(255,140,60,0)');
    g.addColorStop(1, 'rgba(80,20,50,0.28)');
    this.vignette = g;
  }

  /** The whole frame: world first, then the screen-space layers for the state. */
  draw(game) {
    const { ctx } = this;
    ctx.save();
    this.drawWorld(game);
    ctx.restore();
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (game.state === 'title') {
      this.drawTitle(game);
    } else {
      this.drawHud(game);
      if (game.state === 'pause') this.drawPause(game);
      if (game.state === 'wasted') this.drawEndScreen(game, 'WASTED', '#e33d2e', game.wastedText);
      if (game.state === 'busted') this.drawEndScreen(game, 'BUSTED', '#3d7de3', game.bustedText);
      if (game.state === 'complete') this.drawComplete(game);
    }
  }

  // ------------------------------------------------------------ the world

  drawWorld(game) {
    const { ctx } = this;
    const cam = game.camera;
    const zoom = cam.zoom;
    const shakeX = game.shakeT > 0 ? (Math.random() - 0.5) * game.shakeMag * game.shakeT * 8 : 0;
    const shakeY = game.shakeT > 0 ? (Math.random() - 0.5) * game.shakeMag * game.shakeT * 8 : 0;
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x + shakeX, -cam.y + shakeY);
    const view = {
      x0: cam.x - this.w / 2 / zoom - 80,
      y0: cam.y - this.h / 2 / zoom - 80,
      x1: cam.x + this.w / 2 / zoom + 80,
      y1: cam.y + this.h / 2 / zoom + 160,
    };
    this.drawGround(game, view);
    this.drawPickups(game, view);
    this.drawObjectiveMarker(game, view);
    for (const car of game.cars) if (this.inView(car.x, car.y, view, 90)) this.drawCar(game, car);
    for (const ped of game.peds) {
      if (ped.state === 'incar') continue;
      if (this.inView(ped.x, ped.y, view, 40)) this.drawPed(game, ped);
    }
    if (game.state !== 'title') this.drawPlayer(game);
    this.drawBullets(game);
    this.drawParticles(game);
  }

  inView(x, y, view, pad) {
    return x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;
  }

  drawGround(game, view) {
    const { ctx } = this;
    const city = game.city;
    const t = game.time;

    // Sea, sand and boardwalk along the south edge.
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(view.x0, Math.max(view.y0, WATER_Y - 40), view.x1 - view.x0, view.y1 - WATER_Y + 40);
    ctx.fillStyle = COLORS.seaDeep;
    for (let i = 0; i < 5; i++) {
      const y = WATER_Y + 60 + i * 74 + Math.sin(t * 0.7 + i * 2.1) * 6;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(view.x0, y, view.x1 - view.x0, 10);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    for (let i = 0; i < 26; i++) {
      const x = ((i * 613 + Math.sin(t * 0.9 + i) * 22 + t * 14) % (WORLD_W + 200)) - 100;
      const y = WATER_Y + 26 + ((i * 197) % 330);
      if (x > view.x0 && x < view.x1) ctx.fillRect(x, y, 44, 3);
    }
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, CITY_SIZE, WORLD_W, WATER_Y - CITY_SIZE);
    ctx.fillStyle = COLORS.boardwalk;
    ctx.fillRect(0, CITY_SIZE, WORLD_W, 34);
    ctx.fillStyle = 'rgba(90,60,30,0.35)';
    for (let x = 0; x < WORLD_W; x += 46) ctx.fillRect(x, CITY_SIZE, 3, 34);

    // City base, then each block's ground.
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(0, 0, CITY_SIZE, CITY_SIZE);
    for (const g of city.grounds) {
      const bx = blockX(g.c);
      const by = blockY(g.r);
      if (!this.inView(bx + BLOCK / 2, by + BLOCK / 2, view, BLOCK)) continue;
      if (g.kind === 'park') {
        ctx.fillStyle = COLORS.park;
        ctx.fillRect(bx, by, BLOCK, BLOCK);
        ctx.fillStyle = COLORS.plaza;
        ctx.fillRect(bx, by + BLOCK / 2 - 9, BLOCK, 18);
        ctx.fillRect(bx + BLOCK / 2 - 9, by, 18, BLOCK);
      } else if (g.kind === 'lot') {
        ctx.fillStyle = '#4a4d54';
        ctx.fillRect(bx, by, BLOCK, BLOCK);
        ctx.strokeStyle = 'rgba(240,240,230,0.5)';
        ctx.lineWidth = 2;
        for (const spot of city.parkingSpots) {
          if (!spot.lot) continue;
          if (spot.x > bx && spot.x < bx + BLOCK && spot.y > by && spot.y < by + BLOCK) {
            ctx.strokeRect(spot.x - 15, spot.y - 24, 30, 48);
          }
        }
      } else if (g.kind === 'plaza') {
        ctx.fillStyle = COLORS.plaza;
        ctx.fillRect(bx, by, BLOCK, BLOCK);
      } else {
        ctx.fillStyle = (g.c + g.r) % 2 ? '#c6bba2' : '#cdc1a8';
        ctx.fillRect(bx, by, BLOCK, BLOCK);
      }
    }

    // Roads with edge lines and dashed centres.
    ctx.fillStyle = COLORS.road;
    for (let i = 0; i <= 7; i++) {
      ctx.fillRect(vRoadX(i), 0, ROAD, CITY_SIZE);
      ctx.fillRect(0, hRoadY(i), CITY_SIZE, ROAD);
    }
    ctx.fillStyle = COLORS.roadEdge;
    for (let i = 0; i <= 7; i++) {
      ctx.fillRect(vRoadX(i), 0, 3, CITY_SIZE);
      ctx.fillRect(vRoadX(i) + ROAD - 3, 0, 3, CITY_SIZE);
      ctx.fillRect(0, hRoadY(i), CITY_SIZE, 3);
      ctx.fillRect(0, hRoadY(i) + ROAD - 3, CITY_SIZE, 3);
    }
    ctx.fillStyle = COLORS.roadLine;
    for (let i = 0; i <= 7; i++) {
      for (let y = 8; y < CITY_SIZE; y += 44) {
        if (y % PITCH > ROAD - 20 && y % PITCH < PITCH - ROAD) continue;
        ctx.fillRect(vRoadX(i) + ROAD / 2 - 2, y, 4, 24);
      }
      for (let x = 8; x < CITY_SIZE; x += 44) {
        if (x % PITCH > ROAD - 20 && x % PITCH < PITCH - ROAD) continue;
        ctx.fillRect(x, hRoadY(i) + ROAD / 2 - 2, 24, 4);
      }
    }

    // Props under the buildings' shade.
    for (const prop of city.props) {
      if (!this.inView(prop.x, prop.y, view, 60)) continue;
      this.drawProp(game, prop);
    }
    // Buildings, shortest first so taller neighbours overlap naturally.
    const sorted = [...city.buildings].sort((a, b) => a.height - b.height);
    for (const b of sorted) {
      if (!this.inView(b.x + b.w / 2, b.y + b.h / 2, view, Math.max(b.w, b.h) + b.height)) continue;
      this.drawBuilding(game, b);
    }
    // Landmark name pills float over their buildings.
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const key of Object.keys(city.landmarks)) {
      const lm = city.landmarks[key];
      if (!lm.building) continue;
      const b = lm.building;
      const x = b.x + b.w / 2;
      const y = b.y - b.height * 0.30 - 14;
      if (!this.inView(x, y, view, 120)) continue;
      const w = ctx.measureText(lm.name.toUpperCase()).width + 16;
      ctx.fillStyle = 'rgba(20,16,24,0.72)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 10, w, 17, 8);
      ctx.fill();
      ctx.fillStyle = '#ffd98a';
      ctx.fillText(lm.name.toUpperCase(), x, y + 3);
    }
  }

  drawProp(game, prop) {
    const { ctx } = this;
    const { x, y } = prop;
    if (prop.kind === 'palm') {
      const s = prop.s || 1;
      ctx.strokeStyle = 'rgba(46,26,40,0.25)';
      ctx.lineWidth = 7 * s;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 10);
      ctx.lineTo(x + 3, y + 2);
      ctx.stroke();
      ctx.strokeStyle = '#8a6f4d';
      ctx.lineWidth = 4.5 * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 3, y - 9 * s, x + 7, y - 13 * s);
      ctx.stroke();
      ctx.strokeStyle = '#3f9e4d';
      ctx.lineWidth = 3.4 * s;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.5;
        ctx.beginPath();
        ctx.moveTo(x + 7, y - 13 * s);
        ctx.quadraticCurveTo(
          x + 7 + Math.cos(a) * 13 * s, y - 13 * s + Math.sin(a) * 8 * s - 4,
          x + 7 + Math.cos(a) * 21 * s, y - 13 * s + Math.sin(a) * 13 * s + 5 * s,
        );
        ctx.stroke();
      }
    } else if (prop.kind === 'lamp') {
      ctx.fillStyle = '#3a3f47';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.fill();
      const glow = 0.5 + Math.sin(game.time * 2 + x) * 0.08;
      const grad = this.ctx.createRadialGradient(x, y, 1, x, y, 17);
      grad.addColorStop(0, `rgba(255,190,90,${glow})`);
      grad.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, TAU);
      ctx.fill();
    } else if (prop.kind === 'bench') {
      ctx.fillStyle = '#7a5a38';
      ctx.fillRect(x - 11, y - 4, 22, 8);
      ctx.fillStyle = '#966f45';
      ctx.fillRect(x - 11, y - 4, 22, 3);
    } else if (prop.kind === 'crate') {
      const s = (prop.s || 1) * 15;
      ctx.fillStyle = '#9a743f';
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = '#6e5227';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      ctx.beginPath();
      ctx.moveTo(x - s / 2, y - s / 2);
      ctx.lineTo(x + s / 2, y + s / 2);
      ctx.stroke();
    } else if (prop.kind === 'umbrella') {
      ctx.fillStyle = '#e2574c';
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f2f0e6';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.fill();
    } else if (prop.kind === 'hydrant') {
      ctx.fillStyle = '#d23b2e';
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, TAU);
      ctx.fill();
    }
  }

  drawBuilding(game, b) {
    const { ctx } = this;
    const liftX = -b.height * 0.16;
    const liftY = -b.height * 0.30;
    // Ground shadow, then the south and east faces, then the roof.
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(b.x + 12, b.y + 16, b.w, b.h);
    ctx.fillStyle = shade(b.wall, 0.62);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + liftX, b.y + b.h + liftY);
    ctx.lineTo(b.x + b.w + liftX, b.y + b.h + liftY);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(b.wall, 0.8);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w + liftX, b.y + liftY);
    ctx.lineTo(b.x + b.w + liftX, b.y + b.h + liftY);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    // Lit windows on the south face of taller blocks.
    if (b.height > 44) {
      const rows = Math.floor(b.height / 17);
      const cols = Math.max(2, Math.floor(b.w / 17));
      ctx.fillStyle = 'rgba(255,214,130,0.85)';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seed = Math.sin((b.x + c * 31) * (b.y + r * 47)) * 43758.5453;
          if (seed - Math.floor(seed) < 0.42) continue;
          const wx = b.x + 8 + c * ((b.w - 14) / cols) + liftX * (r / rows);
          const wy = b.y + b.h - 6 - r * 13 + liftY * (r / rows);
          ctx.fillRect(wx, wy, 6.5, 4.5);
        }
      }
    }
    ctx.fillStyle = shade(b.wall, 1.12);
    ctx.fillRect(b.x + liftX, b.y + liftY, b.w, b.h);
    ctx.strokeStyle = 'rgba(40,24,30,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + liftX, b.y + liftY, b.w, b.h);
    // Roof furniture: a rim, an air-con box, sometimes a water tank.
    ctx.strokeStyle = 'rgba(40,24,30,0.22)';
    ctx.lineWidth = 5;
    ctx.strokeRect(b.x + liftX + 6, b.y + liftY + 6, b.w - 12, b.h - 12);
    const seed = Math.sin(b.x * 12.9898 + b.y * 78.233) * 43758.5453;
    const frac = seed - Math.floor(seed);
    ctx.fillStyle = shade(b.wall, 0.9);
    ctx.fillRect(b.x + liftX + b.w * 0.18, b.y + liftY + b.h * 0.16, b.w * 0.2, b.h * 0.18);
    if (frac > 0.55 && b.w > 90) {
      ctx.fillStyle = '#8a5a3b';
      ctx.beginPath();
      ctx.arc(b.x + liftX + b.w * 0.72, b.y + liftY + b.h * 0.3, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#a06a42';
      ctx.beginPath();
      ctx.arc(b.x + liftX + b.w * 0.72, b.y + liftY + b.h * 0.3 - 3, 9, 0, TAU);
      ctx.fill();
    }
    if (b.kind === 'landmark') {
      ctx.fillStyle = COLORS.neonPink;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(b.x + liftX + 8, b.y + liftY + 8, Math.min(54, b.w - 16), 5);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------ entities

  drawCar(game, car) {
    const { ctx } = this;
    const spec = carSpec(car);
    ctx.save();
    ctx.translate(car.x, car.y);
    // Soft shadow, then the body turned to the car's heading.
    ctx.fillStyle = 'rgba(30,18,26,0.35)';
    ctx.beginPath();
    ctx.ellipse(5, 7, spec.w * 0.52, spec.h * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(car.angle);
    const w = spec.w;
    const h = spec.h;
    // Wheels (the front pair turns with the steering).
    ctx.fillStyle = '#17181c';
    const wy = h / 2 - 1;
    for (const [wx, front] of [[w * 0.30, true], [-w * 0.30, false]]) {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(wx, side * wy);
        if (front) ctx.rotate(car.steerVis);
        ctx.fillRect(-6, -2.6, 12, 5.2);
        ctx.restore();
      }
    }
    // Body.
    ctx.fillStyle = car.wrecked ? shade(car.paint, 0.45) : car.paint;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 3, -h / 2 + 2, w - 6, h * 0.32, 5);
    ctx.fill();
    // Cabin and glass.
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.roundRect(-w * 0.16, -h * 0.36, w * 0.34, h * 0.72, 4);
    ctx.fill();
    ctx.fillStyle = '#7fd4e8';
    ctx.fillRect(w * 0.13, -h * 0.33, w * 0.07, h * 0.66);
    ctx.fillRect(-w * 0.24, -h * 0.33, w * 0.06, h * 0.66);
    // An occupied car shows its driver's silhouette.
    if (car.driver || car.kind === 'traffic' || car.kind === 'police') {
      ctx.fillStyle = '#10151c';
      ctx.beginPath();
      ctx.arc(-w * 0.02, 0, 4.6, 0, TAU);
      ctx.fill();
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#ffd83d';
      ctx.fillRect(-5, -4, 10, 8);
      ctx.fillStyle = '#17181c';
      ctx.fillRect(-w / 2, h * 0.18, w, 3);
    }
    if (car.type === 'police') {
      ctx.fillStyle = '#17181c';
      ctx.fillRect(-w * 0.30, -h / 2, w * 0.16, h);
      ctx.fillRect(w * 0.24, -h / 2, w * 0.10, h);
      // Light bar: red and blue strobing in turn.
      const phase = Math.sin(game.time * 11 + car.sirenPhase) > 0;
      ctx.fillStyle = phase ? '#ff4040' : '#7a1616';
      ctx.fillRect(-7, -h * 0.30, 6, h * 0.28);
      ctx.fillStyle = phase ? '#2e2e7a' : '#4d7dff';
      ctx.fillRect(1, -h * 0.30, 6, h * 0.28);
      ctx.fillStyle = '#274156';
      ctx.font = '700 7px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CBPD', 0, h * 0.42);
    }
    if (car.kind === 'mission') {
      ctx.strokeStyle = '#ffd83d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 8);
      ctx.stroke();
    }
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(w / 2 - 2, -h * 0.32, 3, 4);
    ctx.fillRect(w / 2 - 2, h * 0.32 - 4, 3, 4);
    ctx.restore();
    // Damage smoke column (particles do the rest; a grey core sells it).
    if (car.hp < car.maxHp * 0.4 && !car.wrecked) {
      ctx.fillStyle = 'rgba(60,60,66,0.35)';
      ctx.beginPath();
      ctx.arc(car.x + 8, car.y - 6, 7 + Math.sin(game.time * 7 + car.id) * 2, 0, TAU);
      ctx.fill();
    }
  }

  drawPed(game, ped) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      const fade = clamp(1 - Math.max(0, ped.downT - 5) / 2, 0, 1);
      ctx.globalAlpha = fade;
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(30,18,26,0.3)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 15, 6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = ped.shirt;
      ctx.fillRect(-11, -4.6, 17, 9.2);
      ctx.fillStyle = ped.pants;
      ctx.fillRect(6, -4.2, 10, 8.4);
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(-15, 0, 4.6, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    const swing = Math.sin(ped.walkPhase || 0) * (ped.speed > 4 ? 5 : 0);
    ctx.fillStyle = 'rgba(30,18,26,0.30)';
    ctx.beginPath();
    ctx.ellipse(1.5, 3, 8.5, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(ped.angle);
    // Legs, torso, head.
    ctx.strokeStyle = ped.pants;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 + swing * 0.4, -4.4);
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 - swing * 0.4, 4.4);
    ctx.stroke();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.roundRect(-5.5, -5.5, 11, 11, 4);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(1.5, 0, 4.3, 0, TAU);
    ctx.fill();
    if (ped.kind === 'officer') {
      ctx.fillStyle = '#1d2733';
      ctx.beginPath();
      ctx.arc(1.5, 0, 4.5, Math.PI * 0.6, Math.PI * 1.9);
      ctx.fill();
    }
    ctx.restore();
    if (ped.name) {
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(20,16,24,0.65)';
      const label = ped.name.toUpperCase();
      const w = ctx.measureText(label).width + 10;
      ctx.beginPath();
      ctx.roundRect(ped.x - w / 2, ped.y - 30, w, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#ffd98a';
      ctx.fillText(label, ped.x, ped.y - 19.5);
    }
  }

  drawPlayer(game) {
    const { ctx } = this;
    const p = game.player;
    if (p.car) return; // Dani is the car while driving
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(255,216,61,0.20)';
    ctx.beginPath();
    ctx.arc(0, 0, 17 + Math.sin(game.time * 4) * 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,18,26,0.32)';
    ctx.beginPath();
    ctx.ellipse(1.5, 3, 8.5, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(p.faceAngle);
    const swing = Math.sin(p.walkPhase || 0) * (p.speedNow > 4 ? 5 : 0);
    ctx.strokeStyle = '#26303a';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 + swing * 0.4, -4.6);
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 - swing * 0.4, 4.6);
    ctx.stroke();
    ctx.fillStyle = '#ff6b4a';
    ctx.beginPath();
    ctx.roundRect(-5.8, -5.8, 11.6, 11.6, 4);
    ctx.fill();
    // The striking arm, mid-punch.
    if (p.punchAnimT > 0) {
      ctx.strokeStyle = '#f2c79b';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(4, -3);
      ctx.lineTo(15, -4);
      ctx.stroke();
    }
    if (p.weapon === 'pistol') {
      ctx.fillStyle = '#17181c';
      ctx.fillRect(6, 2.4, 10, 3.4);
    }
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath();
    ctx.arc(1.5, 0, 4.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.arc(0.8, 0, 4.4, Math.PI * 0.55, Math.PI * 1.95);
    ctx.fill();
    ctx.restore();
  }

  drawBullets(game) {
    const { ctx } = this;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (const b of game.bullets) {
      ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  drawParticles(game) {
    const { ctx } = this;
    for (const pt of game.particles) {
      const a = clamp(pt.life / pt.max, 0, 1);
      ctx.globalAlpha = pt.smoke ? a * 0.4 : a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (pt.smoke ? 1 + (1 - a) * 1.6 : 1), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawPickups(game, view) {
    const { ctx } = this;
    for (const pk of game.pickups) {
      if (pk.taken || !this.inView(pk.x, pk.y, view, 40)) continue;
      const bob = Math.sin(game.time * 3 + pk.x) * 2.4;
      if (pk.kind === 'stash') {
        ctx.strokeStyle = `rgba(255,216,61,${0.5 + Math.sin(game.time * 4 + pk.x) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, 15, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#6e4f27';
        ctx.fillRect(pk.x - 8, pk.y - 6 + bob, 16, 11);
        ctx.fillStyle = '#ffd83d';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', pk.x, pk.y + 3.5 + bob);
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#f4f4f0';
        ctx.beginPath();
        ctx.roundRect(pk.x - 9, pk.y - 9 + bob, 18, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#d23b2e';
        ctx.fillRect(pk.x - 2.4, pk.y - 6 + bob, 4.8, 12);
        ctx.fillRect(pk.x - 6, pk.y - 2.4 + bob, 12, 4.8);
      }
    }
  }

  drawObjectiveMarker(game) {
    const obj = currentObjective(game);
    if (!obj || game.state === 'title') return;
    const { ctx } = this;
    const pulse = 1 + Math.sin(game.time * 5) * 0.12;
    const grad = ctx.createLinearGradient(0, obj.y - 170, 0, obj.y);
    grad.addColorStop(0, 'rgba(255,216,61,0)');
    grad.addColorStop(1, 'rgba(255,216,61,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(obj.x - 11, obj.y - 170, 22, 170);
    ctx.strokeStyle = '#ffd83d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 19 * pulse, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#ffd83d';
    const bob = Math.sin(game.time * 5) * 4;
    ctx.beginPath();
    ctx.moveTo(obj.x - 8, obj.y - 44 + bob);
    ctx.lineTo(obj.x + 8, obj.y - 44 + bob);
    ctx.lineTo(obj.x, obj.y - 32 + bob);
    ctx.closePath();
    ctx.fill();
  }

  // ------------------------------------------------------------ HUD

  drawHud(game) {
    const { ctx } = this;
    const p = game.player;
    if (game.state !== 'title') this.drawMinimap(game);

    // Money and wanted stars, top right.
    ctx.textAlign = 'right';
    ctx.font = '800 27px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(16,20,16,0.55)';
    const money = `$${p.money.toLocaleString()}`;
    ctx.fillText(money, this.w - 21, 41);
    ctx.fillStyle = '#7ee787';
    ctx.fillText(money, this.w - 23, 39);
    this.drawStars(game, this.w - 24, 58);

    // District under the minimap.
    ctx.textAlign = 'left';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,244,214,0.9)';
    ctx.fillText(districtAt(p.x, p.y).toUpperCase(), 16, 224);
    if (game.mission.phase === 'done') {
      ctx.fillStyle = '#ffd83d';
      ctx.fillText('STORY COMPLETE — FREE ROAM', 16, 242);
    }

    // Objective panel, top centre.
    const obj = currentObjective(game);
    if (obj && game.state === 'play') {
      const d = Math.max(0, Math.round(dist(p.x, p.y, obj.x, obj.y) * 0.09));
      const label = obj.label;
      ctx.font = '600 14.5px system-ui, sans-serif';
      const wText = ctx.measureText(label).width;
      const w = Math.min(this.w - 320, Math.max(250, wText + 92));
      const x = (this.w - w) / 2;
      ctx.fillStyle = 'rgba(14,12,20,0.62)';
      ctx.beginPath();
      ctx.roundRect(x, 14, w, 46, 10);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '700 10.5px system-ui, sans-serif';
      ctx.fillStyle = '#ffd83d';
      ctx.fillText((obj.sub || 'OBJECTIVE').toUpperCase(), x + 14, 31);
      ctx.font = '600 14.5px system-ui, sans-serif';
      ctx.fillStyle = '#fdf6e3';
      ctx.fillText(label, x + 14, 51);
      ctx.textAlign = 'right';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.fillStyle = '#ffd83d';
      ctx.fillText(`${d}m`, x + w - 12, 44);
    }

    // Toasts under the objective panel.
    let ty = 78;
    for (const toast of game.toasts) {
      const a = clamp(Math.min(toast.t / 0.3, (toast.max - toast.t) / 0.5), 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(toast.text).width + 30;
      ctx.fillStyle = 'rgba(14,12,20,0.66)';
      ctx.beginPath();
      ctx.roundRect((this.w - w) / 2, ty, w, 30, 9);
      ctx.fill();
      ctx.fillStyle = '#ffd98a';
      ctx.fillText(toast.text, this.w / 2, ty + 20);
      ctx.globalAlpha = 1;
      ty += 38;
    }

    // Bottom right: weapon and health (and the car, when driving).
    const bx = this.w - 246;
    const by = this.h - 86;
    ctx.fillStyle = 'rgba(14,12,20,0.55)';
    ctx.beginPath();
    ctx.roundRect(bx - 10, by - 34, 240, 108, 10);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = '#fdf6e3';
    if (p.car) {
      const spec = carSpec(p.car);
      ctx.fillText(spec.name.toUpperCase(), bx, by - 16);
      ctx.textAlign = 'right';
      ctx.font = '800 24px system-ui, sans-serif';
      ctx.fillStyle = '#ffd83d';
      ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.16)}`, this.w - 44, by - 12);
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText('MPH', this.w - 18, by - 12);
      ctx.textAlign = 'left';
      this.bar(bx, by + 2, 216, 9, p.car.hp / p.car.maxHp, '#e0a51f');
    } else {
      ctx.fillText(p.weapon === 'pistol' ? 'PISTOL — CLICK TO FIRE' : 'FISTS', bx, by - 16);
      if (p.hasPistol) {
        ctx.fillStyle = 'rgba(253,246,227,0.55)';
        ctx.fillText('1 / 2 — SWITCH WEAPON', bx, by - 2);
      }
    }
    ctx.fillStyle = '#fdf6e3';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText('HEALTH', bx, by + 30);
    this.bar(bx, by + 36, 216, 13, p.hp / 100, p.hp > 30 ? '#57c84c' : '#e33d2e');

    // The bust meter, centre screen, while an officer has hold of Dani.
    if ((game.bustT || 0) > 0 && game.state === 'play') {
      ctx.textAlign = 'center';
      ctx.font = '800 17px system-ui, sans-serif';
      ctx.fillStyle = '#7db4ff';
      ctx.fillText('THE OFFICER IS MAKING THE ARREST — MOVE!', this.w / 2, this.h * 0.36);
      this.bar(this.w / 2 - 110, this.h * 0.36 + 12, 220, 10, game.bustT / 1.25, '#3d7de3');
    }

    // Dialogue box.
    const dlg = game.mission.dialogue;
    if (dlg) {
      const lines = wrapText(ctx, dlg.lines[dlg.index], this.w - 220, '16px system-ui, sans-serif');
      const boxH = 66 + lines.length * 21;
      const y = this.h - boxH - 18;
      ctx.fillStyle = 'rgba(12,10,18,0.82)';
      ctx.beginPath();
      ctx.roundRect(40, y, this.w - 80, boxH, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,216,61,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(40, y, this.w - 80, boxH, 12);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.fillStyle = '#ffd83d';
      ctx.fillText(dlg.speaker.toUpperCase(), 62, y + 26);
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = '#fdf6e3';
      lines.forEach((line, i) => ctx.fillText(line, 62, y + 52 + i * 21));
      if (Math.sin(game.time * 5) > -0.2) {
        ctx.textAlign = 'right';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.fillStyle = '#ffd83d';
        ctx.fillText('E ▸', this.w - 62, y + boxH - 14);
      }
    }

    // First-seconds control hints.
    if (game.state === 'play' && game.playT < 16 && !dlg) {
      ctx.textAlign = 'center';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(253,246,227,0.85)';
      const hint = p.car
        ? 'WASD drive · F get out · handbrake SPACE · P pause'
        : 'WASD move · SHIFT run · F enter car · SPACE punch · mouse aim, click to shoot · P pause';
      ctx.fillText(hint, this.w / 2, this.h - 14);
    }

    // Damage flash.
    if (p.hurtT > 0) {
      ctx.fillStyle = `rgba(200,30,20,${(p.hurtT / 0.35) * 0.22})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  bar(x, y, w, h, frac, color) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color;
    if (frac > 0.01) {
      ctx.beginPath();
      ctx.roundRect(x, y, w * clamp(frac, 0, 1), h, h / 2);
      ctx.fill();
    }
  }

  drawStars(game, rightX, y) {
    const { ctx } = this;
    const w = game.wanted;
    const blinkOff = !w.seen && w.heat > 0 && Math.sin(game.time * 6) > 0.2;
    for (let i = 0; i < 5; i++) {
      const cx = rightX - (4 - i) * 26 - 10;
      const active = i < w.stars;
      ctx.save();
      ctx.globalAlpha = active && blinkOff ? 0.35 : 1;
      starPath(ctx, cx, y + 10, 10);
      ctx.fillStyle = active ? '#ffd83d' : 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.restore();
    }
  }

  drawMinimap(game) {
    const { ctx } = this;
    const mw = 148;
    const mh = 190;
    const x0 = 14;
    const y0 = 14;
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, mw, mh, 10);
    ctx.clip();
    ctx.fillStyle = '#1d2b33';
    ctx.fillRect(x0, y0, mw, mh);
    ctx.fillStyle = '#2a7f8c';
    ctx.fillRect(x0, y0 + WATER_Y * sy, mw, mh - WATER_Y * sy);
    ctx.fillStyle = '#d9bd85';
    ctx.fillRect(x0, y0 + CITY_SIZE * sy, mw, (WATER_Y - CITY_SIZE) * sy);
    ctx.fillStyle = '#39424c';
    ctx.fillRect(x0, y0, CITY_SIZE * sx, CITY_SIZE * sy);
    ctx.strokeStyle = '#5f6b78';
    ctx.lineWidth = 1.6;
    for (let i = 0; i <= 7; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + (i * PITCH + ROAD / 2) * sx, y0);
      ctx.lineTo(x0 + (i * PITCH + ROAD / 2) * sx, y0 + CITY_SIZE * sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0 + (i * PITCH + ROAD / 2) * sy);
      ctx.lineTo(x0 + CITY_SIZE * sx, y0 + (i * PITCH + ROAD / 2) * sy);
      ctx.stroke();
    }
    const dot = (x, y, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * sx, y0 + y * sy, r, 0, TAU);
      ctx.fill();
    };
    for (const pk of game.pickups) {
      if (pk.taken) continue;
      if (pk.kind === 'stash') dot(pk.x, pk.y, '#ffd83d', 2.6);
    }
    if (game.wanted.stars > 0) {
      for (const car of game.cars) if (car.kind === 'police' && !car.wrecked) dot(car.x, car.y, '#4d9fff', 3);
    }
    for (const ped of game.peds) if (ped.kind === 'passenger') dot(ped.x, ped.y, '#ffb340', 3);
    const obj = currentObjective(game);
    if (obj) {
      const ox = x0 + obj.x * sx;
      const oy = y0 + obj.y * sy;
      ctx.strokeStyle = '#ffd83d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, 5 + Math.sin(game.time * 5) * 1.4, 0, TAU);
      ctx.stroke();
      dot(obj.x, obj.y, '#ffd83d', 2.6);
    }
    // The player arrow.
    const p = game.player;
    const px = x0 + p.x * sx;
    const py = y0 + p.y * sy;
    const ang = p.car ? p.car.angle : p.faceAngle;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(-4.5, -4);
    ctx.lineTo(-4.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,216,61,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x0, y0, mw, mh, 10);
    ctx.stroke();
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(253,246,227,0.85)';
    ctx.fillText('N', x0 + mw - 7, y0 + 14);
  }

  // ------------------------------------------------------------ screens

  drawTitle(game) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, 'rgba(24,8,36,0.18)');
    grad.addColorStop(0.55, 'rgba(24,8,36,0.05)');
    grad.addColorStop(1, 'rgba(16,6,22,0.82)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.textAlign = 'center';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillStyle = '#ffd98a';
    ctx.fillText('C O R A L   B A Y', this.w / 2, this.h * 0.30);
    ctx.save();
    ctx.shadowColor = '#ff5d8f';
    ctx.shadowBlur = 34;
    ctx.font = '900 92px system-ui, sans-serif';
    ctx.fillStyle = '#ff5d8f';
    ctx.fillText('HEAT', this.w / 2, this.h * 0.30 + 84);
    ctx.restore();
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = '#fdf6e3';
    ctx.fillText('An open-world crime story — steal cars, run jobs, outrun the CBPD.', this.w / 2, this.h * 0.30 + 122);

    if (game.titleShowHelp) {
      this.drawHelpPanel(game);
      return;
    }
    const items = game.titleItems;
    ctx.font = '700 21px system-ui, sans-serif';
    items.forEach((item, i) => {
      const y = this.h * 0.58 + i * 38;
      const selected = i === game.titleSel;
      ctx.fillStyle = selected ? '#ffd83d' : 'rgba(253,246,227,0.82)';
      ctx.fillText(`${selected ? '▸ ' : ''}${item.label}${selected ? ' ◂' : ''}`, this.w / 2, y);
    });
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(253,246,227,0.75)';
    ctx.fillText('WASD / arrows to choose · ENTER to select · M sound on/off', this.w / 2, this.h - 40);
    ctx.fillText('A complete little city: traffic, pedestrians, police, missions, a wanted system and a save game.', this.w / 2, this.h - 18);
  }

  drawHelpPanel(game) {
    const { ctx } = this;
    const w = Math.min(680, this.w - 80);
    const h = 400;
    const x = (this.w - w) / 2;
    const y = (this.h - h) / 2;
    ctx.fillStyle = 'rgba(12,10,18,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,216,61,0.55)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffd83d';
    ctx.fillText('HOW TO PLAY', this.w / 2, y + 40);
    ctx.textAlign = 'left';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#fdf6e3';
    const lines = [
      'WASD / arrows — move and drive        SHIFT — run',
      'F — enter / exit a car (steal it)      SPACE — punch, or handbrake in a car',
      'Mouse — aim · click — shoot (with the pistol)   1 / 2 — fists / pistol',
      'E — talk, advance dialogue             P or ESC — pause · M — sound',
      '',
      'Work Rosa\u2019s jobs from the gold marker at her garage. Crimes raise your',
      'wanted stars; more stars mean more CBPD cruisers and armed officers.',
      'Lose sight of them and hide — the heat cools and the stars fall.',
      'Find the 10 hidden cash stashes. Hearts restore health. Your money,',
      'story progress and position save automatically.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, x + 36, y + 84 + i * 25));
    ctx.textAlign = 'center';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillStyle = '#ffd83d';
    ctx.fillText('ENTER — back', this.w / 2, y + h - 24);
  }

  drawPause(game) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(10,8,16,0.62)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.textAlign = 'center';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.fillStyle = '#fdf6e3';
    ctx.fillText('PAUSED', this.w / 2, this.h * 0.34);
    ctx.font = '700 20px system-ui, sans-serif';
    game.pauseItems.forEach((item, i) => {
      const y = this.h * 0.46 + i * 36;
      const selected = i === game.pauseSel;
      ctx.fillStyle = selected ? '#ffd83d' : 'rgba(253,246,227,0.85)';
      ctx.fillText(`${selected ? '▸ ' : ''}${item.label}${selected ? ' ◂' : ''}`, this.w / 2, y);
    });
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(253,246,227,0.7)';
    ctx.fillText(`$${game.player.money.toLocaleString()} · ${game.stashesFound}/10 stashes · mission ${Math.min(game.mission.index + 1, 4)} of 4`, this.w / 2, this.h * 0.46 + game.pauseItems.length * 36 + 22);
  }

  drawEndScreen(game, word, color, text) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(12,6,10,0.66)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.font = '900 84px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(word.split('').join(' '), this.w / 2, this.h * 0.44);
    ctx.restore();
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillStyle = '#fdf6e3';
    wrapText(ctx, text || '', 620, '600 17px system-ui, sans-serif').forEach((line, i) => {
      ctx.fillText(line, this.w / 2, this.h * 0.44 + 44 + i * 24);
    });
    if (Math.sin(game.time * 4) > -0.3) {
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillStyle = '#ffd83d';
      ctx.fillText('PRESS ENTER', this.w / 2, this.h * 0.44 + 118);
    }
  }

  drawComplete(game) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(14,10,4,0.6)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.textAlign = 'center';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillStyle = '#ffd98a';
    ctx.fillText('C O R A L   B A Y', this.w / 2, this.h * 0.36);
    ctx.save();
    ctx.shadowColor = '#ffb340';
    ctx.shadowBlur = 28;
    ctx.font = '900 56px system-ui, sans-serif';
    ctx.fillStyle = '#ffb340';
    ctx.fillText('STORY COMPLETE', this.w / 2, this.h * 0.36 + 58);
    ctx.restore();
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillStyle = '#fdf6e3';
    ctx.fillText(`Dani walks away with $${game.player.money.toLocaleString()} and ${game.stashesFound} of 10 stashes found.`, this.w / 2, this.h * 0.36 + 100);
    ctx.fillText('The city is yours now — the garage, the beach, and every car in it.', this.w / 2, this.h * 0.36 + 126);
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffd83d';
    ctx.fillText('PRESS ENTER TO KEEP ROAMING', this.w / 2, this.h * 0.36 + 168);
  }
}

/** Multiply a #rrggbb colour by f (below 1 darkens, above lightens). */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Wrap a string to lines of at most maxWidth in the given font. */
export function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}
