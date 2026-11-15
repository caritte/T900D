// Graphe de séance : barres = pente (%), ligne en escalier = vitesse (km/h), axe X = temps.
const NS = 'http://www.w3.org/2000/svg';
export const LIMITS = {
  speed: { min: 1, max: 18, step: 0.5 },
  incline: { min: 0, max: 10, step: 1 },
};
const C = { incline: '#3b82f6', speed: '#f59e0b', grid: '#2a2f3a', text: '#8b93a3' };

const el = (name, attrs, parent) => {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent?.appendChild(n);
  return n;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function drawChart(svg, steps, { selected = -1, cursor = null, editable = false, compact = false, flat = false, onSelect, onChange } = {}) {
  const W = compact ? 300 : svg.clientWidth || 320;
  const H = compact ? 60 : svg.clientHeight || 240;
  const m = compact ? { l: 0, r: 0, t: 2, b: 2 } : { l: 30, r: 34, t: 16, b: 22 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b, bottom = m.t + ph;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (compact) svg.setAttribute('preserveAspectRatio', 'none');
  svg.replaceChildren();

  const T = steps.reduce((a, s) => a + s.duration, 0) || 1;
  const xOf = (t) => m.l + (t / T) * pw;
  const yI = (v) => m.t + ph * (1 - v / LIMITS.incline.max);
  const yS = (v) => m.t + ph * (1 - v / LIMITS.speed.max);

  if (!compact) {
    for (let v = 0; v <= LIMITS.incline.max; v += 2) {
      el('line', { x1: m.l, x2: W - m.r, y1: yI(v), y2: yI(v), stroke: C.grid }, svg);
      el('text', { x: m.l - 5, y: yI(v) + 4, 'text-anchor': 'end', fill: C.incline, 'font-size': 10 }, svg).textContent = v + '%';
    }
    for (let v = 0; v <= LIMITS.speed.max; v += 6) {
      el('text', { x: W - m.r + 5, y: yS(v) + 4, fill: C.speed, 'font-size': 10 }, svg).textContent = v;
    }
    const tick = [60, 120, 300, 600, 900, 1800, 3600].find((s) => T / s <= 8) || 3600;
    for (let t = 0; t <= T; t += tick) {
      el('text', { x: xOf(t), y: H - 6, 'text-anchor': 'middle', fill: C.text, 'font-size': 10 }, svg).textContent = Math.round(t / 60) + "'";
    }
  }

  // Barres de pente + zones de sélection
  let t0 = 0;
  const pos = steps.map((s) => { const p = { x0: xOf(t0), x1: xOf(t0 + s.duration) }; t0 += s.duration; return p; });
  steps.forEach((s, i) => {
    const { x0, x1 } = pos[i];
    const hit = el('rect', { x: x0, y: m.t, width: Math.max(0, x1 - x0), height: ph, fill: i === selected ? 'rgba(255,255,255,.07)' : 'transparent' }, svg);
    if (onSelect) hit.addEventListener('click', () => onSelect(i));
    el('rect', {
      x: x0, y: yI(s.incline), width: Math.max(0, x1 - x0), height: bottom - yI(s.incline),
      fill: C.incline, opacity: i === selected ? 0.85 : 0.45, stroke: '#161a22', 'stroke-width': compact || flat ? 0 : 1, 'pointer-events': 'none',
    }, svg);
  });

  // Ligne de vitesse en escalier
  let d = '';
  steps.forEach((s, i) => { d += (i ? `V${yS(s.speed)}` : `M${pos[0].x0} ${yS(s.speed)}`) + `H${pos[i].x1}`; });
  el('path', { d, fill: 'none', stroke: C.speed, 'stroke-width': compact ? 2 : 3, 'stroke-linejoin': 'round', 'pointer-events': 'none' }, svg);

  if (cursor != null) el('line', { x1: xOf(cursor), x2: xOf(cursor), y1: m.t, y2: bottom, stroke: '#fff', 'stroke-width': 2, 'pointer-events': 'none' }, svg);

  // Poignées de l'étape sélectionnée
  if (editable && steps[selected]) {
    const s = steps[selected], cx = (pos[selected].x0 + pos[selected].x1) / 2;
    const drag = (key, fy, max, lim) => (ev) => {
      ev.preventDefault();
      const move = (e) => {
        const r = svg.getBoundingClientRect();
        const frac = 1 - (e.clientY - r.top - m.t) / ph;
        const v = Math.round((frac * max) / lim.step) * lim.step;
        onChange(selected, { [key]: clamp(+v.toFixed(1), lim.min, lim.max) });
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    };
    const hi = el('rect', { x: cx - 24, y: yI(s.incline) - 11, width: 22, height: 22, rx: 5, fill: C.incline, stroke: '#fff', 'stroke-width': 2, style: 'cursor:ns-resize' }, svg);
    hi.addEventListener('pointerdown', drag('incline', yI, LIMITS.incline.max, LIMITS.incline));
    const hs = el('circle', { cx: cx + 14, cy: yS(s.speed), r: 12, fill: C.speed, stroke: '#fff', 'stroke-width': 2, style: 'cursor:ns-resize' }, svg);
    hs.addEventListener('pointerdown', drag('speed', yS, LIMITS.speed.max, LIMITS.speed));
  }
  return { xOf, m, ph };
}

// Courbe d'une séance réalisée. samples : [t, vitesse, pente, fc] ; la FC est tracée en rouge (40–200 bpm).
export function drawSession(svg, samples) {
  const steps = samples.map((s, i) => ({ duration: s[0] - (i ? samples[i - 1][0] : 0) || 1, speed: s[1], incline: s[2] }));
  const g = drawChart(svg, steps.length ? steps : [{ duration: 1, speed: 0, incline: 0 }], { flat: true });
  const hr = samples.filter((s) => s[3] > 0);
  if (hr.length < 2) return;
  const y = (v) => g.m.t + g.ph * (1 - clamp((v - 40) / 160, 0, 1));
  el('path', { d: hr.map((s, i) => `${i ? 'L' : 'M'}${g.xOf(s[0])} ${y(s[3])}`).join(''), fill: 'none', stroke: '#ef4444', 'stroke-width': 2 }, svg);
}

// ---------- Graphes de progression (une seule série chacun) ----------
const INK = '#eef1f6', SURFACE = '#161a22';
const niceMax = (v) => { const p = 10 ** Math.floor(Math.log10(v || 1)); return Math.ceil((v || 1) / p * 2) / 2 * p; };

// Cadre commun : grille discrète, graduations, et une ligne de lecture en haut mise à jour au survol / au toucher.
function frame(svg, lo, hi, fmt) {
  const W = svg.clientWidth || 320, H = svg.clientHeight || 180, m = { l: 34, r: 12, t: 24, b: 20 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const pw = W - m.l - m.r, ph = H - m.t - m.b, y = (v) => m.t + ph * (1 - (v - lo) / (hi - lo || 1));
  for (const v of [lo, (lo + hi) / 2, hi]) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: C.grid }, svg);
    el('text', { x: m.l - 5, y: y(v) + 4, 'text-anchor': 'end', fill: C.text, 'font-size': 10 }, svg).textContent = fmt(v);
  }
  const tip = el('text', { x: m.l, y: 13, fill: INK, 'font-size': 12, 'font-weight': 600 }, svg);
  return { W, H, m, pw, ph, y, tip };
}
const xLabel = (svg, f, x, text) => { el('text', { x, y: f.H - 5, 'text-anchor': 'middle', fill: C.text, 'font-size': 10 }, svg).textContent = text; };
// Rend un repère actif (lecture + mise en avant) au survol et au toucher.
function activate(marks, f, items, on) {
  const set = (i) => { f.tip.textContent = items[i].tip; marks.forEach((mk, j) => on(mk, j === i)); };
  marks.forEach((mk, i) => { for (const ev of ['pointerenter', 'pointerdown']) mk.hit.addEventListener(ev, () => set(i)); });
  set(items.length - 1);
}

// Barres : items = [{ label, value, tip }]. Barres fines, sommet arrondi, base sur l'axe.
export function drawBars(svg, items, { color = C.incline, fmt = (v) => v } = {}) {
  const f = frame(svg, 0, niceMax(Math.max(...items.map((i) => i.value))), fmt);
  const slot = f.pw / items.length, bw = Math.max(3, Math.min(26, slot - 2)), base = f.m.t + f.ph, every = Math.ceil(items.length / 6);
  const marks = items.map((it, i) => {
    const cx = f.m.l + slot * (i + 0.5), top = f.y(it.value), h = base - top, r = Math.min(4, h, bw / 2);
    const bar = el('path', { d: `M${cx - bw / 2} ${base}V${top + r}q0 ${-r} ${r} ${-r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${base}z`, fill: color }, svg);
    if ((items.length - 1 - i) % every === 0) xLabel(svg, f, cx, it.label);
    return { bar, hit: el('rect', { x: cx - slot / 2, y: f.m.t, width: slot, height: f.ph, fill: 'transparent' }, svg) };
  });
  activate(marks, f, items, (mk, on) => mk.bar.setAttribute('opacity', on ? 1 : 0.55));
}

// Courbe : pts = [{ t, v, tip }] triés par date. Ligne de 2 px, points cerclés de la couleur du fond.
export function drawLine(svg, pts, { color = C.speed, fmt = (v) => v } = {}) {
  if (pts.length < 2) {
    svg.replaceChildren(); svg.setAttribute('viewBox', '0 0 320 60');
    el('text', { x: 160, y: 34, 'text-anchor': 'middle', fill: C.text, 'font-size': 12 }, svg).textContent = pts.length ? `Une seule mesure pour l'instant : ${pts[0].tip}` : 'Pas encore de données';
    return;
  }
  const vs = pts.map((p) => p.v), pad = (Math.max(...vs) - Math.min(...vs)) * 0.15 || 0.5;
  const f = frame(svg, Math.min(...vs) - pad, Math.max(...vs) + pad, fmt);
  const t0 = pts[0].t, span = pts.at(-1).t - t0 || 1, x = (t) => f.m.l + 6 + (f.pw - 12) * (t - t0) / span;
  el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)} ${f.y(p.v)}`).join(''), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
  const day = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  xLabel(svg, f, x(t0) + 10, day(t0)); xLabel(svg, f, x(pts.at(-1).t) - 10, day(pts.at(-1).t));
  const marks = pts.map((p) => ({
    dot: el('circle', { cx: x(p.t), cy: f.y(p.v), r: 4, fill: color, stroke: SURFACE, 'stroke-width': 2 }, svg),
    hit: el('circle', { cx: x(p.t), cy: f.y(p.v), r: 16, fill: 'transparent' }, svg),
  }));
  activate(marks, f, pts, (mk, on) => mk.dot.setAttribute('r', on ? 6 : 4));
}

// Plusieurs courbes sur un axe X commun de catégories (ex. vitesses). series = [{ color, values: [nombre ou null] }],
// labels = libellés de l'axe X, tips = texte de lecture par position. Les trous (null) coupent la ligne.
export function drawMultiLine(svg, labels, series, tips, { fmt = (v) => v } = {}) {
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const pad = (Math.max(...all) - Math.min(...all)) * 0.15 || 3;
  const f = frame(svg, Math.min(...all) - pad, Math.max(...all) + pad, fmt);
  const slot = f.pw / labels.length, x = (i) => f.m.l + slot * (i + 0.5);
  labels.forEach((l, i) => xLabel(svg, f, x(i), l));
  const dots = labels.map(() => []);
  for (const s of series) {
    let d = '', pen = false;
    s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)} ${f.y(v)}`; pen = true; });
    el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    s.values.forEach((v, i) => { if (v != null) dots[i].push(el('circle', { cx: x(i), cy: f.y(v), r: 4, fill: s.color, stroke: SURFACE, 'stroke-width': 2 }, svg)); });
  }
  const marks = labels.map((_, i) => ({ dots: dots[i], hit: el('rect', { x: x(i) - slot / 2, y: f.m.t, width: slot, height: f.ph, fill: 'transparent' }, svg) }));
  activate(marks, f, tips.map((tip) => ({ tip })), (mk, on) => mk.dots.forEach((c) => c.setAttribute('r', on ? 6 : 4)));
}

