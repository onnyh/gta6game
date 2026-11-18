// Bayu Heat — the screen furniture: mission/POLRES panels, minimap, bars,
// speedo, dialogue with portraits, banners, and the pause map and stats.

import { G, clockText } from './state.js';
import { formatRp, repLevel, CITY, STREET_V, STREET_H, SUMMIT, BASECAMP } from './config.js';
import { terrainH, MOUNTAIN_ROAD, TRAIL, polylinePoint, streetNameAt, placeNameAt } from './city.js';
import { RATNA_POS, MISSIONS, STASHES } from './missions.js';

const $ = (id) => document.getElementById(id);
const MAPR = { x0: -150, z0: -430, w: 750, h: 890 };   // world rect the map covers

export class Hud {
  constructor(layout, hooks = {}) {
    this.hooks = hooks;
    this.el = {};
    for (const id of ['hud', 'missionPanel', 'missionIdx', 'missionName', 'missionObjective', 'stageLabel', 'stageBar', 'missionDist', 'missionNextText',
      'policePanel', 'policeRows', 'clockDow', 'clockTime', 'moneyLine', 'starsLine', 'insightLine', 'wslot1', 'wslot2', 'ammoLine',
      'healthFill', 'healthNum', 'armourFill', 'armourNum', 'staminaRow', 'staminaFill', 'staminaNum', 'waterRow', 'waterFill', 'waterNum', 'gearLine', 'caveDark', 'repLevel', 'repTitle', 'repFill', 'repNow', 'repNext',
      'vehiclePanel', 'speedBig', 'vehName', 'condFill', 'condNum', 'radioTrack', 'placeCity', 'placeStreet',
      'dialogue', 'dlgName', 'dlgText', 'portrait', 'prompt', 'toast', 'banner', 'bannerBig', 'bannerSub', 'dmgFlash', 'markerTag', 'markerDist',
      'minimap', 'mapCanvas', 'pauseScreen', 'titleScreen']) this.el[id] = $(id);
    this.miniCtx = this.el.minimap.getContext('2d');
    this.mapBase = this.buildMapBase(layout);
    this.dlgQueue = null; this.dlgIdx = 0; this.dlgDone = null;
    this.toastUntil = 0; this.bannerUntil = 0; this.bannerCb = null;
    this.slowTick = 0;
    this.buildSettingsTab();
  }

  get dialogueOpen() { return !!this.dlgQueue; }

