// @vitest-environment jsdom
//
// Aba "Agenda" da Gestão Empresarial: KPIs e seis blocos a partir de
// /retencao/agenda; seletor 7 · 14 · 30; cada item abre a empresa; vazios
// explícitos e erro audível.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

const respostas = {};
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url, cfg) => {
      const r = respostas[url];
      const data = typeof r === "function" ? r(cfg?.params ?? {}) : r;
      return Promise.resolve(data).then((d) => ({ data: d }));
    }),
  },
}));

import api from "../../services/api";
import AgendaTab from "./AgendaTab";

const URL = "/desenvolvimento-economico/retencao/agenda";
const KPIS_ZERO = { vencidas: 0, proximas: 0, sem_data: 0, demandas_abertas: 0, sem_contato: 0 };
const VAZIA = { hoje: "2026-09-03", dias: 7, kpis: KPIS_ZERO, vencidas: [], proximas: [], sem_data: [], demandas: [], sem_contato: [], contatos_recentes: [] };
const CHEIA = {
  hoje: "2026-09-03", dias: 7,
  kpis: { vencidas: 1, proximas: 1, sem_data: 1, demandas_abertas: 1, sem_contato: 1 },
  vencidas: [{ empresa_id: 7, empresa_nome: "ACME", proxima_acao: "Ligar", proxima_acao_data: "2026-08-30", dias: 4, responsavel: "Ana" }],
  proximas: [{ empresa_id: 9, empresa_nome: "Beta", proxima_acao: "Visita", proxima_acao_data: "2026-09-05", dias: 2, responsavel: null }],
  sem_data: [{ empresa_id: 3, empresa_nome: "Gama", proxima_acao: "Enviar proposta", responsavel: null }],
  demandas: [{ demanda_id: 5, empresa_id: 7, empresa_nome: "ACME", descricao: "Iluminação da via", status: "em_andamento",
    data_registro: "2026-07-20", dias_em_aberto: 45, status_desde: "2026-08-10", responsavel: "Obras", sinal_30d: true }],
  sem_contato: [{ empresa_id: 11, empresa_nome: "Delta", desde: "2026-05-02", dias: 124 }],
  contatos_recentes: [{ empresa_id: 7, empresa_nome: "ACME", tipo: "contato", subtipo: "ligacao", data: "2026-09-01",
    responsavel: "Ana", observacoes: "Retorno sobre alvará" }],
};

const params = () => api.get.mock.calls.filter(([u]) => u === URL).map(([, cfg]) => cfg?.params ?? {});
const regiao = (nome) => screen.getByRole("region", { name: nome });
// Só o <p> do KPI: os títulos dos blocos repetem o texto num <h3>.
const kpi = (label) => screen.getAllByText(label).find((el) => el.tagName === "P").nextElementSibling.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  respostas[URL] = () => CHEIA;
});

const montar = (props = {}) => render(<AgendaTab onAbrirEmpresa={props.onAbrirEmpresa || vi.fn()} refreshKey={props.refreshKey ?? 0} />);
const esperar = () => waitFor(() => expect(regiao("Ações vencidas")).toBeInTheDocument());

