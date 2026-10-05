// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