// Barres empilées : items = [{ label, values: [...], tip }], une couleur par rang de valeur.
// Segments séparés par 2 px de fond ; seul le segment du haut est arrondi.
export function drawStacked(svg, items, colors, { fmt = (v) => v } = {}) {
  const f = frame(svg, 0, niceMax(Math.max(...items.map((it) => it.values.reduce((a, b) => a + b, 0)))), fmt);
  const slot = f.pw / items.length, bw = Math.max(4, Math.min(28, slot - 4)), base = f.m.t + f.ph, every = Math.ceil(items.length / 8);
  const marks = items.map((it, i) => {
    const cx = f.m.l + slot * (i + 0.5), g = el('g', {}, svg);
    let acc = 0;
    const last = it.values.findLastIndex((v) => v > 0);
    it.values.forEach((v, k) => {
      if (!(v > 0)) return;
      const y1 = f.y(acc), y0 = f.y(acc + v); acc += v;
      const h = Math.max(1, y1 - y0 - (k === last ? 0 : 2)), r = k === last ? Math.min(4, h, bw / 2) : 0, top = y1 - h;
      el('path', { d: `M${cx - bw / 2} ${y1}V${top + r}q0 ${-r} ${r} ${-r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${y1}z`, fill: colors[k] }, g);
    });
    if ((items.length - 1 - i) % every === 0) xLabel(svg, f, cx, it.label);
    return { g, hit: el('rect', { x: cx - slot / 2, y: f.m.t, width: slot, height: f.ph, fill: 'transparent' }, svg) };
  });
  activate(marks, f, items, (mk, on) => mk.g.setAttribute('opacity', on ? 1 : 0.72));
}
