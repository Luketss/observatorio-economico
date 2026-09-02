// @vitest-environment jsdom
//
// Bug reportado: o IPS 2026 foi carregado pela tela de coletas e a página não
// tinha como filtrá-lo — as abas de ano eram uma lista fixa ([2024, 2025]).
// Agora vêm de /ips/anos; o ano padrão é o mais recente em que o município do
// usuário tem dados, e carga parcial / troca de município são avisadas.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));

// respostas[url] pode ser um valor ou uma função dos params da chamada.
const respostas = {};
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url, cfg) => {
      const r = respostas[url];
      const data = typeof r === "function" ? r(cfg?.params ?? {}) : (r ?? null);
      return Promise.resolve({ data });
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
// Como em produção (set/2026): 2026 é carga parcial e não inclui a cidade do usuário.
const ANOS = [
  { ano: 2026, municipios: 25, tem_municipio: false },
  { ano: 2025, municipios: 5572, tem_municipio: true },
  { ano: 2024, municipios: 5572, tem_municipio: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  authState.user = { role: "GESTOR", municipio_id: 10, estado: "MG", permissoes: {} };
  respostas["/ips/anos"] = ANOS;
  respostas["/ips/municipios"] = ({ ano }) => (ano === 2026 ? [ARAUJOS, FORMIGA] : [ARAUJOS, DIVINOPOLIS, FORMIGA]);
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
  });

  it("escolher 2026 recarrega com ano=2026 e avisa a cobertura parcial e a troca de município", async () => {
    montar();
    await esperarScorecard({ municipio_id: 10, ano: 2025 });
    fireEvent.click(aba(2026));
    await esperarScorecard({ municipio_id: 1, ano: 2026 });
    expect(screen.getByText(/25 de 5\.572 municípios com dados/)).toBeInTheDocument();
    expect(screen.getByText(/Divinópolis não tem dados de IPS em 2026 — exibindo Araújos/)).toBeInTheDocument();
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

  it("usuário sem município (admin global) abre no ano mais recente", async () => {
    authState.user = { role: "ADMIN_GLOBAL", permissoes: {} };
    respostas["/ips/anos"] = ANOS.map((a) => ({ ...a, tem_municipio: null }));
    montar();
    await esperarScorecard({ municipio_id: 1, ano: 2026 });
    expect(params("/ips/anos")[0]).toEqual({});
  });

  it("sem anos com dados a página avisa em vez de assumir um ano", async () => {
    respostas["/ips/anos"] = [];
    montar();
    await waitFor(() => expect(screen.getByText(/Sem anos com dados/)).toBeInTheDocument());
    expect(params("/ips/scorecard")).toEqual([]);
  });
});
