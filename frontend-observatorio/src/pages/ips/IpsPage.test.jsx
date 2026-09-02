// @vitest-environment jsdom
//
// Bug reportado: o IPS 2026 foi carregado pela tela de coletas e a página não
// tinha como filtrá-lo — as abas de ano eram uma lista fixa ([2024, 2025]).
// Agora vêm de /ips/anos; o ano padrão é o mais recente em que o município de
// referência tem dados; carga parcial, troca de município/estado e falhas de
// carga são avisadas em vez de acontecerem em silêncio.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: null };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));

// respostas[url] pode ser um valor, uma função dos params da chamada ou uma
// promise (resposta atrasada / rejeitada).
const respostas = {};
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url, cfg) => {
      const r = respostas[url];
      const data = typeof r === "function" ? r(cfg?.params ?? {}) : (r ?? null);
      return Promise.resolve(data).then((d) => ({ data: d }));
    }),
    put: vi.fn(),
  },
}));

// jsdom não implementa ResizeObserver; gráficos com dados medem o container.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

import api from "../../services/api";
import IpsPage from "./IpsPage";

const ARAUJOS = { municipio_id: 1, nome: "Araújos", estado: "MG" };
const FORMIGA = { municipio_id: 2, nome: "Formiga", estado: "MG" };
const DIVINOPOLIS = { municipio_id: 10, nome: "Divinópolis", estado: "MG" };
const ADAMANTINA = { municipio_id: 20, nome: "Adamantina", estado: "SP" };
// Como em produção (set/2026): 2026 é carga parcial (só MG) e não inclui a
// cidade do usuário. Formiga não tem 2024, para exercitar a volta ao passado.
const POR_ANO = {
  2024: [ARAUJOS, DIVINOPOLIS, ADAMANTINA],
  2025: [ARAUJOS, DIVINOPOLIS, FORMIGA, ADAMANTINA],
  2026: [ARAUJOS, FORMIGA],
};
const ANOS = [
  { ano: 2026, municipios: 25 },
  { ano: 2025, municipios: 5572 },
  { ano: 2024, municipios: 5572 },
];
const anosPara = ({ municipio_id }) => ANOS.map((a) => ({
  ...a,
  tem_municipio: municipio_id == null ? null : POR_ANO[a.ano].some((m) => m.municipio_id === municipio_id),
}));
const municipiosDe = ({ ano, estado }) => {
  const todos = POR_ANO[ano] ?? [];
  return estado ? todos.filter((m) => m.estado === estado) : todos;
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  authState.user = { role: "GESTOR", municipio_id: 10, estado: "MG", permissoes: {} };
  viewAsState.viewAsId = null;
  respostas["/ips/anos"] = anosPara;
  respostas["/ips/municipios"] = municipiosDe;
  respostas["/ips/scorecard"] = ({ municipio_id, ano }) => ({
    municipio_id, ano, ips_geral: 62.3, necessidades_humanas_basicas: 70, fundamentos_bem_estar: 60,
    oportunidades: 55, populacao: 1000, area_km2: 10, pib_per_capita: 30000,
  });
  respostas["/ips/evolucao"] = [];
  respostas["/ips/ranking"] = { ranking_nacional: 1, total_nacional: 2, ranking_estadual: 1, total_estadual: 2 };
  respostas["/ips/destaques"] = { melhores: [], piores: [] };
  respostas["/ips/sugestoes"] = [];
  respostas["/ips/comparativo"] = [];
});

const montar = () => render(<MemoryRouter><IpsPage /></MemoryRouter>);
const params = (url) => api.get.mock.calls.filter(([u]) => u === url).map(([, cfg]) => cfg?.params ?? {});
const ultimoScorecard = () => params("/ips/scorecard").at(-1);
const aba = (ano) => screen.getByRole("button", { name: String(ano) });
const esperarScorecard = (esperado) => waitFor(() => expect(ultimoScorecard()).toEqual(esperado));
const seletorEstado = () => screen.getByRole("combobox", { name: "Filtrar por estado" });
// O gatilho do MunicipioPicker tem aria-label fixo; o município na tela é o texto dele.
const pickerMunicipio = () => screen.getByRole("button", { name: "Selecionar município" });
const municipioNaTela = () => pickerMunicipio().textContent;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

