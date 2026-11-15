// Plan guidé : propose la prochaine séance selon le niveau, les séances déjà validées,
// et éventuellement un objectif de course (distance + date).
import { PROGRAMS, CATS } from './programs.js';

const twice = (ids) => ids.flatMap((id) => [id, id]);
// intro : suite parcourue une fois ; loop : semaine type répétée ensuite.
export const PLANS = {
  1: { name: 'Remise en forme', intro: twice(['rf1', 'rf2', 'rf3', 'rf4', 'rf5', 'rf6', 'rf7']), loop: ['en1', 'fr1', 'en1', 'ca1', 'en1', 'co1', 'fr2'] },
  2: { name: 'Progression intermédiaire', intro: [], loop: ['en2', 'fr4', 'en3', 'ca3', 'en2', 'co2', 'fr3', 'ca2', 'en2', 'fr5', 'ca4', 'co3'] },
  3: { name: 'Progression confirmé', intro: [], loop: ['en4', 'fr6', 'en2', 'ca5', 'en5', 'co4', 'fr7', 'ca3'] },
};
const INTENSE = ['Cardio', 'Fractionné', 'Côtes', 'Test'];
const byId = (id) => PROGRAMS.find((p) => p.id === id);
const DAY = 864e5;

// ---------- Objectif de course ----------
// pace : fraction de la VMA tenue sur la distance. reps : [répétitions, mètres] de la séance « allure course » par niveau.
export const GOALS = {
  5: { name: '5 km', pace: 0.93, reps: { 1: [3, 800], 2: [5, 1000], 3: [6, 1000] }, week: ['F', 'E', 'P'] },
  10: { name: '10 km', pace: 0.88, reps: { 1: [3, 1000], 2: [3, 2000], 3: [4, 2000] }, week: ['S', 'E', 'P'] },
  21.1: { name: 'Semi-marathon', pace: 0.80, reps: { 1: [2, 2000], 2: [2, 4000], 3: [3, 4000] }, week: ['S', 'L', 'P'] },
};
// Séances types par niveau : E endurance, L longue, F fractionné court, S seuil.
const KIND = {
  E: { 1: 'en1', 2: 'en2', 3: 'en2' }, L: { 1: 'en2', 2: 'en4', 3: 'en5' },
  F: { 1: 'fr2', 2: 'fr3', 3: 'fr7' }, S: { 1: 'ca1', 2: 'ca3', 3: 'ca5' },
};
const BASE = ['E', 'F', 'L'], TAPER = ['en1', 'fr1'];

// Séance « allure course » : répétitions en distance à l'allure visée.
function paceSession(goal, level) {
  const g = GOALS[goal.km], [n, m] = g.reps[level], pct = Math.round(g.pace * 100);
  return {
    id: `goal-${goal.km}-${level}`, cat: CATS[2], level, name: `Allure ${g.name} · ${n} × ${m} m`,
    desc: `Répétitions à ton allure de course visée (${pct} % de la VMA).`,
    text: `10:00 @ 60% / 1 Échauffement\nrepeat ${n} {\n${m}m @ ${pct}% / 1 Allure course\n2:00 @ 55% / 0 Récup\n}\n5:00 @ 55% / 0 Retour au calme`,
  };
}
export const goalActive = (state, now = Date.now()) => !!(state?.goal && GOALS[state.goal.km] && now < state.goal.date + DAY);
// Allure et temps visés pour une VMA donnée.
export function goalTarget(goal, vma) {
  const kmh = GOALS[goal.km].pace * vma;
  return { kmh: +kmh.toFixed(1), seconds: Math.round(goal.km / kmh * 3600) };
}

// Ce que propose le plan aujourd'hui : { program, progress } ; program est null un jour de repos imposé.
// state : { level, idx, goal?: { km, date, created } }
export function planToday(state, now = Date.now()) {
  const pl = PLANS[state?.level];
  if (!pl) return null;
  const i = state.idx || 0;
  if (goalActive(state, now)) {
    const { km, date, created } = state.goal, g = GOALS[km], left = Math.ceil((date - now) / DAY);
    const head = `Objectif ${g.name} · ${left > 0 ? 'J-' + left : 'jour J'}`;
    if (left <= 1) return { program: null, progress: head, rest: left <= 0 ? 'C\'est le jour de la course. Bonne course !' : 'Veille de course : repos complet.' };
    if (left <= 7) return { program: byId(TAPER[i % TAPER.length]), progress: `${head} · semaine d'affûtage` };
    const base = (now - created) / (date - created) < 0.4, k = (base ? BASE : g.week)[i % 3];
    return { program: k === 'P' ? paceSession(state.goal, state.level) : byId(KIND[k][state.level]), progress: `${head} · phase ${base ? 'de base' : 'spécifique'}` };
  }
  const { intro, loop } = pl;
  return i < intro.length
    ? { program: byId(intro[i]), progress: `Cycle de reprise · séance ${i + 1}/${intro.length}` }
    : { program: byId(loop[(i - intro.length) % loop.length]), progress: `Semaine type · séance ${(i - intro.length) % loop.length + 1}/${loop.length}` };
}
// Une séance du plan terminée en entier fait avancer d'un cran.
export const advance = (state, programId, now = Date.now()) =>
  (planToday(state, now)?.program?.id === programId ? { ...state, idx: (state.idx || 0) + 1 } : state);

// Conseil de récupération avant la séance proposée, ou null.
export function advice(sessions, program, now = Date.now()) {
  const h = (s) => (now - (s.start + s.duration * 1000)) / 36e5;
  const recent = sessions.filter((s) => s.duration >= 600);
  if (recent.some((s) => h(s) < 16)) return 'Tu t\'es entraîné il y a moins de 16 heures : une journée de repos est conseillée.';
  const hard = (s) => INTENSE.includes(byId(s.programId)?.cat) || String(s.programId).startsWith('goal-');
  if (INTENSE.includes(program.cat) && recent.some((s) => hard(s) && h(s) < 40)) return 'Dernière séance intense il y a moins de 2 jours : attends demain, ou fais un footing facile à la place.';
  return null;
}
