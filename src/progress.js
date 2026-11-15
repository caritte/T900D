// Statistiques de progression calculées à partir de l'historique.
import { cardioIndex } from './hr.js';

const DAY = 864e5;
export const monday = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };

// Totaux par semaine (lundi → dimanche), de la plus ancienne à la semaine en cours.
export function weekly(sessions, weeks = 12, now = Date.now()) {
  const cur = monday(now), out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cur); d.setDate(d.getDate() - 7 * i);
    out.push({ start: d.getTime(), label: `${d.getDate()}/${d.getMonth() + 1}`, km: 0, duration: 0, count: 0 });
  }
  for (const s of sessions) {
    const w = out.find((x) => x.start === monday(s.start));
    if (w) { w.km += s.distance / 1000; w.duration += s.duration; w.count++; }
  }
  return out;
}

// Indice cardio par séance (séances avec assez de FC), dans l'ordre chronologique.
export const cardioSeries = (sessions) => sessions.map((s) => ({ t: s.start, v: cardioIndex(s.samples || []) }))
  .filter((p) => p.v != null).sort((a, b) => a.t - b.t);

export function records(sessions) {
  const best = (k, list = sessions) => list.reduce((m, s) => (s[k] > (m?.[k] ?? 0) ? s : m), null);
  const wk = {};
  for (const s of sessions) wk[monday(s.start)] = (wk[monday(s.start)] || 0) + s.distance / 1000;
  const bestWeek = Object.entries(wk).sort((a, b) => b[1] - a[1])[0];
  return {
    duration: best('duration'), distance: best('distance'), ascent: best('ascent'), maxSpeed: best('maxSpeed'),
    avgSpeed: best('avgSpeed', sessions.filter((s) => s.duration >= 600)), // au moins 10 min
    week: bestWeek ? { start: +bestWeek[0], km: bestWeek[1] } : null,
  };
}
export { DAY };
