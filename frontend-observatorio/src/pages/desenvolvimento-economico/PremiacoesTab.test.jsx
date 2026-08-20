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
  default: { get: vi.fn((url) => Promise.resolve({ data: url.endsWith("/premiacoes") ? [
    { id: 1, titulo: "Prêmio X", status: "oportunidade", tipo: "premio" },
  ] : {} })) },
}));

import api from "../../services/api";
import PremiacoesTab from "./PremiacoesTab";

const montar = () => render(<MemoryRouter><PremiacoesTab /></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); viewAsState.viewAsId = null; authState.user = { role: "ADMIN_GLOBAL" }; });

describe("PremiacoesTab — guard ADMIN_GLOBAL", () => {
  it("global sem view-as vê SelecioneMunicipio e não busca a lista", () => {
    montar();
    expect(screen.queryByText("Prêmio X")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("global com view-as vê a lista em modo leitura", async () => {
    viewAsState.viewAsId = 42;
    montar();
    await waitFor(() => expect(screen.getByText("Prêmio X")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Nova Premiação/ })).toBeNull();
  });
});
