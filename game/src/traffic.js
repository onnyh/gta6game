// Coral Bay Heat — traffic and pedestrians: the city going about its day.
// Traffic cars follow the road grid lane by lane, brake for whatever is ahead of them
// and honk at jaywalkers. Pedestrians stroll the sidewalks block by block, stroll the
// boardwalk, and run screaming from gunfire, crashes and reckless driving.
import { GRID, LANE, BLOCK, CITY_SIZE } from './config.js';
import { vRoadCenter, hRoadCenter, blockX, blockY } from './city.js';
import { makeCar, stepCarPhysics, carRadius } from './vehicles.js';
import { angleDelta, dist, clamp } from './rng.js';

const HEADINGS = {
  E: { dx: 1, dy: 0, angle: 0 },
  S: { dx: 0, dy: 1, angle: Math.PI / 2 },
  W: { dx: -1, dy: 0, angle: Math.PI },
  N: { dx: 0, dy: -1, angle: -Math.PI / 2 },
};
const LEFT_OF = { E: 'N', N: 'W', W: 'S', S: 'E' };
const RIGHT_OF = { E: 'S', S: 'W', W: 'N', N: 'E' };

/** The lane point for a car at intersection (i, j) travelling in `heading`. */
function lanePoint(i, j, heading) {
  const cx = vRoadCenter(i);
  const cy = hRoadCenter(j);
  if (heading === 'E') return { x: cx, y: cy + LANE };
  if (heading === 'W') return { x: cx, y: cy - LANE };
  if (heading === 'S') return { x: cx - LANE, y: cy };
  return { x: cx + LANE, y: cy };
}

/** Put a traffic car on the road at intersection (i, j) heading somewhere legal. */
function placeOnRoad(car, i, j, heading) {
  const p = lanePoint(i, j, heading);
  car.x = p.x;
  car.y = p.y;
  car.angle = HEADINGS[heading].angle;
  car.speed = 0;
  car.ai = { heading, ti: i + HEADINGS[heading].dx, tj: j + HEADINGS[heading].dy, blockedT: 0, cruise: 0.72 + Math.random() * 0.2 };
  clampTarget(car);
}

function clampTarget(car) {
  car.ai.ti = clamp(car.ai.ti, 0, GRID);
  car.ai.tj = clamp(car.ai.tj, 0, GRID);
}

/** The opening traffic: a dozen cars spread over the grid. */
export function createTrafficCars(rng) {
  const cars = [];
  const types = ['sedan', 'sedan', 'taxi', 'coupe', 'van', 'truck'];
  const paints = ['#e8e4da', '#c33d2e', '#2e6fc2', '#39a06b', '#e0a51f', '#e2703a', '#3fb7c9', '#565d66'];
  for (let n = 0; n < 13; n++) {
    const car = makeCar(rng.pick(types), rng.pick(paints), 0, 0, 0, 'traffic');
    placeOnRoad(car, rng.int(0, GRID), rng.int(0, GRID), rng.pick(Object.keys(HEADINGS)));
    car.speed = 120;
    cars.push(car);
  }
  return cars;
}

function obstacleAhead(game, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const ax = car.x + fx * 62;
  const ay = car.y + fy * 62;
  for (const other of game.cars) {
    if (other === car) continue;
    if (Math.hypot(other.x - ax, other.y - ay) < carRadius(other) + 16) return other;
  }
  const p = game.player;
  if (!p.car && Math.hypot(p.x - ax, p.y - ay) < 26) return p;
  for (const ped of game.peds) {
    if (ped.state === 'down' || ped.state === 'incar') continue;
    if (Math.hypot(ped.x - ax, ped.y - ay) < 22) return ped;
  }
  return null;
}

