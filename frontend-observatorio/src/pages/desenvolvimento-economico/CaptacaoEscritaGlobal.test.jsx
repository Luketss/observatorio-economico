// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "ADMIN_GLOBAL" } };
const viewAsState = { viewAsId: null };
const dados = { captacao: [], escrita: [] };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../context/PlanContext", () => ({ usePlan: () => ({ canAccess: () => true }) }));
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url) => Promise.resolve({
      data: url.endsWith("/captacao") ? dados.captacao
        : url.endsWith("/escrita") ? dados.escrita
        : { disponivel: true, emendas: [], anos: [] },
    })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import api from "../../services/api";
import CaptacaoTab from "./CaptacaoTab";
import EscritaTab from "./EscritaTab";

const CAP_GLOBAL = { id: 1, titulo: "Edital Global", tipo: "edital", estagio: "oportunidade", valor_estimado: 5000000, escopo: "global", municipio_id: null };
const CAP_PROPRIA = { id: 2, titulo: "Edital Próprio", tipo: "edital", estagio: "aprovado", valor_estimado: 1000, escopo: "municipal", municipio_id: 7 };
const ESC_GLOBAL = { id: 10, titulo: "Modelo Global", estagio: "ideia", resultado: null, escopo: "global", municipio_id: null };
const ESC_PROPRIO = { id: 11, titulo: "Projeto Próprio", estagio: "submissao", resultado: null, escopo: "municipal", municipio_id: 7 };
const GESTOR = { role: "GESTOR", municipio_id: 7, permissoes: {
  captacao: ["criar", "editar", "excluir"], escrita: ["criar", "editar", "excluir"],
} };

const montar = (elemento) => render(<MemoryRouter>{elemento}</MemoryRouter>);
const card = (titulo) => screen.getByText(titulo).closest("div.rounded-xl");
const botoes = (titulo) => card(titulo).querySelectorAll("button");
const kpi = (label) => screen.getByText(label).nextSibling.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  viewAsState.viewAsId = null;
  authState.user = { role: "ADMIN_GLOBAL" };
  dados.captacao = [CAP_GLOBAL];
  dados.escrita = [ESC_GLOBAL];
});

describe("CaptacaoTab — conteúdo global", () => {
  it("ADMIN_GLOBAL sem view-as cadastra Nova Oportunidade sem estágio e sem radar de emendas", async () => {
    montar(<CaptacaoTab />);
    await waitFor(() => expect(screen.getByText("Edital Global")).toBeInTheDocument());
    expect(api.get).not.toHaveBeenCalledWith("/emendas/radar", expect.anything());
    expect(screen.getByText(/use "Ver como"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nova Oportunidade/ }));
    expect(screen.queryByText("Estágio", { selector: "label" })).toBeNull();
    const form = screen.getByRole("button", { name: "Criar" }).closest("form");
    fireEvent.change(form.querySelector("input"), { target: { value: "Edital novo" } });
    fireEvent.submit(form);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/desenvolvimento-economico/captacao", expect.objectContaining({ titulo: "Edital novo" }),
    ));
  });

  it("município vê o global sem ações e fora de Valor potencial/Aprovados", async () => {
    authState.user = GESTOR;
    dados.captacao = [CAP_GLOBAL, CAP_PROPRIA];
    montar(<CaptacaoTab />);
    await waitFor(() => expect(screen.getByText("Edital Próprio")).toBeInTheDocument());
    expect(card("Edital Global").textContent).toContain("Global");
    expect(botoes("Edital Global")).toHaveLength(0);
    expect(card("Edital Global").querySelector("select")).toBeNull();
    expect(botoes("Edital Próprio")).toHaveLength(2);
    expect(kpi("Total")).toBe("2");
    expect(kpi("Aprovados")).toBe("1");
    expect(kpi("Valor potencial")).not.toContain("5");
  });
});

describe("EscritaTab — conteúdo global", () => {
  it("ADMIN_GLOBAL sem view-as cadastra Novo Projeto sem estágio/resultado e só vincula captação global", async () => {
    dados.captacao = [CAP_GLOBAL];
    montar(<EscritaTab />);
    await waitFor(() => expect(screen.getByText("Modelo Global")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Novo Projeto/ }));
    expect(screen.queryByText("Resultado", { selector: "label" })).toBeNull();
    expect(screen.getByRole("option", { name: "Edital Global (Global)" })).toBeInTheDocument();
    const form = screen.getByRole("button", { name: "Criar" }).closest("form");
    fireEvent.change(form.querySelector("input"), { target: { value: "Projeto modelo" } });
    fireEvent.submit(form);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/desenvolvimento-economico/escrita", expect.objectContaining({ titulo: "Projeto modelo" }),
    ));
  });

  it("município vê o global sem ações e fora de Submetidos", async () => {
    authState.user = GESTOR;
    dados.escrita = [{ ...ESC_GLOBAL, estagio: "submissao" }, ESC_PROPRIO];
    montar(<EscritaTab />);
    await waitFor(() => expect(screen.getByText("Projeto Próprio")).toBeInTheDocument());
    expect(card("Modelo Global").textContent).toContain("Global");
    expect(botoes("Modelo Global")).toHaveLength(0);
    expect(botoes("Projeto Próprio")).toHaveLength(2);
    expect(kpi("Total de projetos")).toBe("2");
    expect(kpi("Submetidos")).toBe("1");
  });
});
