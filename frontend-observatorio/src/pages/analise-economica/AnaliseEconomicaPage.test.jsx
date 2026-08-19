// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlanContext } from "../../context/PlanContext";

const authState = { user: { role: "SECRETARIO", permissoes: {} } };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));

// Mapa url → resposta; Error = rejeição (simula 403 de plano).
const respostas = {};
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url) => {
      const r = respostas[url];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve({ data: r ?? null });
    }),
  },
}));

import api from "../../services/api";
import AnaliseEconomicaPage from "./AnaliseEconomicaPage";

const RESUMOS_OK = {
  "/pib/resumo": { ultimo_ano: 2021, pib_ultimo_ano: 1234567890.5, crescimento_percentual: 5.2 },
  "/vaf/resumo": { ultimo_ano: 2023, ipm_ultimo_ano: 0.012345, variacao_ipm_percentual: -3.1 },
  "/empresas/resumo": { total_ativas: 585, total_mei: 320 },
  "/estban/resumo": { total_operacoes_credito: 2500000, qtd_agencias: 3 },
  "/comex/resumo": { balanca_comercial: 1500000 },
  "/pix/resumo": { total_transacoes: 12345 },
  "/insights": { bullets: ["insight um", "insight dois"], gerado_em: "2026-08-01T00:00:00" },
};

function montar() {
  return render(
    <MemoryRouter>
      <AnaliseEconomicaPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  Object.assign(respostas, RESUMOS_OK);
  authState.user = { role: "SECRETARIO", permissoes: {} };
  viewAsState.viewAsId = null;
});

describe("AnaliseEconomicaPage — cards das 6 bases", () => {
  it("renderiza os 6 cards com valores dos resumos e links de aprofundamento", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("PIB")).toBeInTheDocument());
    expect(screen.getByText("VAF · IPM")).toBeInTheDocument();
    expect(screen.getByText("Empresas ativas")).toBeInTheDocument();
    expect(screen.getByText("Crédito bancário")).toBeInTheDocument();
    expect(screen.getByText("Balança comercial")).toBeInTheDocument();
    expect(screen.getByText("Transações PIX")).toBeInTheDocument();
    expect(screen.getByText("585")).toBeInTheDocument(); // empresas ativas
    expect(screen.getByText("PIB").closest("a")).toHaveAttribute("href", "/app/pib");
  });

  it("base com erro (403) degrada para — sem quebrar as demais", async () => {
    respostas["/pix/resumo"] = new Error("403");
    montar();
    await waitFor(() => expect(screen.getByText("585")).toBeInTheDocument());
    const cardPix = screen.getByText("Transações PIX").closest("a");
    expect(cardPix.textContent).toContain("—");
  });

  it("base bloqueada por plano mostra o teaser do PlanGate", async () => {
    render(
      <MemoryRouter>
        <PlanContext.Provider value={{ modulos: ["pib"], canAccess: (k) => k !== "pix" }}>
          <AnaliseEconomicaPage />
        </PlanContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("585")).toBeInTheDocument());
    expect(screen.getAllByText("Disponível apenas no plano pago")).toHaveLength(1);
  });
});

describe("AnaliseEconomicaPage — insights por base", () => {
  it("carrega insights do PIB por padrão e troca de base pelo chip", async () => {
    montar();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/insights",
        expect.objectContaining({ params: expect.objectContaining({ dataset: "pib" }) })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "VAF" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/insights",
        expect.objectContaining({ params: expect.objectContaining({ dataset: "vaf" }) })
      )
    );
  });
});

describe("AnaliseEconomicaPage — ADMIN_GLOBAL sem view-as", () => {
  it("mostra o guard de município e não busca resumos", () => {
    authState.user = { role: "ADMIN_GLOBAL" };
    montar();
    expect(screen.queryByText("PIB")).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith("/pib/resumo");
  });
});
