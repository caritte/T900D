import { parseWorkout } from './workout.js';

const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
export const uid = () => Math.random().toString(36).slice(2, 9);

export function loadWorkouts() {
  let list = get('workouts', null);
  list ??= [];
  // Migration de la v1 (séances stockées en texte)
  list = list.map((w) => w.steps ? w : { id: uid(), name: w.name, steps: parseWorkout(w.text) });
  set('workouts', list);
  return list;
}
export const saveWorkouts = (l) => set('workouts', l);
