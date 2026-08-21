import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ler = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// [arquivo, título novo obrigatório, título antigo proibido (null = sem checagem
// de ausência — "Retenção"/"Indicadores" aparecem legitimamente em outros
// pontos desses arquivos)]
const CASOS = [
  ["./DashboardGeralPage.jsx", "Núcleo de Dados", "Central de Inteligência"],
  ["./timeline/TimelinePage.jsx", "Histórico Institucional", "Memória Institucional"],
  ["./desenvolvimento-economico/FunilTab.jsx", "Atração de Investimentos", "Funil de Investimentos"],
  ["./desenvolvimento-economico/GestaoEmpresarialTab.jsx", "Gestão Empresarial", "Retenção & Expansão"],
  ["./dados-internos/IndicadoresInternosPage.jsx", "Indicadores Internos", "Cidade Inteligente"],
  ["./desenvolvimento-economico/CertificacoesShell.jsx", "Certificações e Premiações", null],
  ["./cidade-inteligente/CidadeInteligentePage.jsx", "Cidade Inteligente", null],
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
    expect(src).toContain("Histórico Institucional");
    expect(src).not.toContain("Memória Institucional");
  });

  it("PainelPrefeitoPage usa o título novo", () => {
    const src = ler("./painel-prefeito/PainelPrefeitoPage.jsx");
    expect(src).toContain('title="Visão do Prefeito"');
    expect(src).not.toContain('title="Painel do Prefeito"');
  });

  it("ProjetosPage usa o título novo", () => {
    const src = ler("./projetos/ProjetosPage.jsx");
    expect(src).toContain("Planos de Desenvolvimento");
  });

  it("ProjetosResumoCard acompanha o nome novo da página de destino", () => {
    const src = ler("../components/ProjetosResumoCard.jsx");
    expect(src).toContain('title="Planos de Desenvolvimento"');
  });

  it("DinheiroNaMesa e Emendas não têm mais NidPageHeader próprio", () => {
    expect(ler("./dinheiro-na-mesa/DinheiroNaMesaPage.jsx")).not.toContain('title="Dinheiro na Mesa"');
    expect(ler("./emendas/EmendasPage.jsx")).not.toContain('title="Radar de Emendas"');
  });
});
