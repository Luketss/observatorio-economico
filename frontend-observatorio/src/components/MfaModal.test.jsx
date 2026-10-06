// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MfaModal from "./MfaModal";
import api from "../services/api";

vi.mock("../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const addToast = vi.fn();
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: { div: ({ children, ...p }) => <div onClick={p.onClick}>{children}</div>, form: ({ children, onSubmit }) => <form onSubmit={onSubmit}>{children}</form> },
}));

const statusInativo = { data: { data: { ativo: false, ativado_em: null, codigos_restantes: 0 } } };
const statusAtivo = { data: { data: { ativo: true, ativado_em: "2026-10-06T10:00:00Z", codigos_restantes: 10 } } };

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

describe("MfaModal", () => {
  it("inativo: mostra Ativar; fluxo QR -> confirmar -> codigos; Concluir so apos copiar", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockResolvedValueOnce({ data: { data: { otpauth_url: "otpauth://totp/x", segredo: "JBSWY3DPEHPK3PXP", qr_svg: "<svg data-testid='qr'></svg>" } } });
    api.post.mockResolvedValueOnce({ data: { data: { codigos_recuperacao: ["AAAA-1111", "BBBB-2222"] } } });
    const onClose = vi.fn();
    render(<MfaModal open onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    fireEvent.click(screen.getByRole("button", { name: /App autenticador/i }));
    await screen.findByText("JBSWY3DPEHPK3PXP");
    expect(api.post).toHaveBeenCalledWith("/auth/mfa/configurar", { metodo: "totp" });
    const campo = screen.getByLabelText(/Código do app/i);
    fireEvent.change(campo, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("AAAA-1111");
    expect(api.post).toHaveBeenLastCalledWith("/auth/mfa/ativar", { codigo: "123456" });
    const concluir = screen.getByRole("button", { name: "Concluir" });
    expect(concluir).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Copiar todos/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("AAAA-1111\nBBBB-2222"));
    await waitFor(() => expect(concluir).not.toBeDisabled());
    fireEvent.click(concluir);
    expect(onClose).toHaveBeenCalled();
  });

  it("marcar 'ja guardei' tambem habilita Concluir", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockResolvedValueOnce({ data: { data: { otpauth_url: "o", segredo: "S", qr_svg: "<svg></svg>" } } });
    api.post.mockResolvedValueOnce({ data: { data: { codigos_recuperacao: ["AAAA-1111"] } } });
    render(<MfaModal open onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    fireEvent.click(screen.getByRole("button", { name: /App autenticador/i }));
    fireEvent.change(await screen.findByLabelText(/Código do app/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("AAAA-1111");
    fireEvent.click(screen.getByLabelText(/Já guardei/i));
    expect(screen.getByRole("button", { name: "Concluir" })).not.toBeDisabled();
  });

  it("codigo errado no confirmar mostra erro e permanece no passo", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockResolvedValueOnce({ data: { data: { otpauth_url: "o", segredo: "S", qr_svg: "<svg></svg>" } } });
    api.post.mockRejectedValueOnce({ response: { status: 401, data: { error: { message: "Codigo invalido" } } } });
    render(<MfaModal open onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    fireEvent.click(screen.getByRole("button", { name: /App autenticador/i }));
    fireEvent.change(await screen.findByLabelText(/Código do app/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/inválido|invalido/i);
    expect(screen.getByLabelText(/Código do app/i)).toBeInTheDocument();
  });

  it("ativo: mostra data, codigos restantes e Desativar exige senha + codigo", async () => {
    api.get.mockResolvedValueOnce(statusAtivo);
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    const onClose = vi.fn();
    render(<MfaModal open onClose={onClose} />);
    expect(await screen.findByText(/10 códigos de recuperação restantes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Desativar/i }));
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "senha" } });
    fireEvent.change(screen.getByLabelText(/Código/i), { target: { value: "AAAA-1111" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar desativação/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/mfa/desativar", { senha_atual: "senha", codigo: "AAAA-1111" }));
    expect(addToast).toHaveBeenCalledWith("Verificação em duas etapas desativada.", "success");
    expect(onClose).toHaveBeenCalled();
  });

  it("503 do servidor mostra 'indisponível' e esconde Ativar", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 503, data: { error: { code: "MFA_INDISPONIVEL", message: "MFA indisponivel no servidor" } } } });
    render(<MfaModal open onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/indispon/i);
    expect(screen.queryByRole("button", { name: /Ativar verificação/i })).toBeNull();
  });

  it("409 ao configurar (ja ativo) e mostrado", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: { message: "MFA ja esta ativo" } } } });
    render(<MfaModal open onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    fireEvent.click(screen.getByRole("button", { name: /App autenticador/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ativo/i);
  });

  it("Ativar mostra as duas opcoes com o e-mail do usuario", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    render(<MfaModal open onClose={() => {}} emailUsuario="ana@x.gov.br" />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    expect(screen.getByRole("button", { name: /App autenticador/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Código por e-mail \(ana@x\.gov\.br\)/i })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("metodo e-mail pula o QR: envia o codigo, confirma e mostra os codigos de recuperacao", async () => {
    api.get.mockResolvedValueOnce(statusInativo);
    api.post.mockResolvedValueOnce({ data: { data: { metodo: "email", enviado_para: "a***@x.gov.br" } } });
    api.post.mockResolvedValueOnce({ data: { data: { codigos_recuperacao: ["AAAA-1111"] } } });
    render(<MfaModal open onClose={() => {}} emailUsuario="ana@x.gov.br" />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar verificação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Código por e-mail/i }));
    expect(await screen.findByText(/Enviamos um código para a\*\*\*@x\.gov\.br/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/auth/mfa/configurar", { metodo: "email" });
    expect(screen.queryByText(/Leia o QR/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Código do e-mail/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("AAAA-1111");
    expect(api.post).toHaveBeenLastCalledWith("/auth/mfa/ativar", { codigo: "123456" });
  });

  it("ativo por e-mail mostra o metodo e Desativar pede o codigo por e-mail antes", async () => {
    api.get.mockResolvedValueOnce({ data: { data: { ativo: true, ativado_em: "2026-10-06T10:00:00Z", codigos_restantes: 9, metodo: "email" } } });
    api.post.mockResolvedValueOnce({ data: { enviado_para: "a***@x.gov.br" } });
    api.post.mockResolvedValueOnce({ data: { ok: true } });
    render(<MfaModal open onClose={() => {}} emailUsuario="ana@x.gov.br" />);
    expect(await screen.findByText(/código por e-mail/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Desativar/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/mfa/enviar-codigo"));
    expect(await screen.findByText(/Enviamos um código para a\*\*\*@x\.gov\.br/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: "senha" } });
    fireEvent.change(screen.getByLabelText(/^Código$/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar desativação/i }));
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith("/auth/mfa/desativar", { senha_atual: "senha", codigo: "654321" }));
  });
});
