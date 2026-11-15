// Zones de fréquence cardiaque, en % de la FC max.
export const ZONES = [
  { name: 'Z1', label: 'Récupération', from: 0 },
  { name: 'Z2', label: 'Endurance', from: 0.6 },
  { name: 'Z3', label: 'Tempo', from: 0.7 },
  { name: 'Z4', label: 'Seuil', from: 0.8 },
  { name: 'Z5', label: 'Maximum', from: 0.9 },
];
// Rampe ordinale d'une seule teinte (validée sur le fond des cartes) : plus clair = plus intense.
export const ZONE_COLORS = ['#7a4145', '#a04a4f', '#c6535a', '#ee5e64', '#ffa6a8'];

export function zoneOf(hr, hrMax) {
  if (!(hr > 0)) return -1;
  let z = 0;
  ZONES.forEach((zn, i) => { if (hr >= zn.from * hrMax) z = i; });
  return z;
}

// Temps (s) passé dans chaque zone. samples : [t, vitesse, pente, fc], un point toutes les quelques secondes.
export function zoneTimes(samples, hrMax) {
  const out = [0, 0, 0, 0, 0];
  samples.forEach((s, i) => {
    const z = zoneOf(s[3], hrMax);
    if (z >= 0) out[z] += s[0] - (i ? samples[i - 1][0] : 0);
  });
  return out;
}

// Indice cardio : vitesse moyenne pour 100 battements, sur les phases courues avec FC connue.
// Il monte quand on court plus vite à FC égale. null s'il y a moins d'une minute de données.
export function cardioIndex(samples) {
  const run = samples.filter((s) => s[3] > 0 && s[1] >= 5);
  if (run.length < 12) return null;
  const sum = (k) => run.reduce((a, s) => a + s[k], 0);
  return +(sum(1) / sum(3) * 100).toFixed(2);
}
