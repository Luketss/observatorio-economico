// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link, useLocation } from "react-router-dom";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN_GLOBAL" } }),
}));

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import KpiCard from "./KpiCard";
import api from "../services/api";

const mockApi = api;

describe("KpiCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({
      data: { tooltip: "PIB a preços correntes", descricao: "", fonte: "" },
    });
  });

  it("bolha do tooltip segue o tema (.nid-info-tip) e não usa cor hardcoded", async () => {
    render(
      <KpiCard
        label="PIB Último Ano"
        value="R$ 1,2 bi"
        dataset="pib"
        indicadorKey="ultimo_ano"
      />
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    const icon = screen.getByRole("button", { name: "Ver descrição" });
    fireEvent.mouseEnter(icon);

    const tip = await screen.findByText("PIB a preços correntes");
    expect(tip.className).toContain("nid-info-tip");
    expect(tip.className).not.toContain("bg-[var(--panel)]");
    // Bolha abaixo do ícone: notch aponta para cima (portal — busca a partir da própria bolha)
    expect(tip.querySelector(".nid-info-tip__arrow--up")).not.toBeNull();
  });

  it("botão com conteúdo não duplica title (tooltip custom já cobre o hover)", async () => {
    render(
      <KpiCard
        label="PIB Último Ano"
        value="R$ 1,2 bi"
        dataset="pib"
        indicadorKey="ultimo_ano"
      />
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    const icon = screen.getByRole("button", { name: "Ver descrição" });
    expect(icon).not.toHaveAttribute("title");
  });

  it("botão sem conteúdo (admin, indicador ainda sem descrição) mantém title nativo — não há tooltip custom nesse branch", async () => {
    mockApi.get.mockResolvedValue({
      data: { tooltip: "", descricao: "", fonte: "" },
    });

    render(
      <KpiCard
        label="PIB Último Ano"
        value="R$ 1,2 bi"
        dataset="pib"
        indicadorKey="ultimo_ano"
      />
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    const icon = screen.getByRole("button", { name: "Adicionar descrição" });
    expect(icon).toHaveAttribute("title", "Adicionar descrição");
  });

  it("botão ⓘ tem affordance de hover token-safe (nid-info-btn)", async () => {
    render(
      <KpiCard
        label="PIB Último Ano"
        value="R$ 1,2 bi"
        dataset="pib"
        indicadorKey="ultimo_ano"
      />
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    const icon = screen.getByRole("button", { name: "Ver descrição" });
    expect(icon.className).toContain("nid-info-btn");
  });

  describe("dentro de um <Link> (Painel do Prefeito envolve o KpiCard em Link)", () => {
    function LocationProbe() {
      const location = useLocation();
      return <div data-testid="location">{location.pathname}</div>;
    }

    const montarDentroDeLink = () =>
      render(
        <MemoryRouter initialEntries={["/inicio"]}>
          <LocationProbe />
          <Routes>
            <Route
              path="/inicio"
              element={
                <Link to="/destino" className="block">
                  <KpiCard
                    label="PIB Último Ano"
                    value="R$ 1,2 bi"
                    dataset="pib"
                    indicadorKey="ultimo_ano"
                  />
                </Link>
              }
            />
            <Route path="/destino" element={<div>Destino</div>} />
          </Routes>
        </MemoryRouter>
      );

    it("clicar no ⓘ abre o modal e NÃO navega pelo Link pai", async () => {
      montarDentroDeLink();

      await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

      const icon = screen.getByRole("button", { name: "Ver descrição" });
      fireEvent.click(icon);

      expect(await screen.findByText("Indicador")).toBeInTheDocument();
      expect(screen.getByTestId("location").textContent).toBe("/inicio");
    });

    it("clicar em 'Editar descrição' dentro do modal aberto também NÃO navega", async () => {
      montarDentroDeLink();

      await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

      const icon = screen.getByRole("button", { name: "Ver descrição" });
      fireEvent.click(icon);
      await screen.findByText("Indicador");

      const editBtn = screen.getByText("Editar descrição");
      fireEvent.click(editBtn);

      expect(
        await screen.findByText("Tooltip (texto curto no hover)")
      ).toBeInTheDocument();
      expect(screen.getByTestId("location").textContent).toBe("/inicio");
    });

    it("fechar o modal pelo botão X dentro do Link também NÃO navega", async () => {
      montarDentroDeLink();

      await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

      const icon = screen.getByRole("button", { name: "Ver descrição" });
      fireEvent.click(icon);
      await screen.findByText("Indicador");

      const buttons = screen.getAllByRole("button");
      const closeBtn = buttons.find(
        (b) => b !== icon && !b.textContent.includes("Editar descrição")
      );
      fireEvent.click(closeBtn);

      await waitFor(() => expect(screen.queryByText("Indicador")).not.toBeInTheDocument());
      expect(screen.getByTestId("location").textContent).toBe("/inicio");
    });
  });
});
