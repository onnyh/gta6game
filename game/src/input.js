// Coral Bay Heat — keyboard and mouse state. One place owns the listeners; the game
// polls `keys` for held controls and drains `presses`/`clicks` for one-shot actions,
// so a tap is never lost between frames and never fires twice.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.presses = [];
    this.clicks = [];
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!e.repeat) this.presses.push(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      this.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
      this.clicks.push({ x, y, button: e.button });
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Is a control held right now? Accepts any of the given key names. */
  down(...names) {
    return names.some((n) => this.keys.has(n));
  }

  /** Drain the one-shot key presses since the last call. */
  takePresses() {
    const out = this.presses;
    this.presses = [];
    return out;
  }

  /** Drain the mouse clicks since the last call. */
  takeClicks() {
    const out = this.clicks;
    this.clicks = [];
    return out;
  }
}
