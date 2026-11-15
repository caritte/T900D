import assert from 'node:assert/strict';
import { parseWorkout, totalDuration, WorkoutRunner } from '../src/workout.js';
import { parseTreadmillData, cmd } from '../src/ftms.js';

// Parseur
const steps = parseWorkout(`
# test
5:00 @ 6 / 1 Chauffe
repeat 2 {
  1:00 @ 12 / 1 Vite
  30 @ 6 Récup
}`);
assert.equal(steps.length, 5);
assert.deepEqual(steps[3], { duration: 60, speed: 12, incline: 1, label: 'Vite' });
assert.equal(totalDuration(steps), 300 + 2 * 90);
assert.throws(() => parseWorkout('abc'), /Ligne 1/);
assert.throws(() => parseWorkout('repeat 2 {\n1:00 @ 5'), /non fermée/);

// FTMS : flags=0x0008|0x0400 (inclinaison + temps), vitesse 8.50, incl 2.5 %, ramp 0, temps 90 s
const b = new Uint8Array([0x08, 0x04, 0x52, 0x03, 0x19, 0x00, 0x00, 0x00, 0x5a, 0x00]);
assert.deepEqual(parseTreadmillData(new DataView(b.buffer)), { speed: 8.5, incline: 2.5, elapsed: 90 });
assert.deepEqual([...cmd.speed(8.5)], [0x02, 0x52, 0x03]);
assert.deepEqual([...cmd.incline(-1)], [0x03, 0xf6, 0xff]);

// Moteur avec horloge simulée
let t = 0; const calls = []; let done = false;
const r = new WorkoutRunner(parseWorkout('0:02 @ 5\n0:02 @ 8 / 2'),
  { setSpeed: (v) => calls.push(['v', v]), setIncline: (v) => calls.push(['i', v]) },
  { now: () => t, onDone: () => { done = true; } });
r.start();
for (let i = 0; i < 20 && !done; i++) { t += 500; r.tick(); }
assert.deepEqual(calls, [['v', 5], ['i', 0], ['v', 8], ['i', 2]]);
assert.ok(done);

// Enregistreur : 60 s à 12 km/h, pente 5 %, FC 150
const { Recorder } = await import('../src/recorder.js');
const rec = new Recorder('x', 1000);
for (let i = 0; i < 60; i++) rec.tick({ speed: 12, incline: 5, hr: 150, energy: 10 + Math.floor(i / 6) });
const sm = rec.summary();
assert.equal(sm.distance, 200); assert.equal(sm.ascent, 10); assert.equal(sm.avgSpeed, 12);
assert.equal(sm.hrAvg, 150); assert.equal(sm.kcal, 9); assert.equal(sm.samples.length, 12);
assert.deepEqual(sm.samples[0], [5, 12, 5, 150]);

// Programmes intégrés : tous se construisent, vitesses dans les limites du tapis
const { PROGRAMS } = await import('../src/programs.js');
assert.equal(parseWorkout('1:00 @ 85% / 1 Seuil', 12)[0].speed, 10);
assert.throws(() => parseWorkout('1:00 @ 85%'), /VMA/);
for (const vma of [7, 11, 22]) for (const p of PROGRAMS) {
  const st = parseWorkout(p.text, vma);
  assert.ok(st.every((s) => s.speed >= 1 && s.speed <= 18 && s.incline >= 0 && s.incline <= 10 && s.duration >= 10), p.id);
}
if (process.argv[2] === 'list') for (const p of PROGRAMS) console.log(p.level, p.cat.padEnd(16), p.name.padEnd(36), Math.round(totalDuration(parseWorkout(p.text, 11)) / 60) + ' min');

// Zones FC, indice cardio, plan, progression
const { zoneOf, zoneTimes, cardioIndex } = await import('../src/hr.js');
assert.deepEqual([100, 115, 135, 155, 175, 0].map((h) => zoneOf(h, 190)), [0, 1, 2, 3, 4, -1]);
assert.deepEqual(zoneTimes([[5, 8, 0, 120], [10, 8, 0, 140], [15, 8, 0, 0]], 190), [0, 5, 5, 0, 0]);
assert.equal(cardioIndex(Array.from({ length: 12 }, (_, i) => [i * 5, 10, 0, 150])), 6.67);
assert.equal(cardioIndex([[5, 10, 0, 150]]), null);
const { PLANS, planToday, advance, advice, goalTarget } = await import('../src/plan.js');
const planProgram = (s, now) => planToday(s, now).program;
for (const pl of Object.values(PLANS)) for (const id of [...pl.intro, ...pl.loop]) assert.ok(PROGRAMS.some((p) => p.id === id), id);
let st = { level: 1, idx: 0 };
assert.equal(planProgram(st).id, 'rf1');
st = advance(advance(advance(st, 'rf1'), 'fr1'), 'rf1'); // la séance hors plan ne compte pas
assert.equal(planProgram(st).id, 'rf2');
assert.equal(planProgram({ level: 1, idx: 14 }).id, 'en1');
assert.equal(planProgram({ level: 2, idx: 12 }).id, 'en2');
const H = 36e5, T0 = 1e12, sess = (ago, programId) => ({ start: T0 - ago * H - 1800e3, duration: 1800, programId });
const frac = PROGRAMS.find((p) => p.id === 'fr4'), foot = PROGRAMS.find((p) => p.id === 'en2');
assert.match(advice([sess(5, 'en2')], foot, T0), /16 heures/);
assert.match(advice([sess(30, 'fr4')], frac, T0), /intense/);
assert.equal(advice([sess(30, 'fr4')], foot, T0), null);
assert.equal(advice([sess(50, 'fr4')], frac, T0), null);
const { weekly, records } = await import('../src/progress.js');
const now = new Date(2026, 10, 18, 12).getTime(); // mercredi
const wk = weekly([{ start: now - 864e5, distance: 5000, duration: 1800 }, { start: now - 8 * 864e5, distance: 3000, duration: 1200 }], 4, now);
assert.deepEqual(wk.map((w) => +w.km.toFixed(1)), [0, 0, 3, 5]);
assert.equal(records([{ start: now, distance: 5000, duration: 1800, avgSpeed: 10, maxSpeed: 12, ascent: 5 }]).week.km, 5);

