import { Treadmill } from './ftms.js';
import { DemoTreadmill } from './demo.js';
import { WorkoutRunner, stats, parseWorkout } from './workout.js';
import { PROGRAMS, CATS, LEVELS, CAT_INFO } from './programs.js';
import { drawChart, drawSession, LIMITS } from './chart.js';
import { loadWorkouts, saveWorkouts, uid } from './store.js';
import { Recorder } from './recorder.js';
import { putSession, allSessions, delSession } from './db.js';
import { beep, say, unlock } from './audio.js';

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
  const prev = live.speed;
  live = { ...live, ...d };
  // Start/Stop appuyés sur la console : le tapis passe de l'arrêt au mouvement, ou l'inverse.
  if (prev === 0 && d.speed > 0) consoleStart();
  if (prev > 0 && d.speed === 0) consolePause();
  $('m-speed').textContent = d.speed ?? '-';
  $('m-incline').textContent = d.incline ?? '-';
  $('m-hr').textContent = d.hr || '-';
}
async function ensureConnected(quiet = false) {
  if (tm?.connected) return true;
  try {
    tm ??= new (demo ? DemoTreadmill : Treadmill)({
      onLog: log, onData,
      onStatus: (op) => { if (op === 0x04) consoleStart(); if (op === 0x02) consolePause(); },
      // Le tapis continue de tourner sans liaison : la séance continue aussi, on resynchronise au retour.
      onDisconnect: () => { live.speed = undefined; setTimeout(setStatus, 50); if (run?.state === 'running') speak('Connexion au tapis perdue'); },
      onReconnect: () => { setStatus(); setTimeout(resync, 2500); },
    });
    await tm.connect();
    setStatus();
    return true;
  } catch (e) { log('Erreur : ' + e.message); if (!quiet) alert('Connexion impossible : ' + e.message); return false; }
}
const keepAwake = async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch { /* ignoré */ } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && run?.runner?.running) keepAwake(); });
$('connect').onclick = () => ensureConnected();

// ---------- Navigation ----------
// Chaque écran ouvert ajoute une entrée d'historique : le bouton Retour d'Android remonte d'un niveau.
const views = ['home', 'cat', 'prefs', 'edit', 'run', 'hist', 'sess'];
let current = 'home', popping = false;
function show(v) {
  views.forEach((x) => { $(x).hidden = x !== v; });
  if (v !== 'home' && v !== current && !popping) history.pushState(v, '');
  current = v; scrollTo(0, 0);
}
// Où mène « retour » depuis chaque écran. Renvoyer false annule (séance en cours non confirmée).
const backFns = {
  cat: () => renderHome(), prefs: () => renderHome(), hist: () => renderHome(),
  sess: () => openHist(), edit: () => backToList(), run: () => leaveRun(),
};
addEventListener('popstate', async () => {
  popping = true;
  try { if ((await backFns[current]?.()) === false) history.pushState(current, ''); } finally { popping = false; }
});
document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => history.back(); });

// ---------- Accueil et catégories ----------
let workouts = loadWorkouts();
let vma = +localStorage.vma || 11;
let cat = null, level = 0; // catégorie ouverte ('mine' = mes séances), filtre de niveau

