import { Treadmill } from './ftms.js';
import { DemoTreadmill } from './demo.js';
import { WorkoutRunner, stats } from './workout.js';
import { drawChart, drawSession, LIMITS } from './chart.js';
import { loadWorkouts, saveWorkouts, uid } from './store.js';
import { Recorder } from './recorder.js';
import { putSession, allSessions, delSession } from './db.js';
import { beep, say } from './audio.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const log = (m) => { const l = $('log'); l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; };
const summary = (steps) => { const s = stats(steps); return `${fmt(s.duration)} · ${s.km.toFixed(1)} km · D+ ${Math.round(s.ascent)} m`; };

// ---------- Tapis ----------
const demo = new URLSearchParams(location.search).has('demo');
let tm = null, live = {}, wake = null;

const setStatus = () => {
  const on = tm?.connected;
  $('dot').classList.toggle('on', !!on);
  $('state').textContent = on ? tm.device.name : tm?.reconnecting ? 'reconnexion…' : 'déconnecté';
  $('connect').hidden = !!on;
};
function onData(d) {
  live = { ...live, ...d };
  $('m-speed').textContent = d.speed ?? '-';
  $('m-incline').textContent = d.incline ?? '-';
  $('m-hr').textContent = d.hr || '-';
}
async function ensureConnected() {
  if (tm?.connected) return true;
  try {
    tm ??= new (demo ? DemoTreadmill : Treadmill)({
      onLog: log, onData,
      // Le tapis continue de tourner sans liaison : la séance continue aussi, on resynchronise au retour.
      onDisconnect: () => { live.speed = undefined; setTimeout(setStatus, 50); if (run?.state === 'running') speak('Connexion au tapis perdue'); },
      onReconnect: () => { setStatus(); setTimeout(resync, 2500); },
    });
    await tm.connect();
    setStatus();
    return true;
  } catch (e) { log('Erreur : ' + e.message); alert('Connexion impossible : ' + e.message); return false; }
}
const keepAwake = async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch { /* ignoré */ } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && run?.runner?.running) keepAwake(); });
$('connect').onclick = ensureConnected;

// ---------- Navigation ----------
const views = ['home', 'edit', 'run', 'hist', 'sess'];
const show = (v) => views.forEach((x) => { $(x).hidden = x !== v; });

// ---------- Accueil ----------
let workouts = loadWorkouts();
function renderHome() {
  show('home');
  $('list').replaceChildren();
  workouts.forEach((w) => {
    const c = document.createElement('div');
    c.className = 'card wk';
    c.innerHTML = `<div class="top"><b>${esc(w.name)}</b><span class="muted">${summary(w.steps)}</span></div>
      <svg></svg><div class="acts"><button class="primary" data-a="run">▶ Lancer</button>
      <button class="ghost" data-a="edit">Modifier</button><button class="ghost" data-a="del">🗑</button></div>`;
    c.onclick = (e) => {
      const a = e.target.dataset.a;
      if (a === 'run') openRun(w);
      if (a === 'edit') openEdit(w);
      if (a === 'del' && confirm(`Supprimer « ${w.name} » ?`)) { workouts = workouts.filter((x) => x !== w); saveWorkouts(workouts); renderHome(); }
    };
    $('list').appendChild(c);
    drawChart(c.querySelector('svg'), w.steps, { compact: true });
  });
}
$('new').onclick = () => openEdit(null);
$('free').onclick = () => openRun(null);
$('hist-open').onclick = () => openHist();
$('export').onclick = async () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ workouts, sessions: await allSessions() })], { type: 'application/json' }));
  a.download = 't900d-sauvegarde.json'; a.click();
};
$('import').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    const list = Array.isArray(data) ? data : data.workouts ?? [];
    workouts.push(...list.filter((w) => w.name && Array.isArray(w.steps)).map((w) => ({ ...w, id: uid() })));
    for (const x of data.sessions ?? []) if (x.id && x.start) await putSession(x);
    saveWorkouts(workouts); renderHome();
  } catch { alert('Fichier invalide'); }
};

