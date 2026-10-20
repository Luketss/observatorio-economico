// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../services/api", () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { role: "ADMIN_GLOBAL", nome: "Admin" } }) }));

import api from "../../services/api";
import SuporteAdminPage from "./SuporteAdminPage";

const KPIS = { abertos: 3, em_atendimento: 1, abertos_30d: 5, resolvidos_30d: 2, tempo_medio_primeiro_contato_horas: 4.25 };
const TICKET = { id: 7, usuario_id: 2, usuario_nome: "Ana", usuario_email: "ana@alfa.gov.br", usuario_role: "VISUALIZADOR",
  municipio_id: 1, municipio_nome: "Alfa", mensagem: "Nao consigo exportar o grafico do PIB.", whatsapp: "5537999999999",
  canal_preferido: "whatsapp", status: "aberto", criado_em: "2026-10-19T12:00:00Z", atualizado_em: "2026-10-19T12:00:00Z",
  primeiro_contato_em: null, resolvido_em: null };

function mockApi({ tickets = [TICKET], total = 1 } = {}) {
  api.get.mockImplementation((url) => {
    if (url === "/suporte/admin/kpis") return Promise.resolve({ data: KPIS });
    if (url === "/suporte/admin/tickets") return Promise.resolve({ data: { items: tickets, total, skip: 0, limit: 25 } });
    if (url === "/municipios") return Promise.resolve({ data: [{ id: 1, nome: "Alfa", estado: "MG" }, { id: 2, nome: "Beta", estado: "MG" }] });
    return Promise.resolve({ data: {} });
  });
}

describe("SuporteAdminPage", () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi(); });

  it("mostra os KPIs e a lista", async () => {
    render(<SuporteAdminPage />);
    expect(await screen.findByText("ana@alfa.gov.br")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();          // em aberto = abertos + em_atendimento
    expect(screen.getByText(/3 aguardando primeiro contato/)).toBeInTheDocument();
    expect(screen.getByText("4.3 h")).toBeInTheDocument();
    expect(screen.getByText("Alfa")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/suporte/admin/tickets", expect.objectContaining({
      params: expect.objectContaining({ skip: 0, limit: 25 }),
    }));
  });

  it("filtro de status e municipio usa municipio_filtro, nunca municipio_id", async () => {
    render(<SuporteAdminPage />);
    await screen.findByText("ana@alfa.gov.br");
    fireEvent.click(screen.getByRole("button", { name: /^Em atendimento$/ }));
    fireEvent.change(screen.getByLabelText(/Município/), { target: { value: "2" } });
    await waitFor(() => {
      const ultima = api.get.mock.calls.filter((c) => c[0] === "/suporte/admin/tickets").pop();
      expect(ultima[1].params).toEqual({ skip: 0, limit: 25, status: "em_atendimento", municipio_filtro: 2 });
      expect("municipio_id" in ultima[1].params).toBe(false);
    });
  });

  it("ticket sem municipio mostra travessao", async () => {
    mockApi({ tickets: [{ ...TICKET, municipio_id: null, municipio_nome: null }] });
    render(<SuporteAdminPage />);
    await screen.findByText("ana@alfa.gov.br");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("lista vazia tem estado vazio", async () => {
    mockApi({ tickets: [], total: 0 });
    render(<SuporteAdminPage />);
    expect(await screen.findByText(/Nenhuma solicitação/)).toBeInTheDocument();
  });
});
