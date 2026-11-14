// Bips (Web Audio) et annonces vocales (synthèse du navigateur).
let ctx;
// À appeler dans un geste utilisateur : autorise le son pour la suite (démarrage depuis le tapis).
export function unlock() { try { ctx ??= new AudioContext(); ctx.resume(); } catch { /* indisponible */ } }
export function beep(freq = 880, ms = 150) {
  try {
    ctx ??= new AudioContext(); ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.frequency.value = freq; o.connect(g).connect(ctx.destination);
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.start(t); o.stop(t + ms / 1000);
  } catch { /* audio indisponible */ }
}
export function say(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR';
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
