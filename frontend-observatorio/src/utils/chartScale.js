// chartScale — escala Y pura dos charts nid (extraída de charts.jsx no fix
// do saldo negativo do CAGED, mesmo padrão de chartHover.js).

export const niceTicks = (min, max, count = 5) => {
  const span = max - min || 1;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const steps = [1, 2, 5, 10].map((m) => m * step0);
  const step = steps.find((s) => span / s <= count + 0.5) || step0 * 10;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out = [];
  for (let v = start; v <= end + 0.0001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
};

// Domínio Y com padding de 12%: baseline preso em 0 quando a série não cruza
// zero (mantém o visual histórico dos charts todo-positivos); estende para o
// lado negativo com o mesmo padding quando há valores < 0.
export const yBounds = (values) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return {
    lo: min >= 0 ? 0 : min * 1.12,
    hi: max <= 0 ? 0 : max * 1.12,
  };
};