/** Drive every traffic car one step; keep the flow near the player topped up. */
export function updateTraffic(game, dt) {
  const player = game.player;
  let liveCount = 0;
  for (let i = game.cars.length - 1; i >= 0; i--) {
    const car = game.cars[i];
    if (car.kind !== 'traffic') continue;
    if (player.car === car) continue;
    const d = dist(car.x, car.y, player.x, player.y);
    if (d > 1700 && !car.wrecked) {
      game.cars.splice(i, 1);
      continue;
    }
    if (!car.wrecked) liveCount++;
    if (!car.ai || car.wrecked) continue;

    const target = lanePoint(car.ai.ti, car.ai.tj, car.ai.heading);
    const toTarget = Math.hypot(target.x - car.x, target.y - car.y);
    if (toTarget < 30) {
      // At the intersection: mostly straight on, sometimes a turn, never a U-turn.
      const roll = game.rng.next();
      let next = car.ai.heading;
      if (roll > 0.86) next = RIGHT_OF[car.ai.heading];
      else if (roll > 0.72) next = LEFT_OF[car.ai.heading];
      const ni = car.ai.ti + HEADINGS[next].dx;
      const nj = car.ai.tj + HEADINGS[next].dy;
      if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) {
        next = roll > 0.5 ? LEFT_OF[car.ai.heading] : RIGHT_OF[car.ai.heading];
      }
      car.ai.heading = next;
      car.ai.ti += HEADINGS[next].dx;
      car.ai.tj += HEADINGS[next].dy;
      clampTarget(car);
    }

    const lookX = target.x + HEADINGS[car.ai.heading].dx * 46;
    const lookY = target.y + HEADINGS[car.ai.heading].dy * 46;
    const desired = Math.atan2(lookY - car.y, lookX - car.x);
    const steer = clamp(angleDelta(car.angle, desired) * 2.6, -1, 1);

    let throttle = car.ai.cruise;
    const blocker = obstacleAhead(game, car);
    if (blocker) {
      throttle = car.speed > 14 ? -0.8 : 0;
      car.ai.blockedT += dt;
      if (car.ai.blockedT > 1.5 && blocker === player && car.honkT <= 0) {
        game.sound?.honk();
        car.honkT = 2.5;
      }
    } else {
      car.ai.blockedT = 0;
    }
    car.honkT = Math.max(0, car.honkT - dt);
    stepCarPhysics(game, car, throttle, steer, dt);
  }

  // Top the traffic up around the player.
  game.trafficSpawnT = (game.trafficSpawnT ?? 0) - dt;
  if (liveCount < 13 && game.trafficSpawnT <= 0) {
    game.trafficSpawnT = 0.8;
    for (let tries = 0; tries < 6; tries++) {
      const i = game.rng.int(0, GRID);
      const j = game.rng.int(0, GRID);
      const p = lanePoint(i, j, 'E');
      const d = dist(p.x, p.y, player.x, player.y);
      if (d > 620 && d < 1150) {
        const car = makeCar(game.rng.pick(['sedan', 'sedan', 'taxi', 'coupe', 'van', 'truck']), game.rng.pick(['#e8e4da', '#c33d2e', '#2e6fc2', '#39a06b', '#e0a51f', '#565d66']), 0, 0, 0, 'traffic');
        placeOnRoad(car, i, j, game.rng.pick(Object.keys(HEADINGS)));
        game.cars.push(car);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- pedestrians

const SHIRTS = ['#e2574c', '#f2b134', '#4fa3e0', '#7bc96f', '#e88bb0', '#f0ead8', '#8e6fc9', '#3fb7c9', '#e2703a', '#5d6d7e'];
const PANTS = ['#2e3a4a', '#565d66', '#7a4f35', '#e8e4da', '#33424f', '#6b4f71'];

/** A pedestrian. kind: 'civilian', 'passenger' (a story guest), 'mission' or 'officer'. */
export function makePed(x, y, rng, kind = 'civilian') {
  return {
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    hp: 60,
    kind,
    state: 'walk',
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    skin: rng.pick(['#f2c79b', '#c68863', '#8a5a3b', '#6e4530', '#ffd9b3']),
    block: null, // {c, r} whose sidewalk it walks, or 'beach'
    corner: 0,
    targetX: x,
    targetY: y,
    panic: 0,
    threatX: 0,
    threatY: 0,
    downT: 0,
    car: null, // when state is 'incar'
    shootCd: 0,
    name: null,
  };
}

function sidewalkCorners(c, r) {
  const bx = blockX(c);
  const by = blockY(r);
  const inset = 8;
  return [
    { x: bx + inset, y: by + inset },
    { x: bx + BLOCK - inset, y: by + inset },
    { x: bx + BLOCK - inset, y: by + BLOCK - inset },
    { x: bx + inset, y: by + BLOCK - inset },
  ];
}

/** The opening crowd: thirty strollers on sidewalks and the boardwalk. */
export function createPeds(city, rng) {
  const peds = [];
  for (let n = 0; n < 30; n++) {
    let ped;
    if (n % 6 === 5) {
      ped = makePed(rng.range(60, CITY_SIZE - 60), CITY_SIZE + 22, rng);
      ped.block = 'beach';
      ped.targetX = rng.range(60, CITY_SIZE - 60);
      ped.targetY = CITY_SIZE + 22;
    } else {
      const c = rng.int(0, GRID - 1);
      const r = rng.int(0, GRID - 1);
      const corners = sidewalkCorners(c, r);
      const start = corners[rng.int(0, 3)];
      ped = makePed(start.x, start.y, rng);
      ped.block = { c, r };
      ped.corner = rng.int(0, 3);
      const t = corners[ped.corner];
      ped.targetX = t.x;
      ped.targetY = t.y;
    }
    peds.push(ped);
  }
  return peds;
}

/** Frighten every civilian within radius of (x, y): they run from that point. */
export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.kind !== 'civilian' || ped.state === 'down' || ped.state === 'incar') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.panic = Math.max(ped.panic, 2.6);
      ped.threatX = x;
      ped.threatY = y;
    }
  }
}

