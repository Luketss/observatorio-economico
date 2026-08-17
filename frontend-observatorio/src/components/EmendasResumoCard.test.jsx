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
import EmendasResumoCard from "./EmendasResumoCard";

const resumo = {
  disponivel: true,
  total_empenhado: 3_000_000,
  ano: 2024,
  num_parlamentares: 4,
  top_autor: "Fulano de Tal",
};

const montar = (props) => render(<MemoryRouter><EmendasResumoCard {...props} /></MemoryRouter>);

describe("EmendasResumoCard", () => {
  it("sem dataset/indicadorKey não renderiza o ⓘ (comportamento atual preservado)", async () => {
    api.get.mockResolvedValueOnce({ data: resumo });
    montar();
    await waitFor(() => expect(screen.getByText(/radar de emendas/i)).toBeTruthy());
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });

  it("com dataset e indicadorKey renderiza o ⓘ ao lado do título", async () => {
    api.get.mockResolvedValueOnce({ data: resumo });
    montar({ dataset: "painel_prefeito", indicadorKey: "card_emendas" });
    const icon = await screen.findByTestId("chart-info");
    expect(icon.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(icon.getAttribute("data-key")).toBe("card_emendas");
  });

  it("sem dados disponíveis o card continua null (comportamento preservado mesmo com props)", async () => {
    api.get.mockResolvedValueOnce({ data: { disponivel: false } });
    const { container } = montar({ dataset: "painel_prefeito", indicadorKey: "card_emendas" });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
