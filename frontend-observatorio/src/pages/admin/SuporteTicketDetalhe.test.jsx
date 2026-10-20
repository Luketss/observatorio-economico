// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const addToast = vi.fn();
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));

import api from "../../services/api";
import SuporteTicketDetalhe from "./SuporteTicketDetalhe";

const DET = { id: 7, usuario_id: 2, usuario_nome: "Ana", usuario_email: "ana@alfa.gov.br", usuario_role: "VISUALIZADOR",
  municipio_id: 1, municipio_nome: "Alfa", mensagem: "Nao consigo exportar o grafico do PIB.", whatsapp: "5537999999999",
  canal_preferido: "whatsapp", status: "aberto", criado_em: "2026-10-19T12:00:00Z", atualizado_em: "2026-10-19T12:00:00Z",
  primeiro_contato_em: null, resolvido_em: null,
  eventos: [{ id: 1, tipo: "abertura", status_de: null, status_para: null, texto: null, autor_email: "ana@alfa.gov.br", criado_em: "2026-10-19T12:00:00Z" }] };

describe("SuporteTicketDetalhe", () => {
  beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: DET }); });

  it("mostra contatos com links de e-mail e WhatsApp e o historico", async () => {
    render(<SuporteTicketDetalhe ticketId={7} onClose={() => {}} onAtualizado={() => {}} />);
    expect(await screen.findByText("Nao consigo exportar o grafico do PIB.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Responder por e-mail/ }).getAttribute("href"))
      .toBe("mailto:ana@alfa.gov.br?subject=" + encodeURIComponent("Suporte NID – solicitação #7"));
    const wa = screen.getByRole("link", { name: /Chamar no WhatsApp/ });
    expect(wa.getAttribute("href")).toContain("https://wa.me/5537999999999?text=");
    expect(decodeURIComponent(wa.getAttribute("href"))).toContain("solicitação #7");
    expect(screen.getByText("Solicitação aberta")).toBeInTheDocument();
  });

  it("sem WhatsApp o botao fica desabilitado", async () => {
    api.get.mockResolvedValue({ data: { ...DET, whatsapp: null, canal_preferido: "email" } });
    render(<SuporteTicketDetalhe ticketId={7} onClose={() => {}} onAtualizado={() => {}} />);
    await screen.findByText(/não informado/);
    expect(screen.queryByRole("link", { name: /Chamar no WhatsApp/ })).toBeNull();
  });

  it("alterar status chama o PATCH e avisa", async () => {
    const atualizado = { ...DET, status: "em_atendimento", primeiro_contato_em: "2026-10-19T13:00:00Z",
      eventos: [...DET.eventos, { id: 2, tipo: "status", status_de: "aberto", status_para: "em_atendimento", texto: "liguei", autor_email: "admin@x.com", criado_em: "2026-10-19T13:00:00Z" }] };
    api.patch.mockResolvedValue({ data: atualizado });
    const onAtualizado = vi.fn();
    render(<SuporteTicketDetalhe ticketId={7} onClose={() => {}} onAtualizado={onAtualizado} />);
    await screen.findByText("Solicitação aberta");
    fireEvent.change(screen.getByLabelText("Novo status"), { target: { value: "em_atendimento" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "liguei" } });
    fireEvent.click(screen.getByRole("button", { name: /Alterar status/ }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/suporte/admin/tickets/7/status", { status: "em_atendimento", texto: "liguei" }));
    expect(await screen.findByText(/Aberto → Em atendimento/)).toBeInTheDocument();
    expect(onAtualizado).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith("Status atualizado.", "success");
  });

  it("registrar anotacao chama o POST", async () => {
    api.post.mockResolvedValue({ data: { ...DET, eventos: [...DET.eventos, { id: 3, tipo: "anotacao", status_de: null, status_para: null, texto: "respondido por e-mail", autor_email: "admin@x.com", criado_em: "2026-10-19T14:00:00Z" }] } });
    render(<SuporteTicketDetalhe ticketId={7} onClose={() => {}} onAtualizado={() => {}} />);
    await screen.findByText("Solicitação aberta");
    fireEvent.change(screen.getByLabelText(/Anotação interna/), { target: { value: "respondido por e-mail" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/suporte/admin/tickets/7/anotacoes", { texto: "respondido por e-mail" }));
    expect(await screen.findByText("respondido por e-mail")).toBeInTheDocument();
  });
});
