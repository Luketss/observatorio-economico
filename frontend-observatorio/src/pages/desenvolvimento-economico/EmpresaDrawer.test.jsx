// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })),
             put: vi.fn(() => Promise.resolve({ data: {} })),
             delete: vi.fn(() => Promise.resolve({ data: { ok: true } })) },
}));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import api from "../../services/api";
import { PlanContext } from "../../context/PlanContext";
import EmpresaDrawer from "./EmpresaDrawer";

const EMPRESA = { id: 7, nome: "ACME", setor: "Indústria", status_risco: "alto",
  potencial_expansao: "medio", num_empregos: 42, proxima_acao: "Agendar reunião",
  proxima_acao_data: "2026-09-01" };
const RELEVANCIA = {
  score: 61, faixa: "alta", parcial: false,
  fatores: [
    { chave: "empregos", rotulo: "Empregos informados: 42", pontos: 20, maximo: 40, origem: "cadastro" },
    { chave: "porte", rotulo: "Porte RFB: empresa de pequeno porte", pontos: 12, maximo: 20, origem: "rfb" },
    { chave: "tempo", rotulo: "Tempo de atividade: 16 ano(s)", pontos: 15, maximo: 15, origem: "rfb" },
    { chave: "capital", rotulo: "Capital social: R$ 150.000", pontos: 6, maximo: 10, origem: "rfb" },
    { chave: "expansao", rotulo: "Potencial de expansão: médio", pontos: 8, maximo: 15, origem: "cadastro" },
  ],
};
const RISCO = { nivel: "atencao", sinais: [{ chave: "proxima_acao_vencida", rotulo: "Próxima ação vencida", desde: "2026-08-01" }] };
const DETALHE = {
  ...EMPRESA,
  proxima_acao: "Visita de acompanhamento",
  visitas: [{ id: 1, data_visita: "2026-08-01", responsavel: "Ana", observacoes: "ok", foto_base64: null }],
  contatos: [{ id: 2, data: "2026-08-05", tipo: "ligacao", responsavel: "Bia", observacoes: null }],
  demandas: [{ id: 3, descricao: "Iluminação da via", status: "aberta", data_registro: "2026-08-02", responsavel: null }],
  perfil_rfb: { id: 9, cnpj_basico: "12345678", razao_social: "ACME LTDA",
    nome_fantasia: "ACME", situacao: "02", porte: "03", cnae_fiscal: "1011101",
    capital_social: 150000, data_inicio: "2010-01-05", opcao_simples: true, opcao_mei: false },
  relevancia: RELEVANCIA, risco: RISCO,
};

function montar(props = {}) {
  return render(
    <EmpresaDrawer empresa={EMPRESA} detalhe={DETALHE} onClose={() => {}}
      onChanged={props.onChanged || vi.fn()} canEditar={props.canEditar ?? true} />
  );
}

beforeEach(() => vi.clearAllMocks());

describe("EmpresaDrawer — abas", () => {
  it("mostra as 3 abas com Perfil ativo por padrão, incluindo a seção RFB", () => {
    montar();
    expect(screen.getByRole("tab", { name: /Perfil/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Contatos & Visitas/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Demandas/ })).toBeInTheDocument();
    expect(screen.getByText("ACME LTDA")).toBeInTheDocument(); // razão social RFB
    expect(screen.getByText("Visita de acompanhamento")).toBeInTheDocument(); // próxima ação vem do detalhe, não do card
  });

  it("aba Contatos & Visitas mescla os dois tipos em ordem cronológica", () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Contatos & Visitas/ }));
    const itens = screen.getAllByTestId("timeline-item");
    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toContain("Visita");   // 01/08 antes de
    expect(itens[1].textContent).toContain("Ligação");  // 05/08
  });

  it("registra contato novo via POST", async () => {
    const onChanged = vi.fn();
    montar({ onChanged });
    fireEvent.click(screen.getByRole("tab", { name: /Contatos & Visitas/ }));
    fireEvent.change(screen.getByLabelText("Data do contato"), { target: { value: "2026-08-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar contato" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/desenvolvimento-economico/retencao/7/contatos",
      expect.objectContaining({ data: "2026-08-10", tipo: "reuniao" })
    ));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(7));
  });

  it("muda status da demanda via PUT", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Demandas/ }));
    fireEvent.change(screen.getByLabelText("Status da demanda Iluminação da via"),
      { target: { value: "resolvida" } });
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/desenvolvimento-economico/retencao/demandas/3",
      { status: "resolvida" }
    ));
  });

  it("sem canEditar não há formulários nem selects de status", () => {
    montar({ canEditar: false });
    fireEvent.click(screen.getByRole("tab", { name: /Demandas/ }));
    expect(screen.queryByRole("button", { name: /Registrar/ })).toBeNull();
    expect(screen.queryByLabelText(/Status da demanda/)).toBeNull();
  });

  it("próxima ação limpa no detalhe não ressuscita do prop stale (empresa)", () => {
    render(
      <EmpresaDrawer empresa={EMPRESA} detalhe={{ ...DETALHE, proxima_acao: null, proxima_acao_data: null }}
        onClose={() => {}} onChanged={vi.fn()} canEditar={true} />
    );
    expect(screen.getByText("Nenhuma ação planejada.")).toBeInTheDocument();
    expect(screen.queryByText("Agendar reunião")).toBeNull();
  });

  it("seção RFB fica sob PlanGate quando o plano não inclui empresas", () => {
    render(
      <PlanContext.Provider value={{ modulos: [], canAccess: (k) => k !== "empresas" }}>
        <EmpresaDrawer empresa={EMPRESA} detalhe={DETALHE} onClose={() => {}}
          onChanged={vi.fn()} canEditar={true} />
      </PlanContext.Provider>
    );
    expect(screen.getByText("Disponível apenas no plano pago")).toBeInTheDocument();
  });
});