// ---------- Éditeur ----------
let ed;
function openEdit(w) {
  ed = structuredClone(w ?? { id: uid(), name: '', steps: [{ duration: 300, speed: 6, incline: 0, label: '' }] });
  ed.sel = 0; $('e-name').value = ed.name; show('edit'); renderEdit();
}
function renderEdit() {
  drawChart($('chart-edit'), ed.steps, {
    selected: ed.sel, editable: true,
    onSelect: (i) => { ed.sel = i; renderEdit(); },
    onChange: (i, p) => { Object.assign(ed.steps[i], p); renderEdit(); },
  });
  const s = ed.steps[ed.sel];
  $('e-title').textContent = `Étape ${ed.sel + 1}/${ed.steps.length}`;
  $('e-dur').textContent = fmt(s.duration);
  $('e-spd').textContent = s.speed + ' km/h';
  $('e-inc').textContent = s.incline + ' %';
  $('e-stats').textContent = summary(ed.steps);
}
window.addEventListener('resize', () => { if (!$('edit').hidden) renderEdit(); if (!$('run').hidden) drawRun(); if (!$('sess').hidden) drawSession($('chart-sess'), sess.samples); });
$('edit').addEventListener('click', (e) => {
  const a = e.target.dataset.a; if (!a) return;
  const s = ed.steps[ed.sel], [k, v] = a.split(':');
  if (k === 'dur') s.duration = Math.max(10, s.duration + +v);
  else if (k === 'spd') s.speed = clamp(+(s.speed + +v).toFixed(1), LIMITS.speed.min, LIMITS.speed.max);
  else if (k === 'inc') s.incline = clamp(s.incline + +v, LIMITS.incline.min, LIMITS.incline.max);
  else if (k === 'add') { ed.steps.splice(ed.sel + 1, 0, { ...s, label: '' }); ed.sel++; }
  else if (k === 'del' && ed.steps.length > 1) { ed.steps.splice(ed.sel, 1); ed.sel = Math.min(ed.sel, ed.steps.length - 1); }
  else if (k === 'left' && ed.sel > 0) { [ed.steps[ed.sel - 1], ed.steps[ed.sel]] = [ed.steps[ed.sel], ed.steps[ed.sel - 1]]; ed.sel--; }
  else if (k === 'right' && ed.sel < ed.steps.length - 1) { [ed.steps[ed.sel + 1], ed.steps[ed.sel]] = [ed.steps[ed.sel], ed.steps[ed.sel + 1]]; ed.sel++; }
  else if (k === 'repeat') {
    const n = Math.min(ed.sel + 1, +prompt('Combien d\'étapes à répéter (en remontant depuis la sélection) ?', 2));
    const times = +prompt('Combien de fois en plus ?', 3);
    if (n >= 1 && times >= 1) {
      const block = ed.steps.slice(ed.sel + 1 - n, ed.sel + 1).map((x) => ({ ...x }));
      for (let i = 0; i < times; i++) ed.steps.splice(ed.sel + 1 + i * n, 0, ...block.map((x) => ({ ...x })));
      ed.sel += n * times;
    }
  }
  renderEdit();
});
$('e-back').onclick = renderHome;
$('e-save').onclick = () => {
  ed.name = $('e-name').value.trim() || 'Séance du ' + new Date().toLocaleDateString('fr-FR');
  const w = { id: ed.id, name: ed.name, steps: ed.steps };
  const i = workouts.findIndex((x) => x.id === w.id);
  i >= 0 ? workouts[i] = w : workouts.push(w);
  saveWorkouts(workouts); renderHome();
};

// ---------- Course ----------
// run.w = séance programmée, ou null en course libre. run.state : idle | running | paused.
let run;
const prefs = { beep: localStorage.beep !== '0', voice: localStorage.voice !== '0' };
for (const k of ['beep', 'voice']) {
  $('p-' + k).checked = prefs[k];
  $('p-' + k).onchange = (e) => { prefs[k] = e.target.checked; localStorage[k] = prefs[k] ? '1' : '0'; };
}
const bip = (f, ms) => prefs.beep && beep(f, ms);
function speak(t) { if (prefs.voice) say(t); }
const fr = (n) => String(n).replace('.', ',');
const spoken = (s) => `${fr(s.speed)} kilomètres heure, pente ${fr(s.incline)} pour cent`;
const spokenDur = (d) => [d >= 60 && `${Math.floor(d / 60)} minute${d >= 120 ? 's' : ''}`, d % 60 && `${d % 60} secondes`].filter(Boolean).join(' ');

