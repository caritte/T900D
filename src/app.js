import { Treadmill } from './ftms.js';
import { parseWorkout, WorkoutRunner } from './workout.js';

const $ = (id) => document.getElementById(id);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const log = (m) => { const l = $('log'); l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; };

// --- Connexion ---
let tm, live = {}, target = { speed: 0, incline: 0 }, wake;
tm = new Treadmill({
  onLog: log,
  onDisconnect: () => { $('state').textContent = 'déconnecté'; runner?.pause(); },
  onData: (d) => {
    live = { ...live, ...d };
    $('m-speed').textContent = d.speed ?? '-';
    $('m-incline').textContent = d.incline ?? '-';
    $('m-dist').textContent = d.distance ?? '-';
    $('m-time').textContent = d.elapsed ?? '-';
    $('m-hr').textContent = d.hr ?? '-';
  },
});
$('connect').onclick = async () => {
  try {
    await tm.connect();
    $('state').textContent = 'connecté : ' + tm.device.name;
    wake = await navigator.wakeLock?.request('screen').catch(() => null);
  } catch (e) { log('Erreur : ' + e.message); }
};

// --- Manuel ---
$('start').onclick = () => tm.start();
$('stop').onclick = () => tm.stop();
document.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => {
  const [k, d] = b.dataset.d.split(':');
  target[k] = Math.max(0, +(target[k] + +d).toFixed(1));
  k === 'speed' ? tm.setSpeed(target.speed) : tm.setIncline(target.incline);
});

// --- Séances enregistrées ---
let workouts = load('workouts', []);
const refresh = () => {
  $('saved').innerHTML = '<option value="">— nouvelle —</option>' +
    workouts.map((w, i) => `<option value="${i}">${w.name.replace(/</g, '&lt;')}</option>`).join('');
};
$('saved').onchange = () => {
  const w = workouts[$('saved').value]; if (!w) return;
  $('name').value = w.name; $('text').value = w.text;
};
$('save').onclick = () => {
  const name = $('name').value.trim() || 'Sans nom';
  const i = workouts.findIndex((w) => w.name === name);
  const w = { name, text: $('text').value };
  i >= 0 ? workouts[i] = w : workouts.push(w);
  store('workouts', workouts); refresh();
};
$('del').onclick = () => {
  const i = $('saved').value; if (i === '') return;
  workouts.splice(i, 1); store('workouts', workouts); refresh();
};
refresh();

// --- Exécution ---
let runner, startedAt;
const history = load('history', []);
const renderHistory = () => {
  $('history').innerHTML = history.slice(-20).reverse()
    .map((h) => `<li>${h.date} · ${h.name} · ${fmt(h.duration)} · ${h.distance ?? '?'} m</li>`).join('');
};
const finish = (completed) => {
  history.push({ date: new Date().toLocaleString('fr-FR'), name: $('name').value || 'Sans nom',
    duration: Math.round(runner.total), distance: live.distance, completed });
  store('history', history); renderHistory();
};

$('run').onclick = async () => {
  if (runner?.running) return;
  if (runner && runner.idx >= 0) { runner.start(); tm.start(); return; } // reprise après pause
  let steps;
  try { steps = parseWorkout($('text').value); $('err').textContent = ''; }
  catch (e) { $('err').textContent = e.message; return; }
  runner = new WorkoutRunner(steps, tm, {
    onTick: (s) => {
      $('progress').textContent = s.step
        ? `Étape ${s.idx + 1}/${steps.length} ${s.step.label} · ${s.step.speed} km/h / ${s.step.incline}% · reste ${fmt(s.remaining)} · total ${fmt(s.total)}/${fmt(s.totalDuration)}` +
          (s.next ? ` · ensuite ${s.next.speed} km/h / ${s.next.incline}%` : ' · dernière étape')
        : '';
    },
    onDone: () => { finish(true); $('progress').textContent = 'Séance terminée'; tm.stop(); },
  });
  await tm.start();
  runner.start();
};
$('pause').onclick = () => { runner?.pause(); tm.pause(); };
$('skip').onclick = () => runner?.skip();
$('end').onclick = () => { if (runner?.idx >= 0) { finish(false); runner.stop(); tm.stop(); $('progress').textContent = 'Arrêtée'; } };
renderHistory();
