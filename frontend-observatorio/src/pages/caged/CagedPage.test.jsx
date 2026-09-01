// @vitest-environment jsdom
//
// Bug reportado: com a série cobrindo ago/25–jul/26, o KPI "Saldo · Acumulado"
// somava os dois anos (−262 + 208 = −54) enquanto a página inteira está em
// "Foco · 2026" — o leitor esperava +208. O KPI agora segue o ano em foco e
// ganha a aba "Histórico" para o acumulado de todo o período.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "SECRETARIO", permissoes: {} } };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));

const respostas = {};
vi.mock("../../services/api", () => ({
  // Endpoints de lista do CAGED devolvem [] na API real (safe() da página);
  // os demais componentes (insights, releases, tooltips) lidam com null.
  default: { get: vi.fn((url) => Promise.resolve({ data: respostas[url] ?? (url.startsWith("/caged/") ? [] : null) })) },
}));

// jsdom não implementa ResizeObserver; gráficos com dados medem o container.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

import CagedPage from "./CagedPage";

// 12 meses: 2025 (ago–dez) fecha em −262 e 2026 (jan–jul) em +208 → histórico −54.
const NEG_2025 = [50, 50, 50, 50, 62];
const POS_2026 = [30, 30, 30, 30, 30, 30, 28];
const serie = [
  ...NEG_2025.map((s, i) => ({ ano: 2025, mes: 8 + i, admissoes: 100, desligamentos: 100 + s, saldo: -s })),
  ...POS_2026.map((s, i) => ({ ano: 2026, mes: 1 + i, admissoes: 100 + s, desligamentos: 100, saldo: s })),
];
const resumo = { total_admissoes: 1408, total_desligamentos: 1462, saldo_total: -54 };

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  respostas["/caged/serie"] = serie;
  respostas["/caged/resumo"] = resumo;
  authState.user = { role: "SECRETARIO", permissoes: {} };
  viewAsState.viewAsId = null;
});

const montar = () => render(<MemoryRouter><CagedPage /></MemoryRouter>);
const kpi = (label) => screen.getByText(label).closest(".nid-kpi");
const valor = (label) => kpi(label).querySelector(".nid-kpi-value").textContent;
const esperarKpis = () => waitFor(() => expect(screen.getByText("Saldo · Acumulado")).toBeInTheDocument());

describe("CagedPage — KPI Saldo segue o ano em foco", () => {
  it("por padrão mostra o saldo do ano em foco (2026: +208) e o histórico no rodapé", async () => {
    montar();
    await esperarKpis();
    expect(valor("Saldo · Acumulado")).toContain("208");
    expect(kpi("Saldo · Acumulado").textContent).toContain("-54 no histórico");
  });

  it("aba Histórico troca para o acumulado de todo o período (−54)", async () => {
    montar();
    await esperarKpis();
    fireEvent.click(within(kpi("Saldo · Acumulado")).getByRole("tab", { name: "Histórico" }));
    expect(valor("Saldo · Acumulado")).toContain("-54");
  });

  it("selecionar 2025 nas abas de ano muda o saldo (−262) e o badge de Admissões/Desligamentos", async () => {
    montar();
    await esperarKpis();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    expect(valor("Saldo · Acumulado")).toContain("-262");
    expect(kpi("Admissões").querySelector(".nid-badge").textContent).toBe("2025");
    expect(kpi("Desligamentos").querySelector(".nid-badge").textContent).toBe("2025");
  });
});
