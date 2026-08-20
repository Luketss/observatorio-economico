// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const respostas = { corpo: null };
vi.mock("../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: respostas.corpo })) },
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { role: "SECRETARIO", permissoes: {} } }) }));
vi.mock("./PrioridadesEditorModal", () => ({ default: () => null }));

import PrioridadesPanel from "./PrioridadesPanel";

const montar = () => render(<MemoryRouter><PrioridadesPanel /></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); respostas.corpo = null; });

describe("PrioridadesPanel — corpo nulo/vazio", () => {
  it("200 com corpo null vira estado vazio (não crasha)", async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByText(/As prioridades ainda não foram geradas/)).toBeInTheDocument()
    );
  });

  it("200 com prioridades renderiza o conteúdo", async () => {
    respostas.corpo = {
      prioridades: [{ titulo: "Atenção: teste", observacao: "obs", dataset_referencia: "pib" }],
      gerado_em: "2026-08-01T00:00:00",
      modelo: "ia",
    };
    montar();
    await waitFor(() => expect(screen.getByText("obs")).toBeInTheDocument());
  });
});
