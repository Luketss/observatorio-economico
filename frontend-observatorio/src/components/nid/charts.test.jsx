// @vitest-environment jsdom
//
// Cobre a Task 9: `MultiLineChart` não pode mais transformar "ano sem dado"
// em "vale zero" — a série tem que abrir um buraco (trecho separado), não
// despencar até o eixo. `trechos()` é o helper puro que faz esse corte;
// o teste de componente prova que o resultado visual (número de <path>)
// distingue mesmo ausência de zero real.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { trechos, MultiLineChart } from "./charts.jsx";

afterEach(cleanup);

// jsdom não implementa ResizeObserver (nem a v29 usada aqui) — useContainerWidth
// só precisa que o construtor exista e `observe` não estoure; sem ele todo
// componente que mede o próprio container (AreaLineChart, MultiLineChart)
// quebra no render com "ResizeObserver is not defined". O mock não dispara
// callback: o teste roda com a largura inicial (800), que é suficiente e
// determinística para contar <path>s.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe("trechos (helper puro)", () => {
  it("série sem nenhum null vira um único trecho com todos os pontos", () => {
    const pts = [{ x: 0, y: 0, v: 1 }, { x: 1, y: 1, v: 2 }, { x: 2, y: 2, v: 3 }];
    expect(trechos(pts)).toEqual([pts]);
  });

  it("null no meio quebra a série em dois trechos", () => {
    const p0 = { x: 0, y: 0, v: 1 };
    const p1 = { x: 1, y: 1, v: 2 };
    const p3 = { x: 3, y: 3, v: 4 };
    expect(trechos([p0, p1, null, p3])).toEqual([[p0, p1], [p3]]);
  });

  it("null no começo e no fim recorta as pontas sem gerar trecho vazio", () => {
    const p1 = { x: 1, y: 1, v: 1 };
    const p2 = { x: 2, y: 2, v: 2 };
    expect(trechos([null, p1, p2, null])).toEqual([[p1, p2]]);
  });

  it("série toda null não gera trecho nenhum", () => {
    expect(trechos([null, null, null])).toEqual([]);
  });

  it("ponto isolado entre dois null vira trecho de tamanho 1 (não some da tela)", () => {
    const p = { x: 5, y: 5, v: 9 };
    expect(trechos([null, p, null])).toEqual([[p]]);
  });

  it("série vazia não estoura e devolve nenhum trecho", () => {
    expect(trechos([])).toEqual([]);
  });
});

describe("MultiLineChart — buraco de série em vez de despencar até zero", () => {
  it("ano sem dado (null) quebra a linha em mais de um trecho; zero real permanece contínuo", () => {
    // cidadeA fica sem dado em 2021 (null) — não pode virar um mergulho até o
    // eixo cruzando esse ano. cidadeB tem um ZERO DE VERDADE em 2020 (não
    // ausência) — precisa continuar como um único traço contínuo passando
    // pela altura do zero, exatamente como o saldo do CAGED cruza zero.
    const data = [
      { label: "2019", cidadeA: 10, cidadeB: 5 },
      { label: "2020", cidadeA: 20, cidadeB: 0 },
      { label: "2021", cidadeA: null, cidadeB: -3 },
      { label: "2022", cidadeA: 40, cidadeB: 2 },
      { label: "2023", cidadeA: 50, cidadeB: 6 },
    ];

    const { container } = render(
      <MultiLineChart
        data={data}
        series={["cidadeA", "cidadeB"]}
        colors={["#111111", "#222222"]}
      />
    );

    const pathsA = container.querySelectorAll('path[stroke="#111111"]');
    const pathsB = container.querySelectorAll('path[stroke="#222222"]');

    // Contraprova: com o bug antigo (`d[s] || 0`) as duas séries renderizam
    // como um único <path> cada uma — o ano ausente vira zero e a linha some
    // do jeito errado (sem quebra visível). Pós-fix, só a série com ausência
    // quebra.
    expect(pathsA.length).toBeGreaterThan(1);
    expect(pathsB.length).toBe(1);
  });
});
