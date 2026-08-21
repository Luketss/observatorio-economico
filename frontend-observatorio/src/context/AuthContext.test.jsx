// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import api from "../services/api";

vi.mock("../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

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
