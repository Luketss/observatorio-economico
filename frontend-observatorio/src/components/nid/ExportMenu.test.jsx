// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo, useRef } from "react";
import ExportMenu from "./ExportMenu";
import { ExportProvider, useRegistrarExportacao } from "./ExportContext";
import api from "../../services/api";
import * as exportar from "../../utils/exportar";

const auth = { user: { id: 1, role: "ADMIN_GLOBAL" } };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth }));
const viewAs = { viewAsId: null, viewAsNome: null };
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAs }));
const addToast = vi.fn();
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));
vi.mock("../../services/api", () => ({ default: { post: vi.fn() } }));
vi.mock("../../utils/exportar", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, baixarBlob: vi.fn(), svgParaPng: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))) };
});

function Grafico({ id = "g1", rotulo = "Área", linhas = [{ periodo: "2021", valor: 1 }], carregando = false, comSvg = true }) {
  const svgRef = useRef(null);
  const exp = useMemo(() => ({ colunas: [{ chave: "periodo", rotulo: "Período", tipo: "texto" }, { chave: "valor", rotulo: "Valor", tipo: "numero" }], linhas }), [linhas]);
  useRegistrarExportacao({ id, rotulo, colunas: exp.colunas, linhas: exp.linhas, svgRef: comSvg ? svgRef : null, carregando });
  return comSvg ? <svg ref={svgRef} viewBox="0 0 10 10" /> : <div />;
}

function montar(props = {}, graficos = <Grafico />) {
  return render(
    <ExportProvider>
      {graficos}
      <ExportMenu titulo="Evolução Anual do PIB" sub="PIB total por ano" dataset="pib" {...props} />
    </ExportProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 1, role: "ADMIN_GLOBAL" };
  viewAs.viewAsNome = null;
  window.history.replaceState({}, "", "/app/pib");
});

