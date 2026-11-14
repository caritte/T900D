// Tapis simulé (même interface que Treadmill) pour tester sans matériel : ?demo=1
export class DemoTreadmill {
  constructor({ onData = () => {}, onLog = () => {}, onDisconnect = () => {} } = {}) {
    Object.assign(this, { onData, log: onLog, onDisconnect });
    // Simule les boutons de la console : dispatchEvent(new CustomEvent('demo-console', { detail: 'start' | 'stop' }))
    addEventListener('demo-console', (e) => (e.detail === 'start' ? this.start() : this.stop()));
    this.s = { speed: 0, incline: 0, tSpeed: 0, tIncline: 0, dist: 0, elapsed: 0, running: false };
  }
  get connected() { return !!this.timer; }
  async connect() {
    this.device = { name: 'Démo' };
    this.timer = setInterval(() => this.#step(), 1000);
    this.log('Mode démo');
  }
  #step() {
    const s = this.s, mv = (a, b, k) => a + Math.max(-k, Math.min(k, b - a));
    s.speed = mv(s.speed, s.tSpeed, 1); s.incline = mv(s.incline, s.tIncline, 1);
    if (s.running) { s.elapsed++; s.dist += s.speed / 3.6; }
    this.onData({ speed: s.speed, incline: s.incline, distance: Math.round(s.dist), elapsed: s.elapsed, hr: Math.round(80 + s.speed * 6), energy: Math.round(s.dist / 15) });
  }
  start() { this.s.running = true; if (!this.s.tSpeed) this.s.tSpeed = 1; }
  stop() { this.s.running = false; this.s.tSpeed = 0; }
  pause() { this.stop(); }
  setSpeed(v) { this.s.tSpeed = v; }
  setIncline(v) { this.s.tIncline = v; }
  disconnect() { clearInterval(this.timer); this.timer = null; this.onDisconnect(); }
}
