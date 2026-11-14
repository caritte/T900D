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

export function drawChart(svg, steps, { selected = -1, cursor = null, editable = false, compact = false, onSelect, onChange } = {}) {
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
      fill: C.incline, opacity: i === selected ? 0.85 : 0.45, stroke: '#0f1115', 'stroke-width': compact ? 0 : 1, 'pointer-events': 'none',
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
}
