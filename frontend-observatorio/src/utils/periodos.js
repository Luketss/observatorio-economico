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
