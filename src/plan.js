// Plan guidé : propose la prochaine séance selon le niveau choisi et les séances déjà validées.
import { PROGRAMS } from './programs.js';

const twice = (ids) => ids.flatMap((id) => [id, id]);
// intro : suite parcourue une fois ; loop : semaine type répétée ensuite.
export const PLANS = {
  1: { name: 'Remise en forme', intro: twice(['rf1', 'rf2', 'rf3', 'rf4', 'rf5', 'rf6', 'rf7']), loop: ['en1', 'fr1', 'en1', 'ca1', 'en1', 'co1', 'fr2'] },
  2: { name: 'Progression intermédiaire', intro: [], loop: ['en2', 'fr4', 'en3', 'ca3', 'en2', 'co2', 'fr3', 'ca2', 'en2', 'fr5', 'ca4', 'co3'] },
  3: { name: 'Progression confirmé', intro: [], loop: ['en4', 'fr6', 'en2', 'ca5', 'en5', 'co4', 'fr7', 'ca3'] },
};
const INTENSE = ['Cardio', 'Fractionné', 'Côtes', 'Test'];
const byId = (id) => PROGRAMS.find((p) => p.id === id);

// state : { level, idx }
export function planProgram(state) {
  const pl = PLANS[state?.level];
  if (!pl) return null;
  const { intro, loop } = pl, i = state.idx || 0;
  return byId(i < intro.length ? intro[i] : loop[(i - intro.length) % loop.length]);
}
export function planProgress(state) {
  const { intro, loop } = PLANS[state.level], i = state.idx || 0;
  return i < intro.length ? `Cycle de reprise · séance ${i + 1}/${intro.length}`
    : `Semaine type · séance ${(i - intro.length) % loop.length + 1}/${loop.length}`;
}
// Une séance du plan terminée en entier fait avancer d'un cran.
export const advance = (state, programId) =>
  (planProgram(state)?.id === programId ? { ...state, idx: (state.idx || 0) + 1 } : state);

// Conseil de récupération avant la séance proposée, ou null.
export function advice(sessions, program, now = Date.now()) {
  const h = (s) => (now - (s.start + s.duration * 1000)) / 36e5;
  const recent = sessions.filter((s) => s.duration >= 600);
  if (recent.some((s) => h(s) < 16)) return 'Tu t\'es entraîné il y a moins de 16 heures : une journée de repos est conseillée.';
  const hard = (s) => INTENSE.includes(byId(s.programId)?.cat);
  if (INTENSE.includes(program.cat) && recent.some((s) => hard(s) && h(s) < 40)) return 'Dernière séance intense il y a moins de 2 jours : attends demain, ou fais un footing facile à la place.';
  return null;
}
