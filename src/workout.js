// Séances : parseur d'un mini-langage texte + moteur d'exécution (indépendant du Bluetooth).
//
// Syntaxe, une étape par ligne :  DURÉE @ VITESSE [/ PENTE] [libellé]
//   5:00 @ 6 / 1 Échauffement
//   repeat 6 {
//     1:00 @ 12 / 1 Vite
//     1:30 @ 6 Récup
//   }
// Durée : m:ss ou secondes. Vitesse en km/h, pente en %. '#' = commentaire.

const toSec = (s) => {
  const m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return +m[1] * 60 + +m[2];
  if (/^\d+$/.test(s)) return +s;
  throw new Error(`Durée invalide « ${s} »`);
};

export function parseWorkout(text) {
  const stack = [{ steps: [], times: 1 }];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const err = (m) => { throw new Error(`Ligne ${i + 1} : ${m}`); };
    let m;
    if ((m = /^repeat\s+(\d+)\s*\{$/i.exec(line))) { stack.push({ steps: [], times: +m[1] }); return; }
    if (line === '}') {
      if (stack.length < 2) err('« } » inattendu');
      const g = stack.pop();
      for (let k = 0; k < g.times; k++) stack.at(-1).steps.push(...g.steps);
      return;
    }
    m = /^(\S+)\s*@\s*([\d.]+)(?:\s*\/\s*(-?[\d.]+))?\s*(.*)$/.exec(line);
    if (!m) err(`syntaxe non reconnue « ${line} »`);
    let duration;
    try { duration = toSec(m[1]); } catch (e) { err(e.message); }
    stack.at(-1).steps.push({ duration, speed: +m[2], incline: m[3] ? +m[3] : 0, label: m[4] || '' });
  });
  if (stack.length !== 1) throw new Error('Accolade « { » non fermée');
  const steps = stack[0].steps;
  if (!steps.length) throw new Error('Séance vide');
  return steps;
}

export const totalDuration = (steps) => steps.reduce((a, s) => a + s.duration, 0);

// controller : { setSpeed(kmh), setIncline(pct) }. now : injectable pour les tests.
export class WorkoutRunner {
  constructor(steps, controller, { onTick = () => {}, onDone = () => {}, now = () => Date.now() } = {}) {
    Object.assign(this, { steps, controller, onTick, onDone, now });
    this.idx = -1; this.stepElapsed = 0; this.total = 0; this.running = false; this.timer = null;
  }

  get step() { return this.steps[this.idx]; }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = this.now();
    if (this.idx < 0) this.#enter(0);
    this.timer = setInterval(() => this.tick(), 250);
  }

  pause() { this.running = false; clearInterval(this.timer); }

  stop() { this.pause(); this.idx = -1; }

  skip() { if (this.idx >= 0) this.#enter(this.idx + 1); }

  tick() {
    const t = this.now();
    const dt = (t - this.last) / 1000; this.last = t;
    this.stepElapsed += dt; this.total += dt;
    while (this.idx >= 0 && this.stepElapsed >= this.step.duration) {
      const carry = this.stepElapsed - this.step.duration;
      if (!this.#enter(this.idx + 1)) return;
      this.stepElapsed = carry;
    }
    this.onTick(this.snapshot());
  }

  snapshot() {
    const s = this.step;
    return {
      idx: this.idx, step: s, next: this.steps[this.idx + 1],
      remaining: s ? Math.max(0, s.duration - this.stepElapsed) : 0,
      total: this.total, totalDuration: totalDuration(this.steps),
    };
  }

  #enter(i) {
    this.stepElapsed = 0;
    if (i >= this.steps.length) { this.stop(); this.onDone(); return false; }
    this.idx = i;
    this.controller.setSpeed(this.step.speed);
    this.controller.setIncline(this.step.incline);
    this.onTick(this.snapshot());
    return true;
  }
}
