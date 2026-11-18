// Coral Bay Heat — combat: fists, a pistol, flying bullets, and the physics of
// cars meeting cars and cars meeting people. The player punches with a short arc,
// shoots toward the mouse, and everything that gets hurt reacts — pedestrians
// fall or flee, cars dent and smoke, and witnesses feed the wanted system.
import { carRadius, damageCar } from './vehicles.js';
import { buildingsNear } from './city.js';
import { scarePeds } from './traffic.js';
import { reportCrime } from './police.js';
import { dist } from './rng.js';

export function spawnBullet(game, x, y, angle, speed, from, dmg) {
  game.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.55,
    from,
    dmg,
  });
}

function pointInBuilding(game, x, y) {
  for (const b of buildingsNear(game.city, x, y)) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

/** Move every bullet and settle what it hits. */
export function updateBullets(game, dt) {
  const p = game.player;
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && pointInBuilding(game, b.x, b.y)) {
      game.spawnSparks?.(b.x, b.y, 3, '#ffd98a');
      dead = true;
    }
    if (!dead && b.from === 'player') {
      for (const ped of game.peds) {
        if (ped.state === 'down' || ped.state === 'incar') continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 12) {
          hurtPed(game, ped, b.dmg, b.x, b.y);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const car of game.cars) {
          if (dist(b.x, b.y, car.x, car.y) < carRadius(car)) {
            damageCar(game, car, b.dmg * 0.5, b.x, b.y);
            if (car.kind === 'police') reportCrime(game, 'copHit', car.x, car.y);
            dead = true;
            break;
          }
        }
      }
    } else if (!dead && b.from === 'cop') {
      if (p.car) {
        if (dist(b.x, b.y, p.car.x, p.car.y) < carRadius(p.car)) {
          damageCar(game, p.car, b.dmg * 0.6, b.x, b.y);
          dead = true;
        }
      } else if (dist(b.x, b.y, p.x, p.y) < 12) {
        hurtPlayer(game, b.dmg, b.x, b.y);
        dead = true;
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }
}

/** Hurt a pedestrian: they fall, flee, or — at zero health — stay down. */
export function hurtPed(game, ped, dmg, fromX, fromY) {
  ped.hp -= dmg;
  game.spawnSparks?.(ped.x, ped.y, 5, '#e8e4da');
  if (ped.hp <= 0) {
    if (ped.state !== 'down') {
      ped.state = 'down';
      ped.downT = 0;
      ped.speed = 0;
      if (ped.kind === 'civilian') reportCrime(game, 'killPed', ped.x, ped.y);
      if (ped.kind === 'officer') reportCrime(game, 'copHit', ped.x, ped.y);
      scarePeds(game, ped.x, ped.y, 220);
    }
  } else {
    ped.panic = 2.4;
    ped.threatX = fromX;
    ped.threatY = fromY;
  }
}

/** Hurt the player; at zero health the wasted sequence begins. */
export function hurtPlayer(game, dmg, fromX, fromY) {
  const p = game.player;
  if (game.state !== 'play') return;
  p.hp -= dmg;
  p.hurtT = 0.35;
  p.regenT = 0;
  game.addShake?.(2.5);
  if (p.hp <= 0) {
    p.hp = 0;
    game.onWasted?.();
  }
}

/** The player's punch: a short arc in the facing direction. */
export function tryPunch(game) {
  const p = game.player;
  if (p.car || p.punchCd > 0) return;
  p.punchCd = 0.34;
  p.punchAnimT = 0.18;
  game.sound?.punch();
  const range = 32;
  const tx = p.x + Math.cos(p.faceAngle) * range;
  const ty = p.y + Math.sin(p.faceAngle) * range;
  for (const ped of game.peds) {
    if (ped.state === 'down' || ped.state === 'incar') continue;
    if (dist(tx, ty, ped.x, ped.y) < 20) {
      hurtPed(game, ped, 34, p.x, p.y);
      reportCrime(game, ped.kind === 'officer' ? 'copHit' : 'punch', ped.x, ped.y);
      ped.x += Math.cos(p.faceAngle) * 10;
      ped.y += Math.sin(p.faceAngle) * 10;
      return;
    }
  }
  for (const car of game.cars) {
    if (dist(tx, ty, car.x, car.y) < carRadius(car) + 8) {
      damageCar(game, car, 5, tx, ty);
      game.sound?.thud();
      return;
    }
  }
}

