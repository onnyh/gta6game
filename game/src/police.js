// Coral Bay Heat — the wanted system and the Coral Bay Police Department.
// Crimes raise heat; heat makes stars; stars bring cruisers. Cruisers route through
// the road grid to the player's neighbourhood, then hunt directly. Officers bail out
// when the player is on foot, shoot at three stars and up, and will bust a cornered
// player who stops running. Stay out of sight and the heat bleeds away.
import { GRID, COP_CARS_BY_STARS, COP_FOOT_BY_STARS, HEAT_PER_STAR, HEAT_DECAY, HEAT_SIGHT_RANGE } from './config.js';
import { vRoadCenter, hRoadCenter, lineOfSight, PITCH } from './city.js';
import { makeCar, stepCarPhysics } from './vehicles.js';
import { makePed } from './traffic.js';
import { angleDelta, dist, clamp } from './rng.js';

export function createWanted() {
  return { heat: 0, stars: 0, seen: false, unseenT: 0 };
}

const CRIME_HEAT = {
  theft: 55,
  hitCar: 30,
  hitPed: 110,
  killPed: 170,
  shot: 40,
  punch: 45,
  copHit: 95,
  copWreck: 80,
  trespass: 25,
};

/** Is any officer or cruiser close enough, with line of sight, to see the player? */
export function policeCanSee(game) {
  const p = game.player;
  for (const car of game.cars) {
    if (car.kind !== 'police' || car.wrecked) continue;
    if (dist(car.x, car.y, p.x, p.y) < HEAT_SIGHT_RANGE && lineOfSight(game.city, car.x, car.y, p.x, p.y)) return true;
  }
  for (const ped of game.peds) {
    if (ped.kind !== 'officer' || ped.state === 'down') continue;
    if (dist(ped.x, ped.y, p.x, p.y) < HEAT_SIGHT_RANGE * 0.8 && lineOfSight(game.city, ped.x, ped.y, p.x, p.y)) return true;
  }
  return false;
}

function civilianWitness(game, x, y) {
  for (const ped of game.peds) {
    if (ped.kind === 'civilian' && ped.state !== 'down' && dist(ped.x, ped.y, x, y) < 170) return true;
  }
  return false;
}

/**
 * Report a crime at (x, y). Witnessed crimes count in full; a civilian nearby phones
 * it in for partial credit; an unwitnessed crime in an empty street may never register.
 * `always` is for scripted mission beats, which the story guarantees are noticed.
 */
export function reportCrime(game, kind, x, y, always = false) {
  const base = CRIME_HEAT[kind] ?? 30;
  let factor = 0;
  if (always || policeCanSee(game)) factor = 1;
  else if (civilianWitness(game, x, y)) factor = 0.45;
  if (factor === 0) return;
  game.wanted.heat = Math.min(HEAT_PER_STAR * 5 + 99, game.wanted.heat + base * factor);
}

/** Force at least `stars` wanted stars (mission beats: a robbery is never subtle). */
export function forceStars(game, stars) {
  game.wanted.heat = Math.max(game.wanted.heat, stars * HEAT_PER_STAR + 10);
}

/** Update heat, stars and the hide-and-cool-down clock. */
export function updateWanted(game, dt) {
  const w = game.wanted;
  w.seen = policeCanSee(game);
  if (w.seen) {
    w.unseenT = 0;
  } else if (w.heat > 0) {
    w.unseenT += dt;
    // Cooling down takes longer the hotter it is: hide properly at high stars.
    const rate = HEAT_DECAY * (w.stars >= 4 ? 0.55 : w.stars >= 3 ? 0.75 : 1);
    if (w.unseenT > 1.2) w.heat = Math.max(0, w.heat - rate * dt * 10);
  }
  w.stars = clamp(Math.floor(w.heat / HEAT_PER_STAR), 0, 5);
}

// ---------------------------------------------------------------- cruisers

function nearestIntersection(x, y) {
  const i = clamp(Math.round((x - vRoadCenter(0)) / PITCH), 0, GRID);
  const j = clamp(Math.round((y - hRoadCenter(0)) / PITCH), 0, GRID);
  return { i, j };
}

function spawnCruiser(game) {
  const p = game.player;
  for (let tries = 0; tries < 8; tries++) {
    const i = game.rng.int(0, GRID);
    const j = game.rng.int(0, GRID);
    const x = vRoadCenter(i);
    const y = hRoadCenter(j);
    const d = dist(x, y, p.x, p.y);
    if (d < 540 || d > 900) continue;
    const car = makeCar('police', '#f2f2f0', x, y, 0, 'police');
    car.ai = { ti: i, tj: j, mode: 'hunt', officer: null, stuckT: 0, lastX: x, lastY: y };
    game.cars.push(car);
    return true;
  }
  return false;
}

