// Programmes intégrés. Les vitesses en % sont relatives à la VMA réglée dans l'appli ;
// les vitesses sans % sont absolues (marche, test). Syntaxe : voir workout.js.
export const CATS = ['Remise en forme', 'Endurance', 'Cardio', 'Fractionné', 'Côtes', 'Test'];
export const LEVELS = ['', 'Débutant', 'Intermédiaire', 'Confirmé'];
export const CAT_INFO = {
  'Remise en forme': { icon: '🌱', color: '#2fd27a', sub: 'Reprendre en douceur, marche et course alternées' },
  Endurance: { icon: '🏃', color: '#4c8dff', sub: 'Footings à allure facile, la base du cardio' },
  Cardio: { icon: '❤️', color: '#ff5a5f', sub: 'Allure soutenue tenue longtemps : tempo et seuil' },
  Fractionné: { icon: '⚡', color: '#ffb020', sub: 'Efforts courts et intenses proches de la VMA' },
  Côtes: { icon: '⛰️', color: '#a78bfa', sub: 'Travail en pente : puissance et souffle' },
  Test: { icon: '🧪', color: '#22d3ee', sub: 'Mesurer ta VMA pour calibrer les programmes' },
};

const p = (id, cat, level, name, desc, text) => ({ id, cat, level, name, desc, text });
const WU = (min, inc = 1) => `${min}:00 @ 60% / ${inc} Échauffement`;
const CD = (min) => `${min}:00 @ 55% / 0 Retour au calme`;
const paliers = Array.from({ length: 21 }, (_, i) => `1:00 @ ${8 + i * 0.5} / 1 Palier ${8 + i * 0.5} km/h`).join('\n');

