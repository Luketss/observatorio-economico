// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  default: { get: vi.fn() },
}));
import api from "../services/api";
import FunilResumoCard from "./FunilResumoCard";

const montar = () => render(<MemoryRouter><FunilResumoCard /></MemoryRouter>);

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
});
