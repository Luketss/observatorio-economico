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
import DinheiroNaMesaCard from "./DinheiroNaMesaCard";

const resumo = {
  disponivel: true,
  media_pares: 2_000_000,
  voce_firmado: 500_000,
  dinheiro_na_mesa: 1_500_000,
  acima_da_media: false,
  ano_referencia: 2024,
  total_grupo: 12,
};

const montar = (props) => render(<MemoryRouter><DinheiroNaMesaCard {...props} /></MemoryRouter>);

describe("DinheiroNaMesaCard", () => {
  it("sem dataset/indicadorKey não renderiza o ⓘ (comportamento atual preservado)", async () => {
    api.get.mockResolvedValueOnce({ data: resumo });
    montar();
    await waitFor(() => expect(screen.getByText(/dinheiro na mesa/i)).toBeTruthy());
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });

  it("com dataset e indicadorKey renderiza o ⓘ ao lado do título", async () => {
    api.get.mockResolvedValueOnce({ data: resumo });
    montar({ dataset: "painel_prefeito", indicadorKey: "card_dinheiro_na_mesa" });
    const icon = await screen.findByTestId("chart-info");
    expect(icon.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(icon.getAttribute("data-key")).toBe("card_dinheiro_na_mesa");
  });

  it("sem dados disponíveis o card continua null (comportamento preservado mesmo com props)", async () => {
    api.get.mockResolvedValueOnce({ data: { disponivel: false } });
    const { container } = montar({ dataset: "painel_prefeito", indicadorKey: "card_dinheiro_na_mesa" });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