/** Steer a cruiser: grid routing toward the player, direct hunt when close. */
function driveCruiser(game, car, dt) {
  const p = game.player;
  const ai = car.ai;
  const d = dist(car.x, car.y, p.x, p.y);
  let targetX;
  let targetY;
  let cruise = 1;

  if (ai.mode === 'leave') {
    targetX = car.x < p.x ? -200 : 2900;
    targetY = car.y;
    if (d > 1100) {
      game.cars.splice(game.cars.indexOf(car), 1);
      return;
    }
  } else if (d < 215 || (p.car && d < 300)) {
    // Direct hunt: aim at where the player is heading, not where they are.
    const lead = p.car ? 0.42 : 0.1;
    targetX = p.x + (p.car ? Math.cos(p.car.angle) * p.car.speed * lead : 0);
    targetY = p.y + (p.car ? Math.sin(p.car.angle) * p.car.speed * lead : 0);
    if (!p.car && d < 74) cruise = 0; // pull up and let the officer out
  } else {
    // Route intersection by intersection toward the player's part of the grid.
    const at = nearestIntersection(car.x, car.y);
    const goal = nearestIntersection(p.x, p.y);
    if (at.i === ai.ti && at.j === ai.tj) {
      // Choose the next intersection that closes the Manhattan distance.
      let best = null;
      let bestScore = Infinity;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = clamp(at.i + di, 0, GRID);
        const nj = clamp(at.j + dj, 0, GRID);
        if (ni === at.i && nj === at.j) continue;
        const score = Math.abs(ni - goal.i) + Math.abs(nj - goal.j) + game.rng.next() * 0.35;
        if (score < bestScore) {
          bestScore = score;
          best = { i: ni, j: nj };
        }
      }
      if (best) {
        ai.ti = best.i;
        ai.tj = best.j;
      }
    }
    targetX = vRoadCenter(ai.ti);
    targetY = hRoadCenter(ai.tj);
  }

  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  const steer = clamp(angleDelta(car.angle, desired) * 2.8, -1, 1);
  let throttle = cruise;
  // Do not plough through the player's car at full speed from the front — swing and ram.
  if (car.speed > 260 && d < 60) throttle = 0.2;
  stepCarPhysics(game, car, throttle, steer, dt);

  // Unstick: if barely moving while trying, reverse briefly.
  const moved = Math.hypot(car.x - ai.lastX, car.y - ai.lastY);
  if (throttle > 0 && moved < 6 * dt) ai.stuckT += dt;
  else ai.stuckT = 0;
  ai.lastX = car.x;
  ai.lastY = car.y;
  if (ai.stuckT > 0.9) {
    ai.stuckT = 0;
    car.speed = -120;
    car.angle += 0.6;
  }
}

// ---------------------------------------------------------------- officers on foot

function spawnOfficer(game, car) {
  const ped = makePed(car.x + 18, car.y + 10, game.rng, 'officer');
  ped.hp = 100;
  ped.shirt = '#274156';
  ped.pants = '#1d2733';
  ped.name = 'Officer';
  ped.car = car;
  car.ai.officer = ped;
  game.peds.push(ped);
  return ped;
}

/** A wrecked cruiser spills its officer, who keeps coming on foot at 2+ stars. */
export function wreckCopCar(game, car) {
  reportCrime(game, 'copWreck', car.x, car.y);
  if (game.wanted.stars >= 2 && !car.ai?.officer) {
    spawnOfficer(game, car);
  }
}

