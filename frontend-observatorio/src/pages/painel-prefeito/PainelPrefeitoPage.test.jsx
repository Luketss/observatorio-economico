// @vitest-environment jsdom
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "PREFEITO" } }),
}));
vi.mock("../../context/ViewAsContext", () => ({
  useViewAs: () => ({ viewAsId: null }),
}));

// Resumos com ano/mês reais (pib.ultimo_ano, vaf.ultimo_ano, ips.ano) vs.
// resumos que não carregam período algum (caged, arrecadacao, ...) — usado
// pelos testes de period do KpiCard e pelos testes de fetch por modo.
const DADOS_POR_URL = {
  "/pib/resumo": { ultimo_ano: 2023, pib_ultimo_ano: 123, crescimento_percentual: 1.2 },
  "/vaf/resumo": { ultimo_ano: 2022, ipm_ultimo_ano: 1.2345, variacao_ipm_percentual: 0.5 },
  "/ips/scorecard": { ano: 2021, ips_geral: 65.4 },
  "/dados_internos/indicadores": [
    { id: 1, area: "Desenvolvimento Social", nome_metrica: "Famílias atendidas", valor: 10, unidade: "famílias" },
  ],
};

vi.mock("../../services/api", () => ({
  default: { get: vi.fn((url) => Promise.resolve({ data: DADOS_POR_URL[url] ?? null })) },
}));

vi.mock("../../components/PrioridadesPanel", () => ({ default: () => null }));
vi.mock("../../components/AlertaFpmCard", () => ({ default: () => null }));
vi.mock("../../components/MudancasRelevantes", () => ({
  default: ({ resumos }) => (
    <div data-testid="mudancas" data-keys={Object.keys(resumos || {}).join(",")} />
  ),
}));
vi.mock("../../components/ReleasesPanel", () => ({
  default: ({ dataset }) => <div data-testid="releases" data-dataset={dataset} />,
}));