const setBtns = (state) => {
  run.state = state;
  $('r-start').hidden = state === 'running';
  $('r-start').textContent = state === 'paused' ? 'Reprendre' : 'Démarrer';
  $('r-pause').hidden = state !== 'running';
  $('r-skip').hidden = state !== 'running' || !run.w;
  $('r-stop').hidden = state === 'idle';
};
function drawRun() {
  if (!run) return;
  if (run.w) drawChart($('chart-run'), run.w.steps, { cursor: run.snap?.total ?? null, selected: run.snap?.idx ?? -1 });
  else drawSession($('chart-run'), run.rec?.samples ?? []);
}
function showRec() {
  const r = run?.rec;
  $('m-dist').textContent = r ? (r.dist / 1000).toFixed(2) : '-';
  $('m-time').textContent = r ? fmt(r.t) : '-';
  $('m-kcal').textContent = r ? r.kcal : '-';
}
function openRun(w) {
  run = { w, runner: null, snap: null, rec: null, cue: {} };
  $('r-title').textContent = w?.name ?? 'Course libre';
  $('r-info').textContent = w ? summary(w.steps) : 'Pilote le tapis avec les boutons ci-dessous.';
  setBtns('idle'); show('run'); drawRun(); showRec();
}
// Enregistrement : une mesure par seconde tant que la séance tourne.
setInterval(() => {
  if (run?.state !== 'running' || !run.rec) return;
  run.rec.tick(live); showRec();
  if (!run.w) drawRun();
}, 1000);

function onTick(s) {
  run.snap = s; drawRun();
  if (!s.step) return;
  if (run.cue.idx !== s.idx) { // changement d'étape
    if (run.cue.idx != null) bip(1320, 400);
    speak(`${s.step.label ? s.step.label + '. ' : ''}${spoken(s.step)}, pendant ${spokenDur(s.step.duration)}`);
    run.cue = { idx: s.idx, sec: null };
  }
  const sec = Math.ceil(s.remaining);
  if (sec !== run.cue.sec) {
    run.cue.sec = sec;
    if (sec >= 1 && sec <= 3) bip(880, 150);
    if (sec === 10 && s.step.duration >= 20) speak(s.next ? `Dans 10 secondes : ${spoken(s.next)}` : 'Fin de séance dans 10 secondes');
  }
  $('r-info').textContent = `Étape ${s.idx + 1}/${run.w.steps.length} · ${s.step.speed} km/h / ${s.step.incline}% · reste ${fmt(s.remaining)}` +
    (s.next ? ` · ensuite ${s.next.speed} km/h / ${s.next.incline}%` : ' · dernière étape');
}
// Après une reconnexion : si le tapis tourne encore on renvoie les consignes, sinon on met en pause.
function resync() {
  if (run?.state !== 'running') return;
  if (live.speed > 0) {
    const st = run.runner?.step;
    if (st) { tm.setSpeed(st.speed); tm.setIncline(st.incline); }
    speak('Tapis reconnecté');
  } else { run.runner?.pause(); setBtns('paused'); speak('Tapis à l\'arrêt, séance en pause'); }
}
async function finishRun(completed) {
  const rec = run.rec;
  run.runner?.pause(); run.runner = null; run.snap = null; run.rec = null; run.cue = {};
  wake?.release?.(); setBtns('idle');
  if (rec && rec.t > 10) await putSession(rec.summary(completed));
  drawRun();
  $('r-info').textContent = rec && rec.t > 10
    ? `${completed ? 'Séance terminée 🎉' : 'Séance arrêtée'} · ${fmt(rec.t)} · ${(rec.dist / 1000).toFixed(2)} km — enregistrée dans l'historique`
    : 'Séance trop courte, non enregistrée';
}
$('r-start').onclick = async () => {
  if (!(await ensureConnected())) return;
  bip(660, 120); // débloque aussi l'audio (geste utilisateur requis)
  if (run.state === 'idle') {
    run.rec = new Recorder(run.w?.name ?? 'Course libre');
    if (run.w) run.runner = new WorkoutRunner(run.w.steps, tm, {
      onTick, onDone: () => { tm.stop(); speak('Séance terminée, bravo'); finishRun(true); },
    });
    else speak('C\'est parti');
  }
  await tm.start(); keepAwake(); setBtns('running'); run.runner?.start();
};
$('r-pause').onclick = () => { run.runner?.pause(); tm.pause(); setBtns('paused'); };
$('r-skip').onclick = () => run.runner?.skip();
$('r-stop').onclick = () => { tm.stop(); finishRun(!run.w); };
$('r-back').onclick = async () => {
  if (run.state !== 'idle') {
    if (!confirm('Arrêter la séance en cours ?')) return;
    tm.stop(); await finishRun(!run.w);
  }
  renderHome();
};
document.querySelector('[data-r]').parentElement.addEventListener('click', (e) => {
  const d = e.target.dataset.r; if (!d || !tm?.connected) return;
  const [k, v] = d.split(':'), lim = LIMITS[k];
  const val = clamp(+((live[k] ?? 0) + +v).toFixed(1), k === 'speed' ? lim.min : 0, lim.max);
  k === 'speed' ? tm.setSpeed(val) : tm.setIncline(val);
});

