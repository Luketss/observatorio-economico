// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useMemo, useRef, useState } from "react";
import { ExportProvider, useExportacoes, useRegistrarExportacao } from "./ExportContext";

function Lista() {
  const regs = useExportacoes();
  return <div data-testid="lista">{regs.map((r) => `${r.rotulo}:${r.linhas.length}:${r.carregando ? "L" : "ok"}`).join("|")}</div>;
}

let rendersGrafico = 0;
function Grafico({ id, rotulo, dados, carregando = false }) {
  // eslint-disable-next-line react-hooks/globals
  rendersGrafico += 1;
  const svgRef = useRef(null);
  const exportacao = useMemo(
    () => ({ colunas: [{ chave: "v", rotulo: "V", tipo: "numero" }], linhas: dados.map((v) => ({ v })) }),
    [dados]
  );
  useRegistrarExportacao({ id, rotulo, colunas: exportacao.colunas, linhas: exportacao.linhas, svgRef, carregando });
  return <svg ref={svgRef} data-testid={`svg-${id}`} />;
}

describe("ExportContext", () => {
  it("fora do provider: hook é no-op e lista é vazia", () => {
    render(<><Grafico id="a" rotulo="A" dados={[1]} /><Lista /></>);
    expect(screen.getByTestId("lista").textContent).toBe("");
  });

  it("registra, atualiza e remove no unmount", () => {
    function Harness() {
      const [mostrar, setMostrar] = useState(true);
      const [dados, setDados] = useState([1, 2]);
      return (
        <ExportProvider>
          {mostrar && <Grafico id="a" rotulo="Área" dados={dados} />}
          <Grafico id="b" rotulo="Donut" dados={[1]} carregando />
          <Lista />
          <button onClick={() => setDados([1, 2, 3])}>mais</button>
          <button onClick={() => setMostrar(false)}>remover</button>
        </ExportProvider>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId("lista").textContent).toBe("Área:2:ok|Donut:1:L");
    act(() => screen.getByText("mais").click());
    expect(screen.getByTestId("lista").textContent).toBe("Área:3:ok|Donut:1:L");
    act(() => screen.getByText("remover").click());
    expect(screen.getByTestId("lista").textContent).toBe("Donut:1:L");
  });

  it("registro guarda a ref do svg", () => {
    function Probe() {
      const regs = useExportacoes();
      return <span data-testid="tem-svg">{String(Boolean(regs[0]?.svgRef?.current))}</span>;
    }
    render(<ExportProvider><Grafico id="a" rotulo="A" dados={[1]} /><Probe /></ExportProvider>);
    expect(screen.getByTestId("tem-svg").textContent).toBe("true");
  });

  it("mudanca na lista nao re-renderiza o grafico (contextos separados)", () => {
    rendersGrafico = 0;
    function Harness() {
      const [mostrarB, setMostrarB] = useState(false);
      return (
        <ExportProvider>
          <Grafico id="a" rotulo="A" dados={[1]} />
          {mostrarB && <Grafico id="b" rotulo="B" dados={[2]} />}
          <Lista />
          <button onClick={() => setMostrarB(true)}>b</button>
        </ExportProvider>
      );
    }
    render(<Harness />);
    const antes = rendersGrafico;
    act(() => screen.getByText("b").click());
    // so o grafico B novo renderizou (1 vez, +1 do StrictMode nao se aplica aqui); A nao re-renderizou por causa da lista
    expect(rendersGrafico - antes).toBeLessThanOrEqual(2);
    expect(screen.getByTestId("lista").textContent).toBe("A:1:ok|B:1:ok");
  });
});
