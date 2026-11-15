import { Treadmill } from './ftms.js';
import { DemoTreadmill } from './demo.js';
import { WorkoutRunner, stats, parseWorkout, scaleSteps, distDuration } from './workout.js';
import { PROGRAMS, CATS, LEVELS, CAT_INFO } from './programs.js';
import { drawChart, drawSession, drawBars, drawLine, LIMITS } from './chart.js';
import { loadWorkouts, saveWorkouts, uid, currentUser, loadVma, saveVma, loadFavs, saveFavs, pref, setPref, LEGACY_USER } from './store.js';
import { ZONES, ZONE_COLORS, zoneOf, zoneTimes } from './hr.js';
import { planToday, advance, advice, goalActive, goalTarget, GOALS } from './plan.js';
import { weekly, cardioSeries, records } from './progress.js';
import { Recorder } from './recorder.js';
import { putSession, allSessions, delSession } from './db.js';
import { beep, say, unlock } from './audio.js';

// Dans l'APK Android (Capacitor), le Bluetooth, la voix, l'anti-veille et l'export passent par des plugins natifs.
const native = window.Capacitor?.isNativePlatform?.() ? await import('../native.bundle.js') : null;

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
  $('disconnect').hidden = !on && !tm?.reconnecting;
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
  const z = zoneOf(d.hr, hrMax);
  $('m-hrl').innerHTML = z < 0 ? 'bpm' : `<i class="zdot" style="background:${ZONE_COLORS[z]}"></i>bpm · ${ZONES[z].name}`;
}
async function ensureConnected(quiet = false) {
  if (tm?.connected) return true;
  try {
    tm ??= new (demo ? DemoTreadmill : native ? native.NativeTreadmill : Treadmill)({
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
const keepAwake = async () => {
  if (native) return native.keepAwake();
  try { wake = await navigator.wakeLock?.request('screen'); } catch { /* ignoré */ }
};
const allowSleep = () => (native ? native.allowSleep() : wake?.release?.());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && run?.runner?.running) keepAwake(); });
$('connect').onclick = () => ensureConnected();
$('disconnect').onclick = () => {
  if (run && run.state !== 'idle' && !confirm('Une séance est en cours. Déconnecter quand même ? Le tapis ne sera plus piloté.')) return;
  tm.disconnect(); setTimeout(setStatus, 100);
};

// ---------- Navigation ----------
// Chaque écran ouvert ajoute une entrée d'historique : le bouton Retour d'Android remonte d'un niveau.
const views = ['home', 'cat', 'prefs', 'edit', 'run', 'hist', 'sess', 'prog'];
let current = 'home', popping = false, homing = false;
function show(v) {
  views.forEach((x) => { $(x).hidden = x !== v; });
  if (v !== 'home' && v !== current && !popping) history.pushState(v, '');
  current = v; scrollTo(0, 0);
}
// Où mène « retour » depuis chaque écran. Renvoyer false annule (séance en cours non confirmée).
const backFns = {
  cat: () => renderHome(), prefs: () => renderHome(), hist: () => renderHome(), prog: () => renderHome(),
  sess: () => openHist(), edit: () => backToList(), run: () => leaveRun(),
};
addEventListener('popstate', async () => {
  popping = true;
  try { if ((await backFns[current]?.()) === false) { history.pushState(current, ''); homing = false; } } finally { popping = false; }
  // Retour à l'accueil : on remonte écran par écran jusqu'à l'accueil (une séance en cours peut l'interrompre).
  if (homing) { if (current === 'home') homing = false; else history.back(); }
});
$('logo').onclick = () => { if (current !== 'home') { homing = true; history.back(); } };
document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => history.back(); });

// ---------- Accueil et catégories ----------
let workouts = loadWorkouts(), vma = loadVma();
let favs = loadFavs(); // identifiants des programmes intégrés mis en favoris
let hrMax = pref('hrmax', 185), hrAlert = pref('hralert', 0); // hrAlert : alerte au-dessus de la zone n (0 = aucune)
let plan = pref('plan', null); // plan guidé : { level, idx } ou null
const setPlan = (p) => { plan = p; setPref('plan', p); };
const mySessions = () => allSessions(currentUser(), LEGACY_USER);
let cat = null, level = 0; // catégorie ouverte ('mine' = mes séances), filtre de niveau

