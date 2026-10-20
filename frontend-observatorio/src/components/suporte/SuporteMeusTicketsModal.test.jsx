// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../services/api", () => ({ default: { get: vi.fn() } }));
import api from "../../services/api";
import SuporteMeusTicketsModal from "./SuporteMeusTicketsModal";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const T = (over) => ({ id: 1, mensagem: "Nao consigo exportar o PIB", whatsapp: null, canal_preferido: "email",
  status: "aberto", criado_em: "2026-10-19T12:00:00Z", atualizado_em: "2026-10-19T12:00:00Z", ...over });

describe("SuporteMeusTicketsModal", () => {
  it("lista os tickets com data, status e texto, sem botao de responder", async () => {
    api.get.mockResolvedValue({ data: [T(), T({ id: 2, status: "resolvido", mensagem: "Login nao funciona" })] });
    render(<SuporteMeusTicketsModal open onClose={() => {}} onAbrirNovo={() => {}} />);
    expect(await screen.findByText("Nao consigo exportar o PIB")).toBeInTheDocument();
    expect(screen.getByText("Aberto")).toBeInTheDocument();
    expect(screen.getByText("Resolvido")).toBeInTheDocument();
    expect(screen.getAllByText(/19\/10\/2026/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Responder/i })).toBeNull();
    expect(api.get).toHaveBeenCalledWith("/suporte/tickets/meus");
  });

  it("estado vazio oferece abrir solicitacao", async () => {
    api.get.mockResolvedValue({ data: [] });
    const onAbrirNovo = vi.fn();
    render(<SuporteMeusTicketsModal open onClose={() => {}} onAbrirNovo={onAbrirNovo} />);
    await screen.findByText(/ainda não abriu nenhuma solicitação/);
    fireEvent.click(screen.getByRole("button", { name: /Abrir solicitação/ }));
    expect(onAbrirNovo).toHaveBeenCalled();
  });

  it("fechado nao busca nada", () => {
    render(<SuporteMeusTicketsModal open={false} onClose={() => {}} onAbrirNovo={() => {}} />);
    expect(api.get).not.toHaveBeenCalled();
  });
});
