/**
 * Leitura derivada do Comércio Exterior — frases curtas calculadas a partir
 * da série mensal de exportações/importações (USD), sem IA: balança
 * comercial do último ano com dado, variação das exportações vs ano
 * anterior e tendência dos últimos 3 anos com exportação. Item sem dado
 * suficiente é OMITIDO (a strip encolhe; nunca renderiza placeholder).
 *
 * `tipo_operacao` chega normalizado com `.toLowerCase()` — aceita tanto o
 * código curto ("exp"/"imp") quanto a forma por extenso ("export"/"import"),
 * igual ao `groupComexByPeriod` da própria ComexPage.
 */

// Mesma lógica de US$ curto do fmtUsdShort em
// src/pages/comparativo/ComparacaoPares.jsx — copiada aqui (não importada)
// porque é um util de página, não um util compartilhado.
const fmtUsdShort = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `US$ ${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `US$ ${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `US$ ${(v / 1e3).toFixed(0)}k`;
  return `US$ ${v}`;
};

const fmtPct = (v) => `${Math.abs(v).toFixed(1).replace(".", ",")}%`;

export function montarLeituraComex({ serie } = {}) {
  const leituras = [];

  // Agrega valor_usd por ano, separando exportação e importação.
  const porAno = {};
  (serie || []).forEach((d) => {
    if (d.valor_usd == null) return;
    const tipo = d.tipo_operacao?.toLowerCase();
    if (tipo !== "exp" && tipo !== "export" && tipo !== "imp" && tipo !== "import") return;
    if (!porAno[d.ano]) porAno[d.ano] = { exp: 0, imp: 0 };
    if (tipo === "exp" || tipo === "export") {
      porAno[d.ano].exp += d.valor_usd;
    } else {
      porAno[d.ano].imp += d.valor_usd;
    }
  });

  const anos = Object.keys(porAno)
    .map(Number)
    .sort((a, b) => a - b);

  // Leitura 1 — balança comercial do último ano com dado (exp ou imp > 0).
  const anosComDado = anos.filter((a) => porAno[a].exp > 0 || porAno[a].imp > 0);
  if (anosComDado.length) {
    const ultimo = anosComDado[anosComDado.length - 1];
    const { exp, imp } = porAno[ultimo];
    const saldo = exp - imp;
    if (saldo > 0) {
      leituras.push({
        kind: "up",
        texto: `Superávit comercial de ${fmtUsdShort(saldo)} em ${ultimo}.`,
      });
    } else if (saldo < 0) {
      leituras.push({
        kind: "down",
        texto: `Déficit comercial de ${fmtUsdShort(Math.abs(saldo))} em ${ultimo}.`,
      });
    } else {
      leituras.push({ kind: "info", texto: `Balança comercial equilibrada em ${ultimo}.` });
    }
  }

  // Leitura 2 — variação das exportações vs o ano imediatamente anterior
  // (exige ano-1 presente e com exportação; buraco de série omite).
  const anosComExp = anos.filter((a) => porAno[a].exp > 0);
  if (anosComExp.length >= 2) {
    const ultimo = anosComExp[anosComExp.length - 1];
    const anterior = ultimo - 1;
    if (porAno[anterior] && porAno[anterior].exp > 0) {
      const pct = ((porAno[ultimo].exp - porAno[anterior].exp) / porAno[anterior].exp) * 100;
      const cresceu = pct >= 0;
      leituras.push({
        kind: cresceu ? "up" : "down",
        texto: `Exportações ${cresceu ? "cresceram" : "recuaram"} ${fmtPct(pct)} vs ${anterior}.`,
      });
    }
  }

  // Leitura 3 — tendência dos últimos 3 anos com exportação (mesmo conjunto
  // filtrado, não precisa ser consecutivo — mesma régua das Tasks A/B).
  if (anosComExp.length >= 3) {
    const [a, b, c] = anosComExp.slice(-3);
    const dir =
      porAno[c].exp > porAno[b].exp && porAno[b].exp > porAno[a].exp
        ? "em alta"
        : porAno[c].exp < porAno[b].exp && porAno[b].exp < porAno[a].exp
          ? "em queda"
          : "estável";
    leituras.push({
      kind: dir === "em alta" ? "up" : dir === "em queda" ? "down" : "info",
      texto: `Tendência das exportações ${a}–${c}: ${dir}.`,
    });
  }

  return leituras;
}
