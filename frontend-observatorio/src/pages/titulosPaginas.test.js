import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ler = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// [arquivo, título novo obrigatório, título antigo proibido (null = sem checagem
// de ausência — "Retenção"/"Indicadores" aparecem legitimamente em outros
// pontos desses arquivos)]
const CASOS = [
  ["./DashboardGeralPage.jsx", "Central de Inteligência Econômica", "Dashboard Geral"],
  ["./timeline/TimelinePage.jsx", "Memória Institucional", "Timeline do Mandato"],
  ["./desenvolvimento-economico/FunilTab.jsx", "Atração de Investimentos", "Funil de Investimentos"],
  ["./desenvolvimento-economico/RetencaoTab.jsx", "Inteligência Empresarial", null],
  ["./dados-internos/IndicadoresInternosPage.jsx", "Cidade Inteligente", "Indicadores Internos\n"],
];

describe("Títulos das páginas renomeadas (Fase 1 — 5 eixos)", () => {
  it.each(CASOS)("%s usa o título novo", (arquivo, novo) => {
    expect(ler(arquivo)).toContain(novo);
  });

  it.each(CASOS.filter(([, , antigo]) => antigo))(
    "%s não usa mais o título antigo",
    (arquivo, _novo, antigo) => {
      expect(ler(arquivo)).not.toContain(antigo);
    }
  );

  it("FunilResumoCard acompanha o nome novo da página de destino", () => {
    const src = ler("../components/FunilResumoCard.jsx");
    expect(src).toContain('title="Atração de Investimentos"');
  });

  it("MandatoTimeline acompanha o nome novo da página", () => {
    const src = ler("../components/MandatoTimeline.jsx");
    expect(src).toContain("Memória Institucional");
    expect(src).not.toContain("Timeline do Mandato");
  });
});