function tile(parent, icon, name, sub, color, fn) {
  const b = document.createElement('button');
  b.className = 'tile'; b.style.setProperty('--c', color);
  b.innerHTML = `<i>${icon}</i><b>${name}</b><small>${sub}</small>`;
  b.onclick = fn; parent.appendChild(b);
}
function renderHome() {
  cat = null; show('home'); renderResume();
  $('tiles-train').replaceChildren(); $('tiles-more').replaceChildren();
  for (const c of CATS) {
    const n = PROGRAMS.filter((p) => p.cat === c).length;
    tile($('tiles-train'), CAT_INFO[c].icon, c, `${n} programme${n > 1 ? 's' : ''}`, CAT_INFO[c].color, () => openCat(c));
  }
  tile($('tiles-train'), '⭐', 'Mes séances', `${favs.length} favori${favs.length > 1 ? 's' : ''} · ${workouts.length} perso`, '#f472b6', () => openCat('mine'));
  tile($('tiles-train'), '🎛️', 'Course libre', 'Pilotage manuel', '#94a3b8', () => openRun(null));
  tile($('tiles-more'), '📊', 'Historique', 'Séances et stats', '#4c8dff', () => openHist());
  tile($('tiles-more'), '📈', 'Progression', 'Courbes et records', '#2fd27a', () => openProg());
  tile($('tiles-more'), '⚙️', 'Réglages', `VMA ${vma} km/h`, '#94a3b8', () => openPrefs());
  mySessions().then((all) => {
    renderToday(all);
    const wk = all.filter((x) => x.start >= Date.now() - 7 * 864e5), sum = (k) => wk.reduce((a, x) => a + x[k], 0);
    $('week').innerHTML = cell(wk.length, 'séances · 7 j') + cell((sum('distance') / 1000).toFixed(1), 'km · 7 j') + cell(fmt(sum('duration')), 'temps · 7 j');
  });
}
// Séance du jour proposée par le plan guidé.
let todayW = null;
function renderToday(all) {
  const box = $('today');
  // Accès direct au réglage de l'objectif de course, sinon caché au fond des Réglages.
  const goalBtn = `<button class="ghost" data-a="goal">🎯 ${goalActive(plan) ? 'Modifier l\'objectif' : 'Objectif de course'}</button>`;
  if (!plan?.level) {
    box.innerHTML = '<h3>Séance du jour</h3><p class="muted">Choisis ton niveau : l\'appli te proposera la prochaine séance à chaque fois.</p><div class="acts">' +
      [1, 2, 3].map((l) => `<button class="ghost" data-l="${l}">${LEVELS[l]}</button>`).join('') + `</div><div class="acts">${goalBtn}</div>`;
    return;
  }
  const { program: p, progress, rest } = planToday(plan);
  const g = goalActive(plan) ? goalTarget(plan.goal, vma) : null;
  const target = g ? `<div class="muted">Allure visée ≈ ${fr(g.kmh)} km/h (${fmt(3600 / g.kmh)} /km) · temps visé ≈ ${fmt(g.seconds)}</div>` : '';
  if (!p) { // veille ou jour de course
    todayW = null;
    box.innerHTML = `<h3>Séance du jour</h3><b>${progress}</b><div class="note">${rest}</div>${target}<div class="acts">${goalBtn}</div>`;
    return;
  }
  const note = advice(all, p);
  todayW = { ...p, steps: parseWorkout(p.text, vma) };
  box.innerHTML = `<div class="top"><h3>Séance du jour</h3><span class="badge l${p.level}">${LEVELS[p.level]}</span></div>
    <b>${CAT_INFO[p.cat].icon} ${esc(p.name)}</b><div class="muted">${progress} · ${summary(todayW.steps)}</div>${target}
    ${note ? `<div class="note">⚠ ${note}</div>` : ''}
    <div class="acts"><button class="primary" data-a="run">▶ Lancer</button><button class="ghost" data-a="skip">Passer</button>${goalBtn}</div>`;
}
// Séance interrompue (appli fermée en cours de route) : proposée à la reprise pendant 12 heures.
function renderResume() {
  const r = pref('resume', null), box = $('resume');
  box.hidden = !(r && Date.now() - r.at < 12 * 36e5);
  if (box.hidden) return;
  box.innerHTML = `<h3>Séance interrompue</h3><b>${esc(r.rec.name)}</b>
    <div class="muted">${fmt(r.rec.t)} effectuées · ${(r.rec.dist / 1000).toFixed(2)} km · le ${new Date(r.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div>
    <div class="acts"><button class="primary" data-a="go">Reprendre</button><button class="ghost" data-a="save">Enregistrer telle quelle</button><button class="ghost" data-a="drop">Abandonner</button></div>`;
}
$('resume').onclick = async (e) => {
  const a = e.target.dataset.a, r = pref('resume', null);
  if (!a || !r) return;
  if (a === 'go') return openRun(r.w, r);
  if (a === 'drop' && !confirm('Abandonner cette séance sans l\'enregistrer ?')) return;
  if (a === 'save') { await putSession({ ...Recorder.restore(r.rec).summary(false), user: currentUser(), programId: r.w?.cat ? r.w.id : undefined }); autoBackup(); }
  setPref('resume', null); renderHome();
};
$('today').onclick = (e) => {
  const d = e.target.dataset;
  if (d.l) { setPlan({ level: +d.l, idx: 0 }); renderHome(); }
  if (d.a === 'run') openRun(todayW);
  if (d.a === 'goal') { openPrefs(); $('goal-km').scrollIntoView({ block: 'center' }); $('goal-km').focus(); }
  if (d.a === 'skip') { setPlan({ ...plan, idx: plan.idx + 1 }); renderHome(); }
};
// Carte d'une séance. builtin : programme intégré (non supprimable, « Personnaliser » en fait une copie).
function addCard(parent, w, builtin) {
  const c = document.createElement('div');
  c.className = 'card wk';
  c.innerHTML = `<div class="top"><b>${esc(w.name)}</b>${builtin ? `<span class="badge l${w.level}">${LEVELS[w.level]}</span>` : ''}</div>
    <svg></svg><div class="muted">${summary(w.steps)}${w.desc ? '<br>' + esc(w.desc) : ''}</div>
    <div class="acts"><button class="primary" data-a="run">▶ Lancer</button>
    <button class="ghost" data-a="edit">${builtin ? 'Personnaliser' : 'Modifier'}</button>${builtin
      ? `<button class="ghost" data-a="fav" title="Favori">${favs.includes(w.id) ? '★' : '☆'}</button>` : '<button class="ghost" data-a="del">🗑</button>'}</div>`;
  c.onclick = (e) => {
    const a = e.target.dataset.a;
    if (a === 'run') openRun(w);
    if (a === 'edit') openEdit(builtin ? { id: uid(), name: w.name, steps: w.steps } : w);
    if (a === 'fav') { favs = favs.includes(w.id) ? favs.filter((x) => x !== w.id) : [...favs, w.id]; saveFavs(favs); renderCat(); }
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
  $('c-sub').textContent = mine ? 'Tes programmes favoris (☆ sur un programme) et les séances que tu as créées.' : `${CAT_INFO[cat].sub}. Vitesses calculées pour une VMA de ${vma} km/h.`;
  $('new').hidden = !mine;
  $('c-list').replaceChildren(); $('c-levels').replaceChildren();
  if (mine) {
    const favProgs = PROGRAMS.filter((p) => favs.includes(p.id));
    const title = (t) => $('c-list').insertAdjacentHTML('beforeend', `<div class="month">${t}</div>`);
    if (favProgs.length) title('Favoris');
    favProgs.forEach((p) => addCard($('c-list'), { ...p, steps: parseWorkout(p.text, vma) }, true));
    if (workouts.length) title('Mes créations');
    workouts.forEach((w) => addCard($('c-list'), w, false));
    if (!favProgs.length && !workouts.length) $('c-list').innerHTML = '<p class="muted">Rien ici pour l\'instant. Touche ☆ sur un programme pour l\'ajouter en favori, ou crée une séance avec « + Nouvelle ».</p>';
    return;
  }
  const list = PROGRAMS.filter((p) => p.cat === cat).sort((a, b) => a.level - b.level), levels = [...new Set(list.map((p) => p.level))];
  if (levels.length > 1) for (const l of [0, ...levels]) {
    const b = document.createElement('button');
    b.textContent = l ? LEVELS[l] : 'Tous'; b.classList.toggle('on', l === level);
    b.onclick = () => { level = l; renderCat(); };
    $('c-levels').appendChild(b);
  }
  list.filter((p) => !level || p.level === level).forEach((p) => addCard($('c-list'), { ...p, steps: parseWorkout(p.text, vma) }, true));
}
const backToList = () => (cat ? renderCat() : renderHome());
// ---------- Réglages ----------
function openPrefs() {
  show('prefs');
  $('vma').textContent = vma + ' km/h'; $('hrmax').textContent = hrMax + ' bpm';
  $('hralert').value = hrAlert; $('plan-level').value = plan?.level || 0;
  const goal = goalActive(plan) ? plan.goal : null, g = goal && goalTarget(goal, vma);
  $('goal-km').value = goal?.km || 0;
  $('goal-date').value = goal ? new Date(goal.date).toLocaleDateString('sv') : ''; // format AAAA-MM-JJ
  $('goal-date').min = new Date(Date.now() + 9 * 864e5).toLocaleDateString('sv');
  $('goal-info').textContent = g ? `Avec ta VMA de ${fr(vma)} km/h : allure visée ≈ ${fr(g.kmh)} km/h (${fmt(3600 / g.kmh)} /km), temps visé ≈ ${fmt(g.seconds)}. Le plan s'organise jusqu'à la course : base, phase spécifique, puis une semaine d'affûtage.`
    : 'Choisis une distance et une date (au moins 9 jours à l\'avance) : le plan guidé s\'organise autour.';
  const bk = pref('backup', null);
  $('p-autobk').checked = autoBk; $('p-autobk').disabled = !native;
  $('bk-status').textContent = !native ? 'Disponible uniquement dans l\'appli Android.'
    : !bk ? 'Le fichier sera écrit dans Documents/T900D après la prochaine séance. Ce dossier est conservé si l\'appli est désinstallée.'
    : bk.error ? `Dernière tentative échouée le ${new Date(bk.at).toLocaleString('fr-FR')} : ${bk.error}`
    : `Dernière sauvegarde le ${new Date(bk.at).toLocaleString('fr-FR')} dans ${bk.path}`;
  const lo = (i) => Math.round(ZONES[i].from * hrMax);
  const range = (i) => (i === 0 ? `< ${lo(1)}` : i === 4 ? `${lo(4)} et +` : `${lo(i)}–${lo(i + 1) - 1}`);
  $('zones-ref').innerHTML = ZONES.map((z, i) =>
    `<div class="z"><span><i class="zdot" style="background:${ZONE_COLORS[i]}"></i>${z.name} ${z.label}</span><span></span><span>${range(i)} bpm</span></div>`).join('');
}
$('prefs').addEventListener('click', (e) => {
  const { v, h } = e.target.dataset;
  if (v) {
    vma = clamp(vma + +v, 7, 22); saveVma(vma);
    // Historique de la VMA pour la courbe de progression : une valeur par jour.
    const log = pref('vmalog', []), day = new Date().toDateString();
    if (log.length && new Date(log.at(-1).t).toDateString() === day) log.pop();
    log.push({ t: Date.now(), v: vma }); setPref('vmalog', log);
  }
  if (h) { hrMax = clamp(hrMax + +h, 120, 220); setPref('hrmax', hrMax); }
  if (v || h) openPrefs();
});
$('hralert').onchange = (e) => { hrAlert = +e.target.value; setPref('hralert', hrAlert); };
$('plan-level').onchange = (e) => { const l = +e.target.value; setPlan(l ? { ...plan, level: l, idx: plan?.level === l ? plan.idx : 0 } : null); openPrefs(); };
function setGoal() {
  const km = +$('goal-km').value, date = Date.parse($('goal-date').value + 'T09:00');
  if (km && date > Date.now() + 8 * 864e5) setPlan({ level: plan?.level || 2, idx: 0, goal: { km, date, created: Date.now() } });
  else if (km) { $('goal-info').textContent = 'Indique aussi la date de la course, au moins 9 jours à l\'avance.'; return; } // saisie incomplète : on garde le formulaire
  else if (plan?.goal) setPlan({ level: plan.level, idx: 0 });
  openPrefs();
}
$('goal-km').onchange = $('goal-date').onchange = setGoal;
let autoBk = localStorage.autobk !== '0';
$('p-autobk').onchange = (e) => { autoBk = e.target.checked; localStorage.autobk = autoBk ? '1' : '0'; };
const backupJson = async () => JSON.stringify({ workouts, vma, favs, hrMax, hrAlert, plan, vmalog: pref('vmalog', []), sessions: await mySessions() });
// Écrit la sauvegarde dans Documents/T900D après chaque séance (appli Android uniquement).
async function autoBackup() {
  if (!native || !autoBk) return;
  try { setPref('backup', { at: Date.now(), path: await native.saveBackup('t900d-sauvegarde.json', await backupJson()) }); }
  catch (e) { setPref('backup', { at: Date.now(), error: e.message }); }
}
$('plan-reset').onclick = () => { if (plan && confirm('Recommencer le plan au début ?')) setPlan({ ...plan, idx: 0 }); };
$('new').onclick = () => openEdit(null);
$('export').onclick = async () => {
  const json = await backupJson();
  if (native) return native.shareFile('t900d-sauvegarde.json', json).catch((e) => alert('Export impossible : ' + e.message));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 't900d-sauvegarde.json'; a.click();
};
$('import').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    const list = Array.isArray(data) ? data : data.workouts ?? [];
    workouts.push(...list.filter((w) => w.name && Array.isArray(w.steps)).map((w) => ({ ...w, id: uid() })));
    for (const x of data.sessions ?? []) if (x.id && x.start) await putSession({ ...x, user: currentUser() });
    if (data.vma) { vma = clamp(+data.vma, 7, 22); saveVma(vma); }
    if (Array.isArray(data.favs)) { favs = [...new Set([...favs, ...data.favs])]; saveFavs(favs); }
    if (data.hrMax) { hrMax = clamp(+data.hrMax, 120, 220); setPref('hrmax', hrMax); }
    if (data.hrAlert != null) { hrAlert = +data.hrAlert; setPref('hralert', hrAlert); }
    if (data.plan) setPlan(data.plan);
    if (Array.isArray(data.vmalog) && data.vmalog.length) setPref('vmalog', data.vmalog);
    openPrefs();
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
    onChange: (i, p) => { const st = Object.assign(ed.steps[i], p); if (st.distance) st.duration = distDuration(st); renderEdit(); },
  });
  const s = ed.steps[ed.sel];
  $('e-title').textContent = `Étape ${ed.sel + 1}/${ed.steps.length}`;
  $('e-mode').textContent = s.distance ? 'Distance ⇄' : 'Durée ⇄';
  $('e-dur').textContent = s.distance ? `${s.distance} m (≈ ${fmt(s.duration)})` : fmt(s.duration);
  for (const [a, t, d] of [['dur:-60', '−1m', '−500m'], ['dur:-15', '−15s', '−100m'], ['dur:15', '+15s', '+100m'], ['dur:60', '+1m', '+500m']])
    document.querySelector(`[data-a="${a}"]`).textContent = s.distance ? d : t;
  $('e-spd').textContent = s.speed + ' km/h';
  $('e-inc').textContent = s.incline + ' %';
  $('e-stats').textContent = summary(ed.steps);
}
window.addEventListener('resize', () => { if (!$('edit').hidden) renderEdit(); if (!$('run').hidden) drawRun(); if (!$('sess').hidden) drawSession($('chart-sess'), sess.samples); if (!$('prog').hidden) renderProg(); });
$('edit').addEventListener('click', (e) => {
  const a = e.target.dataset.a; if (!a) return;
  const s = ed.steps[ed.sel], [k, v] = a.split(':');
  if (k === 'dur' && s.distance) s.distance = Math.max(50, s.distance + Math.sign(v) * (Math.abs(v) === 60 ? 500 : 100));
  else if (k === 'dur') s.duration = Math.max(10, s.duration + +v);
  else if (k === 'mode') { if (s.distance) delete s.distance; else s.distance = Math.max(50, Math.round(s.speed / 3.6 * s.duration / 50) * 50); }
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
  for (const st of ed.steps) if (st.distance) st.duration = distDuration(st);
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
// run.w = séance programmée, ou null en course libre. run.steps = ses étapes à l'intensité choisie (run.scale).
// run.state : idle | running | paused.
let run;
const prefs = { beep: localStorage.beep !== '0', voice: localStorage.voice !== '0' };
for (const k of ['beep', 'voice']) {
  $('p-' + k).checked = prefs[k];
  $('p-' + k).onchange = (e) => { prefs[k] = e.target.checked; localStorage[k] = prefs[k] ? '1' : '0'; };
}
const bip = (f, ms) => prefs.beep && beep(f, ms);
function speak(t) { if (prefs.voice) (native?.speak ?? say)(t); }
const fr = (n) => String(n).replace('.', ',');
const spoken = (s) => `${fr(s.speed)} kilomètres heure, pente ${fr(s.incline)} pour cent`;
const spokenLen = (st) => (st.distance ? `${st.distance} mètres` : spokenDur(st.duration));
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
  if (run.w) drawChart($('chart-run'), run.steps, { cursor: run.snap?.pos ?? null, selected: run.snap?.idx ?? -1 });
  else drawSession($('chart-run'), run.rec?.samples ?? []);
}
function showRec() {
  const r = run?.rec;
  $('m-dist').textContent = r ? (r.dist / 1000).toFixed(2) : '-';
  $('m-time').textContent = r ? fmt(r.t) : '-';
  $('m-kcal').textContent = r ? r.kcal : '-';
}
const makeRunner = () => new WorkoutRunner(run.steps, tm ?? { setSpeed() {}, setIncline() {} }, {
  onTick, speedNow: () => live.speed ?? null,
  onDone: () => { tm.stop(); speak('Séance terminée, bravo'); finishRun(true); },
});
// saved : état d'une séance interrompue à reprendre (voir saveResume).
function openRun(w, saved) {
  run = { w, scale: 1, steps: w?.steps, runner: null, snap: null, rec: null, cue: {} };
  $('r-title').textContent = w?.name ?? 'Course libre';
  $('r-int').hidden = !w; $('run').classList.toggle('free', !w);
  setBtns('idle'); $('r-now').hidden = true; show('run');
  setScale(saved?.scale ?? 1);
  if (saved) {
    run.rec = Recorder.restore(saved.rec);
    if (w && saved.runner?.idx >= 0) {
      run.runner = makeRunner(); run.runner.restore(saved.runner);
      run.cue = { idx: saved.runner.idx, sec: null }; // pas d'annonce à l'ouverture
      onTick(run.runner.snapshot());
    }
    setBtns('paused');
    $('r-info').textContent = 'Séance reprise : appuie sur Start du tapis ou sur Reprendre.';
  }
  drawRun(); showRec();
  unlock(); // le clic qui ouvre cet écran autorise le son, même si le départ vient du tapis
  ensureConnected(true).then((ok) => { if (ok) { keepAwake(); if (run?.runner) run.runner.controller = tm; } });
}
// Intensité : décale toutes les vitesses de la séance (80 à 120 %), y compris en cours de route.
function setScale(k) {
  if (!run.w) return;
  run.scale = clamp(Math.round(k * 20) / 20, 0.8, 1.2);
  run.steps = scaleSteps(run.w.steps, run.scale);
  $('r-scale').textContent = Math.round(run.scale * 100) + ' %';
  if (run.runner) {
    run.runner.steps = run.steps;
    if (run.state === 'running' && run.runner.step) tm.setSpeed(run.runner.step.speed);
    onTick(run.runner.snapshot());
  } else $('r-info').textContent = summary(run.steps) + ' · Appuie sur Start du tapis ou sur Démarrer.';
  drawRun();
}
$('r-int').onclick = (e) => { const d = e.target.dataset.i; if (d) setScale(run.scale + +d); };
// Affichage géant ou détaillé : le choix est mémorisé.
const setBig = (on) => { $('run').classList.toggle('big', on); $('r-big').classList.toggle('on', on); localStorage.big = on ? '1' : '0'; drawRun(); };
$('r-big').onclick = () => setBig(!$('run').classList.contains('big'));
setBig(localStorage.big === '1');
// Mémorise la séance en cours toutes les 5 s, pour la reprendre si l'appli est fermée.
function saveResume() {
  if (run?.rec) setPref('resume', { w: run.w, scale: run.scale, runner: run.runner?.state(), rec: { ...run.rec }, at: Date.now() });
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
  if (Math.round(run.rec.t) % 5 === 0) saveResume();
  // Alerte FC : au-dessus de la limite pendant 15 s, rappel au plus une fois par minute.
  const lim = hrAlert && ZONES[hrAlert].from * hrMax;
  if (lim && live.hr >= lim) {
    run.over = (run.over || 0) + 1;
    if (run.over >= 15 && Date.now() - (run.alertAt || 0) > 60000) { run.alertAt = Date.now(); speak(`Fréquence cardiaque ${live.hr}, au-dessus de la zone ${hrAlert}. Ralentis.`); }
  } else run.over = 0;
}, 1000);

