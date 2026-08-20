/**
 * Leitura derivada do PIB — frases curtas calculadas a partir da série anual
 * e do valor adicionado por setor do foco, sem IA: crescimento vs ano
 * anterior, setor dominante do valor adicionado e tendência dos últimos 3
 * anos. Item sem dado suficiente é OMITIDO (a strip encolhe; nunca renderiza
 * placeholder).
 */

const fmtPct = (v) => `${Math.abs(v).toFixed(1).replace(".", ",")}%`;

const SETORES = [
  { nome: "Agropecuária", campo: "va_agropecuaria" },
  { nome: "Indústria", campo: "va_industria" },
  { nome: "Serviços", campo: "va_servicos" },
  { nome: "Governo", campo: "va_governo" },
];

export function montarLeituraPib({ serie, vaFoco } = {}) {
  const leituras = [];
  const porAno = (serie || []).slice().sort((a, b) => a.ano - b.ano);

  // Leitura 1 — crescimento do último ano da série vs anterior.
  if (porAno.length >= 2) {
    const anterior = porAno[porAno.length - 2];
    const ultimo = porAno[porAno.length - 1];
    if (anterior.pib_total > 0) {
      const pct = ((ultimo.pib_total - anterior.pib_total) / anterior.pib_total) * 100;
      const cresceu = pct >= 0;
      let texto = `PIB ${cresceu ? "cresceu" : "recuou"} ${fmtPct(pct)} em ${ultimo.ano}.`;
      if (ultimo.tipo_dado === "PROJETADO") texto += " (valor projetado)";
      leituras.push({ kind: cresceu ? "up" : "down", texto });
    }
  }

  // Leitura 2 — setor dominante no registro de vaFoco com maior ano dentre
  // os que têm os 4 va_* não-nulos.
  const completos = (vaFoco || []).filter((d) => SETORES.every((s) => d[s.campo] != null));
  if (completos.length) {
    const rec = completos.reduce((max, d) => (d.ano > max.ano ? d : max), completos[0]);
    const base = SETORES.reduce((acc, s) => acc + rec[s.campo], 0);
    if (base > 0) {
      const dominante = SETORES.reduce(
        (max, s) => (rec[s.campo] > rec[max.campo] ? s : max),
        SETORES[0]
      );
      const pct = (rec[dominante.campo] / base) * 100;
      leituras.push({
        kind: "info",
        texto: `${dominante.nome} responde por ${fmtPct(pct)} do valor adicionado (${rec.ano}).`,
      });
    }
  }

  // Leitura 3 — tendência dos últimos 3 anos da série por pib_total.
  if (porAno.length >= 3) {
    const [a, b, c] = porAno.slice(-3);
    const dir =
      c.pib_total > b.pib_total && b.pib_total > a.pib_total ? "em alta"
      : c.pib_total < b.pib_total && b.pib_total < a.pib_total ? "em queda"
      : "estável";
    leituras.push({
      kind: dir === "em alta" ? "up" : dir === "em queda" ? "down" : "info",
      texto: `Tendência ${a.ano}–${c.ano}: ${dir}.`,
    });
  }

  return leituras;
}