describe("ExportMenu — gating", () => {
  it("ADMIN_GLOBAL com gráfico registrado vê o botão", () => {
    montar();
    expect(screen.getByRole("button", { name: /exportar/i })).toBeInTheDocument();
  });
  it("VISUALIZADOR e ADMIN_MUNICIPIO não veem nada", () => {
    for (const papel of ["VISUALIZADOR", "ADMIN_MUNICIPIO"]) {
      auth.user = { id: 2, role: papel };
      const { unmount } = montar();
      expect(screen.queryByRole("button", { name: /exportar/i })).toBeNull();
      unmount();
    }
  });
  it("sem gráfico registrado não renderiza", () => {
    montar({}, null);
    expect(screen.queryByRole("button", { name: /exportar/i })).toBeNull();
  });
  it("gráfico carregando → botão desabilitado com tooltip", () => {
    montar({}, <Grafico carregando />);
    const b = screen.getByRole("button", { name: /exportar/i });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAttribute("title", "Sem dados para exportar");
    fireEvent.click(b);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("gráfico sem linhas → desabilitado", () => {
    montar({}, <Grafico linhas={[]} />);
    expect(screen.getByRole("button", { name: /exportar/i })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("ExportMenu — itens e ações", () => {
  it("abre com CSV, XLSX e PNG; gráfico sem svg não tem PNG", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    const itens = screen.getAllByRole("menuitem").map((e) => e.textContent);
    expect(itens).toEqual(["CSV", "XLSX", "PNG"]);
  });
  it("sem svg (gráfico HTML) → sem item PNG", () => {
    montar({}, <Grafico comSvg={false} />);
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    expect(screen.getAllByRole("menuitem").map((e) => e.textContent)).toEqual(["CSV", "XLSX"]);
  });
  it("dois gráficos → itens prefixados pelo rótulo", () => {
    montar({}, <><Grafico id="a" rotulo="Saldo" /><Grafico id="b" rotulo="Ranking" comSvg={false} /></>);
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    expect(screen.getAllByRole("menuitem").map((e) => e.textContent)).toEqual([
      "CSV · Saldo", "XLSX · Saldo", "PNG · Saldo", "CSV · Ranking", "XLSX · Ranking",
    ]);
  });
  it("CSV baixa blob text/csv com nome em slug e município do view-as", () => {
    viewAs.viewAsNome = "Divinópolis";
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
    expect(exportar.baixarBlob).toHaveBeenCalledTimes(1);
    const [blob, nome] = exportar.baixarBlob.mock.calls[0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(nome).toMatch(/^nid_pib_evolucao-anual-do-pib_divinopolis_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(screen.queryByRole("menu")).toBeNull(); // fecha após agir
  });
  it("XLSX chama POST /export/xlsx com colunas, linhas, fonte e dataset, e baixa o blob", async () => {
    api.post.mockResolvedValueOnce({ data: new Blob(["x"], { type: "application/octet-stream" }) });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "XLSX" }));
    await waitFor(() => expect(exportar.baixarBlob).toHaveBeenCalledTimes(1));
    const [url, payload, cfg] = api.post.mock.calls[0];
    expect(url).toBe("/export/xlsx");
    expect(cfg).toEqual({ responseType: "blob" });
    expect(payload).toMatchObject({
      titulo: "Evolução Anual do PIB",
      subtitulo: "PIB total por ano",
      fonte: "IBGE",
      dataset: "pib",
      municipio: null,
      colunas: [{ chave: "periodo", rotulo: "Período", tipo: "texto" }, { chave: "valor", rotulo: "Valor", tipo: "numero" }],
      linhas: [{ periodo: "2021", valor: 1 }],
    });
    expect(exportar.baixarBlob.mock.calls[0][1]).toMatch(/\.xlsx$/);
  });
  it("XLSX 422 → toast de limite; outro erro → toast genérico", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 422 } });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "XLSX" }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith("Tabela grande demais para exportar (limite de 50 mil células)", "error"));
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "XLSX" }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith("Falha ao gerar a planilha. Tente novamente.", "error"));
    expect(exportar.baixarBlob).not.toHaveBeenCalled();
  });
  it("PNG chama svgParaPng com título, sub string e rodapé com fonte, e baixa", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "PNG" }));
    await waitFor(() => expect(exportar.baixarBlob).toHaveBeenCalledTimes(1));
    const [svgEl, opts] = exportar.svgParaPng.mock.calls[0];
    expect(svgEl.tagName.toLowerCase()).toBe("svg");
    expect(opts.titulo).toBe("Evolução Anual do PIB");
    expect(opts.sub).toBe("PIB total por ano");
    expect(opts.rodape).toMatch(/^Fonte: IBGE · UAIZI NID · \d{2}\/\d{2}\/\d{4}$/);
    expect(exportar.baixarBlob.mock.calls[0][1]).toMatch(/\.png$/);
  });
  it("sub que não é string vira vazio", async () => {
    montar({ sub: <em>nó</em> });
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "PNG" }));
    await waitFor(() => expect(exportar.svgParaPng).toHaveBeenCalled());
    expect(exportar.svgParaPng.mock.calls[0][1].sub).toBe("");
  });
  it("PNG que falha → toast com a mensagem do erro", async () => {
    exportar.svgParaPng.mockRejectedValueOnce(new Error("Não foi possível gerar a imagem neste navegador"));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "PNG" }));
    await waitFor(() => expect(addToast).toHaveBeenCalledWith("Não foi possível gerar a imagem neste navegador", "error"));
  });
  it("sem prop dataset usa o pathname para fonte e nome", () => {
    window.history.replaceState({}, "", "/app/caged");
    montar({ dataset: undefined });
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
    expect(exportar.baixarBlob.mock.calls[0][1]).toMatch(/^nid_caged_/);
  });
});

describe("ExportMenu — teclado e foco", () => {
  it("Esc fecha e devolve o foco ao botão; clique fora fecha", () => {
    montar();
    const botao = screen.getByRole("button", { name: /exportar/i });
    fireEvent.click(botao);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(botao);
    fireEvent.click(botao);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("botão tem aria-haspopup e aria-expanded", () => {
    montar();
    const botao = screen.getByRole("button", { name: /exportar/i });
    expect(botao).toHaveAttribute("aria-haspopup", "menu");
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
  });
});
