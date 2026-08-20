// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [
    { id: 9, cnpj_basico: "12345678", razao_social: "ACME LTDA", nome_fantasia: "ACME" },
  ] })) },
}));

import api from "../../services/api";
import BuscaEmpresaRfb from "./BuscaEmpresaRfb";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("BuscaEmpresaRfb", () => {
  it("busca com debounce e entrega a empresa escolhida", async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();
    render(<BuscaEmpresaRfb onSelect={onSelect} />);

    await user.type(screen.getByLabelText("Buscar empresa na base CNPJ"), "acme");

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/empresas/buscar", { params: { q: "acme" } }), { timeout: 1000 });

    const opcao = await screen.findByRole("button", { name: /ACME LTDA/ });
    await user.click(opcao);

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ cnpj_basico: "12345678" }));
  });

  it("menos de 2 caracteres não busca", async () => {
    const user = userEvent.setup({ delay: null });
    render(<BuscaEmpresaRfb onSelect={vi.fn()} />);

    await user.type(screen.getByLabelText("Buscar empresa na base CNPJ"), "a");

    await new Promise(r => setTimeout(r, 400)); // wait for debounce to pass

    expect(api.get).not.toHaveBeenCalled();
  });
});
