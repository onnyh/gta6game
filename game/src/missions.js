// Bayu Heat — Ratna Sari's story: six missions of parcels, borrowed angkots,
// harbour runs and one very bad night for the Teluk Bayu power grid. Each

import { G } from './state.js';
import { TRAIL, polylinePoint } from './city.js';

export const RATNA_POS = { x: 92, z: 222 };

export const STASHES = [
  { id: 'dermaga', x: 520, z: 262 }, { id: 'pasar', x: 214, z: 146 }, { id: 'alun', x: 178, z: 178 },
  { id: 'pantai', x: 466, z: 60 }, { id: 'ruko', x: 140, z: 84 }, { id: 'spbu', x: 366, z: 300 },
  { id: 'basecamp', x: 138, z: -128 }, { id: 'pos2', x: 176, z: -196 },
];
export const PICKUPS = [
  { kind: 'health', x: 40, z: 300 }, { kind: 'health', x: 246, z: 168 },
  { kind: 'armour', x: 104, z: 226 }, { kind: 'health', x: 470, z: 330 },
];

const R = 'RATNA SARI', D = 'DAMAR', S = 'SARI', B = 'BIMO';

export const MISSIONS = [
  {
    name: 'FIRST FARES', reward: 750000, rep: 120,
    intro: [
      [R, 'Damar Wicaksono. You owe me Rp 15.000.000 for that transmission you burned on the Pantai Raya run.'],
      [D, 'Selamat sore to you too, Ratna. I have a plan. It involves driving.'],
      [R, 'It involves MY plan. A parcel is waiting at the Pelabuhan warehouse. Fetch it, bring it here, and we call it a first payment.'],
    ],
    outro: [
      [R, 'Dry, sealed, on time. Maybe there is a wheelman under all that debt after all.'],
      [D, 'Careful, Ratna. That almost sounded like a compliment.'],
    ],
    stages: [
      { kind: 'goto', x: 500, z: 302, label: 'Drive to the <b>Pelabuhan</b> warehouse', next: 'The parcel is by the containers' },
      { kind: 'pickup', x: 508, z: 312, label: 'Pick up the <b>parcel</b>', next: 'Take it back to Bengkel Ratna' },
      { kind: 'goto', x: 98, z: 230, label: 'Bring the parcel to <b>Bengkel Ratna</b>', next: 'Ratna is waiting' },
    ],
  },
  {
    name: 'ANGKOT ANTICS', reward: 1250000, rep: 180, pistol: true,
    intro: [
      [R, 'See that angkot route money everyone skims? Pak Haji\'s blue angkot carries today\'s takings. I want the van, not the cash.'],
      [D, 'You want me to steal public transport. In daylight. In Teluk Bayu.'],
      [R, 'Borrow it loudly, park it behind Pasar Baru, then disappear. And take this — things get loud. (Pistol unlocked)'],
    ],
    outro: [
      [R, 'One angkot, zero fingerprints, one very confused dispatcher. Beautiful work, Damar.'],
    ],
    stages: [
      { kind: 'getin', model: 'angkot', label: 'Steal an <b>angkot</b> — any angkot', next: 'Its owner will notice. Move.' },
      { kind: 'deliver', model: 'angkot', x: 302, z: 148, seconds: 170, setStars: 2, label: 'Park the angkot behind <b>Pasar Baru</b>', next: 'Then lose the POLRES' },
      { kind: 'escape', label: '<b>Lose the POLRES</b>', next: 'Break sight, hide, let the heat die' },
    ],
  },
  {
    name: 'HARBOUR RUN', reward: 2000000, rep: 240,
    intro: [
      [B, 'Bimo, Pelabuhan. Ratna\'s crates of "frozen fish" need to reach my pier before the tide inspection.'],
      [R, 'The crates are at Pasar Baru. The POLRES are sniffing the harbour road today — take the checkpoints wide and do not stop.'],
    ],
    outro: [
      [B, 'Fish delivered, nobody inspected anything. Teluk Bayu still works the way it should.'],
      [R, 'Another payment off your debt, Damar. It almost looks small now. Almost.'],
    ],
    stages: [
      { kind: 'pickup', x: 252, z: 156, label: 'Load the crates at <b>Pasar Baru</b>', next: 'Hit the checkpoints, then the pier' },
      { kind: 'goto', x: 384, z: 196, setStars: 3, label: 'Pass the <b>Jl. Samudra</b> checkpoint', next: 'One more, then the harbour' },
      { kind: 'goto', x: 466, z: 318, chasers: 2, label: 'Reach the <b>Pelabuhan</b> gate', next: 'Deliver at the pier' },
      { kind: 'goto', x: 522, z: 334, label: 'Deliver the crates to <b>Bimo at the pier</b>', next: 'Bimo is waiting by the cranes' },
    ],
  },
  {
    name: 'THE NIGHT LEDGER', reward: 2750000, rep: 300,
    intro: [
      [R, 'Sari keeps the ledger for half the ruko on Jl. Merdeka — including the pages certain people want burned.'],
      [R, 'Pick her up at BayuMart, get her to Bimo\'s office at the port. Her old friends will try to stop the car. Do not let them.'],
    ],
    outro: [
      [S, 'You drive like the road owes you money. Thank you, Damar.'],
      [R, 'Ledger safe, Sari safe, debt smaller. A good night in Teluk Bayu.'],
    ],
    stages: [
      { kind: 'talk', x: 282, z: 294, who: 'SARI', label: 'Pick up <b>Sari</b> at BayuMart', next: 'She is by the entrance' },
      { kind: 'getin', anyCar: true, label: 'Get a <b>car</b> for the run', next: 'Sari rides with you' },
      { kind: 'goto', x: 512, z: 300, seconds: 260, chasers: 2, label: 'Drive Sari to the <b>port office</b>', next: 'Do not let them stop the car' },
    ],
  },
  {
    name: 'BAYU BLACKOUT', reward: 3500000, rep: 380,
    intro: [
      [R, 'Tonight the harbour gets a new customs scanner. Very expensive. Very interested in our crates.'],
      [D, 'Let me guess. The scanner needs electricity.'],
      [R, 'Three substations feed the port. Trip all three, then vanish. The mountain hides those who climb, Damar — remember that.'],
    ],
    outro: [
      [R, 'The whole harbour dark for six hours. Bimo sends his thanks — and his money.'],
    ],
    stages: [
      { kind: 'interact', x: 58, z: 58, setStars: 2, label: 'Trip substation <b>1 of 3</b> — Jl. Cendana', next: 'Two more feed the port' },
      { kind: 'interact', x: 332, z: 92, setStars: 3, label: 'Trip substation <b>2 of 3</b> — Jl. Melati', next: 'One more, then vanish' },
      { kind: 'interact', x: 138, z: 332, setStars: 4, label: 'Trip substation <b>3 of 3</b> — Jl. Kenanga', next: 'Now disappear — up the mountain' },
      { kind: 'goto', x: 146, z: -136, r: 14, label: 'Ditch the car at <b>Basecamp Bayu</b>', next: 'The trail beyond is foot-only. Run it.' },
      { kind: 'trail', trailT: 0.55, label: 'Run the <b>jalur pendakian</b> past Pos 2', next: 'POLRES cars stop at basecamp. Officers give up.' },
      { kind: 'escape', label: '<b>Lose the POLRES</b> — go dark', next: 'Let the mountain cool the heat' },
    ],
  },
  {
    name: 'THE TUGU JOB', reward: 6000000, rep: 600,
    intro: [
      [R, 'Last job, Damar. The customs warehouse at the Pelabuhan holds a sealed container — medicine, officially. It leaves tonight.'],
      [D, 'And unofficially?'],
      [R, 'Unofficially it clears your debt, my loan, and buys this bengkel twice. Load it, bring it to the alun-alun, and whatever happens — lose them.'],
    ],
    outro: [
      [R, 'Debt paid, Damar Wicaksono. Fifteen million, gone. You are a free man in Teluk Bayu.'],
      [D, 'Free. Strange feeling. What do free men do here, Ratna?'],
      [R, 'They climb the mountain at sunrise. They drive the coast road slow. They stay out of my harbour. (STORY COMPLETE)'],
    ],
    stages: [
      { kind: 'pickup', x: 420, z: 316, setStars: 2, label: 'Load the sealed container at the <b>customs warehouse</b>', next: 'The whole POLRES is about to wake up' },
      { kind: 'goto', x: 168, z: 172, seconds: 220, setStars: 5, chasers: 3, label: 'Get the container to the <b>alun-alun</b>', next: 'Then lose them. All of them.' },
      { kind: 'escape', label: '<b>Lose the POLRES</b> — the mountain hides those who climb', next: 'Break sight. Gunung Bayu is your friend' },
      { kind: 'goto', x: 98, z: 230, label: 'Return to <b>Bengkel Ratna</b>', next: 'Settle the debt' },
    ],
  },
];

