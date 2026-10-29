// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "ADMIN_GLOBAL" } };
const viewAsState = { viewAsId: null };
const dados = { lista: [] };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: dados.lista })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import api from "../../services/api";
import PremiacoesTab from "./PremiacoesTab";

const GLOBAL = { id: 1, titulo: "Prêmio Global", status: "oportunidade", tipo: "premio", escopo: "global", municipio_id: null };
const PROPRIO = { id: 2, titulo: "Prêmio Próprio", status: "conquistado", tipo: "premio", escopo: "municipal", municipio_id: 7 };
const GESTOR = { role: "GESTOR", municipio_id: 7, permissoes: { premiacoes: ["criar", "editar", "excluir"] } };

const montar = () => render(<MemoryRouter><PremiacoesTab /></MemoryRouter>);
const card = (titulo) => screen.getByText(titulo).closest("div.rounded-xl");
// Botões de ação reais (o título clicável também tem role="button").
const botoes = (titulo) => card(titulo).querySelectorAll("button");

beforeEach(() => {
  vi.clearAllMocks();
  viewAsState.viewAsId = null;
  authState.user = { role: "ADMIN_GLOBAL" };
  dados.lista = [GLOBAL];
});

describe("PremiacoesTab — conteúdo global", () => {
  it("ADMIN_GLOBAL sem view-as lista e cadastra sem selecionar município", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Prêmio Global")).toBeInTheDocument());
    expect(screen.queryByText("Selecione um município")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Nova Premiação/ }));
    // Formulário global: sem status (andamento é municipal).
    expect(screen.getByText(/aparece para todos os municípios/)).toBeInTheDocument();
    expect(screen.queryByText("Status")).toBeNull();
    const form = screen.getByRole("button", { name: "Criar" }).closest("form");
    fireEvent.change(form.querySelector("input"), { target: { value: "Novo prêmio" } });
    fireEvent.submit(form);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/desenvolvimento-economico/premiacoes", expect.objectContaining({ titulo: "Novo prêmio" }),
    ));
    // Lista recarregada após salvar.
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("ADMIN_GLOBAL em view-as altera só o global; o municipal fica em leitura", async () => {
    viewAsState.viewAsId = 7;
    dados.lista = [GLOBAL, PROPRIO];
    montar();
    await waitFor(() => expect(screen.getByText("Prêmio Próprio")).toBeInTheDocument());
    expect(botoes("Prêmio Global").length).toBe(2);
    expect(botoes("Prêmio Próprio")).toHaveLength(0);
  });

  it("usuário municipal vê o selo Global, não altera o global e o KPI não conta como conquista", async () => {
    authState.user = GESTOR;
    // Mesmo com status "conquistado" o global não conta como conquista.
    dados.lista = [{ ...GLOBAL, status: "conquistado" }, PROPRIO];
    montar();
    await waitFor(() => expect(screen.getByText("Prêmio Global")).toBeInTheDocument());
    expect(within(card("Prêmio Global")).getByText("Global")).toBeInTheDocument();
    expect(botoes("Prêmio Global")).toHaveLength(0);
    expect(within(card("Prêmio Global")).queryByRole("combobox")).toBeNull();
    expect(botoes("Prêmio Próprio")).toHaveLength(2);
    expect(within(card("Prêmio Próprio")).queryByText("Global")).toBeNull();
    const conquistados = screen.getByText("Conquistados").nextSibling;
    expect(conquistados.textContent).toBe("1");
    expect(screen.getByText("Total").nextSibling.textContent).toBe("2");
  });
});
