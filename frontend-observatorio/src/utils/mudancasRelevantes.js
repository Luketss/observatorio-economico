import { fmtBR } from "./metricasEconomicas";

const pctTxt = (p) => `${Math.abs(Number(p)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Monta a lista "Mudanças relevantes" da página inicial a partir dos resumos
 *  já buscados. Só entram bases com variação real disponível; o saldo CAGED
 *  entra como sinal (sem percentual) e sempre por último. */
export function montarMudancas({ pib, vaf, arrecadacao, caged } = {}) {
  const comPct = [];
  if (pib?.crescimento_percentual != null) {
    const p = Number(pib.crescimento_percentual);
    comPct.push({
      key: "pib", label: "PIB", rota: "/app/pib", pct: p, up: p >= 0,
      texto: `PIB ${p >= 0 ? "cresceu" : "recuou"} ${pctTxt(p)}${pib.ultimo_ano ? ` em ${pib.ultimo_ano}` : ""} vs ano anterior.`,
    });
  }
  if (vaf?.variacao_ipm_percentual != null) {
    const p = Number(vaf.variacao_ipm_percentual);
    comPct.push({
      key: "vaf", label: "VAF", rota: "/app/vaf", pct: p, up: p >= 0,
      texto: `Índice de participação (IPM) ${p >= 0 ? "subiu" : "caiu"} ${pctTxt(p)}${vaf.ultimo_ano ? ` no ano-base ${vaf.ultimo_ano}` : ""}.`,
    });
  }
  if (arrecadacao?.crescimento_percentual != null) {
    const p = Number(arrecadacao.crescimento_percentual);
    comPct.push({
      key: "arrecadacao", label: "Arrecadação", rota: "/app/arrecadacao", pct: p, up: p >= 0,
      texto: `Arrecadação ${p >= 0 ? "avançou" : "retraiu"} ${pctTxt(p)} no período.`,
    });
  }
  comPct.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const itens = [...comPct];
  if (caged?.saldo_total != null) {
    const s = Number(caged.saldo_total);
    itens.push({
      key: "caged", label: "CAGED", rota: "/app/caged", pct: null, up: s >= 0,
      texto: `Saldo de ${s >= 0 ? "+" : ""}${fmtBR(s)} vagas formais no período acumulado.`,
    });
  }
  return itens;
}
