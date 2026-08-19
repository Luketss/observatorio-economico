import { fmtNumberShort } from "../components/nid/charts";

// Helpers de formatação e normalizadores das 6 bases econômicas.
// Extraídos de PainelPrefeitoPage (METRICS) sem mudança de comportamento —
// compartilhados entre o Painel (Visão do Prefeito) e a Análise Econômica.
export const fmtBR = (v, opts = {}) =>
  v != null ? Number(v).toLocaleString("pt-BR", opts) : "—";

export function moneyDisplay(v) {
  if (v == null) return { value: "—", unit: "" };
  const a = Math.abs(v);
  if (a >= 1e9) return { value: `R$ ${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, unit: "Bi" };
  if (a >= 1e6) return { value: `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, unit: "Mi" };
  if (a >= 1e3) return { value: `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, unit: "k" };
  return { value: `R$ ${fmtBR(v)}`, unit: "" };
}

export function kpiDelta(p) {
  if (p == null) return null;
  return { value: Number(p), direction: p > 0 ? "up" : p < 0 ? "down" : "flat" };
}

// pick(resumo) → { value, unit, delta, foot } no formato do KpiCard.
export const METRICAS_ECONOMICAS = {
  pib: {
    label: "PIB", route: "/app/pib", resumoPath: "/pib/resumo", planKey: "pib",
    pick: (r) => ({ ...moneyDisplay(r?.pib_ultimo_ano), delta: kpiDelta(r?.crescimento_percentual), foot: r?.ultimo_ano ? String(r.ultimo_ano) : "" }),
  },
  vaf: {
    label: "VAF · IPM", route: "/app/vaf", resumoPath: "/vaf/resumo", planKey: "vaf",
    pick: (r) => ({ value: r?.ipm_ultimo_ano != null ? fmtBR(r.ipm_ultimo_ano, { maximumFractionDigits: 4 }) : "—", unit: "", delta: kpiDelta(r?.variacao_ipm_percentual), foot: r?.ultimo_ano ? String(r.ultimo_ano) : "" }),
  },
  empresas: {
    label: "Empresas ativas", route: "/app/empresas", resumoPath: "/empresas/resumo", planKey: "empresas",
    pick: (r) => ({ value: r?.total_ativas != null ? fmtBR(r.total_ativas) : "—", unit: "", delta: null, foot: r?.total_mei != null ? `${fmtBR(r.total_mei)} MEI` : "" }),
  },
  estban: {
    label: "Crédito bancário", route: "/app/estban", resumoPath: "/estban/resumo", planKey: "estban",
    pick: (r) => ({ ...moneyDisplay(r?.total_operacoes_credito), delta: null, foot: r?.qtd_agencias != null ? `${fmtBR(r.qtd_agencias)} agências` : "" }),
  },
  comex: {
    label: "Balança comercial", route: "/app/comex", resumoPath: "/comex/resumo", planKey: "comex",
    pick: (r) => ({ value: r?.balanca_comercial != null ? `US$ ${fmtBR(r.balanca_comercial, { maximumFractionDigits: 0 })}` : "—", unit: "", delta: null, foot: "exportação − importação" }),
  },
  pix: {
    label: "Transações PIX", route: "/app/pix", resumoPath: "/pix/resumo", planKey: "pix",
    pick: (r) => ({ value: r?.total_transacoes != null ? fmtNumberShort(r.total_transacoes) : "—", unit: "", delta: null, foot: "PF + PJ" }),
  },
};

export const ORDEM_ECONOMICA = ["pib", "vaf", "empresas", "estban", "comex", "pix"];
