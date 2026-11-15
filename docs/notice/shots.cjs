// Refait les captures d'écran de la notice dans docs/notice/shots, en mode démo avec un historique fictif.
// Usage : node docs/notice/shots.cjs (environ 1 minute)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8780', '-d', require('path').join(__dirname, '..', '..')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', d => d.accept());
  const shot = (n, full) => p.screenshot({ path: require('path').join(__dirname, 'shots', n + '.png'), fullPage: !!full });
  const tile = (t) => p.locator('.tile', { hasText: t }).click();
  const home = async () => { await p.click('#logo'); await p.waitForTimeout(700); };
  const U = 'http://localhost:8780/?demo=1';
  await p.goto(U); await p.waitForTimeout(300);
  await p.evaluate(() => new Promise((res) => {
    const now = Date.now();
    localStorage.setItem('plan:jerome', JSON.stringify({ level: 2, idx: 2, goal: { km: 10, date: now + 41 * 864e5, created: now - 22 * 864e5 } }));
    localStorage.setItem('hrmax:jerome', '182');
    localStorage.setItem('vma:jerome', '12.5');
    localStorage.setItem('favs:jerome', JSON.stringify(['fr8', 'en2']));
    localStorage.setItem('workouts:jerome', JSON.stringify([{ id: 'w1', name: 'Mon fractionné', steps: [{ duration: 300, speed: 7, incline: 1, label: '' }, { duration: 144, distance: 400, speed: 10, incline: 1, label: '' }, { duration: 60, speed: 6, incline: 0, label: '' }, { duration: 144, distance: 400, speed: 10, incline: 1, label: '' }, { duration: 60, speed: 6, incline: 0, label: '' }, { duration: 144, distance: 400, speed: 10, incline: 1, label: '' }, { duration: 180, speed: 6, incline: 0, label: '' }] }]));
    localStorage.setItem('vmalog:jerome', JSON.stringify([[70, 11], [42, 11.5], [20, 12], [2, 12.5]].map(([d, v]) => ({ t: now - d * 864e5, v }))));
    const r = indexedDB.open('t900d', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('sessions', 'readwrite'), st = tx.objectStore('sessions');
      const kinds = [['Footing 45′', 'en2', 8, 132], ['Fractionné 1′ / 1′ × 10', 'fr4', 9.5, 150], ['Seuil 3 × 8′', 'ca3', 9, 146]];
      for (let w = 10; w >= 1; w--) for (let k = 0; k < (w % 3 ? 3 : 2); k++) {
        const [name, programId, sp0, hr0] = kinds[k];
        const start = now - (w * 7 - k * 2 - 2) * 864e5, dur = 1800 + (10 - w) * 90 + k * 240, sp = sp0 + (10 - w) * 0.05, hr = hr0 - (10 - w) * 1.4;
        const samples = Array.from({ length: Math.floor(dur / 5) }, (_, i) => { const hard = k && (Math.floor(i / 24) % 2); return [(i + 1) * 5, +(sp + (hard ? 2.5 : -0.5)).toFixed(1), hard ? 1 : 0, Math.round(hr + (hard ? 22 : -4) + Math.sin(i / 9) * 4 + Math.min(12, i / 6) - 12)]; });
        st.put({ id: start, start, name, programId, completed: true, duration: dur, distance: Math.round(sp / 3.6 * dur), ascent: 20 + k * 15, kcal: Math.round(dur / 5.5), avgSpeed: +sp.toFixed(2), maxSpeed: +(sp + 2.5).toFixed(1), hrAvg: Math.round(hr), hrMax: Math.round(hr + 26), samples, user: 'jerome' });
      }
      tx.oncomplete = res;
    };
  }));
  await p.goto(U); await p.waitForTimeout(500);
  await shot('home');
  await tile('Progression'); await p.waitForTimeout(400); await shot('prog', true); await home();
  await tile('Analyse'); await p.waitForTimeout(500); await shot('ana', true); await home();
  await tile('Réglages');
  // Les lignes Health Connect et AAPS n'existent que dans l'APK : on les affiche ici telles qu'elles y apparaissent.
  await p.evaluate(() => {
    for (const id of ['hc-row', 'hc-status', 'hc-acts', 'aaps-status']) document.getElementById(id).hidden = false;
    document.getElementById('p-hc').checked = true;
    document.getElementById('hc-status').textContent = 'Dernier envoi réussi le 15/11/2026 19:56 : Footing 45′ (4 éléments)';
    document.getElementById('aaps-status').textContent = 'Glycémie et IOB : dernière donnée AAPS reçue le 15/11/2026 19:57 (116 mg/dL, IOB 0,75 U).';
    const a = document.getElementById('p-autobk'); a.disabled = false; a.checked = true;
    document.getElementById('bk-status').textContent = 'Dernière sauvegarde le 15/11/2026 15:12 dans Documents/T900D/t900d-sauvegarde.json';
  });
  await shot('prefs', true); await home();
  await tile('Historique'); await p.waitForTimeout(300); await shot('hist');
  await p.locator('.se').nth(1).click(); await p.waitForTimeout(300); await shot('sess', true); await home();
  await tile('Mes séances'); await shot('mine');
  await p.locator('#c-list .wk').last().locator('[data-a=edit]').click(); await p.waitForTimeout(300);
  await p.locator('#chart-edit rect[fill="transparent"]').nth(1).click({ force: true }); await p.waitForTimeout(200); await shot('edit'); await home();
  await tile('Fractionné'); await shot('cat');
  await p.locator('#c-list .wk', { hasText: '10 × 400 m' }).locator('[data-a=run]').click(); await p.waitForTimeout(700);
  await p.click('[data-i="-0.05"]');
  await p.click('#r-start'); await p.waitForTimeout(6000);
  await p.click('#r-skip'); await p.waitForTimeout(12000); await shot('run');
  await p.click('#r-big'); await p.waitForTimeout(400); await shot('run-big');
  await p.setViewportSize({ width: 800, height: 370 }); await p.waitForTimeout(700); await shot('run-big-land');
  await p.click('#r-big'); await p.waitForTimeout(500); await shot('run-land');
  await p.setViewportSize({ width: 390, height: 760 }); await p.waitForTimeout(6000);
  await p.goto(U); await p.waitForTimeout(600);
  // Écran de course avec glycémie et IOB simulés (?aaps=1) ; la séance interrompue reste proposée ensuite.
  await p.goto(U + '&aaps=1'); await p.waitForTimeout(500);
  await p.locator('#resume [data-a=go]').click(); await p.waitForTimeout(900); await p.click('#r-start'); await p.waitForTimeout(7000);
  await shot('run-aaps');
  await p.goto(U); await p.waitForTimeout(600);
  await p.locator('#resume').screenshot({ path: require('path').join(__dirname, 'shots', 'resume.png') });
  await b.close(); srv.kill(); console.log('ok');
})();
