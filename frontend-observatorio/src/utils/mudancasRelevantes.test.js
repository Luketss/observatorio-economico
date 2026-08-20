import { describe, it, expect } from "vitest";
import { montarMudancas } from "./mudancasRelevantes";

const RES = {
  pib: { ultimo_ano: 2022, crescimento_percentual: 3.2 },
  vaf: { ultimo_ano: 2023, variacao_ipm_percentual: -7.1 },
  arrecadacao: { total_geral: 500000, crescimento_percentual: 5.0 },
  caged: { saldo_total: 120, total_admissoes: 900 },
};

describe("montarMudancas", () => {
  it("ordena por |variação| desc e deixa o CAGED por último", () => {
    const m = montarMudancas(RES);
    expect(m.map((i) => i.key)).toEqual(["vaf", "arrecadacao", "pib", "caged"]);
    expect(m[0].up).toBe(false);
    expect(m[3].pct).toBeNull();
    expect(m[3].up).toBe(true);
  });

  it("entradas sem dado ficam fora; tudo vazio → []", () => {
    expect(montarMudancas({ pib: null, vaf: {}, arrecadacao: null, caged: null })).toEqual([]);
    const m = montarMudancas({ ...RES, vaf: null });
    expect(m.map((i) => i.key)).toEqual(["arrecadacao", "pib", "caged"]);
  });

  it("textos citam os números", () => {
    const m = montarMudancas(RES);
    expect(m.find((i) => i.key === "pib").texto).toContain("3,2%");
    expect(m.find((i) => i.key === "caged").texto).toContain("+120");
  });

  it("resumos zero-fill (sentinela de base sem dados) ficam fora", () => {
    const m = montarMudancas({
      pib: { ultimo_ano: 0, pib_ultimo_ano: 0, crescimento_percentual: 0 },
      vaf: { ultimo_ano: 0, ipm_ultimo_ano: 0, variacao_ipm_percentual: 0 },
      arrecadacao: { total_geral: 0, crescimento_percentual: 0 },
      caged: null,
    });
    expect(m).toEqual([]);
  });
});
