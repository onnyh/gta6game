// Coral Bay Heat — missions and story. Dani Reyes, a wheelman with a debt, works it
// off for Rosa Delgado of Rosa's Garage: a dockside pickup, a stolen coupe, a hot
// passenger, and finally the Coral Bay Trust job. Missions are data — a chain of
// steps with markers — and this module runs the chain: briefings, dialogue,
// objectives, scripted wanted spikes, rewards, and the story's final state.
import { makeCar } from './vehicles.js';
import { makePed } from './traffic.js';
import { forceStars } from './police.js';
import { dist } from './rng.js';

export function buildMissions(city) {
  const L = city.landmarks;
  return [
    {
      id: 'first-wheels',
      title: 'First Wheels',
      giver: 'Rosa Delgado',
      reward: 300,
      intro: [
        'Dani Reyes. You still owe me for that transmission you burned on the Ocean Drive run.',
        'Work it off. A crate came in at the Old Port Docks with my name on it — and no paperwork.',
        'Pick it up, bring it back to the garage. And Dani — try not to be interesting on the way.',
      ],
      outro: [
        'Good. The debt is smaller. Take this pistol — the next job is the kind where you might need it.',
        'A buyer is looking at a coupe down at the marina. Come back when you are ready to drive.',
      ],
      steps: [
        { kind: 'pickupPackage', at: L.docks.door, radius: 34, onFoot: true, label: 'Pick up the crate at the Old Port Docks' },
        { kind: 'deliver', at: L.garage.door, radius: 40, label: 'Bring the crate back to Rosa\u2019s Garage' },
      ],
    },
    {
      id: 'marina-coupe',
      title: 'The Marina Coupe',
      giver: 'Rosa Delgado',
      reward: 750,
      intro: [
        'See the turquoise Vireo Coupe parked at Marina Parking? A collector wants it. Quietly.',
        'Steal it and take it to the North Warehouse. The moment you roll, every cruiser in Coral Bay will care.',
        'Bring it back in one piece. The collector pays for the car, not the story.',
      ],
      outro: [
        'The collector wired the money before you even parked. You are getting good at this, Dani.',
        'One more favour — family this time. My cousin Leo needs a ride tonight, and it will not be a quiet one.',
      ],
      steps: [
        { kind: 'steal', label: 'Steal the turquoise Vireo Coupe at Marina Parking' },
        { kind: 'deliverCar', at: L.warehouse.door, radius: 48, label: 'Deliver the coupe to the North Warehouse' },
      ],
    },
    {
      id: 'night-run',
      title: 'Night Run',
      giver: 'Rosa Delgado',
      reward: 1000,
      intro: [
        'Leo saw something at the docks he should not have. Half the CBPD is looking for him.',
        'He is waiting outside Coral Bay General. Pick him up and get him to the Ocean Drive Safehouse.',
        'Do not stop. Do not get caught. He is family, Dani.',
      ],
      outro: [
        'Leo is safe, and he tells me what he saw: the Coral Bay Trust moves its cash on Fridays.',
        'One big score and we are both out of this life. Come back when you are ready to rob a bank.',
      ],
      steps: [
        { kind: 'pickupPassenger', at: L.hospital.door, radius: 60, label: 'Pick up Leo outside Coral Bay General' },
        { kind: 'escapeDeliver', at: L.safehouse.door, radius: 48, label: 'Take Leo to the Ocean Drive Safehouse' },
      ],
    },
    {
      id: 'the-trust-job',
      title: 'The Coral Bay Trust',
      giver: 'Rosa Delgado',
      reward: 3000,
      intro: [
        'Friday. The Trust\u2019s vault cash is bagged and waiting, and their alarm takes forty seconds to matter.',
        'Walk in the front door like you own it. Hold your nerve inside while the bags are filled.',
        'Then run for the boatyard. My cousin keeps a boat fuelled. After this, Dani — we are done.',
      ],
      outro: [
        'You did it. The money is clean, the boat is gone, and Coral Bay never knew your name.',
        'Rosa sells the garage. You buy the little house on Palm Row. Some debts, it turns out, can be outrun.',
      ],
      steps: [
        { kind: 'goto', at: L.bank.door, radius: 34, onFoot: true, label: 'Walk into the Coral Bay Trust' },
        { kind: 'holdout', at: L.bank.door, radius: 78, duration: 40, label: 'Hold your nerve while the bags are filled' },
        { kind: 'escapeTo', at: L.boatyard.door, radius: 56, label: 'Escape to the boatyard — lose yourself there' },
      ],
    },
  ];
}

