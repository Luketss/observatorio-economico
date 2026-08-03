import { describe, expect, it } from "vitest";
import {
  chipDoJob, duracaoJob, labelDataset, labelStatus, linhasJob,
  resumoTodas, textoResumoTodas,
} from "./jobStatus";

describe("labelStatus / labelDataset", () => {
  it("traduz status conhecidos e ecoa desconhecidos", () => {
    expect(labelStatus("pendente")).toBe("Na fila");
    expect(labelStatus("executando")).toBe("Executando");
    expect(labelStatus("concluido")).toBe("Concluído");
    expect(labelStatus("erro")).toBe("Erro");
    expect(labelStatus("abortado")).toBe("Abortado");
    expect(labelStatus("outro")).toBe("outro");
  });
  it("labelDataset trata o meta-job", () => {
    expect(labelDataset("todas")).toBe("Todas as fontes");
    expect(labelDataset("caged")).toBe("caged");
  });
});

describe("chipDoJob", () => {
  it("erro e abortado usam pill err", () => {
    expect(chipDoJob({ status: "erro" })).toEqual({ label: "Erro", pill: "nid-pill--err" });
    expect(chipDoJob({ status: "abortado" })).toEqual({ label: "Abortado", pill: "nid-pill--err" });
  });
  it("executando usa pill run; pendente warn", () => {
    expect(chipDoJob({ status: "executando" }).pill).toBe("nid-pill--run");
    expect(chipDoJob({ status: "pendente" }).pill).toBe("nid-pill--warn");
  });
  it("concluido limpo é ok", () => {
    expect(chipDoJob({ status: "concluido", resumo: { linhas: 10, erros: [] } }))
      .toEqual({ label: "Concluído", pill: "nid-pill--ok" });
  });
  it("concluido com erros/municipios_erro vira aviso", () => {
    expect(chipDoJob({ status: "concluido", resumo: { erros: ["x"] } }).pill).toBe("nid-pill--warn");
    expect(chipDoJob({ status: "concluido", resumo: { municipios_erro: 2 } }).label)
      .toBe("Concluído c/ avisos");
  });
  it("meta-job todas com fonte em erro/aviso vira aviso", () => {
    const resumo = { fontes: [{ key: "pib", status: "ok" }, { key: "comex", status: "erro" }] };
    expect(chipDoJob({ status: "concluido", dataset: "todas", resumo }).pill).toBe("nid-pill--warn");
  });
});

describe("duracaoJob / linhasJob / resumoTodas", () => {
  it("duracao formata s e min", () => {
    expect(duracaoJob({ iniciado_em: "2026-08-02T10:00:00Z", finalizado_em: "2026-08-02T10:00:45Z" })).toBe("45s");
    expect(duracaoJob({ iniciado_em: "2026-08-02T10:00:00Z", finalizado_em: "2026-08-02T10:02:05Z" })).toBe("2min 5s");
    expect(duracaoJob({})).toBe("—");
  });
  it("linhasJob soma fontes no meta-job", () => {
    expect(linhasJob({ dataset: "caged", resumo: { linhas: 7 } })).toBe(7);
    expect(linhasJob({
      dataset: "todas",
      resumo: { fontes: [{ linhas: 2 }, { linhas: 3 }] },
    })).toBe(5);
    expect(linhasJob({ dataset: "todas", resumo: null })).toBeNull();
  });
  it("resumoTodas agrega e textoResumoTodas omite zeros", () => {
    const agg = resumoTodas({ fontes: [
      { key: "pib", status: "ok", linhas: 1 },
      { key: "comex", status: "erro", linhas: 0 },
    ] });
    expect(agg.ok).toBe(1);
    expect(agg.erro).toBe(1);
    expect(textoResumoTodas(agg)).toBe("1 ok, 1 com erro (comex)");
  });
});
