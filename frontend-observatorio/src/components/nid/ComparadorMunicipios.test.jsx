// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComparadorMunicipios from "./ComparadorMunicipios";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [
    { id: 1, nome: "Contagem", estado: "MG" },
    { id: 2, nome: "Betim", estado: "MG" },
  ] })) },
}));

import api from "../../services/api";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ComparadorMunicipios", () => {
  it("so busca a lista quando o usuario abre o seletor", async () => {
    const user = userEvent.setup();
    render(<ComparadorMunicipios fixados={[]} onChange={() => {}} />);

    expect(api.get).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /comparar com/i }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/municipios/selecionaveis"));
  });

  it("escolher um municipio devolve os ids acumulados", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ComparadorMunicipios fixados={[{ municipio_id: 9, nome: "Betim", estado: "MG" }]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /comparar com/i }));
    await user.click(await screen.findByRole("button", { name: /selecionar município/i }));
    await user.click(await screen.findByText("Contagem"));

    expect(onChange).toHaveBeenCalledWith([9, 1]);
  });

  it("remover um chip devolve a lista sem ele", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ComparadorMunicipios
        fixados={[{ municipio_id: 9, nome: "Betim", estado: "MG" },
                  { municipio_id: 8, nome: "Contagem", estado: "MG" }]}
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole("button", { name: /remover Betim/i }));
    expect(onChange).toHaveBeenCalledWith([8]);
  });

  it("no teto, esconde o seletor e diz por que", () => {
    render(
      <ComparadorMunicipios
        max={2}
        fixados={[{ municipio_id: 9, nome: "Betim", estado: "MG" },
                  { municipio_id: 8, nome: "Contagem", estado: "MG" }]}
        onChange={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /comparar com/i })).toBeNull();
    expect(screen.getByText(/máximo de 2/i)).toBeTruthy();
  });
});
