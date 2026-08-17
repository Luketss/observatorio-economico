// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "PREFEITO" } }),
}));
vi.mock("../../context/ViewAsContext", () => ({
  useViewAs: () => ({ viewAsId: null }),
}));
vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: null })) },
}));
vi.mock("../../components/PrioridadesPanel", () => ({ default: () => null }));
vi.mock("../../components/AlertaFpmCard", () => ({ default: () => null }));

vi.mock("../../components/KpiCard", () => ({
  default: ({ label, dataset, indicadorKey }) => (
    <div data-testid="kpi" data-label={label} data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
vi.mock("../../components/FunilResumoCard", () => ({
  default: ({ dataset, indicadorKey }) => (
    <div data-testid="funil-card" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
vi.mock("../../components/ProjetosResumoCard", () => ({
  default: ({ dataset, indicadorKey }) => (
    <div data-testid="projetos-card" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
vi.mock("../../components/DinheiroNaMesaCard", () => ({
  default: ({ dataset, indicadorKey }) => (
    <div data-testid="dinheiro-card" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
vi.mock("../../components/EmendasResumoCard", () => ({
  default: ({ dataset, indicadorKey }) => (
    <div data-testid="emendas-card" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));

import PainelPrefeitoPage from "./PainelPrefeitoPage";

const montar = () => render(<MemoryRouter><PainelPrefeitoPage /></MemoryRouter>);

describe("PainelPrefeitoPage — plumbing de ⓘ (dataset/indicadorKey)", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("modo gerencial: os 4 KpiCards recebem dataset painel_prefeito e indicadorKey kpi_<chave>", async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(4));
    const kpis = screen.getAllByTestId("kpi");
    const chaves = kpis.map((k) => k.getAttribute("data-key"));
    expect(chaves).toEqual(["kpi_pib", "kpi_arrecadacao", "kpi_caged", "kpi_vaf"]);
    kpis.forEach((k) => expect(k.getAttribute("data-dataset")).toBe("painel_prefeito"));
  });

  it("modo gerencial: FunilResumoCard e ProjetosResumoCard recebem dataset/indicadorKey", async () => {
    montar();
    const funil = await screen.findByTestId("funil-card");
    expect(funil.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(funil.getAttribute("data-key")).toBe("card_funil_investimentos");

    const projetos = screen.getByTestId("projetos-card");
    expect(projetos.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(projetos.getAttribute("data-key")).toBe("card_projetos");
  });

  it("DinheiroNaMesaCard e EmendasResumoCard recebem dataset/indicadorKey (independente do modo)", async () => {
    montar();
    const dinheiro = await screen.findByTestId("dinheiro-card");
    expect(dinheiro.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(dinheiro.getAttribute("data-key")).toBe("card_dinheiro_na_mesa");

    const emendas = screen.getByTestId("emendas-card");
    expect(emendas.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(emendas.getAttribute("data-key")).toBe("card_emendas");
  });

  it("modo detalhado: os 13 KpiCards do panorama recebem dataset painel_prefeito e indicadorKey kpi_<chave>", async () => {
    localStorage.setItem("nid-painel-modo", "detalhado");
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(13));
    const kpis = screen.getAllByTestId("kpi");
    const chaves = kpis.map((k) => k.getAttribute("data-key"));
    expect(chaves).toEqual([
      "kpi_arrecadacao", "kpi_pib", "kpi_vaf", "kpi_caged", "kpi_rais", "kpi_empresas",
      "kpi_estban", "kpi_comex", "kpi_pix", "kpi_bolsa_familia", "kpi_pe_de_meia", "kpi_inss", "kpi_ips",
    ]);
    kpis.forEach((k) => expect(k.getAttribute("data-dataset")).toBe("painel_prefeito"));
  });
});