export function createMissionState() {
  return {
    index: 0,
    phase: 'offer', // offer | intro | active | outro | done
    stepIndex: 0,
    stepT: 0,
    hasPackage: false,
    carId: null,
    passengerId: null,
    spiked: false,
    offerArmed: true, // the briefing triggers only after Dani has left and come back
    dialogue: null, // { speaker, lines, index, after: 'intro'|'outro' }
  };
}

function startDialogue(game, speaker, lines, after) {
  game.mission.dialogue = { speaker, lines, index: 0, after };
  game.dialogueLock = true;
}

/** Advance the open dialogue; at the end, move the mission to its next phase. */
export function advanceDialogue(game) {
  const m = game.mission;
  if (!m.dialogue) return;
  m.dialogue.index++;
  game.sound?.pickup();
  if (m.dialogue.index < m.dialogue.lines.length) return;
  const after = m.dialogue.after;
  m.dialogue = null;
  game.dialogueLock = false;
  if (after === 'intro') {
    m.phase = 'active';
    m.stepIndex = 0;
    m.stepT = 0;
    m.spiked = false;
    activateStep(game);
    game.sound?.missionStart();
    game.toast?.(`Mission: ${game.missions[m.index].title}`);
  } else if (after === 'outro') {
    m.index++;
    m.hasPackage = false;
    m.carId = null;
    m.passengerId = null;
    if (m.index >= game.missions.length) {
      m.phase = 'done';
      game.onStoryComplete?.();
    } else {
      m.phase = 'offer';
      m.offerArmed = false; // walk away from the garage and come back for the next job
    }
    game.saveGame?.();
  }
}

/** Set up whatever a step needs in the world: the coupe, Leo, the holdout clock. */
function activateStep(game) {
  const m = game.mission;
  const mission = game.missions[m.index];
  const step = mission.steps[m.stepIndex];
  if (!step) return;
  if (step.kind === 'steal') {
    const lot = game.city.landmarks.marina.door;
    const car = makeCar('coupe', '#19d3c5', lot.x - 88, lot.y - 120, Math.PI / 2, 'mission');
    car.hp = 400;
    car.maxHp = 400;
    game.cars.push(car);
    m.carId = car.id;
  }
  if (step.kind === 'pickupPassenger') {
    const door = game.city.landmarks.hospital.door;
    const leo = makePed(door.x + 16, door.y + 6, game.rng, 'passenger');
    leo.name = 'Leo';
    leo.shirt = '#f2b134';
    leo.hp = 400;
    game.peds.push(leo);
    m.passengerId = leo.id;
  }
  if (step.kind === 'holdout') {
    m.stepT = step.duration;
    forceStars(game, 2);
  }
}

function completeStep(game) {
  const m = game.mission;
  const mission = game.missions[m.index];
  m.stepIndex++;
  m.stepT = 0;
  m.spiked = false;
  if (m.stepIndex < mission.steps.length) {
    activateStep(game);
    game.sound?.pickup();
    return;
  }
  // Mission complete: pay up, then the outro conversation.
  game.player.money += mission.reward;
  game.sound?.cash();
  game.sound?.missionComplete();
  game.toast?.(`Mission complete — $${mission.reward.toLocaleString()}`);
  if (mission.id === 'first-wheels') {
    game.player.hasPistol = true;
    game.player.weapon = 'pistol';
  }
  if (mission.id === 'the-trust-job') {
    game.wanted.heat = 0;
  }
  m.phase = 'outro';
  startDialogue(game, mission.giver, mission.outro, 'outro');
}

function failMission(game, why) {
  const m = game.mission;
  game.toast?.(why);
  game.sound?.busted();
  // Clear mission actors and offer the job again.
  if (m.carId) {
    const car = game.cars.find((c) => c.id === m.carId);
    if (car && game.player.car !== car) game.cars.splice(game.cars.indexOf(car), 1);
  }
  if (m.passengerId) {
    const leo = game.peds.find((q) => q.id === m.passengerId);
    if (leo) game.peds.splice(game.peds.indexOf(leo), 1);
  }
  m.phase = 'offer';
  m.stepIndex = 0;
  m.hasPackage = false;
  m.carId = null;
  m.passengerId = null;
  m.dialogue = null;
  game.dialogueLock = false;
}

