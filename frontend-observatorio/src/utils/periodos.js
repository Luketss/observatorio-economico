export const MES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export function pctChange(novo, velho) {
  if (velho == null || velho === 0) return null;
  return ((novo - velho) / Math.abs(velho)) * 100;
}

export function splitByYear(serie, { valueKey, anoKey = "ano", mesKey = "mes" }) {
  const anos = [...new Set((serie || []).map((d) => d[anoKey]))].sort((a, b) => a - b);
  const anoAtual = anos.length ? anos[anos.length - 1] : null;
  const anoAnterior = anos.length > 1 ? anos[anos.length - 2] : null;
  const valAt = (ano, mes) => {
    const row = (serie || []).find((d) => d[anoKey] === ano && d[mesKey] === mes);
    return row ? (row[valueKey] ?? 0) : null;
  };
  const meses = MES_LABEL.map((label, i) => ({
    label,
    atual: anoAtual != null ? valAt(anoAtual, i + 1) : null,
    anterior: anoAnterior != null ? valAt(anoAnterior, i + 1) : null,
  }));
  return { anoAtual, anoAnterior, meses };
}

export function comparePanelData(serie, { valueKey }) {
  const { anoAtual, anoAnterior, meses } = splitByYear(serie, { valueKey });
  const kA = String(anoAtual ?? "atual");
  const kP = String(anoAnterior ?? "anterior");
  // Trim to the last month that has actual current-year data to avoid:
  // 1) a false YoY decline (comparing N months of atual vs 12 months of anterior)
  // 2) the chart line diving to zero for future months (null coerced to 0)
  const lastIdx = meses.reduce((best, m, i) => (m.atual != null ? i : best), -1);
  const trimmed = lastIdx >= 0 ? meses.slice(0, lastIdx + 1) : meses;
  const sum = (k) => trimmed.reduce((s, m) => s + (m[k] || 0), 0);
  const totalAtual = sum("atual");
  const totalAnterior = sum("anterior");
  return {
    chartData: trimmed.map((m) => ({ label: m.label, [kA]: m.atual, [kP]: m.anterior })),
    series: [kA, kP],
    temAnterior: anoAnterior != null,
    totalAtual,
    totalAnterior,
    deltaPct: pctChange(totalAtual, totalAnterior),
  };
}

export function beforeAfter(serie, markerDate, { valueKey, anoKey = "ano", mesKey = "mes", janela = 12 }) {
  const d = markerDate instanceof Date ? markerDate : new Date(markerDate);
  const markKey = d.getUTCFullYear() * 12 + d.getUTCMonth(); // months since year 0, marker month index
  const pts = (serie || [])
    .map((r) => ({ key: r[anoKey] * 12 + (r[mesKey] - 1), v: r[valueKey] ?? 0 }))
    .sort((a, b) => a.key - b.key);
  const antesPts = pts.filter((p) => p.key < markKey).slice(-janela);
  const depoisPts = pts.filter((p) => p.key >= markKey).slice(0, janela);
  const mean = (arr) => (arr.length ? arr.reduce((s, p) => s + p.v, 0) / arr.length : null);
  const mAntes = mean(antesPts);
  const mDepois = mean(depoisPts);
  return {
    antes: { media: mAntes, n: antesPts.length },
    depois: { media: mDepois, n: depoisPts.length },
    deltaPct: pctChange(mDepois, mAntes),
  };
}
