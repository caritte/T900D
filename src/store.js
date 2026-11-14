// Données de l'utilisateur du téléphone (localStorage). Les séances réalisées sont dans db.js.
const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
export const uid = () => Math.random().toString(36).slice(2, 9);

// L'appli a brièvement géré plusieurs profils : les données restent rangées sous l'identifiant
// du profil qui était actif sur ce téléphone (ou sous LEGACY_USER s'il n'y en avait pas).
export const LEGACY_USER = 'jerome';
const cur = localStorage.user || LEGACY_USER;
export const currentUser = () => cur;
for (const k of ['workouts', 'vma']) { // données d'avant les profils
  const v = localStorage.getItem(k);
  if (v != null && localStorage.getItem(`${k}:${cur}`) == null) { localStorage.setItem(`${k}:${cur}`, v); localStorage.removeItem(k); }
}

export const loadWorkouts = () => get(`workouts:${cur}`, []).filter((w) => Array.isArray(w.steps));
export const saveWorkouts = (l) => set(`workouts:${cur}`, l);
export const loadVma = () => +localStorage[`vma:${cur}`] || 11;
export const saveVma = (v) => { localStorage[`vma:${cur}`] = v; };
