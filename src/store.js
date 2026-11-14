import { parseWorkout } from './workout.js';

const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
export const uid = () => Math.random().toString(36).slice(2, 9);

const SAMPLES = [
  ['Intervalles 30 min', '5:00 @ 6 / 1 Échauffement\nrepeat 6 {\n 1:00 @ 11 / 1 Vite\n 2:00 @ 6 / 0 Récup\n}\n5:00 @ 5 Retour au calme'],
  ['Côtes', '5:00 @ 6 / 0 Échauffement\nrepeat 4 {\n 2:00 @ 8 / 6 Montée\n 1:00 @ 5 / 0 Récup\n}\n3:00 @ 5 Retour au calme'],
  ['Test extrêmes', '0:30 @ 6 / 0\n0:20 @ 12 / 5\n0:20 @ 18 / 10\n0:30 @ 6 / 0'],
];

export function loadWorkouts() {
  let list = get('workouts', null);
  if (!list) list = SAMPLES.map(([name, text]) => ({ id: uid(), name, steps: parseWorkout(text) }));
  // Migration de la v1 (séances stockées en texte)
  list = list.map((w) => w.steps ? w : { id: uid(), name: w.name, steps: parseWorkout(w.text) });
  set('workouts', list);
  return list;
}
export const saveWorkouts = (l) => set('workouts', l);
export const loadHistory = () => get('history', []);
export const addHistory = (h) => { const l = loadHistory(); l.push(h); set('history', l.slice(-100)); };
