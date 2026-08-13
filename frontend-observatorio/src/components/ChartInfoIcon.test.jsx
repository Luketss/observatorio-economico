// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN_GLOBAL" } }),
}));

vi.mock("../hooks/useEscapeKey", () => ({
  useEscapeKey: () => {},
}));

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import ChartInfoIcon from "./ChartInfoIcon";
import api from "../services/api";

const mockApi = api;

describe("ChartInfoIcon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({
      data: { tooltip: "", descricao: "", fonte: "" },
    });
  });

  it("deve exibir mensagem de erro quando PUT falha", async () => {
    mockApi.put.mockRejectedValueOnce(new Error("Network error"));

    const { container } = render(
      <ChartInfoIcon dataset="pib" indicadorKey="chart_evolucao_pib" />
    );

    // Aguarda fetch inicial
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    // Click no ícone
    const icon = container.querySelector('button[title="Adicionar descrição"]');
    fireEvent.click(icon);

    // Aguarda modal abrir
    await waitFor(() => {
      expect(screen.getByText("Descrição do gráfico")).toBeInTheDocument();
    });

    // Click em "Editar descrição"
    const editBtn = screen.getByText("Editar descrição");
    fireEvent.click(editBtn);

    // Aguarda inputs aparecerem (textarea)
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Ex.: IBGE — SIDRA")
      ).toBeInTheDocument();
    });

    // Click em "Salvar"
    const allButtons = screen.getAllByRole("button");
    const saveBtn = allButtons.find((btn) => btn.textContent.includes("Salvar"));
    fireEvent.click(saveBtn);

    // Aguarda mensagem de erro aparecer
    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível salvar — tente novamente.")
      ).toBeInTheDocument();
    });

    // Verifica que o form continua em edição (input ainda presente)
    expect(
      screen.getByPlaceholderText("Ex.: IBGE — SIDRA")
    ).toBeInTheDocument();
  });

  it("deve fechar modal após salvar com sucesso", async () => {
    mockApi.put.mockResolvedValueOnce({
      data: { tooltip: "t", descricao: "d", fonte: "" },
    });

    const { container } = render(
      <ChartInfoIcon dataset="pib" indicadorKey="chart_evolucao_pib" />
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    // Click no ícone
    const icon = container.querySelector('button[title="Adicionar descrição"]');
    fireEvent.click(icon);

    await waitFor(() => {
      expect(screen.getByText("Descrição do gráfico")).toBeInTheDocument();
    });

    // Click em "Editar descrição"
    const editBtn = screen.getByText("Editar descrição");
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Ex.: IBGE — SIDRA")
      ).toBeInTheDocument();
    });

    // Click em "Salvar"
    const allButtons = screen.getAllByRole("button");
    const saveBtn = allButtons.find((btn) => btn.textContent.includes("Salvar"));
    fireEvent.click(saveBtn);

    // Aguarda inputs desaparecerem (modal volta ao view mode)
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Ex.: IBGE — SIDRA")
      ).not.toBeInTheDocument();
    });

    // Verifica que não há mensagem de erro
    expect(
      screen.queryByText("Não foi possível salvar — tente novamente.")
    ).not.toBeInTheDocument();
  });
});