function walkToward(game, ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return true;
  const desired = Math.atan2(dy, dx);
  ped.angle += clamp(angleDelta(ped.angle, desired) * 6, -1, 1) * dt * 3;
  ped.speed = speed;
  const nx = ped.x + Math.cos(ped.angle) * speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * speed * dt;
  const [rx, ry] = game.collide(nx, ny, 9);
  ped.x = rx;
  ped.y = ry;
  return d < 16;
}

/** Move every pedestrian one step: strolling, fleeing, riding, or down. */
export function updatePeds(game, dt) {
  const player = game.player;
  for (const ped of game.peds) {
    if (ped.state === 'incar') {
      if (ped.car) {
        ped.x = ped.car.x;
        ped.y = ped.car.y;
      }
      continue;
    }
    if (ped.state === 'down') {
      ped.downT += dt;
      ped.speed = 0;
      continue;
    }

    // Keep the crowd near the action: quietly relocate anyone left far behind.
    if (ped.kind === 'civilian' && dist(ped.x, ped.y, player.x, player.y) > 1500) {
      const c = game.rng.int(0, GRID - 1);
      const r = game.rng.int(0, GRID - 1);
      const corners = sidewalkCorners(c, r);
      const s = corners[0];
      if (dist(s.x, s.y, player.x, player.y) > 500) {
        ped.x = s.x;
        ped.y = s.y;
        ped.block = { c, r };
        ped.corner = 1;
        ped.targetX = corners[1].x;
        ped.targetY = corners[1].y;
        ped.panic = 0;
      }
    }

    if (ped.kind === 'passenger') {
      // A story passenger sticks close, and climbs in when the player drives.
      if (player.car) {
        if (dist(ped.x, ped.y, player.car.x, player.car.y) < 52) {
          ped.state = 'incar';
          ped.car = player.car;
          player.car.passenger = ped;
        } else {
          walkToward(game, ped, player.car.x, player.car.y, 205, dt);
        }
      } else {
        const d = dist(ped.x, ped.y, player.x, player.y);
        if (d > 34) walkToward(game, ped, player.x, player.y, d > 130 ? 200 : 96, dt);
        else ped.speed = 0;
      }
      continue;
    }

    if (ped.panic > 0) {
      ped.panic -= dt;
      const away = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX);
      walkToward(game, ped, ped.x + Math.cos(away) * 120, ped.y + Math.sin(away) * 120, 178, dt);
      continue;
    }

    // An ordinary stroll: corner to corner around a block, sometimes crossing the road.
    if (walkToward(game, ped, ped.targetX, ped.targetY, 62, dt)) {
      if (ped.block === 'beach') {
        ped.targetX = game.rng.range(50, CITY_SIZE - 50);
        ped.targetY = CITY_SIZE + 22;
      } else if (ped.block) {
        const corners = sidewalkCorners(ped.block.c, ped.block.r);
        if (game.rng.chance(0.22)) {
          // Cross to a neighbouring block and walk its sidewalk instead.
          const dc = game.rng.pick([-1, 0, 1]);
          const dr = dc === 0 ? game.rng.pick([-1, 1]) : 0;
          const nc = ped.block.c + dc;
          const nr = ped.block.r + dr;
          if (nc >= 0 && nc < GRID && nr >= 0 && nr < GRID) {
            ped.block = { c: nc, r: nr };
            ped.corner = 0;
            const t = sidewalkCorners(nc, nr)[0];
            ped.targetX = t.x;
            ped.targetY = t.y;
            continue;
          }
        }
        ped.corner = (ped.corner + 1) % 4;
        const t = corners[ped.corner];
        ped.targetX = t.x;
        ped.targetY = t.y;
      }
    }
  }
}
