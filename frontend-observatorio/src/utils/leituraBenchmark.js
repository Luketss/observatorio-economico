/**
 * Leitura derivada do benchmark — frases curtas calculadas do envelope, sem
 * IA: posição no ranking, distância à mediana dos pares no último ano e
 * tendência dos últimos 3 anos do foco. Item sem dado suficiente é OMITIDO
 * (a strip encolhe; nunca renderiza placeholder).
 */

const fmtPct = (v) => `${Math.abs(v).toFixed(1).replace(".", ",")}%`;

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function montarLeitura({ posicao, itens, foco, pares }) {
  if (!foco) return [];
  const leituras = [];

  if (posicao?.nacional?.total) {
    const estadual = posicao.estadual?.total
      ? ` e #${posicao.estadual.rank} de ${posicao.estadual.total} no estado`
      : "";
    leituras.push({
      kind: "info",
      texto: `Em ${posicao.ano}: #${posicao.nacional.rank} de ${posicao.nacional.total} municípios no Brasil${estadual}.`,
    });
  }

  const doFoco = (itens || [])
    .filter((i) => i.municipio_id === foco.municipio_id)
    .sort((a, b) => a.ano - b.ano);
  const ultimo = doFoco[doFoco.length - 1];
  const idsPares = new Set((pares || []).map((p) => p.municipio_id));

  if (ultimo && idsPares.size) {
    const valoresPares = (itens || [])
      .filter((i) => i.ano === ultimo.ano && idsPares.has(i.municipio_id))
      .map((i) => i.valor);
    if (valoresPares.length) {
      const m = mediana(valoresPares);
      if (m !== 0) {
        const pct = ((ultimo.valor - m) / Math.abs(m)) * 100;
        const acima = pct >= 0;
        leituras.push({
          kind: acima ? "up" : "down",
          texto: `Em ${ultimo.ano}, ficou ${fmtPct(pct)} ${acima ? "acima" : "abaixo"} da mediana dos ${idsPares.size} pares.`,
        });
      }
    }
  }

  if (doFoco.length >= 3) {
    const [a, b, c] = doFoco.slice(-3);
    const dir =
      c.valor > b.valor && b.valor > a.valor ? "em alta"
      : c.valor < b.valor && b.valor < a.valor ? "em queda"
      : "estável";
    leituras.push({
      kind: dir === "em alta" ? "up" : dir === "em queda" ? "down" : "info",
      texto: `Tendência ${a.ano}–${c.ano}: ${dir}.`,
    });
  }

  return leituras;
}
