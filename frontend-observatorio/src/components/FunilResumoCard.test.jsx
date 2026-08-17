// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  default: { get: vi.fn() },
}));
vi.mock("./ChartInfoIcon", () => ({
  default: ({ dataset, indicadorKey }) => (
    <span data-testid="chart-info" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
import api from "../services/api";
import FunilResumoCard from "./FunilResumoCard";

const montar = (props) => render(<MemoryRouter><FunilResumoCard {...props} /></MemoryRouter>);

describe("FunilResumoCard", () => {
  it("mostra os números do resumo", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        por_estagio: { lead: 4, contato: 2, negociacao: 1, implantacao: 3 },
        valor_total_estimado: 1500000,
        taxa_conversao: 30.0,
      },
    });
    montar();
    await waitFor(() => expect(screen.getByText("10")).toBeTruthy()); // leads somados
    expect(screen.getByText(/30%/)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy(); // em implantação
    expect(screen.getByRole("link", { name: /ver funil/i })).toBeTruthy();
  });

  it("valor potencial usa formato compacto (não transborda a célula do grid)", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        por_estagio: { lead: 4, contato: 2, negociacao: 1, implantacao: 3 },
        valor_total_estimado: 1500000,
        taxa_conversao: 30.0,
      },
    });
    montar();
    await waitFor(() => expect(screen.getByText(/R\$\s?1,5\s?mi/)).toBeTruthy());
    expect(screen.queryByText(/1\.500\.000/)).toBeNull();
  });

  it("funil vazio mostra estado vazio (card não some)", async () => {
    api.get.mockResolvedValueOnce({
      data: { por_estagio: { lead: 0, contato: 0, negociacao: 0, implantacao: 0 }, valor_total_estimado: 0, taxa_conversao: 0 },
    });
    montar();
    await waitFor(() => expect(screen.getByText(/nenhuma oportunidade/i)).toBeTruthy());
  });

  it("erro de API vira estado vazio, sem crash", async () => {
    api.get.mockRejectedValueOnce(new Error("falha"));
    montar();
    await waitFor(() => expect(screen.getByText(/nenhuma oportunidade/i)).toBeTruthy());
  });

  it("sem dataset/indicadorKey não renderiza o ⓘ (comportamento atual preservado)", async () => {
    api.get.mockResolvedValueOnce({
      data: { por_estagio: { lead: 1 }, valor_total_estimado: 100, taxa_conversao: 10 },
    });
    montar();
    await waitFor(() => expect(screen.getByText("Funil de Investimentos")).toBeTruthy());
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });

  it("com dataset e indicadorKey renderiza o ⓘ ao lado do título", async () => {
    api.get.mockResolvedValueOnce({
      data: { por_estagio: { lead: 1 }, valor_total_estimado: 100, taxa_conversao: 10 },
    });
    montar({ dataset: "painel_prefeito", indicadorKey: "card_funil_investimentos" });
    const icon = await screen.findByTestId("chart-info");
    expect(icon.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(icon.getAttribute("data-key")).toBe("card_funil_investimentos");
  });
});
