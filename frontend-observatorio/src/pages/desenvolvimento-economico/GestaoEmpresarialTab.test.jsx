// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

const LISTA = [
  { id: 2, nome: "Bar do Zé", setor: "Serviços", status_risco: "alto", potencial_expansao: "baixo", num_empregos: 3,
    relevancia: { score: 10, faixa: "baixa", parcial: true, fatores: [] },
    risco: { nivel: "nenhum", sinais: [] } },
  { id: 3, nome: "Câmara Fria", setor: "Logística", status_risco: "medio", potencial_expansao: "medio", num_empregos: 120,
    relevancia: { score: 44, faixa: "media", parcial: false, fatores: [] },
    risco: { nivel: "atencao", sinais: [{ chave: "rfb_irregular", rotulo: "Situação inapta na RFB", desde: null }] } },
  { id: 1, nome: "ACME", setor: "Indústria", status_risco: "baixo", potencial_expansao: "alto", num_empregos: 42,
    relevancia: { score: 68, faixa: "alta", parcial: false, fatores: [] },
    risco: { nivel: "alto", sinais: [
      { chave: "proxima_acao_vencida", rotulo: "Próxima ação vencida", desde: "2026-08-01" },
      { chave: "sem_contato_90d", rotulo: "Sem contato há mais de 90 dias", desde: "2026-05-01" },
    ] } },
];

// O <h4> do card carrega role="button" (propsTituloClicavel), então não é heading para o Testing Library.
const nomesNaTela = () => Array.from(document.querySelectorAll("h4")).map((h) => h.textContent);
// Só o <p> do KPI: "Em risco" e "Alta relevância" também são <option> do filtro.
const kpi = (label) => screen.getAllByText(label).find((el) => el.tagName === "P").nextElementSibling.textContent;

describe("GestaoEmpresarialTab — relevância e risco calculados", () => {
  beforeEach(() => {
    viewAsState.viewAsId = 42;
    api.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith("/retencao") ? LISTA : {} }));
  });

  it("cards mostram chip de relevância (com 'parcial' sem vínculo RFB) e chips curtos por sinal", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(screen.getByText("Relevância 68 · Alta")).toBeInTheDocument();
    const parcial = screen.getByText("Relevância 10 · Baixa · parcial");
    expect(parcial).toHaveAttribute("title", "sem vínculo com a base RFB");
    expect(screen.getByText("Ação vencida")).toBeInTheDocument();
    expect(screen.getByText("Sem contato 90d+")).toBeInTheDocument();
    expect(screen.getByText("RFB irregular")).toBeInTheDocument();
    expect(screen.getByText("Risco alto")).toBeInTheDocument(); // chip manual continua (Bar do Zé)
  });

  it("5 KPIs: 'Em risco' conta manual alto OU calculado alto", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(kpi("Total de empresas")).toBe("3");
    expect(kpi("Em risco")).toBe("2");          // ACME (calculado alto) + Bar do Zé (manual alto)
    expect(kpi("Alta relevância")).toBe("1");
    expect(kpi("Alto potencial")).toBe("1");
    expect(kpi("Total empregos")).toBe("165");
  });

  it("ordem padrão é relevância decrescente, mesmo que a API venha em outra ordem", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(nomesNaTela()).toEqual(["ACME", "Câmara Fria", "Bar do Zé"]);
  });

  it("ordenação por Nome e por Risco (alto → atenção → nenhum)", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), { target: { value: "nome" } });
    expect(nomesNaTela()).toEqual(["ACME", "Bar do Zé", "Câmara Fria"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), { target: { value: "risco" } });
    expect(nomesNaTela()).toEqual(["ACME", "Câmara Fria", "Bar do Zé"]);
  });

  it("busca ignora acento e caixa (nome ou setor) e mostra estado vazio", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    const busca = screen.getByRole("textbox", { name: "Buscar empresa" });
    fireEvent.change(busca, { target: { value: "camara" } });
    expect(nomesNaTela()).toEqual(["Câmara Fria"]);
    fireEvent.change(busca, { target: { value: "LOGIST" } });
    expect(nomesNaTela()).toEqual(["Câmara Fria"]);
    fireEvent.change(busca, { target: { value: "zzz" } });
    expect(screen.getByText("Nenhuma empresa corresponde ao filtro.")).toBeInTheDocument();
    expect(document.querySelectorAll("h4")).toHaveLength(0);
  });

  it("filtros Em risco / Alta relevância / Sem vínculo RFB", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    const filtro = screen.getByRole("combobox", { name: "Filtrar empresas" });
    fireEvent.change(filtro, { target: { value: "risco" } });
    expect(nomesNaTela()).toEqual(["ACME", "Bar do Zé"]);
    fireEvent.change(filtro, { target: { value: "alta" } });
    expect(nomesNaTela()).toEqual(["ACME"]);
    fireEvent.change(filtro, { target: { value: "sem_rfb" } });
    expect(nomesNaTela()).toEqual(["Bar do Zé"]);
    fireEvent.change(filtro, { target: { value: "todas" } });
    expect(nomesNaTela()).toHaveLength(3);
  });

  it("lista sem enriquecimento (mock antigo) não quebra: KPIs calculados valem 0", async () => {
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.endsWith("/retencao") ? [{ id: 1, nome: "ACME", status_risco: "baixo", potencial_expansao: "baixo" }] : {},
    }));
    montar();
    await waitFor(() => expect(screen.getByText("ACME")).toBeInTheDocument());
    expect(kpi("Em risco")).toBe("0");
    expect(kpi("Alta relevância")).toBe("0");
    expect(screen.queryByText(/^Relevância \d/)).toBeNull(); // só o chip; a <option> "Relevância" não conta
  });
});