describe("IpsPage — anos com dados vêm do backend", () => {
  it("as abas de ano vêm de /ips/anos, não de uma lista fixa", async () => {
    montar();
    await waitFor(() => expect(aba(2026)).toBeInTheDocument());
    const abas = screen.getAllByRole("button", { name: /^20\d\d$/ }).map((b) => b.textContent);
    expect(abas).toEqual(["2024", "2025", "2026"]);
  });

  it("abre no ano mais recente em que o município do usuário tem dados (2025, não 2026)", async () => {
    montar();
    await esperarScorecard({ municipio_id: 10, ano: 2025 });
    expect(params("/ips/anos")[0]).toEqual({ municipio_id: 10 });
    expect(aba(2025).className).toContain("active");
    expect(screen.queryByText(/não tem dados de IPS/)).toBeNull();
    expect(screen.queryByText(/municípios com dados/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("escolher 2026 recarrega com ano=2026 e avisa a cobertura parcial e a troca de município", async () => {
    montar();
    await esperarScorecard({ municipio_id: 10, ano: 2025 });
    fireEvent.click(aba(2026));
    await esperarScorecard({ municipio_id: 1, ano: 2026 });
    expect(screen.getByText(/25 de 5\.572 municípios com dados/)).toBeInTheDocument();
    expect(screen.getByText("Divinópolis não tem dados de IPS em 2026 — exibindo Araújos.")).toBeInTheDocument();
    // Nada de rodada com o município antigo no ano novo (404 garantido).
    expect(params("/ips/scorecard")).not.toContainEqual({ municipio_id: 10, ano: 2026 });
  });

  it("voltar para 2025 restaura o município escolhido e os avisos somem", async () => {
    montar();
    await esperarScorecard({ municipio_id: 10, ano: 2025 });
    fireEvent.click(aba(2026));
    await esperarScorecard({ municipio_id: 1, ano: 2026 });
    fireEvent.click(aba(2025));
    await esperarScorecard({ municipio_id: 10, ano: 2025 });
    expect(screen.queryByText(/não tem dados de IPS/)).toBeNull();
    expect(screen.queryByText(/municípios com dados/)).toBeNull();
  });

  it("município escolhido no seletor é mantido ao trocar de ano; sem dados no ano, a página avisa", async () => {
    montar();
    await esperarScorecard({ municipio_id: 10, ano: 2025 });
    expect(municipioNaTela()).toBe("Divinópolis — MG");
    fireEvent.click(pickerMunicipio());
    fireEvent.click(screen.getByRole("option", { name: /Formiga/ }));
    await esperarScorecard({ municipio_id: 2, ano: 2025 });

    fireEvent.click(aba(2026)); // Formiga tem 2026: fica, sem aviso
    await esperarScorecard({ municipio_id: 2, ano: 2026 });
    expect(screen.queryByText(/não tem dados de IPS/)).toBeNull();

    fireEvent.click(aba(2024)); // Formiga não tem 2024: cai na cidade do usuário e avisa
    await esperarScorecard({ municipio_id: 10, ano: 2024 });
    expect(screen.getByText("Formiga não tem dados de IPS em 2024 — exibindo Divinópolis.")).toBeInTheDocument();
  });

  it("estado sem dados no ano: troca de estado e município com aviso; resposta atrasada do estado antigo não desfaz a troca", async () => {
    montar();
    await esperarScorecard({ municipio_id: 10, ano: 2025 });
    fireEvent.change(seletorEstado(), { target: { value: "SP" } });
    await esperarScorecard({ municipio_id: 20, ano: 2025 });
    expect(screen.queryByText(/não tem dados de IPS/)).toBeNull(); // troca manual não avisa

    // A lista de SP em 2026 (vazia) chega DEPOIS da lista de MG.
    respostas["/ips/municipios"] = (p) =>
      (p.estado === "SP" && p.ano === 2026 ? pausa(40).then(() => []) : municipiosDe(p));
    fireEvent.click(aba(2026));
    await esperarScorecard({ municipio_id: 1, ano: 2026 });
    expect(seletorEstado().value).toBe("MG");
    expect(screen.getByText("Adamantina (SP) não tem dados de IPS em 2026 — exibindo Araújos (MG).")).toBeInTheDocument();

    await pausa(80); // resposta atrasada aterrissa e é ignorada
    expect(municipioNaTela()).toBe("Araújos — MG");
    expect(ultimoScorecard()).toEqual({ municipio_id: 1, ano: 2026 });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("usuário sem município (admin global) abre no ano mais recente", async () => {
    authState.user = { role: "ADMIN_GLOBAL", permissoes: {} };
    montar();
    await esperarScorecard({ municipio_id: 1, ano: 2026 });
    expect(params("/ips/anos")[0]).toEqual({});
  });

  it("em view-as o município impersonado é a referência (ano padrão, estado e cidade)", async () => {
    authState.user = { role: "ADMIN_GLOBAL", permissoes: {} };
    viewAsState.viewAsId = 2; // Formiga: tem 2026
    montar();
    await esperarScorecard({ municipio_id: 2, ano: 2026 });
    expect(params("/ips/anos")[0]).toEqual({ municipio_id: 2 });
    expect(seletorEstado().value).toBe("MG");
    expect(municipioNaTela()).toBe("Formiga — MG");
  });

  it("sem anos com dados a página avisa em vez de assumir um ano", async () => {
    respostas["/ips/anos"] = [];
    montar();
    await waitFor(() => expect(screen.getByText(/Sem anos com dados/)).toBeInTheDocument());
    expect(params("/ips/scorecard")).toEqual([]);
  });

  it("falha ao carregar os anos é avisada", async () => {
    respostas["/ips/anos"] = () => Promise.reject(new Error("500"));
    montar();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os anos do IPS."));
    expect(params("/ips/scorecard")).toEqual([]);
  });

  it("falha no lote de dados é avisada com município e ano", async () => {
    respostas["/ips/scorecard"] = () => Promise.reject(new Error("500"));
    montar();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar o IPS de Divinópolis em 2025."));
  });
});