function onTick(s) {
  run.snap = s; drawRun();
  if (!s.step) return;
  if (run.cue.idx !== s.idx) { // changement d'étape
    if (run.cue.idx != null) bip(1320, 400);
    speak(`${s.step.label ? s.step.label + '. ' : ''}${spoken(s.step)}, pendant ${spokenLen(s.step)}`);
    run.cue = { idx: s.idx, sec: null };
  }
  const sec = Math.ceil(s.remaining);
  if (sec !== run.cue.sec) {
    run.cue.sec = sec;
    if (sec >= 1 && sec <= 3) bip(880, 150);
    if (sec === 10 && s.step.duration >= 20) speak(s.next ? `Dans 10 secondes : ${spoken(s.next)}` : 'Fin de séance dans 10 secondes');
  }
  $('r-now').hidden = false; $('r-info').textContent = '';
  $('r-step').textContent = `Étape ${s.idx + 1}/${run.steps.length}${s.step.label ? ' · ' + s.step.label : ''} · ${s.step.speed} km/h · ${s.step.incline} %`;
  $('r-remain').textContent = s.remainingDist != null ? `${Math.ceil(s.remainingDist / 10) * 10} m` : fmt(Math.ceil(s.remaining));
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
  const rec = run.rec, w = run.w, steps = run.steps, programId = w?.cat ? w.id : undefined; // programme intégré uniquement
  setPref('resume', null);
  run.runner?.pause(); run.runner = null; run.snap = null; run.rec = null; run.cue = {};
  allowSleep(); setBtns('idle'); $('r-now').hidden = true;
  if (rec && rec.t > 10) { await putSession({ ...rec.summary(completed), user: currentUser(), programId }); autoBackup(); }
  // Le plan n'avance que si la séance a vraiment été faite (pas en sautant les étapes).
  if (completed && programId && plan && rec.t >= 0.8 * stats(steps).duration) setPlan(advance(plan, programId));
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
      if (run.w) run.runner = makeRunner();
      else speak('C\'est parti');
    }
    if (run.runner) run.runner.controller = tm; // une séance reprise a pu être préparée avant la connexion
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
  sessions = await mySessions();
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
  const zt = zoneTimes(x.samples || [], hrMax), tot = zt.reduce((a, b) => a + b, 0);
  $('s-zones').innerHTML = !tot ? '' : `<div class="muted">Temps par zone cardiaque (FC max ${hrMax} bpm)</div>` + ZONES.map((z, i) =>
    `<div class="z"><span><i class="zdot" style="background:${ZONE_COLORS[i]}"></i>${z.name} ${z.label}</span>
     <div class="track"><div class="fill" style="width:${zt[i] / tot * 100}%;background:${ZONE_COLORS[i]};${zt[i] ? '' : 'min-width:0'}"></div></div>
     <span>${fmt(zt[i])} · ${Math.round(zt[i] / tot * 100)} %</span></div>`).join('');
}

