import { describe, it, expect } from "vitest";
import { janela12m, janela12mAnos, dentroDoFiltro } from "./periodoCards";
import { describeFilter, detectPreset } from "../components/FilterBar";

const mensal = (d) => ({ ano: d.ano, mes: d.mes });

describe("janela12m (série mensal)", () => {
  it("ancora no último dado, não no calendário (dataset com defasagem)", () => {
    const serie = [];
    for (let m = 1; m <= 12; m++) serie.push({ ano: 2023, mes: m });
    for (let m = 1; m <= 7; m++) serie.push({ ano: 2024, mes: m });
    expect(janela12m(serie, mensal)).toEqual({
      yearFrom: "2023", monthFrom: "8", yearTo: "2024", monthTo: "7",
    });
  });

  it("último dado em dezembro → janela dentro do mesmo ano", () => {
    const serie = Array.from({ length: 24 }, (_, i) => ({
      ano: 2023 + Math.floor(i / 12), mes: (i % 12) + 1,
    }));
    expect(janela12m(serie, mensal)).toEqual({
      yearFrom: "2024", monthFrom: "1", yearTo: "2024", monthTo: "12",
    });
  });

  it("clampa o início no primeiro ponto (série curta; 1 ponto → o próprio ponto)", () => {
    expect(janela12m([{ ano: 2024, mes: 3 }, { ano: 2024, mes: 7 }], mensal)).toEqual({
      yearFrom: "2024", monthFrom: "3", yearTo: "2024", monthTo: "7",
    });
    expect(janela12m([{ ano: 2024, mes: 7 }], mensal)).toEqual({
      yearFrom: "2024", monthFrom: "7", yearTo: "2024", monthTo: "7",
    });
  });

  it("série vazia → filtro vazio (Tudo)", () => {
    expect(janela12m([], mensal)).toEqual({
      yearFrom: "", monthFrom: "", yearTo: "", monthTo: "",
    });
  });

  it("normaliza competência AAAAMM e data_referencia via extrator", () => {
    const porCompetencia = (d) => ({
      ano: +String(d.competencia).slice(0, 4),
      mes: +String(d.competencia).slice(4, 6),
    });
    expect(janela12m([{ competencia: "202407" }], porCompetencia)).toEqual({
      yearFrom: "2024", monthFrom: "7", yearTo: "2024", monthTo: "7",
    });
    const porData = (d) => ({
      ano: +String(d.data_referencia).slice(0, 4),
      mes: +String(d.data_referencia).slice(5, 7),
    });
    expect(janela12m([{ data_referencia: "2024-07-01" }], porData).yearTo).toBe("2024");
  });
});

describe("janela12m (série anual)", () => {
  it("último ano com dado — o '12m' de uma série anual", () => {
    const serie = [{ ano: 2019 }, { ano: 2020 }, { ano: 2021 }];
    expect(janela12m(serie, (d) => ({ ano: d.ano }))).toEqual({
      yearFrom: "2021", monthFrom: "", yearTo: "2021", monthTo: "",
    });
  });
});

describe("janela12mAnos (FilterBar só de ano sobre série mensal)", () => {
  it("último ano com dado e o anterior — mesmo range do botão 12m", () => {
    const serie = [{ data_referencia: "2023-01-01" }, { data_referencia: "2025-01-01" }];
    const extrair = (d) => parseInt(String(d.data_referencia).substring(0, 4));
    expect(janela12mAnos(serie, extrair)).toEqual({
      yearFrom: "2024", monthFrom: "", yearTo: "2025", monthTo: "",
    });
  });

  it("um ano só → o próprio ano; vazia → Tudo", () => {
    expect(janela12mAnos([{ ano: 2024 }], (d) => d.ano).yearFrom).toBe("2024");
    expect(janela12mAnos([], (d) => d.ano)).toEqual({
      yearFrom: "", monthFrom: "", yearTo: "", monthTo: "",
    });
  });
});

describe("dentroDoFiltro", () => {
  const f = { yearFrom: "2023", monthFrom: "8", yearTo: "2024", monthTo: "7" };

  it("janela cruzando o ano inclui meses 'menores' do ano seguinte", () => {
    expect(dentroDoFiltro({ ano: 2024, mes: 1 }, f, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2023, mes: 8 }, f, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2024, mes: 7 }, f, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2023, mes: 7 }, f, mensal)).toBe(false);
    expect(dentroDoFiltro({ ano: 2024, mes: 8 }, f, mensal)).toBe(false);
  });

  it("só anos → semântica atual preservada", () => {
    const g = { yearFrom: "2023", yearTo: "2024", monthFrom: "", monthTo: "" };
    expect(dentroDoFiltro({ ano: 2022, mes: 12 }, g, mensal)).toBe(false);
    expect(dentroDoFiltro({ ano: 2024, mes: 12 }, g, mensal)).toBe(true);
  });

  it("só meses (sem ano) → faixa de meses em todos os anos (legado)", () => {
    const g = { yearFrom: "", yearTo: "", monthFrom: "3", monthTo: "6" };
    expect(dentroDoFiltro({ ano: 2020, mes: 4 }, g, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2024, mes: 7 }, g, mensal)).toBe(false);
  });

  it("filtro vazio deixa tudo passar", () => {
    const vazio = { yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" };
    expect(dentroDoFiltro({ ano: 1999, mes: 1 }, vazio, mensal)).toBe(true);
  });

  it("item sem mes com janela completa cai no criterio de anos", () => {
    expect(dentroDoFiltro({ ano: 2024 }, f, mensal)).toBe(true);
    expect(dentroDoFiltro({ ano: 2022 }, f, mensal)).toBe(false);
  });
});

describe("FilterBar — detectPreset/describeFilter com a janela ancorada", () => {
  it("último ano sozinho (span 1 terminando no maxYear) é reconhecido como 12m", () => {
    expect(detectPreset("2024", "2024", 2024)).toBe("12m");
  });

  it("presets existentes preservados", () => {
    expect(detectPreset("2023", "2024", 2024)).toBe("12m");
    expect(detectPreset("2020", "2024", 2024)).toBe("5a");
    expect(detectPreset("2015", "2024", 2024)).toBe("10a");
    expect(detectPreset("", "", 2024)).toBe("tudo");
    expect(detectPreset("2020", "2023", 2024)).toBe("personalizar");
    expect(detectPreset("2020", "2020", 2024)).toBe("personalizar"); // span 1 fora do maxYear
  });

  it("describeFilter com janela completa mostra Mês/Ano – Mês/Ano", () => {
    expect(describeFilter({ yearFrom: "2023", monthFrom: "8", yearTo: "2024", monthTo: "7" }))
      .toBe("Ago/2023 – Jul/2024");
  });

  it("describeFilter de ano único mostra 'Ano X'", () => {
    expect(describeFilter({ yearFrom: "2024", yearTo: "2024" })).toBe("Ano 2024");
  });

  it("describeFilter sem meses continua igual", () => {
    expect(describeFilter({ yearFrom: "2023", yearTo: "2024" })).toBe("2023–2024");
    expect(describeFilter({ yearFrom: "", yearTo: "" })).toBe(null);
  });
});