describe("EmpresaDrawer — relevância e sinais calculados", () => {
  it("bloco Relevância: score, faixa, barra e fatores de cadastro; fatores RFB dentro da seção Base RFB", () => {
    montar();
    const bloco = screen.getByRole("region", { name: "Relevância" });
    expect(within(bloco).getByText("61")).toBeInTheDocument();
    expect(within(bloco).getByText("Alta")).toBeInTheDocument();
    expect(within(bloco).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "61");
    expect(within(bloco).getByText("Empregos informados: 42")).toBeInTheDocument();
    expect(within(bloco).getByText("20/40")).toBeInTheDocument();
    expect(within(bloco).queryByText(/Porte RFB/)).toBeNull(); // fatores RFB não ficam no bloco
    const rfb = screen.getByText("Base RFB").closest("div");
    expect(within(rfb).getByText("Porte RFB: empresa de pequeno porte")).toBeInTheDocument();
    expect(within(rfb).getByText("12/20")).toBeInTheDocument();
    expect(within(rfb).getByText("15/15")).toBeInTheDocument();
  });

  it("bloco Sinais de risco lista rótulo e data de referência", () => {
    montar();
    const bloco = screen.getByRole("region", { name: "Sinais de risco" });
    expect(bloco.textContent).toContain("atenção");
    expect(within(bloco).getByText(/Próxima ação vencida/)).toBeInTheDocument();
    expect(bloco.textContent).toContain("desde 01/08/2026");
  });

  it("dicas de dado ausente: empregos não informados e sem vínculo RFB (parcial); nenhum sinal", () => {
    const parcial = {
      ...DETALHE, perfil_rfb: null,
      relevancia: { score: 8, faixa: "baixa", parcial: true, fatores: [
        { chave: "empregos", rotulo: "Empregos: não informado", pontos: 0, maximo: 40, origem: "cadastro" },
        { chave: "porte", rotulo: "Porte RFB: sem vínculo RFB", pontos: 0, maximo: 20, origem: "rfb" },
        { chave: "tempo", rotulo: "Tempo de atividade: sem vínculo RFB", pontos: 0, maximo: 15, origem: "rfb" },
        { chave: "capital", rotulo: "Capital social: sem vínculo RFB", pontos: 0, maximo: 10, origem: "rfb" },
        { chave: "expansao", rotulo: "Potencial de expansão: médio", pontos: 8, maximo: 15, origem: "cadastro" },
      ] },
      risco: { nivel: "nenhum", sinais: [] },
    };
    render(<EmpresaDrawer empresa={EMPRESA} detalhe={parcial} onClose={() => {}} onChanged={vi.fn()} canEditar={true} />);
    expect(screen.getByText(/Baixa · parcial/)).toBeInTheDocument();
    expect(screen.getByText(/informe os empregos para refinar/)).toBeInTheDocument();
    expect(screen.getByText(/vincule à base RFB no formulário/)).toBeInTheDocument();
    expect(screen.getByText("Nenhum sinal de risco calculado.")).toBeInTheDocument();
  });

  it("modificador de situação aparece com pontos negativos e sem máximo", () => {
    const baixada = {
      ...DETALHE,
      relevancia: { ...RELEVANCIA, score: 0, faixa: "baixa", fatores: [
        ...RELEVANCIA.fatores,
        { chave: "situacao", rotulo: "baixada na RFB: score zerado", pontos: -61, maximo: 0, origem: "rfb" },
      ] },
    };
    render(<EmpresaDrawer empresa={EMPRESA} detalhe={baixada} onClose={() => {}} onChanged={vi.fn()} canEditar={true} />);
    const rfb = screen.getByText("Base RFB").closest("div");
    expect(within(rfb).getByText("baixada na RFB: score zerado")).toBeInTheDocument();
    expect(within(rfb).getByText("-61")).toBeInTheDocument();
  });

  it("sem plano 'empresas' os fatores RFB ficam sob o mesmo PlanGate da Base RFB (um único cadeado)", () => {
    render(
      <PlanContext.Provider value={{ modulos: [], canAccess: (k) => k !== "empresas" }}>
        <EmpresaDrawer empresa={EMPRESA} detalhe={DETALHE} onClose={() => {}} onChanged={vi.fn()} canEditar={true} />
      </PlanContext.Provider>
    );
    expect(screen.getAllByText("Disponível apenas no plano pago")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Relevância" }).textContent).toContain("61"); // score e cadastro visíveis
  });

  it("enquanto o detalhe não chegou, usa relevância/risco do card", () => {
    render(<EmpresaDrawer empresa={{ ...EMPRESA, relevancia: RELEVANCIA, risco: RISCO }} detalhe={null}
      onClose={() => {}} onChanged={vi.fn()} canEditar={true} />);
    expect(screen.getByRole("region", { name: "Relevância" }).textContent).toContain("61");
  });
});
