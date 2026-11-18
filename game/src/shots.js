// Coral Bay Heat — the screenshot scenes. With ?shot=<name> the game skips its title,
// stages a real moment of play with the ordinary systems (traffic, police, missions),
// runs it forward a fixed number of fixed-length steps under a simple pilot, and
// renders the resulting frame. Nothing is drawn by hand for the camera: the cover is
// the game, caught mid-chase, mid-job, mid-drive.
import { hRoadCenter, vRoadCenter } from './city.js';
import { makeCar } from './vehicles.js';
import { forceStars } from './police.js';
import { clamp, angleDelta } from './rng.js';

/** Drive toward a heading while the shot runs: full throttle, gentle corrections. */
function drivePilot(heading) {
  return (game) => {
    const car = game.player.car;
    if (!car) return { throttle: 0, steer: 0 };
    const steer = clamp(angleDelta(car.angle, heading) * 2.4, -1, 1);
    return { throttle: 0.88, steer };
  };
}

function addCruiser(game, x, y, angle) {
  const car = makeCar('police', '#f2f2f0', x, y, angle, 'police');
  car.ai = { ti: 3, tj: 3, mode: 'hunt', officer: null, stuckT: 0, lastX: x, lastY: y };
  car.speed = 210;
  game.cars.push(car);
  return car;
}

/**
 * Stage the named scene on a fresh game and return { steps, pilot }:
 * main.js runs `steps` fixed steps, asking `pilot` for the player's controls.
 */
export function stageShot(game, name) {
  const p = game.player;
  const garage = game.city.landmarks.garage.door;
  game.state = 'play';

  if (name === 'chase') {
    // Four stars on a downtown avenue: Dani runs the stolen coupe north toward the
    // warehouse drop, and the CBPD pours in behind.
    const roadX = vRoadCenter(3);
    const car = makeCar('coupe', '#19d3c5', roadX + 17, hRoadCenter(5) + 120, -Math.PI / 2, 'mission');
    car.hp = 400;
    car.maxHp = 400;
    game.cars.push(car);
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    addCruiser(game, roadX - 17, hRoadCenter(5) + 260, -Math.PI / 2);
    addCruiser(game, roadX - 17, hRoadCenter(6) + 60, -Math.PI / 2);
    addCruiser(game, vRoadCenter(2) + 17, hRoadCenter(5) + 420, -Math.PI / 2);
    forceStars(game, 4);
    game.wanted.seen = true;
    p.money = 1875;
    p.hasPistol = true;
    game.mission.index = 1;
    game.mission.phase = 'active';
    game.mission.stepIndex = 1;
    game.mission.carId = car.id;
    game.mission.spiked = true;
    return { steps: 66, pilot: drivePilot(-Math.PI / 2) };
  }

  if (name === 'mission') {
    // The briefing: Dani on foot at Rosa's garage, the first job's dialogue open.
    p.x = garage.x + 6;
    p.y = garage.y + 4;
    p.faceAngle = -Math.PI / 2;
    const car = makeCar('coupe', '#e2703a', garage.x - 70, garage.y + 26, 0.2, 'parked');
    game.cars.push(car);
    p.money = 120;
    game.mission.phase = 'intro';
    game.mission.dialogue = {
      speaker: 'Rosa Delgado',
      lines: game.missions[0].intro,
      index: 1,
      after: 'intro',
    };
    game.dialogueLock = true;
    return { steps: 12, pilot: null };
  }

  if (name === 'heist') {
    // Inside the Trust job: the holdout clock running down, CBPD arriving in force.
    const bank = game.city.landmarks.bank.door;
    p.x = bank.x;
    p.y = bank.y + 10;
    p.faceAngle = Math.PI / 2;
    p.hasPistol = true;
    p.weapon = 'pistol';
    p.money = 2050;
    game.mission.index = 3;
    game.mission.phase = 'active';
    game.mission.stepIndex = 1;
    game.mission.stepT = 17;
    forceStars(game, 4);
    addCruiser(game, bank.x - 150, bank.y + 190, -0.5);
    addCruiser(game, bank.x + 190, bank.y + 230, 2.6);
    return { steps: 42, pilot: null };
  }

  // 'cover' and anything else: the sunset drive along Ocean Drive, a job on the clock.
  const car = makeCar('sport', '#3fb7c9', 330, hRoadCenter(7) + 17, 0, 'parked');
  game.cars.push(car);
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.money = 640;
  p.hasPistol = true;
  game.mission.index = 0;
  game.mission.phase = 'active';
  game.mission.stepIndex = 1;
  game.mission.hasPackage = true;
  forceStars(game, 2);
  addCruiser(game, 120, hRoadCenter(7) - 17, 0);
  return { steps: 84, pilot: drivePilot(0) };
}
