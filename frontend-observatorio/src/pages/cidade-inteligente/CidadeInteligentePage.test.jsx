// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const authState = { user: { role: "ADMIN_GLOBAL" } };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("./CertificacaoDrawer", () => ({ default: () => null }));

const CERTS = [
  { id: 1, nome: "ISO 37122", entidade: "ABNT", descricao: null,
    total: 4, atendidos: 2, em_andamento: 1, pendentes: 1 },
];
vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: CERTS })) },
}));

import api from "../../services/api";
import CidadeInteligentePage from "./CidadeInteligentePage";

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { role: "ADMIN_GLOBAL" };
  viewAsState.viewAsId = null;
});

describe("CidadeInteligentePage", () => {
  it("global sem view-as vê SelecioneMunicipio e não busca", () => {
    render(<CidadeInteligentePage />);
    expect(screen.getByText("Selecione um município")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("lista cards com progresso", async () => {
    authState.user = { role: "PREFEITO" };
    render(<CidadeInteligentePage />);
    expect(await screen.findByText("ISO 37122")).toBeInTheDocument();
    expect(screen.getByText("2 de 4 atendidos")).toBeInTheDocument();
  });

  it("usuário sem permissão de criar não vê o botão", async () => {
    authState.user = { role: "PREFEITO", permissoes: {} };
    render(<CidadeInteligentePage />);
    await screen.findByText("ISO 37122");
    expect(screen.queryByRole("button", { name: /Nova certificação/ })).toBeNull();
  });

  it("lista vazia mostra CTA", async () => {
    authState.user = { role: "PREFEITO" };
    api.get.mockResolvedValueOnce({ data: [] });
    render(<CidadeInteligentePage />);
    expect(await screen.findByText(/Nenhuma certificação/)).toBeInTheDocument();
  });
});