/** Fire the pistol toward a world point. */
export function tryShoot(game, targetX, targetY) {
  const p = game.player;
  if (p.car || p.shootCd > 0 || p.weapon !== 'pistol') return;
  p.shootCd = 0.21;
  p.faceAngle = Math.atan2(targetY - p.y, targetX - p.x);
  const angle = p.faceAngle + game.rng.range(-0.028, 0.028);
  spawnBullet(game, p.x + Math.cos(p.faceAngle) * 14, p.y + Math.sin(p.faceAngle) * 14, angle, 920, 'player', 34);
  game.spawnMuzzle?.(p.x + Math.cos(p.faceAngle) * 16, p.y + Math.sin(p.faceAngle) * 16);
  game.sound?.shot();
  scarePeds(game, p.x, p.y, 280);
  reportCrime(game, 'shot', p.x, p.y);
}

/** Cars meeting people, and cars meeting cars. Called once a step from the main loop. */
export function updateCollisions(game, dt) {
  const p = game.player;
  // Car vs pedestrian, and car vs the on-foot player.
  for (const car of game.cars) {
    const speed = Math.abs(car.speed);
    if (speed < 30) continue;
    const r = carRadius(car);
    for (const ped of game.peds) {
      if (ped.state === 'down' || ped.state === 'incar') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < r + 9) {
        const dmg = speed * 0.22 + 12;
        const wasAlive = ped.hp > 0;
        hurtPed(game, ped, dmg, car.x, car.y);
        ped.x += Math.cos(car.angle) * 14;
        ped.y += Math.sin(car.angle) * 14;
        if (ped.state !== 'down' && speed > 150) {
          ped.hp = 0;
          ped.state = 'down';
          ped.downT = 0;
        }
        if (car === p.car && wasAlive) {
          reportCrime(game, ped.hp <= 0 ? 'killPed' : 'hitPed', ped.x, ped.y);
          game.sound?.thud();
          car.speed *= 0.82;
        }
      }
    }
    if (!p.car && car !== p.car && dist(car.x, car.y, p.x, p.y) < r + 10 && speed > 55) {
      hurtPlayer(game, Math.min(38, speed * 0.09), car.x, car.y);
      p.x += Math.cos(car.angle) * 18;
      p.y += Math.sin(car.angle) * 18;
      p.knockT = 0.3;
    }
  }

  // Car vs car: separate the pair, share the momentum, dent both.
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const rr = carRadius(a) + carRadius(b) - 4;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = rr - d;
      const aParked = Math.abs(a.speed) < 4 && a.kind === 'parked';
      const bParked = Math.abs(b.speed) < 4 && b.kind === 'parked';
      if (!aParked) {
        a.x -= nx * overlap * (bParked ? 1 : 0.5);
        a.y -= ny * overlap * (bParked ? 1 : 0.5);
      }
      if (!bParked) {
        b.x += nx * overlap * (aParked ? 1 : 0.5);
        b.y += ny * overlap * (aParked ? 1 : 0.5);
      }
      const impact = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
      if (impact > 55) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        damageCar(game, a, impact * 0.05, midX, midY);
        damageCar(game, b, impact * 0.05, midX, midY);
        if (a === p.car || b === p.car) {
          const other = a === p.car ? b : a;
          game.sound?.crash(Math.min(1, impact / 300));
          game.addShake?.(Math.min(8, impact / 45));
          reportCrime(game, other.kind === 'police' ? 'copHit' : 'hitCar', midX, midY);
          if (impact > 190) hurtPlayer(game, 5, midX, midY);
        }
      }
      const avg = (a.speed + b.speed) / 2;
      if (!aParked) a.speed = avg * 0.92;
      if (!bParked) b.speed = avg * 0.92;
    }
  }
}
