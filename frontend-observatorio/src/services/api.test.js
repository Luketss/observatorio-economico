// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import api from "./api";

// The response interceptor is registered at module load; axios exposes it via
// the handlers array. Calling `rejected` directly simulates a failed response
// without any network.
const rejected = api.interceptors.response.handlers[0].rejected;

function erro401() {
  return {
    config: { url: "/kpis/resumo" },
    response: { status: 401, data: { detail: "Not authenticated" } },
  };
}

describe("api response interceptor — delogar automático desabilitado", () => {
  beforeEach(() => {
    localStorage.setItem("access_token", "token-valido");
  });

  it("401 não apaga o access_token", async () => {
    await expect(rejected(erro401())).rejects.toBeTruthy();
    expect(localStorage.getItem("access_token")).toBe("token-valido");
  });

  it("401 não redireciona para /login", async () => {
    const hrefAntes = window.location.href;
    await expect(rejected(erro401())).rejects.toBeTruthy();
    expect(window.location.href).toBe(hrefAntes);
  });

  it("normaliza erro de domínio para data.detail", async () => {
    const error = {
      config: { url: "/projetos" },
      response: {
        status: 409,
        data: { success: false, error: { code: "CONFLICT", message: "Já existe" } },
      },
    };
    await expect(rejected(error)).rejects.toBeTruthy();
    expect(error.response.data.detail).toBe("Já existe");
  });
});