/** The marker the HUD and minimap should point at right now, or null. */
export function currentObjective(game) {
  const m = game.mission;
  if (m.phase === 'offer' && m.index < game.missions.length) {
    const at = game.city.landmarks.garage.door;
    return { x: at.x, y: at.y, label: `Talk to Rosa at her garage`, sub: game.missions[m.index].title };
  }
  if (m.phase !== 'active') return null;
  const step = game.missions[m.index].steps[m.stepIndex];
  if (!step) return null;
  if (step.kind === 'steal') {
    const car = game.cars.find((c) => c.id === m.carId);
    if (car) return { x: car.x, y: car.y, label: step.label, sub: game.missions[m.index].title };
    return null;
  }
  let label = step.label;
  if (step.kind === 'holdout') label = `${step.label} — ${Math.ceil(m.stepT)}s`;
  if (step.onFoot && game.player.car) label += ' (on foot)';
  return { x: step.at.x, y: step.at.y, label, sub: game.missions[m.index].title };
}

/** Run the mission chain one step: briefings, step checks, scripted beats. */
export function updateMissions(game, dt) {
  const m = game.mission;
  const p = game.player;
  if (m.dialogue || m.phase === 'done') return;
  const mission = game.missions[m.index];
  if (!mission) return;

  if (m.phase === 'offer') {
    const door = game.city.landmarks.garage.door;
    const dDoor = dist(p.x, p.y, door.x, door.y);
    if (dDoor > 70) m.offerArmed = true;
    if (m.offerArmed && !p.car && dDoor < 34) {
      m.phase = 'intro';
      m.offerArmed = false;
      startDialogue(game, mission.giver, mission.intro, 'intro');
    }
    return;
  }
  if (m.phase !== 'active') return;

  const step = mission.steps[m.stepIndex];
  if (!step) return;
  const d = step.at ? dist(p.x, p.y, step.at.x, step.at.y) : Infinity;

  switch (step.kind) {
    case 'goto':
      if (d < step.radius && (!step.onFoot || !p.car)) completeStep(game);
      break;
    case 'pickupPackage':
      if (d < step.radius && !p.car) {
        m.hasPackage = true;
        game.toast?.('Package picked up');
        completeStep(game);
      }
      break;
    case 'deliver':
      if (d < step.radius && m.hasPackage) completeStep(game);
      break;
    case 'steal': {
      const car = game.cars.find((c) => c.id === m.carId);
      if (!car || car.wrecked) {
        failMission(game, 'The coupe is wrecked — Rosa is furious. The job is off.');
        break;
      }
      if (p.car === car) {
        if (!m.spiked) {
          m.spiked = true;
          forceStars(game, 2);
          game.toast?.('The coupe is hot — the CBPD is rolling');
        }
        completeStep(game);
      }
      break;
    }
    case 'deliverCar': {
      const car = game.cars.find((c) => c.id === m.carId);
      if (!car || car.wrecked) {
        failMission(game, 'The coupe is wrecked — Rosa is furious. The job is off.');
        break;
      }
      if (p.car === car && dist(car.x, car.y, step.at.x, step.at.y) < step.radius) completeStep(game);
      break;
    }
    case 'pickupPassenger': {
      const leo = game.peds.find((q) => q.id === m.passengerId);
      if (!leo || leo.state === 'down') {
        failMission(game, 'Leo did not make it — the job is off.');
        break;
      }
      if (leo.state === 'incar' || dist(leo.x, leo.y, p.x, p.y) < 40) {
        if (!m.spiked) {
          m.spiked = true;
          forceStars(game, 3);
          game.toast?.('Leo is in — and so are the police. Drive!');
        }
        if (leo.state === 'incar') completeStep(game);
      }
      break;
    }
    case 'escapeDeliver': {
      const leo = game.peds.find((q) => q.id === m.passengerId);
      if (!leo || leo.state === 'down') {
        failMission(game, 'Leo did not make it — the job is off.');
        break;
      }
      if (d < step.radius && (leo.state === 'incar' || dist(leo.x, leo.y, p.x, p.y) < 44)) {
        // Leo slips away into the safehouse.
        if (leo.state === 'incar' && leo.car) leo.car.passenger = null;
        game.peds.splice(game.peds.indexOf(leo), 1);
        m.passengerId = null;
        completeStep(game);
      }
      break;
    }
    case 'holdout': {
      if (d < step.radius && !p.car) {
        m.stepT -= dt;
        if (m.stepT < 26) forceStars(game, 3);
        if (m.stepT < 12) forceStars(game, 4);
        if (m.stepT <= 0) {
          game.toast?.('The bags are full — RUN');
          completeStep(game);
        }
      }
      break;
    }
    case 'escapeTo':
      if (d < step.radius) {
        game.wanted.heat = 0;
        completeStep(game);
      }
      break;
    default:
      break;
  }
}
