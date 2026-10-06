// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RedefinirSenhaPage from "./RedefinirSenhaPage";
import api from "../../services/api";

vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("framer-motion", () => ({ motion: new Proxy({}, { get: () => ({ children, ...p }) => <div {...Object.fromEntries(Object.entries(p).filter(([k]) => !["initial","animate","transition","exit","whileHover","whileTap"].includes(k)))}>{children}</div> }) }));
vi.mock("../../assets/bg.jpeg", () => ({ default: "" }));
vi.mock("../../assets/nid_fundo_transparente.png", () => ({ default: "" }));
vi.mock("../../assets/logo_uaizi.png", () => ({ default: "" }));

const RESP_410 = { response: { status: 410, data: { error: { code: "TOKEN_INVALIDO", message: "Link invalido" } } } };

function montar(url = "/redefinir-senha?token=tok-abc") {
  return render(<MemoryRouter initialEntries={[url]}><RedefinirSenhaPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe("RedefinirSenhaPage", () => {
  it("410 na validacao mostra link expirado e oferece pedir outro", async () => {
    api.get.mockRejectedValueOnce(RESP_410);
    montar();
    expect(await screen.findByText(/Este link expirou ou já foi usado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir outro link" })).toHaveAttribute("href", "/esqueci-senha");
    expect(api.get).toHaveBeenCalledWith("/auth/redefinir-senha/validar", { params: { token: "tok-abc" } });
  });

  it("sem token na URL mostra invalido sem chamar a API", async () => {
    montar("/redefinir-senha");
    expect(await screen.findByText(/Este link expirou ou já foi usado/)).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("200 mostra o formulario com o e-mail mascarado; senhas diferentes bloqueiam sem chamar a API", async () => {
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    montar();
    expect(await screen.findByText(/a\*\*\*@x\.gov\.br/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "outra" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/As senhas não coincidem/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("senha curta bloqueia", async () => {
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    montar();
    await screen.findByLabelText("Nova senha");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/pelo menos 6 caracteres/);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("sucesso mostra 'Ir para o login'", async () => {
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    api.post.mockResolvedValueOnce({ data: { message: "Senha redefinida. Faca login." } });
    montar();
    await screen.findByLabelText("Nova senha");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("link", { name: "Ir para o login" })).toHaveAttribute("href", "/login");
    expect(api.post).toHaveBeenCalledWith("/auth/redefinir-senha", { token: "tok-abc", nova_senha: "novaSenha9" });
  });

  it("410 ao salvar vira estado expirado", async () => {
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    api.post.mockRejectedValueOnce(RESP_410);
    montar();
    await screen.findByLabelText("Nova senha");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "novaSenha9" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByText(/Este link expirou ou já foi usado/)).toBeInTheDocument();
  });

  it("erro de rede na validacao oferece tentar de novo", async () => {
    api.get.mockRejectedValueOnce(new Error("Network Error"));
    api.get.mockResolvedValueOnce({ data: { valido: true, email_mascarado: "a***@x.gov.br" } });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("Nova senha")).toBeInTheDocument();
  });
});
