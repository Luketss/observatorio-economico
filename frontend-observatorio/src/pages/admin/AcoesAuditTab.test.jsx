// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn() },
}));

import AcoesAuditTab from "./AcoesAuditTab";
import api from "../../services/api";

const LINHA = {
  id: 1,
  categoria: "acao",
  acao: "usuario_criado",
  ator_id: 1,
  ator_email: "admin@x.com",
  ator_nome: "Admin",
  alvo_usuario_id: 2,
  alvo_email: "novo@x.com",
  municipio_id: null,
  detalhe: "role: VISUALIZADOR | municipio: None",
  ip: "1.2.3.4",
  criado_em: "2026-08-16T12:00:00Z",
};

describe("AcoesAuditTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { items: [LINHA], total: 1 } });
  });

  it("carrega e exibe as linhas da trilha", async () => {
    render(<AcoesAuditTab />);
    await waitFor(() => {
      expect(screen.getByText("admin@x.com")).toBeInTheDocument();
    });
    expect(screen.getByText("novo@x.com")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      "/admin/auditoria/acoes",
      expect.objectContaining({
        params: expect.objectContaining({ skip: 0, limit: 25 }),
      })
    );
  });

  it("filtro de categoria refaz a busca com o param", async () => {
    render(<AcoesAuditTab />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Filtrar por categoria"), {
      target: { value: "leitura" },
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith(
        "/admin/auditoria/acoes",
        expect.objectContaining({
          params: expect.objectContaining({ categoria: "leitura" }),
        })
      );
    });
  });

  it("erro de rede mostra mensagem", async () => {
    api.get.mockRejectedValueOnce(new Error("boom"));
    render(<AcoesAuditTab />);
    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível carregar a trilha de ações.")
      ).toBeInTheDocument();
    });
  });
});
