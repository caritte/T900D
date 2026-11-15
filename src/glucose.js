// Mise en forme de l'état reçu d'AAPS (glycémie et insuline active). Pur, testable.
// status : { glucoseMgdl, glucoseTimeStamp, units, slopeArrow, deltaMgdl, iob, high, low }
const STALE_MIN = 11; // au-delà, la mesure n'est plus présentée comme actuelle (capteur toutes les 5 min)

export function glucoseView(status, now = Date.now()) {
  if (!status || status.glucoseMgdl == null || !status.glucoseTimeStamp) return null;
  const mmol = /mmol/i.test(status.units || ''), conv = (v) => (mmol ? v / 18.016 : v);
  const show = (v) => (mmol ? conv(v).toFixed(1) : String(Math.round(v))).replace('.', ',');
  const value = conv(status.glucoseMgdl);
  // Les seuils d'AAPS sont déjà dans l'unité de l'utilisateur ; à défaut 70–180 mg/dL.
  const low = status.low > 0 ? status.low : conv(70), high = status.high > 0 ? status.high : conv(180);
  const age = Math.max(0, Math.floor((now - status.glucoseTimeStamp) / 60000));
  const d = status.deltaMgdl, delta = d == null ? '' : (d > 0 ? '+' : d < 0 ? '−' : '') + show(Math.abs(d));
  return {
    bg: show(status.glucoseMgdl), unit: mmol ? 'mmol/L' : 'mg/dL',
    arrow: status.slopeArrow || '', delta,
    state: value < low ? 'low' : value > high ? 'high' : 'in',
    age, stale: age >= STALE_MIN,
    iob: status.iob == null ? null : status.iob.toFixed(2).replace('.', ','),
  };
}