// ---------- Progression ----------
const METRICS = {
  km: ['Kilomètres', (w) => +w.km.toFixed(1), (v) => `${v} km`],
  duration: ['Temps', (w) => Math.round(w.duration / 60), (v) => `${v} min`],
  count: ['Séances', (w) => w.count, (v) => `${v} séance${v > 1 ? 's' : ''}`],
};
let metric = 'km';
async function openProg() { sessions = await mySessions(); show('prog'); renderProg(); }
function renderProg() {
  $('g-metric').replaceChildren();
  for (const k in METRICS) {
    const b = document.createElement('button');
    b.textContent = METRICS[k][0]; b.classList.toggle('on', k === metric);
    b.onclick = () => { metric = k; renderProg(); };
    $('g-metric').appendChild(b);
  }
  const [, val, txt] = METRICS[metric], day = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  drawBars($('chart-week'), weekly(sessions, 12).map((w) => ({ label: w.label, value: val(w), tip: `Semaine du ${w.label} : ${txt(val(w))}` })),
    { color: '#4c8dff', fmt: (v) => +v.toFixed(1) });
  drawLine($('chart-cardio'), cardioSeries(sessions).map((p) => ({ ...p, tip: `${day(p.t)} : ${p.v} km/h pour 100 bpm` })), { color: '#ff5a5f', fmt: (v) => v.toFixed(1) });
  drawLine($('chart-vma'), pref('vmalog', [{ t: Date.now(), v: vma }]).map((p) => ({ ...p, tip: `${day(p.t)} : VMA ${p.v} km/h` })), { color: '#ffb020', fmt: (v) => v.toFixed(1) });
  const r = records(sessions), row = (label, s, value) => (s ? `<span>${label}</span><b>${value} <small>${day(s.start)}</small></b>` : '');
  $('g-records').innerHTML = (row('Plus longue séance', r.duration, r.duration && fmt(r.duration.duration)) +
    row('Plus longue distance', r.distance, r.distance && km(r.distance.distance) + ' km') +
    row('Meilleure vitesse moyenne (10 min et plus)', r.avgSpeed, r.avgSpeed && r.avgSpeed.avgSpeed + ' km/h') +
    row('Vitesse maximale', r.maxSpeed, r.maxSpeed && r.maxSpeed.maxSpeed + ' km/h') +
    row('Plus gros dénivelé', r.ascent, r.ascent && r.ascent.ascent + ' m') +
    row('Meilleure semaine', r.week, r.week && r.week.km.toFixed(1) + ' km')) || '<span>Aucune séance enregistrée.</span>';
}
$('s-del').onclick = async () => { if (confirm('Supprimer cette séance de l\'historique ?')) { await delSession(sess.id); history.back(); } };

renderHome(); setStatus();
fetch('version.json').then((r) => r.json()).then((v) => { $('version').textContent = 'Version ' + v.version; }).catch(() => {});
if (!native && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