  buildMapBase(layout) {
    const c = document.createElement('canvas');
    c.width = MAPR.w; c.height = MAPR.h;
    const g = c.getContext('2d');
    const X = (x) => x - MAPR.x0, Z = (z) => z - MAPR.z0;
    g.fillStyle = '#2b6f96'; g.fillRect(0, 0, c.width, c.height);                    // sea
    g.fillStyle = '#5d7350'; g.fillRect(0, 0, X(458), c.height);                    // land
    for (let z = -420; z < -4; z += 6) for (let x = -140; x < 560; x += 6) {
      const h = terrainH(x, z);
      const l = Math.min(52, h * 0.5);
      g.fillStyle = `rgb(${86 + l},${104 + l * 0.6},${58 + l * 0.3})`;
      g.fillRect(X(x), Z(z), 6, 6);
    }
    g.fillStyle = '#e8d096'; g.fillRect(X(458), 0, X(494) - X(458), Z(400));         // beach
    g.fillStyle = '#6f7d55';
    for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) g.fillRect(X(i * 64 + 10), Z(j * 64 + 10), 44, 44);
    g.fillStyle = '#8d8271'; g.fillRect(X(138), Z(138), 44, 44);
    g.fillStyle = '#998b74'; g.fillRect(X(202), Z(138), 108, 44);
    g.strokeStyle = '#33363d'; g.lineWidth = 13; g.lineCap = 'round';
    for (const rx of CITY.roadX) { g.beginPath(); g.moveTo(X(rx), Z(-6)); g.lineTo(X(rx), Z(398)); g.stroke(); }
    for (const rz of CITY.roadZ) { g.beginPath(); g.moveTo(X(-6), Z(rz)); g.lineTo(X(462), Z(rz)); g.stroke(); }
    g.strokeStyle = '#59504a'; g.lineWidth = 6;
    g.beginPath(); MOUNTAIN_ROAD.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.stroke();
    g.strokeStyle = '#d8c491'; g.lineWidth = 2; g.setLineDash([5, 4]);
    g.beginPath(); TRAIL.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#7d7468'; g.fillRect(X(492), Z(262), 66, 132);                   // port
    return c;
  }

  drawMap(player, target) {
    const cv = this.el.mapCanvas, g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.fillStyle = '#141c16'; g.fillRect(0, 0, W, H);
    const s = Math.min(W / MAPR.w, H / MAPR.h);
    const ox = (W - MAPR.w * s) / 2, oy = (H - MAPR.h * s) / 2;
    g.drawImage(this.mapBase, ox, oy, MAPR.w * s, MAPR.h * s);
    const X = (x) => ox + (x - MAPR.x0) * s, Z = (z) => oy + (z - MAPR.z0) * s;
    g.font = '700 10px Arial'; g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    CITY.roadX.forEach((rx, i) => { g.save(); g.translate(X(rx) - 4, Z(210)); g.rotate(-Math.PI / 2); g.fillText(STREET_V[i], 0, 0); g.restore(); });
    CITY.roadZ.forEach((rz, i) => { if (i < 6) g.fillText(STREET_H[i], X(230), Z(rz) - 5); });
    g.font = '800 11px Arial'; g.fillStyle = '#ffe9b0';
    g.fillText('PEGUNUNGAN JAWA TENGAH', X(215), Z(-330));
    g.font = '700 9.5px Arial'; g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('Merbabu', X(30), Z(-352)); g.fillText('Sumbing', X(215), Z(-366)); g.fillText('Sindoro', X(420), Z(-352));
    g.font = '800 11px Arial'; g.fillStyle = '#ffd97a';
    g.fillText('GUNUNG BAYU', X(SUMMIT.x), Z(SUMMIT.z) - 12);
    g.fillText('BASECAMP', X(BASECAMP.x), Z(BASECAMP.z) + 16);
    for (const t of [0.3, 0.55, 0.8]) { const p = polylinePoint(TRAIL, t); g.fillStyle = '#fff'; g.beginPath(); g.arc(X(p.x), Z(p.z), 2.4, 0, 7); g.fill(); }
    g.font = '700 8.5px Arial'; g.fillStyle = 'rgba(255,233,176,0.9)';
    { const bp = polylinePoint(TRAIL, 0.43); g.fillText('JEMBATAN BOLONG', X(bp.x), Z(bp.z) - 7); }
    { const cp = polylinePoint(TRAIL, 0.65); g.fillText('GOA', X(cp.x), Z(cp.z) - 7); }
    g.font = '800 10.5px Arial'; g.fillStyle = '#fff';
    const places = [['PASAR BARU', 256, 150], ['ALUN-ALUN', 160, 148], ['PELABUHAN', 524, 316], ['BENGKEL RATNA', 96, 214], ['POLRES', 352, 208], ['RS BAYU', 32, 272], ['BAYUMART', 288, 274], ['PANTAI BAYU', 474, 108]];
    for (const [n, x, z] of places) g.fillText(n, X(x), Z(z));
    g.fillStyle = '#ffc21f'; g.font = '900 15px Arial';
    g.fillText('★', X(SUMMIT.x), Z(SUMMIT.z) + 4);
    if (target) {
      g.strokeStyle = '#ffc21f'; g.lineWidth = 2;
      g.beginPath(); g.arc(X(target.x), Z(target.z), 8 + Math.sin(performance.now() / 300) * 2, 0, 7); g.stroke();
      g.fillStyle = '#ffc21f'; g.beginPath(); g.arc(X(target.x), Z(target.z), 3, 0, 7); g.fill();
    }
    g.save();
    g.translate(X(player.x), Z(player.z)); g.rotate(player.heading);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
  }

  showDialogue(lines, onDone) {
    this.dlgQueue = lines; this.dlgIdx = 0; this.dlgDone = onDone || null;
    this.renderDialogue();
  }
  renderDialogue() {
    const [who, text] = this.dlgQueue[this.dlgIdx];
    this.el.dlgName.textContent = who;
    this.el.dlgText.textContent = text;
    this.el.dialogue.classList.remove('hidden');
    this.drawPortrait(who);
  }
  advanceDialogue() {
    if (!this.dlgQueue) return false;
    this.dlgIdx++;
    if (this.hooks.onBlip) this.hooks.onBlip();
    if (this.dlgIdx >= this.dlgQueue.length) {
      this.el.dialogue.classList.add('hidden');
      const cb = this.dlgDone; this.dlgQueue = null; this.dlgDone = null;
      if (cb) cb();
    } else this.renderDialogue();
    return true;
  }
  drawPortrait(who) {
    const cv = this.el.portrait, g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const styles = {
      'RATNA SARI': { skin: 0xa06844, hair: 0x1c1410, top: 0xc8352e, bun: true, earring: true },
      'DAMAR': { skin: 0x96684a, hair: 0x100c08, top: 0x2e8f6e, stubble: true },
      'SARI': { skin: 0xbd8552, hair: 0x2a1a0e, top: 0x2aa8a0, long: true },
      'BIMO': { skin: 0x8a5a34, hair: 0x14100c, top: 0x2050b0, cap: true, beard: true },
    };
    const st = styles[who] || { skin: 0xa06844, hair: 0x14100c, top: 0x707880 };
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#8a4a7d'); grad.addColorStop(1, '#ff9a4e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(122, 26, 15, 0, 7); g.fill();
    g.fillStyle = hex(st.top); g.fillRect(28, 112, 92, 40);                        // shoulders
    g.fillStyle = hex(st.skin); g.fillRect(66, 92, 16, 24);                       // neck
    g.beginPath(); g.ellipse(74, 62, 30, 36, 0, 0, 7); g.fill();                  // face
    g.fillStyle = hex(st.hair);
    g.beginPath(); g.ellipse(74, 34, 31, 16, 0, Math.PI, 7); g.fill();            // hair top
    if (st.bun) { g.beginPath(); g.arc(74, 12, 11, 0, 7); g.fill(); }
    if (st.long) { g.fillRect(40, 30, 13, 74); g.fillRect(95, 30, 13, 74); }
    if (st.cap) { g.fillStyle = '#1d3468'; g.fillRect(42, 22, 64, 13); g.fillRect(42, 33, 76, 6); }
    g.fillStyle = '#241a12';
    g.beginPath(); g.arc(63, 60, 3.2, 0, 7); g.arc(85, 60, 3.2, 0, 7); g.fill();  // eyes
    g.fillRect(56, 50, 13, 3); g.fillRect(79, 50, 13, 3);                          // brows
    if (st.beard || st.stubble) { g.fillStyle = 'rgba(20,14,10,0.55)'; g.fillRect(58, 76, 32, 15); }
    g.strokeStyle = '#7a4632'; g.lineWidth = 2.4;
    g.beginPath(); g.arc(74, 76, 9, 0.25, Math.PI - 0.25); g.stroke();            // mouth
    if (st.earring) { g.fillStyle = '#ffd83c'; g.beginPath(); g.arc(102, 74, 3.4, 0, 7); g.fill(); }
  }

  toast(main, sub = '', seconds = 3.4) {
    this.el.toast.innerHTML = main + (sub ? `<span class="sub">${sub}</span>` : '');
    this.el.toast.classList.remove('hidden');
    this.toastUntil = G.time + seconds;
  }
  banner(big, sub = '', seconds = 2.6, cb = null) {
    this.el.bannerBig.textContent = big;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.remove('hidden');
    this.bannerUntil = G.time + seconds;
    this.bannerCb = cb;
  }
  setPrompt(html) {
    if (html) { this.el.prompt.innerHTML = html; this.el.prompt.classList.remove('hidden'); }
    else this.el.prompt.classList.add('hidden');
  }
  flashDamage() { this.el.dmgFlash.style.opacity = 1; setTimeout(() => { this.el.dmgFlash.style.opacity = 0; }, 130); }
  setCave(f) { this.el.caveDark.style.opacity = f.toFixed(2); }

  buildSettingsTab() {
    const div = document.createElement('div');
    div.id = 'settingsBody'; div.className = 'hidden'; div.style.minWidth = '300px';
    div.innerHTML = `<div style="font-size:14.5px;line-height:1.6">
      <p><label><input type="checkbox" id="setMute"> Mute all sound (M)</label></p>
      <p><label><input type="checkbox" id="setShadows" checked> Shadows</label></p>
      <p class="dim">Settings apply at once. Progress saves on mission completion, at the summit, and with SAVE GAME.</p></div>`;
    $('pauseBody').appendChild(div);
    this.settingsBody = div;
  }

  setPauseTab(tab) {
    document.querySelectorAll('.ptab').forEach((el) => el.classList.toggle('sel', el.dataset.tab === tab));
    const mapMode = tab === 'map' || tab === 'stats';
    this.el.mapCanvas.style.display = mapMode ? '' : 'none';
    $('statsCol').style.display = mapMode ? '' : 'none';
    $('controlsBody').classList.toggle('hidden', tab !== 'controls');
    this.settingsBody.classList.toggle('hidden', tab !== 'settings');
  }

  fillStats() {
    const done = G.stats.missionsDone;
    const pct = Math.round((done / 6) * 60 + (G.summit ? 15 : 0) + (G.stashesFound.length / STASHES.length) * 25);
    $('statPct').textContent = `${pct}% COMPLETE`;
    $('statCash').textContent = formatRp(G.money);
    const rows = [
      ['Story missions', `${done} / ${MISSIONS.length}`],
      ['Cash earned', formatRp(G.stats.earned)],
      ['Vehicles stolen', G.stats.stolen],
      ['Top speed', `${Math.round(G.stats.topSpeed)} km/h`],
      ['Summits', `${G.summit ? 1 : 0} / 1 — Gunung Bayu`],
      ['Best Gunung Bayu climb', G.bestClimb ? `${Math.floor(G.bestClimb / 60)}:${String(Math.round(G.bestClimb % 60)).padStart(2, '0')}` : '—'],
      ['Falls on the mountain', G.stats.mtFalls || 0],
      ['Cash stashes', `${G.stashesFound.length} / ${STASHES.length}`],
      ['Times busted', G.stats.arrests],
      ['Times wasted', G.stats.deaths],
      ['Time in Teluk Bayu', `${Math.floor(G.stats.playSeconds / 60)}:${String(Math.floor(G.stats.playSeconds % 60)).padStart(2, '0')}`],
    ];
    $('statGrid').innerHTML = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
    const rl = repLevel(G.rep);
    $('statRepLevel').textContent = rl.level;
    $('statRepTitle').textContent = rl.title;
  }

  update(dt, ctx) {
    const { player, missions, police, camera, audio } = ctx;
    if (G.time > this.toastUntil) this.el.toast.classList.add('hidden');
    if (this.bannerUntil && G.time > this.bannerUntil) {
      this.el.banner.classList.add('hidden');
      this.bannerUntil = 0;
      if (this.bannerCb) { const cb = this.bannerCb; this.bannerCb = null; cb(); }
    }
    this.el.healthFill.style.width = `${G.health}%`;
    this.el.healthNum.textContent = Math.ceil(G.health);
    this.el.armourFill.style.width = `${G.armour}%`;
    this.el.armourNum.textContent = Math.ceil(G.armour);
    const showStamina = player.z < 24 || G.stamina < 99.5;
    this.el.staminaRow.classList.toggle('hidden', !showStamina);
    if (showStamina) {
      this.el.staminaFill.style.width = `${G.stamina}%`;
      this.el.staminaNum.textContent = Math.ceil(G.stamina);
    }
    const onMountain = player.z < -55 && player.onFoot;
    this.el.waterRow.classList.toggle('hidden', !onMountain);
    this.el.gearLine.classList.toggle('hidden', !onMountain);
    if (onMountain) {
      this.el.waterFill.style.width = `${G.gear.bottle ? G.water : 0}%`;
      this.el.waterNum.textContent = G.gear.bottle ? Math.ceil(G.water) : '0';
      this.el.gearLine.textContent = G.gear.bottle || G.gear.torch
        ? `GEAR — Botol: ${G.gear.bottle ? '✓' : '✗'} · Senter: ${G.gear.torch ? '✓' : '✗'}`
        : 'GEAR — ambil botol + senter di Basecamp!';
    }
    this.drawMinimap(player, ctx.targetPos, police);

    this.slowTick -= dt;
    if (this.slowTick > 0) return;
    this.slowTick = 0.12;
    const ct = clockText();
    this.el.clockDow.textContent = ct.dow;
    this.el.clockTime.textContent = ct.time;
    this.el.moneyLine.textContent = formatRp(G.money);
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="${i < G.stars ? 'on' : ''} ${i < G.stars && !G.seenByPolice && G.stars > 0 ? 'blink' : ''}">★</span>`;
    this.el.starsLine.innerHTML = stars;
    if (G.stars > 0) {
      this.el.insightLine.classList.remove('hidden');
      const rows = police.responseList(player);
      const near = rows.find((r) => !r.heli) || rows[0];
      this.el.insightLine.textContent = G.seenByPolice ? `IN SIGHT${near ? ' · ' + near.callsign : ''}` : 'SEARCHING';
      this.el.insightLine.classList.toggle('search', !G.seenByPolice);
      this.el.policePanel.classList.remove('hidden');
      this.el.policeRows.innerHTML = rows.map((r) => {
        const cls = r.state === 'SPOTLIGHT ON YOU' || r.state === 'RAMMING' ? 'hot' : r.state === 'CHASING' || r.state === 'IN SIGHT' ? 'warm' : '';
        const mark = r.heli ? '<span class="dia">◆</span>' : '<span class="plus">+</span>';
        return `<div class="prow">${mark}<span class="cs">${r.callsign}</span><span class="dist">${Math.round(r.dist)} m</span><span class="st ${cls}">${r.state}</span></div>`;
      }).join('');
    } else {
      this.el.insightLine.classList.add('hidden');
      this.el.policePanel.classList.add('hidden');
    }
    const rl = repLevel(G.rep);
    this.el.repLevel.textContent = rl.level;
    this.el.repTitle.textContent = rl.title;
    this.el.repNow.textContent = G.rep.toLocaleString('id-ID');
    this.el.repNext.textContent = rl.isMax ? 'MAX' : rl.next.toLocaleString('id-ID');
    this.el.repFill.style.width = rl.isMax ? '100%' : `${((G.rep - rl.at) / (rl.next - rl.at)) * 100}%`;
    this.el.wslot1.classList.toggle('sel', G.weapon === 1);
    this.el.wslot2.classList.toggle('sel', G.weapon === 2);
    this.el.wslot2.classList.toggle('locked', !G.hasPistol);
    this.el.ammoLine.textContent = G.hasPistol ? `${G.ammo}/${G.reserve}` : '--';
    this.el.placeCity.textContent = placeNameAt(player.x, player.z);
    this.el.placeStreet.textContent = streetNameAt(player.x, player.z);
    const target = ctx.targetPos;
    if (missions.active) {
      const m = missions.active, s = missions.stage;
      this.el.missionPanel.classList.remove('hidden');
      this.el.missionIdx.textContent = `${G.missionIndex + 1}/${MISSIONS.length}`;
      this.el.missionName.textContent = m.name;
      let obj = s.label;
      if (missions.timer !== null) obj += ` — <b>${Math.floor(missions.timer / 60)}:${String(Math.floor(missions.timer % 60)).padStart(2, '0')}</b>`;
      this.el.missionObjective.innerHTML = obj;
      this.el.stageLabel.textContent = `STAGE ${missions.stageIdx + 1}/${m.stages.length}`;
      const frac = (missions.stageIdx + (target ? Math.max(0, 1 - Math.hypot(player.x - target.x, player.z - target.z) / 420) : 0.4)) / m.stages.length;
      this.el.stageBar.style.width = `${Math.min(100, frac * 100)}%`;
      this.el.missionNextText.textContent = s.next || '';
      this.el.missionDist.textContent = target ? `${Math.round(Math.hypot(player.x - target.x, player.z - target.z))} m` : '';
    } else if (missions.offerAvailable()) {
      this.el.missionPanel.classList.remove('hidden');
      this.el.missionIdx.textContent = `${G.missionIndex + 1}/${MISSIONS.length}`;
      this.el.missionName.textContent = MISSIONS[G.missionIndex].name;
      this.el.missionObjective.innerHTML = 'Talk to <b>Ratna Sari</b> at Bengkel Ratna';
      this.el.stageLabel.textContent = 'STORY';
      this.el.stageBar.style.width = '0%';
      this.el.missionNextText.textContent = 'She has work. You have a debt.';
      this.el.missionDist.textContent = `${Math.round(Math.hypot(player.x - RATNA_POS.x, player.z - RATNA_POS.z))} m`;
    } else this.el.missionPanel.classList.add('hidden');
    if (player.vehicle) {
      this.el.vehiclePanel.classList.remove('hidden');
      const kmh = Math.round(Math.abs(player.vehicle.speed) * 3.6);
      this.el.speedBig.innerHTML = `${kmh} <small>KM/H</small>`;
      this.el.vehName.textContent = player.vehicle.def.name;
      this.el.condFill.style.width = `${player.vehicle.condition}%`;
      this.el.condNum.textContent = `${Math.round(player.vehicle.condition)}%`;
      const tr = audio.currentTrack();
      this.el.radioTrack.textContent = `“${tr.title}” · ${tr.artist}`;
    } else this.el.vehiclePanel.classList.add('hidden');
    if (target && camera) {
      const v = ctx.project(target);
      if (v) {
        this.el.markerTag.classList.remove('hidden');
        this.el.markerTag.style.left = `${v.x}px`;
        this.el.markerTag.style.top = `${v.y}px`;
        this.el.markerDist.textContent = `${Math.round(Math.hypot(player.x - target.x, player.z - target.z))} m`;
      } else this.el.markerTag.classList.add('hidden');
    } else this.el.markerTag.classList.add('hidden');
  }

  drawMinimap(player, target, police) {
    const g = this.miniCtx, S = 196, R = 118;   // shows 118 m radius
    const cx = S / 2, cy = S / 2;
    g.clearRect(0, 0, S, S);
    const sx = (player.x - MAPR.x0) - R, sy = (player.z - MAPR.z0) - R;
    g.drawImage(this.mapBase, sx, sy, R * 2, R * 2, 0, 0, S, S);
    const px = (x) => cx + (x - player.x) * (S / (R * 2));
    const pz = (z) => cy + (z - player.z) * (S / (R * 2));
    g.fillStyle = '#fff';
    for (const st of STASHES) {
      if (G.stashesFound.includes(st.id)) continue;
      if (Math.abs(st.x - player.x) < R && Math.abs(st.z - player.z) < R) { g.beginPath(); g.arc(px(st.x), pz(st.z), 2.2, 0, 7); g.fill(); }
    }
    for (const u of police.units) {
      const src = u.mode === 'foot' && u.officer ? u.officer : u.vehicle;
      if (Math.abs(src.x - player.x) > R || Math.abs(src.z - player.z) > R) continue;
      g.fillStyle = (performance.now() % 600 < 300) ? '#4a8aff' : '#ff4a4a';
      g.beginPath(); g.arc(px(src.x), pz(src.z), 3.4, 0, 7); g.fill();
    }
    if (police.heli.active) {
      g.fillStyle = '#ffd83c';
      g.beginPath(); g.arc(px(police.heli.x), pz(police.heli.z), 3.4, 0, 7); g.fill();
    }
    if (target) {
      let dx = target.x - player.x, dz = target.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > R - 8) { dx *= (R - 8) / d; dz *= (R - 8) / d; }
      g.fillStyle = '#ffc21f';
      g.beginPath(); g.arc(cx + dx * (S / (R * 2)), cy + dz * (S / (R * 2)), 4.4, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
    }
    g.save();
    g.translate(cx, cy); g.rotate(player.heading);
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5.4, 6.4); g.lineTo(0, 3.4); g.lineTo(-5.4, 6.4); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#fff'; g.font = '900 12px Arial'; g.textAlign = 'center';
    g.fillText('N', cx, 15);
  }
}
