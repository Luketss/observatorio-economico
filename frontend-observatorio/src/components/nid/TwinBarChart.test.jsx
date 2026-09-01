// @vitest-environment jsdom
//
// Bug: na página do CAGED, alternar "Movimentação CAGED" de Saldo para Bruto
// fazia o gráfico sumir — e voltar para Saldo não o trazia de volta. O
// TwinBarChart público media o container UMA vez (useContainerWidth no pai) e
// passava ref+largura para o renderer interno; ao trocar o modo o renderer
// antigo desmonta e o ResizeObserver, ainda preso à div desmontada, entrega a
// notificação 0x0 que o navegador emite ao remover o elemento observado. A
// largura vira 0 para sempre (o observer nunca é religado à div nova).
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { TwinBarChart } from "./charts.jsx";

// ResizeObserver fiel ao navegador no que importa aqui: registra os alvos
// observados e permite entregar notificações — inclusive a 0x0 que Chrome e
// Firefox emitem quando um alvo observado sai do documento.
const observers = [];
class FakeResizeObserver {
  constructor(cb) {
    this.cb = cb;
    this.targets = new Set();
    this.disconnected = false;
    observers.push(this);
  }
  observe(el) { this.targets.add(el); }
  unobserve(el) { this.targets.delete(el); }
  disconnect() { this.disconnected = true; this.targets.clear(); }
}
globalThis.ResizeObserver = FakeResizeObserver;

function entregar(width, filtro = () => true) {
  act(() => {
    observers.forEach((o) => {
      if (o.disconnected) return;
      o.targets.forEach((el) => {
        if (filtro(el)) o.cb([{ target: el, contentRect: { width } }]);
      });
    });
  });
}
// O que o navegador faz sozinho ao desmontar um elemento observado.
const notificarDesmontados = () => entregar(0, (el) => !el.isConnected);

const data = [
  { label: "Jan", admissoes: 10, desligamentos: 4 },
  { label: "Fev", admissoes: 6, desligamentos: 9 },
  { label: "Mar", admissoes: 12, desligamentos: 5 },
];

const larguraViewBox = (c) => Number(c.querySelector("svg").getAttribute("viewBox").split(" ")[2]);
const barras = (c) =>
  [...c.querySelectorAll("svg rect")].filter(
    (r) => Number(r.getAttribute("width")) > 0 && Number(r.getAttribute("height")) > 0,
  );

beforeEach(() => { observers.length = 0; });

describe("TwinBarChart — troca de modo Saldo/Bruto", () => {
  it("Saldo → Bruto → Saldo mantém o gráfico visível (largura sobrevive à troca de renderer)", () => {
    const { container, rerender } = render(<TwinBarChart data={data} mode="saldo" height={260} />);
    entregar(600);
    expect(larguraViewBox(container)).toBe(600);
    expect(barras(container).length).toBeGreaterThan(0);

    rerender(<TwinBarChart data={data} mode="bruto" height={260} />);
    notificarDesmontados();
    expect(larguraViewBox(container)).toBeGreaterThan(0);
    expect(barras(container).length).toBe(6); // admissões + desligamentos por mês

    rerender(<TwinBarChart data={data} mode="saldo" height={260} />);
    notificarDesmontados();
    expect(larguraViewBox(container)).toBeGreaterThan(0);
    expect(barras(container).length).toBeGreaterThan(0);
  });

  it("depois da troca, o container observado é o do renderer ativo (não a div desmontada)", () => {
    const { container, rerender } = render(<TwinBarChart data={data} mode="saldo" height={260} />);
    rerender(<TwinBarChart data={data} mode="bruto" height={260} />);
    const wrapAtivo = container.querySelector(".nid-chart-wrap");
    const observado = observers.some((o) => !o.disconnected && o.targets.has(wrapAtivo));
    expect(observado).toBe(true);

    // e a largura medida no renderer novo é aplicada ao SVG dele
    entregar(500, (el) => el === wrapAtivo);
    expect(larguraViewBox(container)).toBe(500);
  });
});
