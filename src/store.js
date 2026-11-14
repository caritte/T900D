// Profils et données par profil (localStorage). Les séances réalisées sont dans db.js.
const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
export const uid = () => Math.random().toString(36).slice(2, 9);

// Profil qui hérite des données créées avant l'arrivée des profils.
export const LEGACY_USER = 'jerome';

export function loadUsers() {
  let users = get('users', null);
  if (!users) {
    users = [{ id: 'mel', name: 'Mel' }, { id: LEGACY_USER, name: 'Jérôme' }, { id: 'lena', name: 'Léna' }];
    set('users', users);
    for (const k of ['workouts', 'vma']) {
      const v = localStorage.getItem(k);
      if (v != null) { localStorage.setItem(`${k}:${LEGACY_USER}`, v); localStorage.removeItem(k); }
    }
  }
  return users;
}
export const saveUsers = (l) => set('users', l);

let cur = localStorage.user || null;
export const currentUser = () => cur;
export const setCurrentUser = (id) => { cur = id; localStorage.user = id; };

export const loadWorkouts = () => get(`workouts:${cur}`, []).filter((w) => Array.isArray(w.steps));
export const saveWorkouts = (l) => set(`workouts:${cur}`, l);
export const loadVma = () => +localStorage[`vma:${cur}`] || 11;
export const saveVma = (v) => { localStorage[`vma:${cur}`] = v; };
export const dropUserData = (id) => { for (const k of ['workouts', 'vma']) localStorage.removeItem(`${k}:${id}`); };
