// hud.js — everything drawn over the 3D view: the circular minimap with its
// traffic, police and objective blips, the wanted stars, Raka's cash, the
// speedometer, the objective banner, toasts, the arrest meter and the
// contextual action prompt. Pure DOM/canvas — no game logic lives here.

import { ROAD_LINES, ROAD_WIDTH, BEACH_Z, SEA_Z, MOUNTAIN, CITY_HALF } from "./world.js";

const MAP_EXTENT = 580; // the minimap shows [-580, 580] on both axes
const MAP_SIZE = 216;

export class Hud {
  constructor() {
    this.root = document.getElementById("hud");
    this.starsEl = document.getElementById("stars");
    this.cashEl = document.getElementById("cash");
    this.objectiveEl = document.getElementById("objective");
    this.toastEl = document.getElementById("toast");
    this.speedoEl = document.getElementById("speedo");
    this.speedNum = this.speedoEl.querySelector(".num");
    this.promptEl = document.getElementById("prompt");
    this.bustedBar = document.getElementById("busted-bar");
    this.bustedFill = document.getElementById("busted-fill");
    this.vignette = document.getElementById("vignette");
    this.missionDoneEl = document.getElementById("mission-done");
    this.mapCtx = document.getElementById("minimap").getContext("2d");
    this.objectiveHtml = undefined;
    this.starsShown = -1;
    this.toastTimer = 0;
    this.doneTimer = 0;
    this.frame = 0;
  }

  show() {
    this.root.classList.add("on");
  }

  hide() {
    this.root.classList.remove("on");
  }

  setCash(amount) {
    const rounded = Math.max(0, Math.round(amount));
    if (this.cashShown !== undefined && rounded !== this.cashShown) {
      // A quick scale pulse whenever the money moves.
      this.cashEl.style.transform = rounded > this.cashShown ? "scale(1.14)" : "scale(0.92)";
      setTimeout(() => { this.cashEl.style.transform = ""; }, 160);
    }
    this.cashShown = rounded;
    this.cashEl.textContent = `Rp ${rounded.toLocaleString("id-ID")}`;
  }

  setStars(stars, escaping) {
    if (stars === this.starsShown && escaping === this.escapingShown) return;
    this.starsShown = stars;
    this.escapingShown = escaping;
    let html = "";
    for (let i = 0; i < 5; i++) {
      html += i < stars ? "★" : '<span class="off">★</span>';
    }
    this.starsEl.innerHTML = html;
    this.starsEl.style.opacity = escaping ? "0.45" : "1";
  }

  setSpeed(kmh) {
    if (kmh === null || kmh === undefined) {
      this.speedoEl.style.display = "none";
      return;
    }
    this.speedoEl.style.display = "block";
    this.speedNum.textContent = String(Math.round(Math.abs(kmh)));
  }

  setObjective(html) {
    if (html === this.objectiveHtml) return;
    this.objectiveHtml = html;
    if (!html) {
      this.objectiveEl.style.display = "none";
      return;
    }
    this.objectiveEl.style.display = "block";
    this.objectiveEl.innerHTML = html;
  }

  toast(text, kind = "", ms = 2700) {
    this.toastEl.textContent = text;
    this.toastEl.className = `show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.className = "";
    }, ms);
  }

  missionDone(text) {
    this.missionDoneEl.textContent = text;
    this.missionDoneEl.classList.add("show");
    clearTimeout(this.doneTimer);
    this.doneTimer = setTimeout(() => this.missionDoneEl.classList.remove("show"), 3400);
  }

  // progress 0..1 while the police are closing the arrest; null when safe.
  setBusted(progress) {
    if (progress === null || progress <= 0.01) {
      this.bustedBar.style.display = "none";
      this.vignette.classList.remove("on");
      return;
    }
    this.bustedBar.style.display = "block";
    this.bustedFill.style.width = `${Math.round(progress * 100)}%`;
    this.vignette.classList.add("on");
  }

  setPrompt(html) {
    if (!html) {
      this.promptEl.style.display = "none";
      return;
    }
    this.promptEl.style.display = "block";
    this.promptEl.innerHTML = html;
  }

  // state: { playerPos, playerHeading, police: [{x,z}], traffic: [{x,z}], marker }
  drawMinimap(state) {
    // The map is redrawn every other frame — plenty for a minimap.
    this.frame += 1;
    if (this.frame % 2 === 1) return;
    const g = this.mapCtx;
    const S = MAP_SIZE / (MAP_EXTENT * 2);
    const mx = (x) => (x + MAP_EXTENT) * S;
    const mz = (z) => (z + MAP_EXTENT) * S;

    g.fillStyle = "#57704a";
    g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // The bay.
    g.fillStyle = "#1a6f9e";
    g.fillRect(0, mz(SEA_Z), MAP_SIZE, MAP_SIZE - mz(SEA_Z));
    g.fillStyle = "#e6cf9a";
    g.fillRect(0, mz(BEACH_Z), MAP_SIZE, mz(SEA_Z) - mz(BEACH_Z));
    // Gunung Bayu.
    g.fillStyle = "#6d7f52";
    g.beginPath();
    g.arc(mx(MOUNTAIN.x), mz(MOUNTAIN.z), MOUNTAIN.r * S, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#8d8578";
    g.beginPath();
    g.arc(mx(MOUNTAIN.x), mz(MOUNTAIN.z), MOUNTAIN.r * 0.3 * S, 0, Math.PI * 2);
    g.fill();
    // City slab and avenues.
    g.fillStyle = "rgba(154, 149, 138, 0.5)";
    g.fillRect(mx(-CITY_HALF), mz(-CITY_HALF), CITY_HALF * 2 * S, CITY_HALF * 2 * S);
    g.strokeStyle = "#2c2f36";
    g.lineWidth = Math.max(2, ROAD_WIDTH * S);
    for (const line of ROAD_LINES) {
      g.beginPath();
      g.moveTo(mx(-CITY_HALF - 20), mz(line));
      g.lineTo(mx(CITY_HALF + 20), mz(line));
      g.stroke();
      g.beginPath();
      g.moveTo(mx(line), mz(-CITY_HALF - 20));
      g.lineTo(mx(line), mz(CITY_HALF + 20));
      g.stroke();
    }
    // Traffic.
    g.fillStyle = "#cfd4da";
    for (const c of state.traffic) {
      g.fillRect(mx(c.x) - 1.5, mz(c.z) - 1.5, 3, 3);
    }
    // Police: alternating red/blue blips.
    const phase = Math.floor(performance.now() / 280) % 2 === 0;
    for (const c of state.police) {
      g.fillStyle = phase ? "#ff3b30" : "#3d7de8";
      g.beginPath();
      g.arc(mx(c.x), mz(c.z), 3.6, 0, Math.PI * 2);
      g.fill();
    }
    // Objective marker: a pulsing gold ring.
    if (state.marker) {
      const pulse = 5 + Math.sin(performance.now() / 240) * 1.6;
      g.strokeStyle = "#ffb340";
      g.lineWidth = 2.4;
      g.beginPath();
      g.arc(mx(state.marker.x), mz(state.marker.z), pulse + 3, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#ffb340";
      g.beginPath();
      g.arc(mx(state.marker.x), mz(state.marker.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    // Raka: a white arrow turned to his heading.
    const px = mx(state.playerPos.x);
    const py = mz(state.playerPos.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(state.playerHeading), -Math.cos(state.playerHeading)));
    g.fillStyle = "#ffffff";
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(4.6, 5.4);
    g.lineTo(0, 2.8);
    g.lineTo(-4.6, 5.4);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
