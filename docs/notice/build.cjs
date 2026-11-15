// Génère le PDF de la notice à partir de notice.html.
// Usage : node docs/notice/build.cjs v3   → docs/notice-t900d-v3.pdf
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const v = process.argv[2];
  if (!v) throw new Error('Indique la version, ex. : node docs/notice/build.cjs v3');
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto('file://' + path.join(__dirname, 'notice.html'));
  await p.waitForLoadState('networkidle');
  await p.pdf({
    path: path.join(__dirname, '..', `notice-t900d-${v}.pdf`), format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-size:8px;color:#888;width:100%;text-align:center">T900D ${v} – Notice d'utilisation · page <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
  await b.close();
})();
