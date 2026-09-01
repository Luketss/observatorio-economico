// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "SECRETARIO", permissoes: {} } };
const viewAsState = { viewAsId: null };
vi.mock("../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));

const respostas = {};
vi.mock("../services/api", () => ({
  default: { get: vi.fn((url) => Promise.resolve({ data: respostas[url] ?? null })) },
}));

// PrioridadesPanel trata resposta resolvida com data:null como status "ok" e
// desestrutura state.data sem guarda — pré-existente, fora do escopo desta
// task. InsightsPanel/ReleasesPanel lidam com null graciosamente e não
// precisam de mock.
vi.mock("../components/PrioridadesPanel", () => ({ default: () => null }));

import api from "../services/api";
import DashboardGeralPage from "./DashboardGeralPage";

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  Object.assign(respostas, {
    "/pib/resumo": { ultimo_ano: 2022, pib_ultimo_ano: 1200000, crescimento_percentual: 3.2 },
    "/vaf/resumo": { ultimo_ano: 2023, ipm_ultimo_ano: 0.0123, variacao_ipm_percentual: -7.1 },
    "/arrecadacao/resumo": { total_geral: 500000, crescimento_percentual: 5.0 },
    "/caged/resumo": { saldo_total: 120, total_admissoes: 900 },
    "/pib/serie": [], "/pib/comparativo": null, "/arrecadacao/por_tipo": [],
    "/caged/serie": [], "/dashboard-cards": [],
  });
  authState.user = { role: "SECRETARIO", permissoes: {} };
  viewAsState.viewAsId = null;
});

const montar = () => render(<MemoryRouter><DashboardGeralPage /></MemoryRouter>);

describe("DashboardGeralPage — porta de entrada", () => {
  it("renderiza as seções na ordem nova, com o hero do VAF", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("VAF · IPM")).toBeInTheDocument());
    const h3s = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(h3s.indexOf("Cenário do município")).toBeGreaterThan(-1);
    expect(h3s.indexOf("Mudanças relevantes")).toBeGreaterThan(h3s.indexOf("Cenário do município"));
    expect(h3s.indexOf("Aprofundar")).toBeGreaterThan(h3s.indexOf("Mudanças relevantes"));
    expect(h3s.indexOf("Panorama")).toBeGreaterThan(h3s.indexOf("Aprofundar"));
    expect(screen.queryByText("Crescimento PIB")).toBeNull();
  });

  it("atalhos apontam para os 6 destinos curados", async () => {
    montar();
    await waitFor(() => expect(screen.getByRole("link", { name: /Análise Econômica/ })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Visão do Prefeito/ })).toHaveAttribute("href", "/app/painel-prefeito");
    expect(screen.getByRole("link", { name: /Gestão Empresarial/ })).toHaveAttribute("href", "/app/desenvolvimento-economico/retencao");
  });

  it("ADMIN_GLOBAL sem view-as vê o guard e não busca nada", () => {
    authState.user = { role: "ADMIN_GLOBAL" };
    montar();
    expect(screen.queryByText("VAF · IPM")).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
});

// ── Gráficos de PIB independentes ────────────────────────────────────────────
// O cliente reportou como bug: passar o mouse na "Evolução do PIB" acendia o
// tooltip fantasma no "PIB Comparativo" (e vice-versa). Os dois gráficos não
// compartilham mais o grupo de hover.
import { fireEvent } from "@testing-library/react";

// jsdom não implementa ResizeObserver; gráficos com dados medem o container.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

describe("DashboardGeralPage — gráficos de PIB independentes", () => {
  it("hover na Evolução do PIB não acende tooltip no PIB Comparativo", async () => {
    respostas["/pib/serie"] = [
      { ano: 2020, pib_total: 100 }, { ano: 2021, pib_total: 120 }, { ano: 2022, pib_total: 130 },
    ];
    respostas["/pib/comparativo"] = {
      foco: { municipio_id: 1, nome: "Foco", estado: "MG" },
      pares: [{ municipio_id: 2, nome: "Par", estado: "MG" }],
      fixados: [], criterio_pares: "populacao", motivo: null,
      itens: [
        { ano: 2020, municipio_id: 1, cidade: "Foco", pib_total: 100, va_agropecuaria: 10, va_industria: 30, va_servicos: 40, va_governo: 20 },
        { ano: 2021, municipio_id: 1, cidade: "Foco", pib_total: 120, va_agropecuaria: 12, va_industria: 36, va_servicos: 48, va_governo: 24 },
        { ano: 2022, municipio_id: 1, cidade: "Foco", pib_total: 130, va_agropecuaria: 13, va_industria: 39, va_servicos: 52, va_governo: 26 },
        { ano: 2020, municipio_id: 2, cidade: "Par", pib_total: 90 },
        { ano: 2021, municipio_id: 2, cidade: "Par", pib_total: 95 },
        { ano: 2022, municipio_id: 2, cidade: "Par", pib_total: 99 },
      ],
    };
    montar();
    await waitFor(() => expect(screen.getByText("Evolução do PIB")).toBeInTheDocument());
    const evolucao = screen.getByText("Evolução do PIB").closest(".nid-panel");
    const comparativo = screen.getByText("PIB Comparativo").closest(".nid-panel");
    await waitFor(() => expect(evolucao.querySelector("rect[fill='transparent']")).not.toBeNull());
    await waitFor(() => expect(comparativo.querySelector("rect[fill='transparent']")).not.toBeNull());

    fireEvent.mouseMove(evolucao.querySelector("rect[fill='transparent']"), { clientX: 120 });
    expect(evolucao.querySelectorAll(".nid-tip").length).toBe(1);
    expect(comparativo.querySelectorAll(".nid-tip").length).toBe(0);

    fireEvent.mouseLeave(evolucao.querySelector(".nid-chart-wrap"));
    fireEvent.mouseMove(comparativo.querySelector("rect[fill='transparent']"), { clientX: 120 });
    expect(comparativo.querySelectorAll(".nid-tip").length).toBe(1);
    expect(evolucao.querySelectorAll(".nid-tip").length).toBe(0);
  });
});
