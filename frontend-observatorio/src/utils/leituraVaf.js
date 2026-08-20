/**
 * Leitura derivada do VAF — frases curtas calculadas a partir da série anual
 * do Índice de Participação Municipal (IPM), sem IA: variação do IPM entre
 * os dois anos-base mais recentes, tradução do que a variação significa para
 * o repasse de ICMS (só quando houve mudança) e tendência dos últimos 3
 * anos-base. Item sem dado suficiente é OMITIDO (a strip encolhe; nunca
 * renderiza placeholder).
 *
 * `pct_ipm` é a variação percentual pré-calculada (ex.: 5.24, -2.30) usada
 * aqui só como marca de linha com dado válido; o valor exibido é sempre
 * `indice_participacao_municipal` (a fração do IPM em si), formatado com 4
 * casas decimais e vírgula.
 */

const fmtIndice = (v) => Number(v).toFixed(4).replace(".", ",");

export function montarLeituraVaf({ serie } = {}) {
  const leituras = [];
  const porAno = (serie || [])
    .filter((d) => d.pct_ipm != null && d.indice_participacao_municipal != null)
    .slice()
    .sort((a, b) => a.ano_base - b.ano_base);

  // Leitura 1 — variação do IPM entre os dois anos-base mais recentes.
  if (porAno.length >= 2) {
    const anterior = porAno[porAno.length - 2];
    const ultimo = porAno[porAno.length - 1];
    const x = fmtIndice(anterior.indice_participacao_municipal);
    const y = fmtIndice(ultimo.indice_participacao_municipal);
    const houveMudanca =
      ultimo.indice_participacao_municipal !== anterior.indice_participacao_municipal;

    if (ultimo.indice_participacao_municipal > anterior.indice_participacao_municipal) {
      leituras.push({
        kind: "up",
        texto: `Índice de participação (IPM) subiu de ${x} para ${y} (ano-base ${ultimo.ano_base}).`,
      });
    } else if (ultimo.indice_participacao_municipal < anterior.indice_participacao_municipal) {
      leituras.push({
        kind: "down",
        texto: `Índice de participação (IPM) caiu de ${x} para ${y} (ano-base ${ultimo.ano_base}).`,
      });
    } else {
      leituras.push({
        kind: "info",
        texto: `Índice de participação (IPM) manteve-se em ${x} (ano-base ${ultimo.ano_base}).`,
      });
    }

    // Leitura 2 — tradução, só quando houve mudança (subiu ou caiu).
    if (houveMudanca) {
      leituras.push({
        kind: "info",
        texto: "IPM maior significa fatia maior do repasse de ICMS do estado no ano seguinte.",
      });
    }
  }

  // Leitura 3 — tendência dos últimos 3 anos-base (mesmo conjunto filtrado).
  if (porAno.length >= 3) {
    const [a, b, c] = porAno.slice(-3);
    const dir =
      c.indice_participacao_municipal > b.indice_participacao_municipal &&
      b.indice_participacao_municipal > a.indice_participacao_municipal
        ? "em alta"
        : c.indice_participacao_municipal < b.indice_participacao_municipal &&
            b.indice_participacao_municipal < a.indice_participacao_municipal
          ? "em queda"
          : "estável";
    leituras.push({
      kind: dir === "em alta" ? "up" : dir === "em queda" ? "down" : "info",
      texto: `Tendência ${a.ano_base}–${c.ano_base}: ${dir}.`,
    });
  }

  return leituras;
}
