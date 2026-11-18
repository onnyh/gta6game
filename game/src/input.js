// Bayu Heat — keyboard and mouse state. One place owns the listeners; the game
// polls `keys` for held controls and drains `presses`/`clicks` for one-shots,

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.presses = [];
    this.clicks = [];
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseDX = 0;   // pointer-lock look deltas, drained by the camera
    this.mouseDY = 0;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!e.repeat) this.presses.push(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    canvas.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0; }
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => { this.mouseDown = true; this.clicks.push({ button: e.button }); });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  down(...names) { return names.some((n) => this.keys.has(n)); }

  takePresses() { const out = this.presses; this.presses = []; return out; }
  takeClicks() { const out = this.clicks; this.clicks = []; return out; }
  takeLook() { const d = { x: this.mouseDX, y: this.mouseDY }; this.mouseDX = 0; this.mouseDY = 0; return d; }
}
