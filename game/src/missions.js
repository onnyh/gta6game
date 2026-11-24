// missions.js — Pak Haji Darma's three jobs: the story chain that gives
// Teluk Bayu its spine. A timed harbour delivery, a climb to the summit
// flag of Gunung Bayu, and a three-star escape. Each job pays cash, the
// chain pays off Raka's debt, and a finished chain can be run again for a
// bigger purse.

import { HARBOUR_POS, MARKET_POS } from "./world.js";

const DELIVERY_TIME = 150; // seconds to reach the pier once the package is in hand

export class MissionChain {
  // hooks: {
  //   toast(text, kind),            kind: '' | 'good' | 'bad'
  //   reward(amount, label),        cash paid (main.js banks it)
  //   objective(html, marker),      HUD banner; marker {x, z} | null
  //   setWanted(stars),             police control for the escape job
  //   chainComplete(round),         the debt is paid
  // }
  constructor({ summitPos, hooks }) {
    this.summitPos = summitPos;
    this.hooks = hooks;
    this.round = 1;
    this.index = 0; // 0, 1, 2 — which job; 3 = chain complete
    this.step = "pickup"; // delivery sub-step: 'pickup' | 'deliver'
    this.timer = 0;
    this.active = false;
    this.marker = null;
    this.earnedThisChain = 0;
    this.totalEarned = 0; // across every round, for the pause screen
  }

  rewardFor(base) {
    return Math.round(base * (1 + (this.round - 1) * 0.5));
  }

  start() {
    this.active = true;
    this.index = 0;
    this.step = "pickup";
    this.earnedThisChain = 0;
    this.hooks.toast("Pekerjaan 1 dari 3: Antar Paket ke Pelabuhan", "");
    this.refreshObjective(null);
  }

  restart() {
    this.round += 1;
    this.hooks.toast(`Putaran ${this.round}: hadiah naik 50%!`, "good");
    this.start();
  }

  get done() {
    return this.index >= 3;
  }

  // The current objective marker for the minimap and the world beacon.
  currentMarker() {
    return this.marker;
  }

  refreshObjective(playerPos) {
    const h = this.hooks;
    if (!this.active) {
      h.objective(null, null);
      this.marker = null;
      return;
    }
    const dist = (p) =>
      playerPos ? ` • <span class="dist">${Math.round(Math.hypot(playerPos.x - p.x, playerPos.z - p.z))} m</span>` : "";
    if (this.index === 0 && this.step === "pickup") {
      this.marker = { x: MARKET_POS.x, z: MARKET_POS.z };
      h.objective(`<b>Antar Paket:</b> ambil paket di pasar ikan${dist(MARKET_POS)}`, this.marker);
    } else if (this.index === 0) {
      this.marker = { x: HARBOUR_POS.x, z: HARBOUR_POS.z };
      h.objective(
        `<b>Antar Paket:</b> bawa ke ujung dermaga! Sisa <b>${Math.ceil(this.timer)} dtk</b>${dist(HARBOUR_POS)}`,
        this.marker
      );
    } else if (this.index === 1) {
      this.marker = { x: this.summitPos.x, z: this.summitPos.z };
      h.objective(`<b>Bendera Gunung Bayu:</b> capai bendera di puncak dengan berjalan kaki${dist(this.summitPos)}`, this.marker);
    } else if (this.index === 2) {
      this.marker = null;
      h.objective(`<b>Lolos dari Kejaran:</b> jauh dari polisi sampai semua bintang hilang`, null);
    } else {
      this.marker = null;
      h.objective(`<b>Utang lunas!</b> Tekan <b>M</b> untuk menjalankan lagi putaran ${this.round + 1} (hadiah +50%)`, null);
    }
  }

  // One line for menus: where the chain stands right now.
  statusLine() {
    if (!this.active) return "Belum ada pekerjaan — temui Pak Haji Darma di pasar ikan.";
    if (this.done) return `Utang lunas pada putaran ${this.round}. Total hasil: Rp ${this.totalEarned.toLocaleString("id-ID")}.`;
    const names = ["Antar Paket ke Pelabuhan", "Bendera Gunung Bayu", "Lolos dari Kejaran"];
    return `Putaran ${this.round} • Pekerjaan ${this.index + 1} dari 3: ${names[this.index]}`;
  }

  completeJob(base, label) {
    const amount = this.rewardFor(base);
    this.earnedThisChain += amount;
    this.totalEarned += amount;
    this.hooks.reward(amount, label);
    this.index += 1;
    this.step = "pickup";
    this.timer = 0;
    if (this.index === 1) this.hooks.toast("Pekerjaan 2 dari 3: Bendera Gunung Bayu", "");
    if (this.index === 2) {
      this.hooks.toast("Pekerjaan terakhir: Lolos dari Kejaran!", "bad");
      this.hooks.setWanted(3);
    }
    if (this.done) {
      this.hooks.toast("UTANG LUNAS! Teluk Bayu milikmu sekarang.", "good");
      this.hooks.chainComplete(this.round);
    }
    this.refreshObjective(null);
  }

  // Called by main.js when the police make an arrest.
  notifyBusted() {
    if (this.active && this.index === 2 && !this.done) {
      this.hooks.toast("Tertangkap! Pak Haji mengurusmu keluar — coba lagi.", "bad");
      this.hooks.setWanted(3);
      this.refreshObjective(null);
    }
  }

  // ctx: { playerPos, inCar, stars }
  update(dt, ctx) {
    if (!this.active) return;
    const p = ctx.playerPos;

    if (this.index === 0 && this.step === "pickup") {
      if (Math.hypot(p.x - MARKET_POS.x, p.z - MARKET_POS.z) < 9) {
        this.step = "deliver";
        this.timer = DELIVERY_TIME;
        this.hooks.toast("Paket diambil! Antar ke ujung dermaga, cepat!", "good");
      }
    } else if (this.index === 0 && this.step === "deliver") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.step = "pickup";
        this.hooks.toast("Terlambat — paketnya basah. Ambil lagi di pasar.", "bad");
      } else if (Math.hypot(p.x - HARBOUR_POS.x, p.z - HARBOUR_POS.z) < 8) {
        this.completeJob(15000, "Paket terkirim tepat waktu");
        return;
      }
    } else if (this.index === 1) {
      const d = Math.hypot(p.x - this.summitPos.x, p.z - this.summitPos.z);
      if (!ctx.inCar && d < 10 && p.y > this.summitPos.y - 6) {
        this.completeJob(20000, "Bendera berkibar di puncak Gunung Bayu");
        return;
      }
    } else if (this.index === 2) {
      if (ctx.stars === 0) {
        this.completeJob(30000, "Polisi kehilangan jejakmu");
        return;
      }
    }
    this.refreshObjective(p);
  }
}
