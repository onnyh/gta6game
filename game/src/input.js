// input.js — one place that turns keyboards, mice and thumbs into game
// intent. Keyboard + pointer-lock mouse on desktop; on touch devices a
// virtual joystick (push it to the rim to sprint), a look-drag anywhere on
// the right of the screen, and big interact / jump buttons.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.jumpQueued = false;
    this.interactQueued = false;
    this.usingTouch = false;
    this.joy = { x: 0, y: 0, id: null };
    this.lookTouch = { id: null, lastX: 0, lastY: 0 };

    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space") this.jumpQueued = true;
      if (e.code === "KeyE") this.interactQueued = true;
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.lookDX += e.movementX || 0;
        this.lookDY += e.movementY || 0;
      } else if (this.mouseDrag.on) {
        // Fallback for embeds where pointer lock is refused: drag to look.
        this.lookDX += (e.clientX - this.mouseDrag.x) * 1.6;
        this.lookDY += (e.clientY - this.mouseDrag.y) * 1.6;
        this.mouseDrag.x = e.clientX;
        this.mouseDrag.y = e.clientY;
      }
    });
    this.mouseDrag = { on: false, x: 0, y: 0 };
    canvas.addEventListener("mousedown", (e) => {
      this.mouseDrag.on = true;
      this.mouseDrag.x = e.clientX;
      this.mouseDrag.y = e.clientY;
    });
    window.addEventListener("mouseup", () => {
      this.mouseDrag.on = false;
    });

    this.buildTouchUi();
    this.bindTouch(canvas);
    this.armTouchIfCapable();
  }

  // ---- queries used by main.js ------------------------------------------

  isDown(code) {
    return this.keys.has(code);
  }

  // { x: strafe (-1 left .. 1 right), z: forward (-1 back .. 1 forward) }
  moveInput() {
    let x = 0;
    let z = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) z += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) z -= 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.usingTouch) {
      x += this.joy.x;
      z += -this.joy.y;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  sprint() {
    if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) return true;
    if (this.usingTouch && Math.hypot(this.joy.x, this.joy.y) > 0.92) return true;
    return false;
  }

  consumeLook() {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeInteract() {
    const i = this.interactQueued;
    this.interactQueued = false;
    return i;
  }

  // ---- touch UI -----------------------------------------------------------

  buildTouchUi() {
    const css = `
      .touch-ui { position: fixed; inset: 0; pointer-events: none; z-index: 5; display: none; }
      .touch-ui.on { display: block; }
      #joy-base { position: absolute; left: 26px; bottom: 92px; width: 118px; height: 118px;
        border-radius: 50%; background: rgba(255,255,255,0.10); border: 2px solid rgba(255,255,255,0.35);
        pointer-events: auto; touch-action: none; }
      #joy-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; border-radius: 50%;
        background: rgba(255,255,255,0.35); transform: translate(-50%, -50%); }
      .touch-btn { position: absolute; width: 64px; height: 64px; border-radius: 50%;
        background: rgba(255,179,64,0.30); border: 2px solid rgba(255,179,64,0.7); color: #fff7ea;
        font-size: 20px; font-weight: 800; display: flex; align-items: center; justify-content: center;
        pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; }
      #btn-interact { right: 30px; bottom: 108px; }
      #btn-jump { right: 108px; bottom: 52px; background: rgba(255,255,255,0.16); border-color: rgba(255,255,255,0.5); }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const ui = document.createElement("div");
    ui.className = "touch-ui";
    ui.innerHTML = `
      <div id="joy-base"><div id="joy-knob"></div></div>
      <div id="btn-interact" class="touch-btn">E</div>
      <div id="btn-jump" class="touch-btn">↑</div>`;
    document.body.appendChild(ui);
    this.touchUi = ui;
    this.joyBase = ui.querySelector("#joy-base");
    this.joyKnob = ui.querySelector("#joy-knob");

    ui.querySelector("#btn-interact").addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.interactQueued = true;
    }, { passive: false });
    ui.querySelector("#btn-jump").addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.jumpQueued = true;
    }, { passive: false });

    const joyMove = (touch) => {
      const rect = this.joyBase.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = (touch.clientX - cx) / (rect.width / 2);
      let dy = (touch.clientY - cy) / (rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.joy.x = dx;
      this.joy.y = dy;
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx * 32}px), calc(-50% + ${dy * 32}px))`;
    };
    this.joyBase.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joy.id = t.identifier;
      joyMove(t);
    }, { passive: false });
    this.joyBase.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this.joy.id) joyMove(t);
    }, { passive: false });
    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          this.joy.id = null;
          this.joy.x = 0;
          this.joy.y = 0;
          this.joyKnob.style.transform = "translate(-50%, -50%)";
        }
      }
    };
    this.joyBase.addEventListener("touchend", joyEnd);
    this.joyBase.addEventListener("touchcancel", joyEnd);
  }

  bindTouch(canvas) {
    canvas.addEventListener("touchstart", (e) => {
      this.enableTouch();
      for (const t of e.changedTouches) {
        if (t.clientX > window.innerWidth * 0.4 && this.lookTouch.id === null) {
          this.lookTouch.id = t.identifier;
          this.lookTouch.lastX = t.clientX;
          this.lookTouch.lastY = t.clientY;
        }
      }
    }, { passive: true });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookTouch.id) {
          this.lookDX += (t.clientX - this.lookTouch.lastX) * 2.6;
          this.lookDY += (t.clientY - this.lookTouch.lastY) * 2.6;
          this.lookTouch.lastX = t.clientX;
          this.lookTouch.lastY = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookTouch.id) this.lookTouch.id = null;
      }
    };
    canvas.addEventListener("touchend", end);
    canvas.addEventListener("touchcancel", end);
  }

  enableTouch() {
    if (!this.usingTouch) {
      this.usingTouch = true;
      this.touchUi.classList.add("on");
    }
  }

  // On a touch-capable device, show the controls from the start rather than
  // waiting for the first canvas touch.
  armTouchIfCapable() {
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
      this.enableTouch();
    }
  }
}
