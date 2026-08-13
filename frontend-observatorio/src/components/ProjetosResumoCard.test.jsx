// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  default: { get: vi.fn() },
}));
import api from "../services/api";
import ProjetosResumoCard from "./ProjetosResumoCard";

const montar = () => render(<MemoryRouter><ProjetosResumoCard /></MemoryRouter>);

describe("ProjetosResumoCard", () => {
  it("mostra contadores e o top de projetos em andamento", async () => {
    api.get.mockResolvedValueOnce({
      data: [
        { id: 1, titulo: "Creche Norte", status: "em_andamento", data_prazo: "2000-01-01", tarefas: [{ id: 1, concluida: true }, { id: 2, concluida: false }] },
        { id: 2, titulo: "Portal", status: "concluido", data_prazo: null, tarefas: [] },
      ],
    });
    montar();
    await waitFor(() => expect(screen.getByText("Creche Norte")).toBeTruthy());
    // Verifica contador com styling de atraso (--accent-2)
    const counterRow = screen.getByText("em andamento").closest("div");
    expect(within(counterRow).getByText(/atrasado/)).toHaveStyle("color: var(--accent-2)");
    // Verifica item da lista com detalhe de dias atrasado
    const lista = screen.getByRole("list");
    expect(within(lista).getByText(/\d+d atrasado/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /ver projetos/i })).toBeTruthy();
  });

  it("sem projetos mostra estado vazio (card não some)", async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    montar();
    await waitFor(() => expect(screen.getByText(/nenhum projeto/i)).toBeTruthy());
  });
});