function updateOfficer(game, ped, dt) {
  const p = game.player;
  const car = ped.car;
  ped.shootCd = Math.max(0, ped.shootCd - dt);
  const d = dist(ped.x, ped.y, p.x, p.y);

  // The chase is over: get back in the car, or walk off if it is a wreck.
  if (game.wanted.stars === 0) {
    if (car && !car.wrecked) {
      if (dist(ped.x, ped.y, car.x, car.y) < 30) {
        game.peds.splice(game.peds.indexOf(ped), 1);
        if (car.ai) {
          car.ai.officer = null;
          car.ai.mode = 'leave';
        }
      } else {
        officerWalk(game, ped, car.x, car.y, 120, dt);
      }
    } else if (d > 700) {
      game.peds.splice(game.peds.indexOf(ped), 1);
    } else {
      officerWalk(game, ped, ped.x + 60, ped.y - 60, 70, dt);
    }
    return;
  }

  // The player drove off: back to the cruiser and give chase by car.
  if (p.car && d > 150 && car && !car.wrecked) {
    if (dist(ped.x, ped.y, car.x, car.y) < 30) {
      game.peds.splice(game.peds.indexOf(ped), 1);
      if (car.ai) {
        car.ai.officer = null;
        car.ai.mode = 'hunt';
      }
    } else {
      officerWalk(game, ped, car.x, car.y, 185, dt);
    }
    return;
  }

  if (d > 26) {
    officerWalk(game, ped, p.x, p.y, game.wanted.stars >= 3 ? 168 : 178, dt);
  } else {
    ped.speed = 0;
    ped.angle = Math.atan2(p.y - ped.y, p.x - ped.x);
    // Bust: a player who stays in reach and is not fighting back is arrested.
    if (!p.car && p.speedNow < 40) {
      game.bustT = (game.bustT || 0) + dt;
      if (game.bustT > 1.25) game.onBusted?.();
    }
  }

  // Shooting at three stars and up, with a clear shot and some spread.
  if (game.wanted.stars >= 3 && d < 320 && d > 30 && ped.shootCd <= 0 && lineOfSight(game.city, ped.x, ped.y, p.x, p.y)) {
    ped.shootCd = game.rng.range(0.75, 1.25);
    const aim = Math.atan2(p.y - ped.y, p.x - ped.x) + game.rng.range(-0.07, 0.07);
    game.spawnBullet?.(ped.x, ped.y, aim, 860, 'cop', game.rng.range(5, 10));
    game.sound?.shot();
  }
}

function officerWalk(game, ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 3) {
    ped.speed = 0;
    return;
  }
  const desired = Math.atan2(dy, dx);
  ped.angle += clamp(angleDelta(ped.angle, desired) * 8, -1, 1) * dt * 4;
  ped.speed = speed;
  const [rx, ry] = game.collide(ped.x + Math.cos(ped.angle) * speed * dt, ped.y + Math.sin(ped.angle) * speed * dt, 9);
  ped.x = rx;
  ped.y = ry;
}

// ---------------------------------------------------------------- the update

/** Field cruisers and officers to match the wanted level, and run their AI. */
export function updatePolice(game, dt) {
  const w = game.wanted;
  const p = game.player;
  if (!p.car) {
    if ((game.bustT || 0) > 0 && !anyOfficerNear(game)) game.bustT = Math.max(0, (game.bustT || 0) - dt * 2);
  } else {
    game.bustT = 0;
  }

  const cruisers = game.cars.filter((c) => c.kind === 'police' && !c.wrecked);
  const wantCars = COP_CARS_BY_STARS[w.stars];
  game.copSpawnT = (game.copSpawnT ?? 0) - dt;
  if (cruisers.length < wantCars && game.copSpawnT <= 0) {
    if (spawnCruiser(game)) game.copSpawnT = 1.4;
    else game.copSpawnT = 0.5;
  }

  // Cruisers beyond the wanted level peel off and leave.
  if (cruisers.length > wantCars) {
    const extra = cruisers[cruisers.length - 1];
    if (extra.ai) extra.ai.mode = 'leave';
  }

  for (const car of [...game.cars]) {
    if (car.kind !== 'police') continue;
    if (car.wrecked) continue;
    if (car.ai?.officer) continue; // parked up while its officer is out
    if (p.car === car) continue;
    driveCruiser(game, car, dt);
    // Bail out: close to an on-foot player, the officer takes the chase on foot.
    if (!p.car && w.stars >= 1 && dist(car.x, car.y, p.x, p.y) < 76 && Math.abs(car.speed) < 60 && !car.ai?.officer) {
      const footOut = game.peds.filter((q) => q.kind === 'officer' && q.state !== 'down').length;
      if (footOut < COP_FOOT_BY_STARS[w.stars] || w.stars === 1) {
        spawnOfficer(game, car);
        car.speed = 0;
      }
    }
  }

  for (const ped of [...game.peds]) {
    if (ped.kind === 'officer' && ped.state !== 'down') updateOfficer(game, ped, dt);
  }

  // The siren follows the nearest live cruiser.
  let nearest = Infinity;
  for (const car of game.cars) {
    if (car.kind === 'police' && !car.wrecked) nearest = Math.min(nearest, dist(car.x, car.y, p.x, p.y));
  }
  game.sound?.siren(nearest);
}

function anyOfficerNear(game) {
  const p = game.player;
  return game.peds.some((q) => q.kind === 'officer' && q.state !== 'down' && dist(q.x, q.y, p.x, p.y) < 30);
}
