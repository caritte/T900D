// Enregistre une séance à partir des données du tapis. tick() est appelé chaque seconde active.
export const SAMPLE = 5; // s entre deux points de la courbe

export class Recorder {
  constructor(name, now = Date.now()) {
    Object.assign(this, { name, start: now, t: 0, dist: 0, ascent: 0, kcal: 0, maxSpeed: 0, hrSum: 0, hrN: 0, hrMax: 0, samples: [] });
    this.lastKcal = null;
  }

  tick(live, dt = 1) {
    const speed = live.speed || 0, incline = live.incline || 0, hr = live.hr || 0;
    // Le compteur de distance du tapis n'a qu'une résolution de 100 m : on intègre la vitesse.
    const d = (speed / 3.6) * dt;
    this.t += dt; this.dist += d; this.ascent += d * Math.max(0, incline) / 100;
    this.maxSpeed = Math.max(this.maxSpeed, speed);
    if (live.energy != null) {
      if (this.lastKcal != null && live.energy > this.lastKcal) this.kcal += live.energy - this.lastKcal;
      this.lastKcal = live.energy;
    }
    if (hr > 0) { this.hrSum += hr; this.hrN++; this.hrMax = Math.max(this.hrMax, hr); }
    if (Math.floor(this.t / SAMPLE) > this.samples.length) this.samples.push([Math.round(this.t), speed, incline, hr]);
  }

  summary(completed = true) {
    return {
      id: this.start, start: this.start, name: this.name, completed,
      duration: Math.round(this.t), distance: Math.round(this.dist), ascent: Math.round(this.ascent), kcal: this.kcal,
      avgSpeed: this.t ? +(this.dist / this.t * 3.6).toFixed(2) : 0, maxSpeed: this.maxSpeed,
      hrAvg: this.hrN ? Math.round(this.hrSum / this.hrN) : 0, hrMax: this.hrMax, samples: this.samples,
    };
  }
}
