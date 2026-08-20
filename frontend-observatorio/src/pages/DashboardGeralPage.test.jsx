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
