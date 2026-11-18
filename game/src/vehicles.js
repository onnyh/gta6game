// Coral Bay Heat — vehicles: what a car is, how it moves, and the parked cars that
// fill the lots and kerbs. Player, traffic and police all drive the same physics,
// so a stolen cruiser feels like the cruiser that was chasing you a moment before.
import { CAR_TYPES, CAR_PAINTS } from './config.js';
import { clamp } from './rng.js';
import { collideCircle, terrainAt } from './city.js';

let nextCarId = 1;

/** A fresh car. kind is 'parked', 'traffic', 'police' or 'mission'. */
export function makeCar(type, paint, x, y, angle, kind) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++,
    type,
    paint,
    x, y, angle,
    speed: 0,
    steerVis: 0, // front-wheel angle, for drawing
    hp: spec.hp,
    maxHp: spec.hp,
    kind,
    driver: null, // a ped, for traffic; the player is tracked separately
    passenger: null,
    ai: null, // traffic or police brain, attached by their modules
    wrecked: false,
    honkT: 0,
    sirenPhase: Math.random() * Math.PI * 2,
    doorOpenT: 0,
  };
}

export function carSpec(car) {
  return CAR_TYPES[car.type];
}

export function carRadius(car) {
  return CAR_TYPES[car.type].w * 0.46;
}

/**
 * Advance a car one step under throttle (-1..1) and steer (-1..1).
 * Arcade handling: strong grip, a little drift at full lock, sand slows everything.
 * Building collision is resolved here; car-to-car and car-to-ped are the caller's job.
 */
export function stepCarPhysics(game, car, throttle, steer, dt) {
  const spec = CAR_TYPES[car.type];
  const terrain = terrainAt(car.x, car.y);
  const topSpeed = spec.top * (terrain === 'sand' ? 0.55 : 1);
  const accel = spec.accel * (terrain === 'sand' ? 0.6 : 1);

  if (car.wrecked) throttle = 0;

  if (throttle > 0) {
    car.speed += accel * throttle * dt * Math.max(0.25, 1 - car.speed / (topSpeed * 1.25));
  } else if (throttle < 0) {
    if (car.speed > 12) {
      car.speed -= 460 * dt; // brakes
    } else {
      car.speed -= accel * 0.55 * dt; // reverse
    }
  }
  // Drag and rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  if (throttle === 0) car.speed -= car.speed * 0.9 * dt;
  const reverseTop = -topSpeed * 0.32;
  car.speed = clamp(car.speed, reverseTop, topSpeed);
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  // Steering bites harder at city speeds and fades at full tilt.
  const speedFactor = clamp(car.speed / 130, -1.5, 1.5);
  const turnRate = steer * spec.grip * 0.62 * speedFactor;
  car.angle += turnRate * dt * (1 - Math.min(0.45, Math.abs(car.speed) / topSpeed * 0.45));
  car.steerVis += ((steer * 0.5) - car.steerVis) * Math.min(1, dt * 10);

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let nx = car.x + fx * car.speed * dt;
  let ny = car.y + fy * car.speed * dt;
  const [rx, ry] = collideCircle(game.city, nx, ny, carRadius(car) * 0.8);
  // A hard scrape against a building scrubs speed and hurts.
  const scrape = Math.hypot(rx - nx, ry - ny);
  if (scrape > 2.2 && Math.abs(car.speed) > 60) {
    damageCar(game, car, Math.abs(car.speed) * 0.03, rx, ry);
    if (game.sound) game.sound.crash(Math.min(1, Math.abs(car.speed) / 320));
    game.addShake?.(Math.min(7, Math.abs(car.speed) / 60));
    car.speed *= 0.45;
  }
  car.x = rx;
  car.y = ry;
}

/** Hurt a car; at zero health it becomes a smoking wreck that no longer drives. */
export function damageCar(game, car, amount, x, y) {
  if (car.wrecked) return;
  car.hp -= amount;
  game.spawnSparks?.(x ?? car.x, y ?? car.y, 4, '#ffb340');
  if (car.hp <= 0) {
    car.hp = 0;
    car.wrecked = true;
    car.speed = 0;
    game.spawnSparks?.(car.x, car.y, 22, '#ff7a3c');
    game.spawnSmoke?.(car.x, car.y, 10);
    if (game.sound) game.sound.crash(1);
    if (car.kind === 'police') game.onCopCarWrecked?.(car);
  }
}

/** Fill the city's parking spots with a believable mix of parked cars. */
export function spawnParkedCars(city, rng) {
  const cars = [];
  const types = ['sedan', 'sedan', 'taxi', 'coupe', 'van', 'truck', 'sedan'];
  for (const spot of city.parkingSpots) {
    if (!rng.chance(spot.lot ? 0.62 : 0.55)) continue;
    const type = rng.pick(types);
    cars.push(makeCar(type, rng.pick(CAR_PAINTS), spot.x + rng.range(-3, 3), spot.y + rng.range(-3, 3), spot.angle + rng.range(-0.04, 0.04), 'parked'));
  }
  return cars;
}

/** The nearest car to a point within `range`, or null. */
export function nearestCar(game, x, y, range) {
  let best = null;
  let bestD = range;
  for (const car of game.cars) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
