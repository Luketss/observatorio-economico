// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";

const auth = { login: vi.fn(), verificarMfa: vi.fn(), user: null, loading: false };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("framer-motion", () => ({ motion: new Proxy({}, { get: () => ({ children, ...p }) => <div {...Object.fromEntries(Object.entries(p).filter(([k]) => !["initial","animate","transition","exit","whileHover","whileTap"].includes(k)))}>{children}</div> }) }));
vi.mock("../../assets/bg.jpeg", () => ({ default: "" }));
vi.mock("../../assets/nid_fundo_transparente.png", () => ({ default: "" }));
vi.mock("../../assets/logo_uaizi.png", () => ({ default: "" }));

function montar() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

async function preencherELogar() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@x.gov.br" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
});

describe("LoginPage — etapa de codigo (MFA)", () => {
  it("sem MFA nao mostra a etapa de codigo", async () => {
    auth.login.mockResolvedValueOnce({ mfa: false });
    montar();
    await preencherELogar();
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith("a@x.gov.br", "senha"));
    expect(screen.queryByLabelText(/Código de verificação/i)).toBeNull();
  });

  it("com MFA mostra o campo de codigo e verifica", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockResolvedValueOnce();
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    expect(campo).toHaveAttribute("inputmode", "numeric");
    expect(campo).toHaveAttribute("autocomplete", "one-time-code");
    expect(document.activeElement).toBe(campo);
    fireEvent.change(campo, { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    await waitFor(() => expect(auth.verificarMfa).toHaveBeenCalledWith("tok", "123 456"));
  });

  it("codigo invalido mostra erro inline e mantem a etapa", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockRejectedValueOnce({ response: { status: 401, data: { error: { code: "UNAUTHORIZED", message: "Codigo invalido" } } } });
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    fireEvent.change(campo, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Código inválido");
    expect(screen.getByLabelText(/Código de verificação/i)).toBeInTheDocument();
  });

  it("token invalidado por muitas tentativas volta a etapa da senha com aviso", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockRejectedValueOnce({ response: { status: 401, data: { error: { code: "MFA_TOKEN_INVALIDADO", message: "Muitas tentativas; faca login de novo" } } } });
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    fireEvent.change(campo, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    await screen.findByLabelText("Senha");
    expect(screen.getByRole("alert")).toHaveTextContent(/faça login de novo/i);
  });

  it("link alterna para codigo de recuperacao e Voltar retorna a senha", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    montar();
    await preencherELogar();
    await screen.findByLabelText(/Código de verificação/i);
    fireEvent.click(screen.getByRole("button", { name: /Usar código de recuperação/i }));
    const rec = screen.getByLabelText(/Código de recuperação/i);
    expect(rec).toHaveAttribute("placeholder", "XXXX-XXXX");
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByLabelText("Senha")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("MFA indisponivel no servidor (503) mostra a mensagem do backend", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockRejectedValueOnce({ response: { status: 503, data: { error: { code: "MFA_INDISPONIVEL", message: "MFA indisponivel no servidor" } } } });
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    fireEvent.change(campo, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/indispon/i);
  });

  it("codigo de erro desconhecido mostra a mensagem do backend", async () => {
    auth.login.mockResolvedValueOnce({ mfa: true, mfaToken: "tok" });
    auth.verificarMfa.mockRejectedValueOnce({ response: { status: 401, data: { error: { code: "MFA_SEGREDO_INVALIDO", message: "Segredo MFA invalido; zere e recadastre o MFA" } } } });
    montar();
    await preencherELogar();
    const campo = await screen.findByLabelText(/Código de verificação/i);
    fireEvent.change(campo, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Segredo MFA invalido; zere e recadastre o MFA");
  });

  it("etapa da senha mostra o link Esqueci minha senha", () => {
    montar();
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toHaveAttribute("href", "/esqueci-senha");
  });
});
