import { describe, expect, it } from "vitest";
import { filtrarGrupos, mesclarCatalogoComBanco } from "./indicadorAdmin";

const CATALOGO = {
  pib: [
    { key: "ultimo_ano", label: "PIB — Último Ano", tipo: "kpi" },
    { key: "chart_evolucao_anual", label: "Evolução Anual do PIB", tipo: "chart" },
  ],
  caged: [{ key: "chart_saldo", label: "Saldo Mensal/Anual", tipo: "chart" }],
};

const BANCO = [
  { dataset: "pib", indicador_key: "ultimo_ano", tooltip: "Valor do PIB no último ano.", descricao: "", fonte: "IBGE" },
  { dataset: "velho", indicador_key: "sumido", tooltip: "linha órfã de refactor", descricao: "", fonte: null },
];

describe("mesclarCatalogoComBanco", () => {
  it("marca preenchido e carrega conteúdo do banco", () => {
    const { grupos, orfaos } = mesclarCatalogoComBanco(CATALOGO, BANCO);
    const pib = grupos.find((g) => g.dataset === "pib");
    const ultimoAno = pib.entries.find((e) => e.key === "ultimo_ano");
    expect(ultimoAno.preenchido).toBe(true);
    expect(ultimoAno.tooltip).toBe("Valor do PIB no último ano.");
    expect(ultimoAno.fonte).toBe("IBGE");
    const chart = pib.entries.find((e) => e.key === "chart_evolucao_anual");
    expect(chart.preenchido).toBe(false);
    expect(chart.tooltip).toBe("");
    expect(orfaos).toHaveLength(1);
    expect(orfaos[0].dataset).toBe("velho");
  });

  it("vazio no banco → tudo não preenchido, zero órfãos", () => {
    const { grupos, orfaos } = mesclarCatalogoComBanco(CATALOGO, []);
    expect(orfaos).toEqual([]);
    expect(grupos.flatMap((g) => g.entries).every((e) => !e.preenchido)).toBe(true);
  });

  it("linha só com espaços não conta como preenchida", () => {
    const { grupos } = mesclarCatalogoComBanco(CATALOGO, [
      { dataset: "caged", indicador_key: "chart_saldo", tooltip: "  ", descricao: "", fonte: null },
    ]);
    const caged = grupos.find((g) => g.dataset === "caged");
    expect(caged.entries[0].preenchido).toBe(false);
  });
});

describe("filtrarGrupos", () => {
  const { grupos } = mesclarCatalogoComBanco(CATALOGO, BANCO);

  it("busca por label (case-insensitive) mantém só matches", () => {
    const r = filtrarGrupos(grupos, { busca: "evolução", soVazios: false });
    expect(r.flatMap((g) => g.entries).map((e) => e.key)).toEqual(["chart_evolucao_anual"]);
  });

  it("busca por key também casa", () => {
    const r = filtrarGrupos(grupos, { busca: "chart_saldo", soVazios: false });
    expect(r.flatMap((g) => g.entries).map((e) => e.key)).toEqual(["chart_saldo"]);
  });

  it("soVazios esconde preenchidos e some com grupo vazio", () => {
    const r = filtrarGrupos(grupos, { busca: "", soVazios: true });
    const keys = r.flatMap((g) => g.entries).map((e) => e.key);
    expect(keys).not.toContain("ultimo_ano");
    expect(keys).toContain("chart_evolucao_anual");
  });
});
