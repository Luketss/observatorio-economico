import { describe, it, expect } from "vitest";
import { NAV_STRUCTURE, NAV_FLAT, isModuloLocked } from "./navStructure";

// Congela o mapa rota → chave de plano. Estas chaves acoplam sidebar,
// plano_config (banco) e scoped_modulo (backend): mudar QUALQUER valor aqui
// exige migração de dados — é exatamente o que a Fase 1 proíbe.
const ROTA_MODULO = {
  "/app": "geral",
  "/app/painel-prefeito": "painel_prefeito",
  "/app/benchmark": "benchmark",
  "/app/ips": "ips",
  "/app/bolsa-familia": "bolsa_familia",
  "/app/pe-de-meia": "pe_de_meia",
  "/app/inss": "inss",
  "/app/dados-internos/indicadores": "dados_internos.indicadores",
  "/app/pib": "pib",
  "/app/vaf": "vaf",
  "/app/empresas": "empresas",
  "/app/estban": "estban",
  "/app/comex": "comex",
  "/app/pix": "pix",
  "/app/caged": "caged",
  "/app/rais": "rais",
  "/app/arrecadacao": "arrecadacao",
  "/app/desenvolvimento-economico/retencao": "desenvolvimento_economico.retencao",
  "/app/desenvolvimento-economico/funil": "desenvolvimento_economico.funil",
  "/app/desenvolvimento-economico/premiacoes": "desenvolvimento_economico.premiacoes",
  "/app/desenvolvimento-economico/captacao": "desenvolvimento_economico.captacao",
  "/app/desenvolvimento-economico/escrita": "desenvolvimento_economico.escrita",
  "/app/dinheiro-na-mesa": "captacao_federal",
  "/app/emendas": "emendas",
  "/app/projetos": "projetos",
  "/app/dados-internos/plano-gov": "dados_internos.plano_gov",
  "/app/timeline": "timeline_mandato",
  "/app/dados-internos/calendario": "dados_internos.calendario",
  "/app/impacto": "impacto",
  "/app/releases": "releases",
};

describe("NAV_STRUCTURE — 5 eixos", () => {
  it("tem as 5 seções na ordem do design", () => {
    expect(NAV_STRUCTURE.map((s) => s.label)).toEqual([
      "Visão Executiva",
      "Indicadores & Cidade Int.",
      "Dados Econômicos",
      "Desenv. Empresarial",
      "Gestão",
    ]);
    NAV_STRUCTURE.forEach((s) => expect(s.type).toBe("section"));
  });

  it("preserva TODAS as rotas atuais com as MESMAS chaves de plano", () => {
    const mapa = Object.fromEntries(
      NAV_FLAT.filter((i) => i.modulo != null).map((i) => [i.to, i.modulo])
    );
    expect(mapa).toEqual(ROTA_MODULO);
    // 30 com chave + FPM e Análise Econômica sem = 32 navegáveis
    expect(NAV_FLAT).toHaveLength(32);
  });

  it("flags pontuais preservadas e itens bem formados", () => {
    const porRota = Object.fromEntries(NAV_FLAT.map((i) => [i.to, i]));
    expect(porRota["/app"].end).toBe(true);
    expect(porRota["/app/releases"].hideForAdmin).toBe(true);
    expect(porRota["/app/fpm"].modulo).toBeUndefined();
    expect(porRota["/app/analise-economica"].modulo).toBeUndefined();
    NAV_FLAT.forEach((i) => {
      expect(typeof i.to).toBe("string");
      expect(typeof i.label).toBe("string");
      expect(i.icon).toBeTruthy();
    });
  });

  it("labels renomeados do design presentes; antigos ausentes", () => {
    const labels = NAV_FLAT.map((i) => i.label);
    expect(labels).toContain("Núcleo de Dados");
    expect(labels).toContain("Visão do Prefeito");
    expect(labels).toContain("Histórico Institucional");
    expect(labels).toContain("Atração de Investimentos");
    expect(labels).toContain("Retenção & Expansão");
    expect(labels).toContain("Indicadores Internos");
    expect(labels).toContain("Planos de Desenvolvimento");
    expect(labels).toContain("Análise Econômica");
    expect(labels).not.toContain("Dashboard");
    expect(labels).not.toContain("Timeline");
    expect(labels).not.toContain("Funil de Investimentos");
    expect(labels).not.toContain("Central de Inteligência");
    expect(labels).not.toContain("Inteligência Empresarial");
    expect(labels).not.toContain("Memória Institucional");
    expect(labels).not.toContain("Projetos");
  });

  it("labels de grupo são únicos (openGroups é chaveado por label)", () => {
    const grupos = NAV_STRUCTURE.flatMap((s) =>
      s.items.filter((i) => i.type === "group").map((i) => i.label)
    );
    expect(new Set(grupos).size).toBe(grupos.length);
  });
});

describe("isModuloLocked", () => {
  it("global, catálogo nulo ou item sem chave nunca bloqueiam", () => {
    expect(isModuloLocked({ isGlobal: true, modulos: [], modulo: "pib" })).toBe(false);
    expect(isModuloLocked({ isGlobal: false, modulos: null, modulo: "pib" })).toBe(false);
    expect(isModuloLocked({ isGlobal: false, modulos: [], modulo: undefined })).toBe(false);
  });

  it("bloqueia chave fora do plano e libera chave dentro", () => {
    expect(isModuloLocked({ isGlobal: false, modulos: ["pib"], modulo: "vaf" })).toBe(true);
    expect(isModuloLocked({ isGlobal: false, modulos: ["pib"], modulo: "pib" })).toBe(false);
  });
});
