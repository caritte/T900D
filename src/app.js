import { Treadmill } from './ftms.js';
import { DemoTreadmill } from './demo.js';
import { WorkoutRunner, stats } from './workout.js';
import { drawChart, LIMITS } from './chart.js';
import { loadWorkouts, saveWorkouts, loadHistory, addHistory, uid } from './store.js';

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
  $('state').textContent = on ? tm.device.name : 'déconnecté';
  $('connect').hidden = !!on;
};
function onData(d) {
  live = { ...live, ...d };
  $('m-speed').textContent = d.speed ?? '-';
  $('m-incline').textContent = d.incline ?? '-';
  $('m-dist').textContent = d.distance ?? '-';
  $('m-time').textContent = d.elapsed != null ? fmt(d.elapsed) : '-';
}
async function ensureConnected() {
  if (tm?.connected) return true;
  try {
    tm ??= new (demo ? DemoTreadmill : Treadmill)({
      onLog: log, onData,
      onDisconnect: () => { setStatus(); run?.runner?.pause(); },
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
const views = ['home', 'edit', 'run'];
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
  $('history').innerHTML = loadHistory().slice(-10).reverse()
    .map((h) => `<li>${esc(h.date)} · ${esc(h.name)} · ${fmt(h.duration)} · ${h.distance ?? '?'} m${h.completed ? '' : ' (arrêtée)'}</li>`).join('') || '<li>Aucune séance</li>';
}
$('new').onclick = () => openEdit(null);
$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(workouts, null, 1)], { type: 'application/json' }));
  a.download = 't900d-seances.json'; a.click();
};
$('import').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  try {
    const list = JSON.parse(await e.target.files[0].text());
    workouts.push(...list.filter((w) => w.name && Array.isArray(w.steps)).map((w) => ({ ...w, id: uid() })));
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
window.addEventListener('resize', () => { if (!$('edit').hidden) renderEdit(); if (!$('run').hidden) drawRun(); });
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
let run;
const setBtns = (state) => {
  $('r-start').hidden = state === 'running';
  $('r-start').textContent = state === 'paused' ? 'Reprendre' : 'Démarrer';
  for (const id of ['r-pause', 'r-skip']) $(id).hidden = state !== 'running';
  $('r-stop').hidden = state === 'idle';
};
const drawRun = () => run && drawChart($('chart-run'), run.w.steps, { cursor: run.snap?.total ?? null, selected: run.snap?.idx ?? -1 });
function openRun(w) {
  run = { w, runner: null, snap: null };
  $('r-title').textContent = w.name; $('r-info').textContent = summary(w.steps);
  setBtns('idle'); show('run'); drawRun();
}
function finishRun(completed) {
  const r = run.runner;
  if (r.total > 10) addHistory({ date: new Date().toLocaleString('fr-FR'), name: run.w.name, duration: Math.round(r.total), distance: live.distance, completed });
  run.runner = null; run.snap = null; wake?.release?.(); setBtns('idle'); drawRun();
  $('r-info').textContent = completed ? 'Séance terminée 🎉' : 'Séance arrêtée';
}
$('r-start').onclick = async () => {
  if (!(await ensureConnected())) return;
  if (!run.runner) {
    run.runner = new WorkoutRunner(run.w.steps, tm, {
      onTick: (s) => {
        run.snap = s; drawRun();
        if (s.step) $('r-info').textContent = `Étape ${s.idx + 1}/${run.w.steps.length} · ${s.step.speed} km/h / ${s.step.incline}% · reste ${fmt(s.remaining)}` +
          (s.next ? ` · ensuite ${s.next.speed} km/h / ${s.next.incline}%` : ' · dernière étape');
      },
      onDone: () => { tm.stop(); finishRun(true); },
    });
  }
  await tm.start(); keepAwake(); run.runner.start(); setBtns('running');
};
$('r-pause').onclick = () => { run.runner.pause(); tm.pause(); setBtns('paused'); };
$('r-skip').onclick = () => run.runner.skip();
$('r-stop').onclick = () => { tm.stop(); run.runner.pause(); finishRun(false); };
$('r-back').onclick = () => {
  if (run?.runner && !confirm('Arrêter la séance en cours ?')) return;
  if (run?.runner) { tm.stop(); run.runner.pause(); finishRun(false); }
  renderHome();
};
document.querySelector('[data-r]').parentElement.addEventListener('click', (e) => {
  const d = e.target.dataset.r; if (!d || !tm?.connected) return;
  const [k, v] = d.split(':'), lim = LIMITS[k];
  const val = clamp(+((live[k] ?? 0) + +v).toFixed(1), k === 'speed' ? lim.min : 0, lim.max);
  k === 'speed' ? tm.setSpeed(val) : tm.setIncline(val);
});

renderHome(); setStatus();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
