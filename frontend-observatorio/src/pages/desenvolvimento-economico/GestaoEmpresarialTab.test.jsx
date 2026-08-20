// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "ADMIN_GLOBAL" } };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../services/api", () => ({
  default: { get: vi.fn((url) => Promise.resolve({ data: url.endsWith("/retencao") ? [
    { id: 1, nome: "ACME", status_risco: "baixo", potencial_expansao: "baixo" },
  ] : {} })) },
}));

import api from "../../services/api";
import GestaoEmpresarialTab from "./GestaoEmpresarialTab";

const montar = () => render(<MemoryRouter><GestaoEmpresarialTab /></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); viewAsState.viewAsId = null; authState.user = { role: "ADMIN_GLOBAL" }; });

describe("GestaoEmpresarialTab — guard ADMIN_GLOBAL", () => {
  it("global sem view-as vê SelecioneMunicipio e não busca a lista", () => {
    montar();
    expect(screen.queryByText("ACME")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("global com view-as vê a lista em modo leitura (sem botões de escrita)", async () => {
    viewAsState.viewAsId = 42;
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Nova Empresa/ })).toBeNull();
  });
});
