// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [
    { id: 9, cnpj_basico: "12345678", razao_social: "ACME LTDA", nome_fantasia: "ACME" },
  ] })) },
}));

import api from "../../services/api";
import BuscaEmpresaRfb from "./BuscaEmpresaRfb";

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

describe("BuscaEmpresaRfb", () => {
  it("busca com debounce e entrega a empresa escolhida", async () => {
    const onSelect = vi.fn();
    render(<BuscaEmpresaRfb onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText("Buscar empresa na base CNPJ"), { target: { value: "acme" } });
    expect(api.get).not.toHaveBeenCalled(); // ainda no debounce
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(api.get).toHaveBeenCalledWith("/empresas/buscar", { params: { q: "acme" } });
    expect(api.get).toHaveBeenCalledTimes(1); // catch double-call regressions
    await act(() => vi.advanceTimersByTimeAsync(0)); // flush microtasks
    const opcao = screen.getByRole("button", { name: /ACME LTDA/ });
    fireEvent.click(opcao);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ cnpj_basico: "12345678" }));
  });

  it("menos de 2 caracteres não busca", async () => {
    render(<BuscaEmpresaRfb onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Buscar empresa na base CNPJ"), { target: { value: "a" } });
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(api.get).not.toHaveBeenCalled();
  });
});