function tile(parent, icon, name, sub, color, fn) {
  const b = document.createElement('button');
  b.className = 'tile'; b.style.setProperty('--c', color);
  b.innerHTML = `<i>${icon}</i><b>${name}</b><small>${sub}</small>`;
  b.onclick = fn; parent.appendChild(b);
}
function renderHome() {
  cat = null; show('home');
  $('tiles-train').replaceChildren(); $('tiles-more').replaceChildren();
  for (const c of CATS) {
    const n = PROGRAMS.filter((p) => p.cat === c).length;
    tile($('tiles-train'), CAT_INFO[c].icon, c, `${n} programme${n > 1 ? 's' : ''}`, CAT_INFO[c].color, () => openCat(c));
  }
  tile($('tiles-train'), '⭐', 'Mes séances', `${workouts.length} perso`, '#f472b6', () => openCat('mine'));
  tile($('tiles-train'), '🎛️', 'Course libre', 'Pilotage manuel', '#94a3b8', () => openRun(null));
  tile($('tiles-more'), '📊', 'Historique', 'Séances et stats', '#4c8dff', () => openHist());
  tile($('tiles-more'), '⚙️', 'Réglages', `VMA ${vma} km/h`, '#94a3b8', () => { show('prefs'); $('vma').textContent = vma + ' km/h'; });
  allSessions().then((all) => {
    const wk = all.filter((x) => x.start >= Date.now() - 7 * 864e5), sum = (k) => wk.reduce((a, x) => a + x[k], 0);
    $('week').innerHTML = cell(wk.length, 'séances · 7 j') + cell((sum('distance') / 1000).toFixed(1), 'km · 7 j') + cell(fmt(sum('duration')), 'temps · 7 j');
  });
}
// Carte d'une séance. builtin : programme intégré (non supprimable, « Personnaliser » en fait une copie).
function addCard(parent, w, builtin) {
  const c = document.createElement('div');
  c.className = 'card wk';
  c.innerHTML = `<div class="top"><b>${esc(w.name)}</b>${builtin ? `<span class="badge l${w.level}">${LEVELS[w.level]}</span>` : ''}</div>
    <svg></svg><div class="muted">${summary(w.steps)}${w.desc ? '<br>' + esc(w.desc) : ''}</div>
    <div class="acts"><button class="primary" data-a="run">▶ Lancer</button>
    <button class="ghost" data-a="edit">${builtin ? 'Personnaliser' : 'Modifier'}</button>${builtin ? '' : '<button class="ghost" data-a="del">🗑</button>'}</div>`;
  c.onclick = (e) => {
    const a = e.target.dataset.a;
    if (a === 'run') openRun(w);
    if (a === 'edit') openEdit(builtin ? { id: uid(), name: w.name, steps: w.steps } : w);
    if (a === 'del' && confirm(`Supprimer « ${w.name} » ?`)) { workouts = workouts.filter((x) => x !== w); saveWorkouts(workouts); renderCat(); }
  };
  parent.appendChild(c);
  drawChart(c.querySelector('svg'), w.steps, { compact: true });
}
function openCat(c) { cat = c; level = 0; renderCat(); }
function renderCat() {
  const mine = cat === 'mine';
  show('cat');
  $('c-title').textContent = mine ? '⭐ Mes séances' : `${CAT_INFO[cat].icon} ${cat}`;
  $('c-sub').textContent = mine ? 'Tes séances créées ou personnalisées.' : `${CAT_INFO[cat].sub}. Vitesses calculées pour une VMA de ${vma} km/h.`;
  $('new').hidden = !mine;
  $('c-list').replaceChildren(); $('c-levels').replaceChildren();
  if (mine) {
    workouts.forEach((w) => addCard($('c-list'), w, false));
    if (!workouts.length) $('c-list').innerHTML = '<p class="muted">Aucune séance perso. Crée-en une, ou personnalise un programme.</p>';
    return;
  }
  const list = PROGRAMS.filter((p) => p.cat === cat), levels = [...new Set(list.map((p) => p.level))];
  if (levels.length > 1) for (const l of [0, ...levels]) {
    const b = document.createElement('button');
    b.textContent = l ? LEVELS[l] : 'Tous'; b.classList.toggle('on', l === level);
    b.onclick = () => { level = l; renderCat(); };
    $('c-levels').appendChild(b);
  }
  list.filter((p) => !level || p.level === level).forEach((p) => addCard($('c-list'), { ...p, steps: parseWorkout(p.text, vma) }, true));
}
const backToList = () => (cat ? renderCat() : renderHome());
$('prefs').addEventListener('click', (e) => {
  const d = e.target.dataset.v; if (!d) return;
  vma = clamp(vma + +d, 7, 22); localStorage.vma = vma; $('vma').textContent = vma + ' km/h';
});
$('new').onclick = () => openEdit(null);
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
    saveWorkouts(workouts); alert('Import terminé');
  } catch { alert('Fichier invalide'); }
};