// ---------- Historique ----------
let sessions = [], sess;
const cell = (v, l, cls = '') => `<div class="${cls}"><b>${v}</b><small>${l}</small></div>`;
const km = (m) => (m / 1000).toFixed(2);
const pace = (v) => v > 0 ? fmt(3600 / v) : '-';
async function openHist() {
  sessions = await allSessions();
  const names = [...new Set(sessions.map((x) => x.name))].sort();
  const cur = $('h-name').value;
  $('h-name').innerHTML = '<option value="">Toutes</option>' + names.map((n) => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('');
  show('hist'); renderHist();
}
function renderHist() {
  const days = +$('h-period').value, name = $('h-name').value, sort = $('h-sort').value;
  const since = days ? Date.now() - days * 864e5 : 0;
  const list = sessions.filter((x) => x.start >= since && (!name || x.name === name)).sort((a, b) => b[sort] - a[sort]);
  const sum = (k) => list.reduce((a, x) => a + (x[k] || 0), 0);
  $('h-totals').innerHTML = cell(list.length, 'séances') + cell(km(sum('distance')), 'km') + cell(fmt(sum('duration')), 'temps') +
    cell(Math.round(sum('ascent')), 'm D+') + cell(sum('kcal'), 'kcal') + cell(sum('duration') ? (sum('distance') / sum('duration') * 3.6).toFixed(1) : '-', 'km/h moy.');
  $('h-list').replaceChildren();
  let month = '';
  for (const x of list) {
    const d = new Date(x.start), mo = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (sort === 'start' && mo !== month) { month = mo; $('h-list').insertAdjacentHTML('beforeend', `<div class="month">${mo}</div>`); }
    const c = document.createElement('div');
    c.className = 'card se';
    c.innerHTML = `<span><b>${esc(x.name)}</b>${x.completed ? '' : ' <span class="muted">(arrêtée)</span>'}<br>
      <span class="muted">${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></span>
      <span style="text-align:right">${fmt(x.duration)} · ${km(x.distance)} km<br><span class="muted">${x.avgSpeed} km/h${x.hrAvg ? ' · ♥ ' + x.hrAvg : ''}</span></span>`;
    c.onclick = () => openSess(x);
    $('h-list').appendChild(c);
  }
  if (!list.length) $('h-list').innerHTML = '<p class="muted">Aucune séance sur cette période.</p>';
}
for (const id of ['h-period', 'h-name', 'h-sort']) $(id).onchange = renderHist;
$('h-back').onclick = renderHome;
function openSess(x) {
  sess = x; show('sess');
  $('s-title').textContent = x.name;
  $('s-date').textContent = new Date(x.start).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) + (x.completed ? '' : ' · arrêtée avant la fin');
  drawSession($('chart-sess'), x.samples);
  $('s-stats').innerHTML = cell(fmt(x.duration), 'durée') + cell(km(x.distance), 'km') + cell(x.kcal || '-', 'kcal') +
    cell(x.avgSpeed, 'km/h moy.', 'sp') + cell(x.maxSpeed, 'km/h max', 'sp') + cell(pace(x.avgSpeed), 'allure /km') +
    cell(x.ascent, 'm D+', 'in') + cell(x.hrAvg || '-', 'bpm moy.', 'hr') + cell(x.hrMax || '-', 'bpm max', 'hr');
}
$('s-back').onclick = openHist;
$('s-del').onclick = async () => { if (confirm('Supprimer cette séance de l\'historique ?')) { await delSession(sess.id); openHist(); } };

renderHome(); setStatus();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