// Étapes en distance : fin à la distance réellement parcourue
const { scaleSteps } = await import('../src/workout.js');
const ds = parseWorkout('400m @ 12 / 1 Vite\n1km @ 10\n0:30 @ 6');
assert.deepEqual([ds[0].distance, ds[0].duration, ds[1].distance, ds[1].duration, ds[2].distance], [400, 120, 1000, 360, undefined]);
assert.deepEqual(scaleSteps(ds, 0.9).map((s) => [s.speed, s.duration]), [[11, 131], [9, 400], [5.5, 30]]);
{
  let t = 0, done = false, sp = 6; const ch = [];
  const r = new WorkoutRunner(parseWorkout('100m @ 12\n0:10 @ 6'), { setSpeed: (v) => ch.push([t / 1000, v]), setIncline() {} }, { now: () => t, speedNow: () => sp, onDone: () => { done = true; } });
  r.start();
  for (let i = 0; i < 400 && !done; i++) { t += 500; r.tick(); if (i === 10) assert.ok(r.snapshot().remainingDist < 100 && r.snapshot().pos > 0); }
  // à 6 km/h réels (1,667 m/s), 100 m prennent 60 s, et non les 30 s prévues à 12 km/h
  assert.deepEqual(ch, [[0, 12], [60.5, 6]]); assert.ok(done); // 60,5 : pas de 0,5 s du test
  // reprise : état restauré, aucune commande envoyée
  const r2 = new WorkoutRunner(parseWorkout('100m @ 12\n0:10 @ 6'), { setSpeed() { throw new Error('commande inattendue'); }, setIncline() {} }, { now: () => t });
  r2.restore({ idx: 1, stepElapsed: 4, stepDist: 0, total: 64 }); r2.start(); r2.pause();
  assert.equal(Math.round(r2.snapshot().remaining), 6);
}
const rec2 = Recorder.restore(JSON.parse(JSON.stringify(rec)));
rec2.tick({ speed: 12, incline: 0 }); assert.equal(Math.round(rec2.t), 61); assert.equal(rec2.summary().samples.length, 12);

// Objectif de course
const D = 864e5, c0 = 1e12, goal = { km: 10, date: c0 + 56 * D, created: c0 };
const gs = (idx, now) => planToday({ level: 2, idx, goal }, now);
assert.deepEqual([0, 1, 2].map((i) => gs(i, c0 + D).program.id), ['en2', 'fr3', 'en4']);            // phase de base
assert.deepEqual([0, 1, 2].map((i) => gs(i, c0 + 30 * D).program.id), ['ca3', 'en2', 'goal-10-2']); // phase spécifique
assert.match(gs(0, c0 + 30 * D).progress, /J-26 · phase spécifique/);
const pace = gs(2, c0 + 30 * D).program, pst = parseWorkout(pace.text, 12);
assert.equal(pst.filter((s) => s.distance === 2000).length, 3); assert.equal(pst[1].speed, 10.5);
assert.equal(gs(0, c0 + 51 * D).program.id, 'en1');            // affûtage
assert.equal(gs(0, c0 + 55.5 * D).program, null);              // veille
assert.equal(gs(0, c0 + 58 * D).program.id, 'en2');            // objectif passé : retour au plan normal
assert.equal(advance({ level: 2, idx: 2, goal }, 'goal-10-2', c0 + 30 * D).idx, 3);
assert.deepEqual(goalTarget(goal, 12), { kmh: 10.6, seconds: 3409 });

// Glycémie AAPS
const { glucoseView } = await import('../src/glucose.js');
const gt = 1e12, st0 = { glucoseMgdl: 97.4, glucoseTimeStamp: gt - 3 * 60000, units: 'mg/dl', slopeArrow: '→', deltaMgdl: -2, iob: 3.123, low: 72, high: 180 };
assert.deepEqual(glucoseView(st0, gt), { bg: '97', unit: 'mg/dL', arrow: '→', delta: '−2', state: 'in', age: 3, stale: false, iob: '3,12' });
assert.equal(glucoseView({ ...st0, glucoseMgdl: 65 }, gt).state, 'low');
assert.equal(glucoseView({ ...st0, glucoseMgdl: 210, deltaMgdl: 6 }, gt).delta, '+6');
assert.equal(glucoseView(st0, gt + 10 * 60000).stale, true);
const mm = glucoseView({ ...st0, glucoseMgdl: 126, units: 'mmol', low: 4, high: 10, deltaMgdl: 9 }, gt);
assert.deepEqual([mm.bg, mm.unit, mm.delta, mm.state], ['7,0', 'mmol/L', '+0,5', 'in']);
assert.equal(glucoseView({ iob: 1 }, gt), null); assert.equal(glucoseView(null), null);
console.log('OK');
