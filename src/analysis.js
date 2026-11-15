// Analyses fines de l'historique : FC selon la vitesse, récupération cardiaque, zones par semaine.
// samples : [t, vitesse, pente, fc], un point toutes les 5 s.
import { zoneTimes } from './hr.js';
import { monday } from './progress.js';

const DAY = 864e5;
const STEADY = 90;   // s à vitesse stable avant de compter la FC (le cœur met du temps à suivre)
const MIN_PTS = 24;  // 2 minutes de mesures au minimum pour afficher une moyenne

// Périodes glissantes de 4 semaines, de la plus récente à la plus ancienne.
export const PERIODS = ['4 dernières semaines', '4 semaines précédentes', 'Il y a 8 à 12 semaines'];

// FC moyenne par tranche de vitesse (1 km/h) et par période, sur les phases courues à plat et stabilisées.
// Renvoie { bins: [vitesses], periods: [[fc ou null par vitesse] par période] }.
export function hrBySpeed(sessions, now = Date.now()) {
  const acc = PERIODS.map(() => ({}));
  for (const s of sessions) {
    const p = Math.floor((now - s.start) / (28 * DAY));
    if (p < 0 || p >= PERIODS.length) continue;
    let bin = null, since = 0;
    for (const [t, speed, incline, hr] of s.samples || []) {
      const b = speed >= 5 && incline <= 1 ? Math.round(speed) : null;
      if (b !== bin) { bin = b; since = t; }
      if (b != null && hr > 0 && t - since >= STEADY) { const a = (acc[p][b] ??= { sum: 0, n: 0 }); a.sum += hr; a.n++; }
    }
  }
  const ok = (a, b) => a[b]?.n >= MIN_PTS;
  const bins = [...new Set(acc.flatMap((a) => Object.keys(a).map(Number).filter((b) => ok(a, b))))].sort((x, y) => x - y);
  return { bins, periods: acc.map((a) => bins.map((b) => (ok(a, b) ? Math.round(a[b].sum / a[b].n) : null))) };
}

// Récupération cardiaque : baisse de la FC (bpm) dans la minute qui suit un effort intense.
// Un effort = au moins 45 s à vitesse stable, suivi d'une baisse d'au moins 2 km/h tenue 60 s.
export function recoveries(samples) {
  const out = [];
  for (let i = 12; i + 9 < samples.length; i++) {
    const end = i - 3, v = samples[end][1];                 // end : dernier point de l'effort (le tapis ralentit en ~15 s)
    if (v - samples[i][1] < 2) continue;
    if (samples.slice(end - 9, end + 1).some((s) => Math.abs(s[1] - v) > 0.6 || !(s[3] > 0))) continue;
    if (samples.slice(i, end + 13).some((s) => s[1] > v - 1.5)) continue;
    const peak = Math.max(...samples.slice(end, i + 1).map((s) => s[3])), after = samples[end + 12][3];
    if (!(after > 0)) continue;
    out.push(peak - after);
    i = end + 12;
  }
  return out;
}
// Une valeur par séance de fractionné (au moins minEfforts efforts mesurables) : moyenne de ses récupérations.
// Les footings sont écartés : leur unique ralentissement final n'est pas comparable à une récupération entre deux efforts.
export const recoverySeries = (sessions, minEfforts = 3) => sessions.map((s) => {
  const r = recoveries(s.samples || []);
  return { t: s.start, n: r.length, v: r.length >= minEfforts ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null };
}).filter((p) => p.v != null).sort((a, b) => a.t - b.t);

// Temps (s) par zone cardiaque pour chacune des dernières semaines (lundi → dimanche), de la plus ancienne à l'actuelle.
export function zonesByWeek(sessions, hrMax, weeks = 8, now = Date.now()) {
  const cur = monday(now), out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cur); d.setDate(d.getDate() - 7 * i);
    out.push({ start: d.getTime(), label: `${d.getDate()}/${d.getMonth() + 1}`, zones: [0, 0, 0, 0, 0] });
  }
  for (const s of sessions) {
    const w = out.find((x) => x.start === monday(s.start));
    if (w) zoneTimes(s.samples || [], hrMax).forEach((z, i) => { w.zones[i] += z; });
  }
  return out;
}
// Part du temps facile (Z1-Z2), modéré (Z3) et dur (Z4-Z5), en %. null sans donnée.
export function intensitySplit(weeks) {
  const z = [0, 1, 2, 3, 4].map((i) => weeks.reduce((a, w) => a + w.zones[i], 0)), tot = z.reduce((a, b) => a + b, 0);
  if (!tot) return null;
  const pct = (v) => Math.round(v / tot * 100);
  return { easy: pct(z[0] + z[1]), moderate: pct(z[2]), hard: pct(z[3] + z[4]) };
}