// ---------- Éditeur ----------
let ed;
function openEdit(w) {
  ed = structuredClone(w ?? { id: uid(), name: '', steps: [{ duration: 300, speed: 6, incline: 0, label: '' }] });
  ed = { id: ed.id, name: ed.name, steps: ed.steps, sel: 0 };
  $('e-name').value = ed.name; show('edit'); renderEdit();
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
$('e-save').onclick = () => {
  ed.name = $('e-name').value.trim() || 'Séance du ' + new Date().toLocaleDateString('fr-FR');
  const w = { id: ed.id, name: ed.name, steps: ed.steps };
  const i = workouts.findIndex((x) => x.id === w.id);
  i >= 0 ? workouts[i] = w : workouts.push(w);
  saveWorkouts(workouts); cat = 'mine'; history.back();
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
  $('r-info').textContent = (w ? summary(w.steps) + ' · ' : '') + 'Appuie sur Start du tapis ou sur Démarrer.';
  setBtns('idle'); $('r-now').hidden = true; show('run'); drawRun(); showRec();
  unlock(); // le clic qui ouvre cet écran autorise le son, même si le départ vient du tapis
  ensureConnected(true).then((ok) => ok && keepAwake());
}
// Départ et pause déclenchés depuis la console du tapis (écran Course ouvert uniquement).
const armed = () => run && !$('run').hidden;
function consoleStart() { if (armed() && run.state !== 'running') startRun(false); }
function consolePause() { if (armed() && run.state === 'running') pauseRun(false); }
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
  $('r-now').hidden = false; $('r-info').textContent = '';
  $('r-step').textContent = `Étape ${s.idx + 1}/${run.w.steps.length}${s.step.label ? ' · ' + s.step.label : ''} · ${s.step.speed} km/h · ${s.step.incline} %`;
  $('r-remain').textContent = fmt(Math.ceil(s.remaining));
  $('r-next').textContent = s.next ? `${s.next.speed} km/h · ${s.next.incline} %` : 'Fin de séance';
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
  wake?.release?.(); setBtns('idle'); $('r-now').hidden = true;
  if (rec && rec.t > 10) await putSession(rec.summary(completed));
  drawRun();
  $('r-info').textContent = rec && rec.t > 10
    ? `${completed ? 'Séance terminée 🎉' : 'Séance arrêtée'} · ${fmt(rec.t)} · ${(rec.dist / 1000).toFixed(2)} km — enregistrée dans l'historique`
    : 'Séance trop courte, non enregistrée';
}
// fromApp : true si le bouton de l'appli est utilisé (il faut alors commander le tapis),
// false si le tapis a déjà démarré / s'est déjà arrêté de lui-même.
async function startRun(fromApp) {
  if (run.state === 'running' || run.busy) return;
  run.busy = true;
  try {
    if (fromApp && !(await ensureConnected())) return;
    bip(660, 120);
    if (run.state === 'idle') {
      run.rec = new Recorder(run.w?.name ?? 'Course libre');
      if (run.w) run.runner = new WorkoutRunner(run.w.steps, tm, {
        onTick, onDone: () => { tm.stop(); speak('Séance terminée, bravo'); finishRun(true); },
      });
      else speak('C\'est parti');
    }
    const resumed = run.state === 'paused', st = run.runner?.step;
    if (fromApp) await tm.start();
    keepAwake(); setBtns('running'); run.runner?.start();
    // Après un arrêt, le tapis repart à sa vitesse mini : on renvoie les consignes de l'étape.
    if (resumed && st) { tm.setSpeed(st.speed); tm.setIncline(st.incline); }
  } finally { run.busy = false; }
}
function pauseRun(fromApp) {
  run.runner?.pause();
  if (fromApp) tm.pause(); else speak('Pause');
  setBtns('paused');
}
$('r-start').onclick = () => startRun(true);
$('r-pause').onclick = () => pauseRun(true);
$('r-skip').onclick = () => run.runner?.skip();
$('r-stop').onclick = () => { tm.stop(); finishRun(!run.w); };
async function leaveRun() {
  if (run.state !== 'idle') {
    if (!confirm('Arrêter la séance en cours ?')) return false;
    tm.stop(); await finishRun(!run.w);
  }
  backToList();
}
$('adj').addEventListener('click', (e) => {
  const d = e.target.dataset.r; if (!d || !tm?.connected) return;
  const [k, v] = d.split(':'), lim = LIMITS[k];
  const val = clamp(+((live[k] ?? 0) + +v).toFixed(1), k === 'speed' ? lim.min : 0, lim.max);
  k === 'speed' ? tm.setSpeed(val) : tm.setIncline(val);
});

// ---------- Historique ----------
let sessions = [], sess;
function cell(v, l, cls = '') { return `<div><b class="${cls}">${v}</b><small>${l}</small></div>`; }
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
function openSess(x) {
  sess = x; show('sess');
  $('s-title').textContent = x.name;
  $('s-date').textContent = new Date(x.start).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) + (x.completed ? '' : ' · arrêtée avant la fin');
  drawSession($('chart-sess'), x.samples);
  $('s-stats').innerHTML = cell(fmt(x.duration), 'durée') + cell(km(x.distance), 'km') + cell(x.kcal || '-', 'kcal') +
    cell(x.avgSpeed, 'km/h moy.', 'sp') + cell(x.maxSpeed, 'km/h max', 'sp') + cell(pace(x.avgSpeed), 'allure /km') +
    cell(x.ascent, 'm D+', 'in') + cell(x.hrAvg || '-', 'bpm moy.', 'hr') + cell(x.hrMax || '-', 'bpm max', 'hr');
}
$('s-del').onclick = async () => { if (confirm('Supprimer cette séance de l\'historique ?')) { await delSession(sess.id); history.back(); } };

renderHome(); setStatus();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
