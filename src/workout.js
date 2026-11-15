// Séances : parseur d'un mini-langage texte + moteur d'exécution (indépendant du Bluetooth).
//
// Syntaxe, une étape par ligne :  DURÉE @ VITESSE [/ PENTE] [libellé]
//   5:00 @ 6 / 1 Échauffement
//   repeat 6 {
//     1:00 @ 12 / 1 Vite
//     1:30 @ 6 Récup
//   }
// Durée : m:ss ou secondes ; ou une distance (400m, 1.5km) : l'étape se termine alors à la distance parcourue.
// Vitesse en km/h, ou en % de la VMA (ex. 85%) si une VMA est fournie.
// Pente en %. '#' = commentaire.

const toSec = (s) => {
  const m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return +m[1] * 60 + +m[2];
  if (/^\d+$/.test(s)) return +s;
  throw new Error(`Durée invalide « ${s} »`);
};

const MAX_SPEED = 18;

export function parseWorkout(text, vma) {
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
    m = /^(\S+)\s*@\s*([\d.]+%?)(?:\s*\/\s*(-?[\d.]+))?\s*(.*)$/.exec(line);
    if (!m) err(`syntaxe non reconnue « ${line} »`);
    const pct = m[2].endsWith('%');
    if (pct && !vma) err('vitesse en % sans VMA');
    const speed = pct ? Math.min(MAX_SPEED, Math.max(1, Math.round(parseFloat(m[2]) / 100 * vma * 2) / 2)) : +m[2];
    const step = { duration: 0, speed, incline: m[3] ? +m[3] : 0, label: m[4] || '' };
    const d = /^([\d.]+)(m|km)$/.exec(m[1]);
    if (d) { step.distance = Math.round(+d[1] * (d[2] === 'km' ? 1000 : 1)); step.duration = distDuration(step); }
    else try { step.duration = toSec(m[1]); } catch (e) { err(e.message); }
    stack.at(-1).steps.push(step);
  });
  if (stack.length !== 1) throw new Error('Accolade « { » non fermée');
  const steps = stack[0].steps;
  if (!steps.length) throw new Error('Séance vide');
  return steps;
}

// Durée estimée (s) d'une étape définie en distance : sert aux graphes et aux totaux.
export const distDuration = (s) => Math.max(1, Math.round(s.distance / (s.speed / 3.6)));
// Applique un facteur d'intensité à toutes les vitesses (0,9 = 10 % plus facile).
export const scaleSteps = (steps, k) => steps.map((s) => {
  const o = { ...s, speed: Math.min(MAX_SPEED, Math.max(1, Math.round(s.speed * k * 2) / 2)) };
  if (o.distance) o.duration = distDuration(o);
  return o;
});
export const totalDuration = (steps) => steps.reduce((a, s) => a + s.duration, 0);

// controller : { setSpeed(kmh), setIncline(pct) }. now : injectable pour les tests.
// speedNow : vitesse réelle du tapis (km/h), pour mesurer la distance des étapes en distance.
export class WorkoutRunner {
  constructor(steps, controller, { onTick = () => {}, onDone = () => {}, now = () => Date.now(), speedNow = () => null } = {}) {
    Object.assign(this, { steps, controller, onTick, onDone, now, speedNow });
    this.idx = -1; this.stepElapsed = 0; this.stepDist = 0; this.total = 0; this.running = false; this.timer = null;
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
    this.stepDist += ((this.speedNow() ?? this.step?.speed ?? 0) / 3.6) * dt;
    while (this.idx >= 0 && this.#done()) {
      const carry = this.step.distance ? 0 : this.stepElapsed - this.step.duration;
      if (!this.#enter(this.idx + 1)) return;
      this.stepElapsed = carry;
    }
    this.onTick(this.snapshot());
  }

  #done() { const s = this.step; return s.distance ? this.stepDist >= s.distance : this.stepElapsed >= s.duration; }

  // Reprise d'une séance interrompue : replace le moteur sans envoyer de commande au tapis.
  restore({ idx, stepElapsed, stepDist, total }) { Object.assign(this, { idx, stepElapsed, stepDist, total }); }
  state() { return { idx: this.idx, stepElapsed: this.stepElapsed, stepDist: this.stepDist, total: this.total }; }

  snapshot() {
    const s = this.step;
    if (!s) return { idx: this.idx, remaining: 0, total: this.total, pos: 0 };
    const frac = Math.min(1, s.distance ? this.stepDist / s.distance : this.stepElapsed / s.duration);
    return {
      idx: this.idx, step: s, next: this.steps[this.idx + 1],
      // remaining : secondes restantes (estimées pour une étape en distance) ; remainingDist : mètres restants
      remaining: Math.max(0, s.duration * (1 - frac)),
      remainingDist: s.distance ? Math.max(0, s.distance - this.stepDist) : null,
      total: this.total, totalDuration: totalDuration(this.steps),
      pos: totalDuration(this.steps.slice(0, this.idx)) + s.duration * frac, // position sur le graphe
    };
  }

  #enter(i) {
    this.stepElapsed = 0; this.stepDist = 0;
    if (i >= this.steps.length) { this.stop(); this.onDone(); return false; }
    this.idx = i;
    this.controller.setSpeed(this.step.speed);
    this.controller.setIncline(this.step.incline);
    this.onTick(this.snapshot());
    return true;
  }
}

// Résumé d'une séance : durée (s), distance (km), dénivelé positif estimé (m).
export function stats(steps) {
  let duration = 0, km = 0, ascent = 0;
  for (const s of steps) {
    const d = (s.speed * s.duration) / 3600;
    duration += s.duration; km += d; ascent += d * 1000 * (s.incline / 100);
  }
  return { duration, km, ascent };
}