vi.mock("../../components/KpiCard", () => ({
  default: ({ label, period, dataset, indicadorKey }) => (
    <div data-testid="kpi" data-label={label} data-period={period ?? ""} data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
vi.mock("../../components/FunilResumoCard", () => ({
  default: ({ dataset, indicadorKey }) => (
    <div data-testid="funil-card" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
vi.mock("../../components/ProjetosResumoCard", () => ({
  default: ({ dataset, indicadorKey }) => (
    <div data-testid="projetos-card" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
vi.mock("../../components/DinheiroNaMesaCard", () => ({
  default: ({ dataset, indicadorKey }) => (
    <div data-testid="dinheiro-card" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));
vi.mock("../../components/EmendasResumoCard", () => ({
  default: ({ dataset, indicadorKey }) => (
    <div data-testid="emendas-card" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));

import api from "../../services/api";
import PainelPrefeitoPage from "./PainelPrefeitoPage";

const montar = () => render(<MemoryRouter><PainelPrefeitoPage /></MemoryRouter>);

const ENDPOINTS_DETALHADO = [
  "/rais/resumo", "/empresas/resumo", "/estban/resumo", "/comex/resumo", "/pix/resumo",
  "/bolsa_familia/resumo", "/pe_de_meia/resumo", "/inss/resumo", "/ips/scorecard",
  "/dados_internos/indicadores", "/dados_internos/plano_gov",
];

describe("PainelPrefeitoPage — plumbing de ⓘ (dataset/indicadorKey)", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("modo gerencial: os 4 KpiCards recebem dataset painel_prefeito e indicadorKey kpi_<chave>", async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(4));
    const kpis = screen.getAllByTestId("kpi");
    const chaves = kpis.map((k) => k.getAttribute("data-key"));
    expect(chaves).toEqual(["kpi_pib", "kpi_arrecadacao", "kpi_caged", "kpi_vaf"]);
    kpis.forEach((k) => expect(k.getAttribute("data-dataset")).toBe("painel_prefeito"));
  });

  it("modo gerencial: FunilResumoCard e ProjetosResumoCard recebem dataset/indicadorKey", async () => {
    montar();
    const funil = await screen.findByTestId("funil-card");
    expect(funil.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(funil.getAttribute("data-key")).toBe("card_funil_investimentos");

    const projetos = screen.getByTestId("projetos-card");
    expect(projetos.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(projetos.getAttribute("data-key")).toBe("card_projetos");
  });

  it("DinheiroNaMesaCard e EmendasResumoCard recebem dataset/indicadorKey (independente do modo)", async () => {
    montar();
    const dinheiro = await screen.findByTestId("dinheiro-card");
    expect(dinheiro.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(dinheiro.getAttribute("data-key")).toBe("card_dinheiro_na_mesa");

    const emendas = screen.getByTestId("emendas-card");
    expect(emendas.getAttribute("data-dataset")).toBe("painel_prefeito");
    expect(emendas.getAttribute("data-key")).toBe("card_emendas");
  });

  it("modo detalhado: os 13 KpiCards do panorama recebem dataset painel_prefeito e indicadorKey kpi_<chave>", async () => {
    localStorage.setItem("nid-painel-modo", "detalhado");
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(13));
    const kpis = screen.getAllByTestId("kpi");
    const chaves = kpis.map((k) => k.getAttribute("data-key"));
    expect(chaves).toEqual([
      "kpi_arrecadacao", "kpi_pib", "kpi_vaf", "kpi_caged", "kpi_rais", "kpi_empresas",
      "kpi_estban", "kpi_comex", "kpi_pix", "kpi_bolsa_familia", "kpi_pe_de_meia", "kpi_inss", "kpi_ips",
    ]);
    kpis.forEach((k) => expect(k.getAttribute("data-dataset")).toBe("painel_prefeito"));
  });
});

describe("PainelPrefeitoPage — deltas (período nos KPIs, mudanças relevantes, releases, fetch por modo)", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("KpiCard de pib recebe period com o ano do resumo (pib.ultimo_ano)", async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(4));
    const pib = screen.getAllByTestId("kpi").find((k) => k.getAttribute("data-key") === "kpi_pib");
    expect(pib.getAttribute("data-period")).toBe("2023");
  });

  it("KpiCard sem ano/mês no resumo (caged, arrecadacao) não recebe period — nunca '0'", async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(4));
    const kpis = screen.getAllByTestId("kpi");
    const caged = kpis.find((k) => k.getAttribute("data-key") === "kpi_caged");
    const arrecadacao = kpis.find((k) => k.getAttribute("data-key") === "kpi_arrecadacao");
    expect(caged.getAttribute("data-period")).toBe("");
    expect(arrecadacao.getAttribute("data-period")).toBe("");
  });

  it("modo detalhado: KpiCard de ips recebe period com o ano do scorecard (ips.ano)", async () => {
    localStorage.setItem("nid-painel-modo", "detalhado");
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(13));
    const ips = screen.getAllByTestId("kpi").find((k) => k.getAttribute("data-key") === "kpi_ips");
    expect(ips.getAttribute("data-period")).toBe("2021");
  });

  it("modo gerencial: renderiza MudancasRelevantes com os 4 resumos do panorama gerencial", async () => {
    montar();
    const mudancas = await screen.findByTestId("mudancas");
    expect(mudancas.getAttribute("data-keys")).toBe("pib,vaf,arrecadacao,caged");
  });

  it('ReleasesPanel dataset="geral" é renderizado no rodapé, comum aos dois modos', async () => {
    montar();
    const releases = await screen.findByTestId("releases");
    expect(releases.getAttribute("data-dataset")).toBe("geral");
  });

  it("modo gerencial: busca só pib/arrecadacao/caged/vaf — nunca os endpoints exclusivos do modo detalhado", async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(4));
    const urls = api.get.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(expect.arrayContaining(["/pib/resumo", "/arrecadacao/resumo", "/caged/resumo", "/vaf/resumo"]));
    ENDPOINTS_DETALHADO.forEach((url) => expect(urls).not.toContain(url));
  });

  it("trocar para o modo detalhado busca os endpoints que faltam, sem refazer os 4 já buscados", async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(4));

    fireEvent.click(screen.getByText("Detalhado"));
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(13));

    const urls = api.get.mock.calls.map((c) => c[0]);
    ENDPOINTS_DETALHADO.forEach((url) => expect(urls).toContain(url));
    // os 4 do modo gerencial não são refeitos ao trocar de modo (cache simples)
    ["/pib/resumo", "/arrecadacao/resumo", "/caged/resumo", "/vaf/resumo"].forEach((url) => {
      expect(urls.filter((u) => u === url).length).toBe(1);
    });
  });

  it('matchAreaKey: "Desenvolvimento Social" resolve para a área Assistência Social, não Desenvolvimento Econômico', async () => {
    localStorage.setItem("nid-painel-modo", "detalhado");
    montar();
    await waitFor(() => expect(screen.getAllByTestId("kpi").length).toBe(13));
    const assistencia = await screen.findByText("Assistência Social");
    const card = assistencia.closest("div").parentElement;
    expect(card.textContent).toContain("Famílias atendidas");

    const desenvolvimento = screen.getByText("Desenvolvimento Econômico");
    const cardDesenv = desenvolvimento.closest("div").parentElement;
    expect(cardDesenv.textContent).not.toContain("Famílias atendidas");
  });
});
