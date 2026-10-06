// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import api from "../services/api";
import { identificarSessao } from "../services/analytics";

vi.mock("../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

// Mock parcial: montarDadosSessao segue real (é o que queremos testar junto),
// só identificarSessao vira spy para não depender do DOM do tracker.
vi.mock("../services/analytics", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, identificarSessao: vi.fn() };
});

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <div>carregando</div>;
  return <div>{user ? user.nome : "sem-user"}</div>;
}

describe("AuthContext — bootstrap do /auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("access_token", "token-valido");
  });

  it("apaga o token quando o backend rejeita com 401", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 401 } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await screen.findByText("sem-user");
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("mantém o token quando o /auth/me falha sem resposta (erro de rede)", async () => {
    api.get.mockRejectedValueOnce(new Error("Network Error"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await screen.findByText("sem-user");
    expect(localStorage.getItem("access_token")).toBe("token-valido");
  });
});

function ProbeLogin() {
  const { user, loading, login, logout } = useAuth();
  if (loading) return <div>carregando</div>;
  return (
    <div>
      <div>{user ? user.nome : "sem-user"}</div>
      <button onClick={() => login("b@x.gov.br", "senha")}>entrar</button>
      <button onClick={logout}>sair</button>
    </div>
  );
}

describe("AuthContext — identificação da sessão no analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("access_token");
  });

  it("identifica a sessão com municipio_id e papel após o /auth/me (sem PII)", async () => {
    localStorage.setItem("access_token", "token-valido");
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          id: 9,
          nome: "Ana",
          email: "ana@x.gov.br",
          municipio_id: 7,
          role: "VISUALIZADOR",
          ativo: true,
        },
      },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await screen.findByText("Ana");
    expect(identificarSessao).toHaveBeenCalledTimes(1);
    expect(identificarSessao).toHaveBeenCalledWith({ municipio_id: 7, papel: "VISUALIZADOR" });
  });

  it("sem token não identifica nada", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await screen.findByText("sem-user");
    expect(identificarSessao).not.toHaveBeenCalled();
  });

  it("logout e login como outro usuário identificam de novo com os dados novos", async () => {
    localStorage.setItem("access_token", "token-valido");
    api.get.mockResolvedValueOnce({
      data: { data: { id: 9, nome: "Ana", email: "ana@x", municipio_id: 7, role: "VISUALIZADOR", ativo: true } },
    });

    render(
      <AuthProvider>
        <ProbeLogin />
      </AuthProvider>
    );
    await screen.findByText("Ana");
    expect(identificarSessao).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("sair"));
    await screen.findByText("sem-user");
    expect(identificarSessao).toHaveBeenCalledTimes(1); // user null não identifica

    api.post.mockResolvedValueOnce({ data: { access_token: "token-2" } });
    api.get.mockResolvedValueOnce({
      data: { data: { id: 3, nome: "Bia", email: "b@x", municipio_id: 12, role: "ADMIN_MUNICIPIO", ativo: true } },
    });
    fireEvent.click(screen.getByText("entrar"));
    await screen.findByText("Bia");

    expect(identificarSessao).toHaveBeenCalledTimes(2);
    expect(identificarSessao).toHaveBeenLastCalledWith({ municipio_id: 12, papel: "ADMIN_MUNICIPIO" });
  });
});

function ProbeMfa() {
  const { user, loading, login, verificarMfa } = useAuth();
  const [res, setRes] = useState(null);
  if (loading) return <div>carregando</div>;
  return (
    <div>
      <div>{user ? user.nome : "sem-user"}</div>
      <div data-testid="res">{res ? JSON.stringify(res) : ""}</div>
      <button onClick={async () => setRes(await login("a@x", "s"))}>login</button>
      <button onClick={() => verificarMfa("tok-mfa", "123456")}>verificar</button>
    </div>
  );
}

describe("AuthContext — login em duas etapas (MFA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("access_token");
  });

  it("login com mfa_obrigatorio devolve { mfa: true, mfaToken } e NAO grava token nem carrega /auth/me", async () => {
    api.post.mockResolvedValueOnce({ data: { mfa_obrigatorio: true, mfa_token: "tok-mfa" } });
    render(<AuthProvider><ProbeMfa /></AuthProvider>);
    await screen.findByText("sem-user");
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("res").textContent).toBe(JSON.stringify({ mfa: true, mfaToken: "tok-mfa" })));
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    expect(identificarSessao).not.toHaveBeenCalled();
  });

  it("login sem MFA devolve { mfa: false } e segue como antes", async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: "t1" } });
    api.get.mockResolvedValueOnce({ data: { data: { id: 1, nome: "Ana", municipio_id: 7, role: "VISUALIZADOR" } } });
    render(<AuthProvider><ProbeMfa /></AuthProvider>);
    await screen.findByText("sem-user");
    fireEvent.click(screen.getByText("login"));
    await screen.findByText("Ana");
    expect(screen.getByTestId("res").textContent).toBe(JSON.stringify({ mfa: false }));
    expect(localStorage.getItem("access_token")).toBe("t1");
  });

  it("verificarMfa chama /auth/mfa/verificar, grava o token e carrega o usuario", async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: "t2", refresh_token: "r2" } });
    api.get.mockResolvedValueOnce({ data: { data: { id: 1, nome: "Bia", municipio_id: null, role: "ADMIN_GLOBAL" } } });
    render(<AuthProvider><ProbeMfa /></AuthProvider>);
    await screen.findByText("sem-user");
    fireEvent.click(screen.getByText("verificar"));
    await screen.findByText("Bia");
    expect(api.post).toHaveBeenCalledWith("/auth/mfa/verificar", { mfa_token: "tok-mfa", codigo: "123456" });
    expect(localStorage.getItem("access_token")).toBe("t2");
    expect(identificarSessao).toHaveBeenCalledWith({ papel: "ADMIN_GLOBAL" });
  });

  it("login com metodo email devolve metodo, enviadoPara e enviado", async () => {
    api.post.mockResolvedValueOnce({ data: { mfa_obrigatorio: true, mfa_token: "tok-mfa", metodo: "email", enviado_para: "a***@x.com", enviado: false } });
    render(<AuthProvider><ProbeMfa /></AuthProvider>);
    await screen.findByText("sem-user");
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("res").textContent).toBe(
      JSON.stringify({ mfa: true, mfaToken: "tok-mfa", metodo: "email", enviadoPara: "a***@x.com", enviado: false })
    ));
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("reenviarCodigoMfa chama /auth/mfa/reenviar e devolve o corpo", async () => {
    function ProbeReenviar() {
      const { reenviarCodigoMfa } = useAuth();
      const [r, setR] = useState(null);
      return (
        <>
          <button onClick={async () => setR(await reenviarCodigoMfa("tok-mfa"))}>reenviar</button>
          <div data-testid="r">{r ? JSON.stringify(r) : ""}</div>
        </>
      );
    }
    api.post.mockResolvedValueOnce({ data: { enviado_para: "a***@x.com" } });
    render(<AuthProvider><ProbeReenviar /></AuthProvider>);
    fireEvent.click(await screen.findByText("reenviar"));
    await waitFor(() => expect(screen.getByTestId("r").textContent).toBe(JSON.stringify({ enviado_para: "a***@x.com" })));
    expect(api.post).toHaveBeenCalledWith("/auth/mfa/reenviar", { mfa_token: "tok-mfa" });
  });
});
