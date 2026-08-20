// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
const DETALHE = {
  ...EMPRESA,
  proxima_acao: "Visita de acompanhamento",
  visitas: [{ id: 1, data_visita: "2026-08-01", responsavel: "Ana", observacoes: "ok", foto_base64: null }],
  contatos: [{ id: 2, data: "2026-08-05", tipo: "ligacao", responsavel: "Bia", observacoes: null }],
  demandas: [{ id: 3, descricao: "Iluminação da via", status: "aberta", data_registro: "2026-08-02", responsavel: null }],
  perfil_rfb: { id: 9, cnpj_basico: "12345678", razao_social: "ACME LTDA",
    nome_fantasia: "ACME", situacao: "02", porte: "03", cnae_fiscal: "1011101",
    capital_social: 150000, data_inicio: "2010-01-05", opcao_simples: true, opcao_mei: false },
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