export class MissionRunner {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = 'idle';         // idle | run | failed
    this.active = null;
    this.stageIdx = 0;
    this.timer = null;
    this.missionVehicle = null;
  }

  get stage() { return this.active ? this.active.stages[this.stageIdx] : null; }

  offerAvailable() { return !this.active && !G.storyDone; }

  begin() {
    this.active = MISSIONS[G.missionIndex];
    this.stageIdx = 0;
    this.state = 'run';
    this.missionVehicle = null;
    this.applyStage();
    if (this.hooks.onBegin) this.hooks.onBegin(this.active);
  }

  applyStage() {
    const s = this.stage;
    this.timer = s && s.seconds ? s.seconds : null;
    if (s && s.setStars && this.hooks.onSetStars) this.hooks.onSetStars(s.setStars);
    if (this.hooks.onChasers) this.hooks.onChasers(s && s.chasers ? s.chasers : 0);
    if (this.hooks.onStage) this.hooks.onStage(this.active, this.stageIdx);
  }

  completeStage() {
    this.stageIdx++;
    if (this.stageIdx >= this.active.stages.length) { this.finish(); return; }
    this.applyStage();
  }

  finish() {
    const m = this.active;
    this.active = null;
    this.state = 'idle';
    if (this.hooks.onChasers) this.hooks.onChasers(0);
    if (this.hooks.onComplete) this.hooks.onComplete(m);
  }

  fail() {
    this.active = null;
    this.state = 'failed';
    if (this.hooks.onChasers) this.hooks.onChasers(0);
    if (this.hooks.onFail) this.hooks.onFail();
  }

  update(dt, ctx) {
    if (!this.active || ctx.dialogueOpen) return;
    const s = this.stage;
    if (!s) return;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail(); return; }
    }
    const p = ctx.player;
    switch (s.kind) {
      case 'goto':
        if (Math.hypot(p.x - s.x, p.z - s.z) < (s.r || 8)) this.completeStage();
        break;
      case 'deliver':
        if (p.vehicle && (!s.model || p.vehicle.type === s.model) && Math.hypot(p.x - s.x, p.z - s.z) < 9) this.completeStage();
        break;
      case 'pickup':
      case 'interact':
        if (p.onFoot && Math.hypot(p.x - s.x, p.z - s.z) < 3.4 && ctx.pressE) this.completeStage();
        break;
      case 'talk':
        if (p.onFoot && Math.hypot(p.x - s.x, p.z - s.z) < 3.6 && ctx.pressE) this.completeStage();
        break;
      case 'getin':
        if (p.vehicle && (s.anyCar || p.vehicle.type === s.model)) { this.missionVehicle = p.vehicle; this.completeStage(); }
        break;
      case 'trail': {
        const tp = polylinePoint(TRAIL, s.trailT);
        if (p.onFoot && Math.hypot(p.x - tp.x, p.z - tp.z) < 7) this.completeStage();
        break;
      }
      case 'escape':
        if (G.stars === 0) this.completeStage();
        break;
    }
  }

  targetPos() {
    const s = this.stage;
    if (!s) return null;
    if (s.kind === 'getin' || s.kind === 'escape') return null;
    if (s.kind === 'trail') { const tp = polylinePoint(TRAIL, s.trailT); return { x: tp.x, z: tp.z }; }
    return { x: s.x, z: s.z };
  }
}
