// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const addToast = vi.fn();
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { nome: "Ana", email: "ana@x.gov.br" } }) }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));
vi.mock("../../services/api", () => ({ default: { post: vi.fn() } }));

import api from "../../services/api";
import SuporteTicketModal from "./SuporteTicketModal";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const digitar = (label, valor) => fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });
const enviar = () => fireEvent.click(screen.getByRole("button", { name: /^Enviar/ }));

describe("SuporteTicketModal", () => {
  it("mostra nome e e-mail que vao junto e o aviso de terceiros", () => {
    render(<SuporteTicketModal open onClose={() => {}} />);
    expect(screen.getByText(/Ana · ana@x.gov.br/)).toBeInTheDocument();
    expect(screen.getByText(/Não inclua dados pessoais de terceiros/)).toBeInTheDocument();
  });

  it("bloqueia envio com mensagem curta", () => {
    render(<SuporteTicketModal open onClose={() => {}} />);
    digitar(/Conte o que aconteceu/, "oi");
    enviar();
    expect(screen.getByText(/pelo menos 10 caracteres/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("canal WhatsApp exige numero", () => {
    render(<SuporteTicketModal open onClose={() => {}} />);
    digitar(/Conte o que aconteceu/, "Nao consigo exportar o PIB");
    fireEvent.click(screen.getByLabelText(/^WhatsApp$/));
    enviar();
    expect(screen.getByText(/Informe o WhatsApp/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("envia o payload, mostra toast e fecha", async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    const onClose = vi.fn();
    render(<SuporteTicketModal open onClose={onClose} />);
    digitar(/Conte o que aconteceu/, "Nao consigo exportar o PIB");
    digitar(/WhatsApp para contato/, "(37) 99999-9999");
    fireEvent.click(screen.getByLabelText(/^WhatsApp$/));
    enviar();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/suporte/tickets", {
      mensagem: "Nao consigo exportar o PIB", whatsapp: "(37) 99999-9999", canal_preferido: "whatsapp",
    });
    expect(addToast).toHaveBeenCalledWith("Solicitação enviada. Vamos entrar em contato por WhatsApp.", "success");
  });

  it("erro 429 mostra texto amigavel e nao fecha", async () => {
    api.post.mockRejectedValue({ response: { status: 429, data: { error: "Rate limit exceeded" } } });
    const onClose = vi.fn();
    render(<SuporteTicketModal open onClose={onClose} />);
    digitar(/Conte o que aconteceu/, "Nao consigo exportar o PIB");
    enviar();
    await screen.findByText(/muitas solicitações/);
    expect(onClose).not.toHaveBeenCalled();
  });
});