describe("AgendaTab", () => {
  it("KPIs e blocos a partir do payload; padrão 7 dias", async () => {
    montar();
    await esperar();
    expect(params()[0]).toEqual({ dias: 7 });
    expect(kpi("Ações vencidas")).toBe("1");
    expect(kpi("Próximos 7 dias")).toBe("1");
    expect(kpi("Sem data")).toBe("1");
    expect(kpi("Demandas abertas")).toBe("1");
    expect(kpi("Sem contato 90 d+")).toBe("1");
    expect(within(regiao("Ações vencidas")).getByText(/Ligar · venceu há 4 dias · Ana/)).toBeInTheDocument();
    expect(within(regiao("Próximos 7 dias")).getByText(/Visita · em 2 dias \(05\/09\/2026\)/)).toBeInTheDocument();
    expect(within(regiao("Sem data marcada")).getByText(/Enviar proposta/)).toBeInTheDocument();
    expect(within(regiao("Demandas abertas")).getByText(/Iluminação da via · Em andamento desde 10\/08\/2026 · 45 dias em aberto/)).toBeInTheDocument();
    expect(within(regiao("Demandas abertas")).getByText("30 d+")).toBeInTheDocument();
    expect(within(regiao("Sem contato há 90 dias ou mais")).getByText(/desde 02\/05\/2026 · 124 dias/)).toBeInTheDocument();
    expect(within(regiao("Contatos e visitas recentes")).getByText(/01\/09\/2026 · Ligação · Ana — Retorno sobre alvará/)).toBeInTheDocument();
  });

  it("seletor de janela envia dias e atualiza os rótulos", async () => {
    respostas[URL] = ({ dias }) => ({ ...CHEIA, dias, kpis: { ...CHEIA.kpis, proximas: dias === 14 ? 3 : 1 } });
    montar();
    await esperar();
    fireEvent.click(screen.getByRole("tab", { name: "14 dias" }));
    await waitFor(() => expect(params().at(-1)).toEqual({ dias: 14 }));
    await waitFor(() => expect(kpi("Próximos 14 dias")).toBe("3"));
    expect(screen.getByRole("tab", { name: "14 dias" })).toHaveAttribute("aria-selected", "true");
    expect(within(regiao("Próximos 14 dias")).getByText(/Visita/)).toBeInTheDocument();
  });

  it("clicar num item abre a empresa", async () => {
    const onAbrirEmpresa = vi.fn();
    montar({ onAbrirEmpresa });
    await esperar();
    fireEvent.click(within(regiao("Sem contato há 90 dias ou mais")).getByRole("button", { name: /^Abrir Delta/ }));
    expect(onAbrirEmpresa).toHaveBeenCalledWith(11);
    fireEvent.click(within(regiao("Demandas abertas")).getByRole("button", { name: /^Abrir ACME/ }));
    expect(onAbrirEmpresa).toHaveBeenLastCalledWith(7);
  });

  it("vazio geral e frases por bloco", async () => {
    respostas[URL] = () => VAZIA;
    montar();
    await esperar();
    expect(screen.getByText(/Nada na agenda: nenhuma ação, demanda aberta ou contato recente/)).toBeInTheDocument();
    expect(within(regiao("Ações vencidas")).getByText("Nenhuma ação vencida.")).toBeInTheDocument();
    expect(within(regiao("Próximos 7 dias")).getByText("Nada nos próximos 7 dias.")).toBeInTheDocument();
    expect(within(regiao("Sem data marcada")).getByText("Todas as ações têm data.")).toBeInTheDocument();
    expect(within(regiao("Demandas abertas")).getByText("Nenhuma demanda aberta.")).toBeInTheDocument();
    expect(within(regiao("Sem contato há 90 dias ou mais")).getByText("Todas as empresas tiveram contato nos últimos 90 dias.")).toBeInTheDocument();
    expect(within(regiao("Contatos e visitas recentes")).getByText("Nenhum contato ou visita nos últimos 30 dias.")).toBeInTheDocument();
  });

  it("vazio por bloco não mostra o aviso geral", async () => {
    respostas[URL] = () => ({ ...CHEIA, proximas: [], kpis: { ...CHEIA.kpis, proximas: 0 } });
    montar();
    await esperar();
    expect(screen.queryByText(/Nada na agenda/)).toBeNull();
    expect(within(regiao("Próximos 7 dias")).getByText("Nada nos próximos 7 dias.")).toBeInTheDocument();
  });

  it("erro de carga é avisado", async () => {
    respostas[URL] = () => Promise.reject(new Error("500"));
    montar();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a agenda."));
    expect(screen.queryByRole("region", { name: "Ações vencidas" })).toBeNull();
  });

  it("refreshKey recarrega", async () => {
    const { rerender } = render(<AgendaTab onAbrirEmpresa={vi.fn()} refreshKey={0} />);
    await esperar();
    const antes = params().length;
    rerender(<AgendaTab onAbrirEmpresa={vi.fn()} refreshKey={1} />);
    await waitFor(() => expect(params().length).toBe(antes + 1));
  });
});