export const PROGRAMS = [
  // --- Remise en forme : progression marche/course, à enchaîner dans l'ordre ---
  p('rf1', CATS[0], 1, 'Reprise 1 · 1′ course / 2′ marche', 'Première étape : 8 courtes courses séparées par de la marche. Tu dois pouvoir parler en courant.',
    '5:00 @ 5 Marche\nrepeat 8 {\n1:00 @ 65% Course\n2:00 @ 5.5 Marche\n}\n5:00 @ 5 Marche'),
  p('rf2', CATS[0], 1, 'Reprise 2 · 2′ course / 2′ marche', 'Quand Reprise 1 passe facilement deux fois de suite.',
    '5:00 @ 5 Marche\nrepeat 6 {\n2:00 @ 65% Course\n2:00 @ 5.5 Marche\n}\n5:00 @ 5 Marche'),
  p('rf3', CATS[0], 1, 'Reprise 3 · 3′ course / 1′30 marche', 'La course prend le dessus sur la marche.',
    '5:00 @ 5 Marche\nrepeat 6 {\n3:00 @ 65% Course\n1:30 @ 5.5 Marche\n}\n5:00 @ 5 Marche'),
  p('rf4', CATS[0], 1, 'Reprise 4 · 5′ course / 2′ marche', '4 blocs de 5 minutes de course.',
    '5:00 @ 5 Marche\nrepeat 4 {\n5:00 @ 65% Course\n2:00 @ 5.5 Marche\n}\n5:00 @ 5 Marche'),
  p('rf5', CATS[0], 1, 'Reprise 5 · 8′ course / 2′ marche', '3 blocs de 8 minutes.',
    '5:00 @ 5 Marche\nrepeat 3 {\n8:00 @ 65% Course\n2:00 @ 5.5 Marche\n}\n5:00 @ 5 Marche'),
  p('rf6', CATS[0], 1, 'Reprise 6 · 2 × 12′', 'Deux longs blocs, une seule pause marchée.',
    '5:00 @ 5 Marche\n12:00 @ 65% Course\n2:00 @ 5.5 Marche\n12:00 @ 65% Course\n5:00 @ 5 Marche'),
  p('rf7', CATS[0], 1, 'Reprise 7 · 20′ continus', 'Objectif du cycle : 20 minutes sans marcher. Ensuite, passe à Endurance.',
    '5:00 @ 5 Marche\n20:00 @ 65% Course\n5:00 @ 5 Marche'),
  p('rf8', CATS[0], 1, 'Marche active inclinée', 'Sans impact : marche rapide en pente. Idéal en récupération ou en reprise.',
    '5:00 @ 5 / 0 Marche\nrepeat 4 {\n3:00 @ 5.5 / 4 Pente\n2:00 @ 5.5 / 7 Pente forte\n1:00 @ 5 / 1 Souffle\n}\n5:00 @ 4.5 / 0 Retour au calme'),

  // --- Endurance : aisance respiratoire, base du cardio ---
  p('en1', CATS[1], 1, 'Footing 30′', 'Allure facile, respiration aisée du début à la fin.', `${WU(5)}\n20:00 @ 65% / 1 Footing\n${CD(5)}`),
  p('en2', CATS[1], 2, 'Footing 45′', 'Le footing de base de la semaine.', `${WU(5)}\n35:00 @ 68% / 1 Footing\n${CD(5)}`),
  p('en3', CATS[1], 2, 'Endurance progressive 40′', 'Chaque palier un peu plus rapide, finir en contrôle.',
    `${WU(5)}\n10:00 @ 65% / 1 Facile\n10:00 @ 70% / 1 Moyen\n10:00 @ 75% / 1 Actif\n${CD(5)}`),
  p('en4', CATS[1], 3, 'Sortie longue 60′', 'Volume à allure facile.', `${WU(10)}\n45:00 @ 68% / 1 Footing\n${CD(5)}`),
  p('en5', CATS[1], 3, 'Sortie longue vallonnée 75′', 'Longue sortie avec relances en pente douce.',
    `${WU(10)}\nrepeat 6 {\n6:00 @ 68% / 1 Plat\n3:00 @ 66% / 3 Faux plat\n1:00 @ 68% / 0 Descente\n}\n${CD(5)}`),

  // --- Cardio : allure soutenue tenue longtemps (tempo, seuil) ---
  p('ca1', CATS[2], 1, 'Cardio 3 × 5′', 'Allure soutenue mais tenable : tu peux dire quelques mots, pas une phrase.',
    `${WU(10)}\nrepeat 3 {\n5:00 @ 78% / 1 Soutenu\n2:00 @ 55% / 0 Récup\n}\n${CD(5)}`),
  p('ca2', CATS[2], 2, 'Tempo 20′', '20 minutes continues à allure tempo.', `${WU(10)}\n20:00 @ 80% / 1 Tempo\n${CD(5)}`),
  p('ca3', CATS[2], 2, 'Seuil 3 × 8′', 'Travail au seuil : difficile mais régulier.',
    `${WU(10)}\nrepeat 3 {\n8:00 @ 85% / 1 Seuil\n2:00 @ 55% / 0 Récup\n}\n${CD(5)}`),
  p('ca4', CATS[2], 2, 'Fartlek 40′', 'Jeu d\'allures : changements de rythme fréquents.',
    `${WU(10)}\nrepeat 4 {\n2:00 @ 85% / 1 Vite\n1:00 @ 65% / 1 Facile\n1:00 @ 92% / 1 Très vite\n2:00 @ 60% / 0 Récup\n}\n${CD(6)}`),
  p('ca5', CATS[2], 3, 'Seuil 2 × 15′', 'Deux longs blocs au seuil.',
    `${WU(15)}\nrepeat 2 {\n15:00 @ 85% / 1 Seuil\n3:00 @ 55% / 0 Récup\n}\n${CD(7)}`),

  // --- Fractionné : efforts courts proches de la VMA ---
  p('fr1', CATS[3], 1, 'Fractionné 1′ / 1′ × 6', 'Découverte du fractionné : 1 minute vite, 1 minute très lente.',
    `${WU(10)}\nrepeat 6 {\n1:00 @ 90% / 1 Vite\n1:00 @ 50% / 0 Récup\n}\n${CD(5)}`),
  p('fr2', CATS[3], 1, '30 / 30 · 2 × 6', 'Deux séries de 6 accélérations de 30 secondes.',
    `${WU(10)}\nrepeat 2 {\nrepeat 6 {\n0:30 @ 95% / 1 Vite\n0:30 @ 50% / 0 Récup\n}\n3:00 @ 55% / 0 Récup longue\n}\n${CD(4)}`),
  p('fr3', CATS[3], 2, '30 / 30 · 2 × 10', 'Le classique du développement de la VMA.',
    `${WU(15)}\nrepeat 2 {\nrepeat 10 {\n0:30 @ 100% / 1 VMA\n0:30 @ 55% / 0 Récup\n}\n3:00 @ 55% / 0 Récup longue\n}\n${CD(5)}`),
  p('fr4', CATS[3], 2, 'Fractionné 1′ / 1′ × 10', '10 répétitions d\'une minute.',
    `${WU(15)}\nrepeat 10 {\n1:00 @ 95% / 1 Vite\n1:00 @ 55% / 0 Récup\n}\n${CD(5)}`),
  p('fr5', CATS[3], 2, 'Pyramide 1-2-3-2-1', 'Efforts croissants puis décroissants, récupération égale à la moitié de l\'effort.',
    `${WU(15)}\n1:00 @ 95% / 1 Vite\n1:00 @ 55% / 0 Récup\n2:00 @ 92% / 1 Vite\n1:00 @ 55% / 0 Récup\n3:00 @ 90% / 1 Vite\n1:30 @ 55% / 0 Récup\n2:00 @ 92% / 1 Vite\n1:00 @ 55% / 0 Récup\n1:00 @ 95% / 1 Vite\n${CD(6)}`),
  p('fr6', CATS[3], 3, 'VMA longue 6 × 3′', 'Efforts longs à haute intensité.',
    `${WU(15)}\nrepeat 6 {\n3:00 @ 92% / 1 VMA longue\n2:00 @ 55% / 0 Récup\n}\n${CD(8)}`),
  p('fr7', CATS[3], 3, '30 / 30 · 2 × 12 à 105 %', 'Version exigeante, au-dessus de la VMA.',
    `${WU(15)}\nrepeat 2 {\nrepeat 12 {\n0:30 @ 105% / 1 Sprint\n0:30 @ 55% / 0 Récup\n}\n4:00 @ 55% / 0 Récup longue\n}\n${CD(6)}`),

  p('fr8', CATS[3], 2, '10 × 400 m', 'Dix fois 400 mètres à la VMA. Les étapes rapides se terminent à la distance, pas au temps.',
    `${WU(15)}\nrepeat 10 {\n400m @ 100% / 1 400 m\n1:30 @ 55% / 0 Récup\n}\n${CD(6)}`),
  p('fr9', CATS[3], 3, '5 × 1000 m', 'Cinq fois 1 kilomètre à allure soutenue.',
    `${WU(15)}\nrepeat 5 {\n1000m @ 92% / 1 1000 m\n2:30 @ 55% / 0 Récup\n}\n${CD(8)}`),

  // --- Côtes : puissance et cardio avec moins de vitesse ---
  p('co1', CATS[4], 1, 'Côtes douces 6 × 1′', 'Montées courtes à 5 %, récupération en marchant.',
    `${WU(10, 0)}\nrepeat 6 {\n1:00 @ 70% / 5 Montée\n2:00 @ 5.5 / 0 Marche\n}\n${CD(5)}`),
  p('co2', CATS[4], 2, 'Côtes 8 × 1′30 à 6 %', 'Montées soutenues, récupération en trottinant.',
    `${WU(12, 0)}\nrepeat 8 {\n1:30 @ 75% / 6 Montée\n1:30 @ 55% / 0 Récup\n}\n${CD(6)}`),
  p('co3', CATS[4], 2, 'Pyramide de pente', 'La pente monte par paliers jusqu\'à 10 % puis redescend, allure constante.',
    `${WU(10, 0)}\n2:00 @ 65% / 2\n2:00 @ 65% / 4\n2:00 @ 65% / 6\n2:00 @ 65% / 8\n2:00 @ 62% / 10 Sommet\n2:00 @ 65% / 8\n2:00 @ 65% / 6\n2:00 @ 65% / 4\n2:00 @ 65% / 2\n${CD(6)}`),
  p('co4', CATS[4], 3, 'Côtes 10 × 2′ à 8 %', 'Séance de force exigeante.',
    `${WU(15, 0)}\nrepeat 10 {\n2:00 @ 75% / 8 Montée\n2:00 @ 55% / 0 Récup\n}\n${CD(7)}`),

  // --- Test ---
  p('te1', CATS[5], 2, 'Test VMA par paliers', 'Vitesse +0,5 km/h chaque minute à partir de 8 km/h. Arrête quand tu ne tiens plus : ta VMA est la vitesse du dernier palier terminé. À faire reposé, en bonne santé.',
    `10:00 @ 7 / 0 Échauffement\n2:00 @ 5 / 0 Marche\n${paliers}`),
];
