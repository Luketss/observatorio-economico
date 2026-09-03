// @vitest-environment jsdom
//
// Aba "Descobrir na base RFB": ranking paginado das empresas ainda não
// acompanhadas, filtros, busca com debounce, carregar mais, acompanhar,
// estados vazio e de erro.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

// respostas[url] pode ser um valor, uma função dos params ou uma promise.
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
import DescobrirRfb from "./DescobrirRfb";

const BASE = "/desenvolvimento-economico/retencao/descobrir";
const ITENS = [
  { cnpj_basico: "11111111", razao_social: "Metal Forte", nome_fantasia: null, situacao: "02", porte: "05",
    cnae_fiscal: "2511000", divisao: "25", divisao_descricao: "Fabricação de produtos de metal",
    capital_social: 5000000, data_inicio: "2000-01-05", score: 43 },
  { cnpj_basico: "22222222", razao_social: "Padaria Pão", nome_fantasia: "Pão Quente", situacao: "04", porte: "01",
    cnae_fiscal: "4721102", divisao: "47", divisao_descricao: "Comércio varejista",
    capital_social: null, data_inicio: null, score: 3 },
];
const TERCEIRA = { ...ITENS[0], cnpj_basico: "33333333", razao_social: "Terceira" };

const params = (url) => api.get.mock.calls.filter(([u]) => u === url).map(([, cfg]) => cfg?.params ?? {});
const ultimo = () => params(BASE).at(-1);
const cell = (nome) => screen.getByRole("cell", { name: nome });

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  respostas[`${BASE}/divisoes`] = [
    { divisao: "25", descricao: "Fabricação de produtos de metal", total: 1 },
    { divisao: "47", descricao: "Comércio varejista", total: 8123 },
  ];
  respostas[BASE] = ({ offset }) => ({ total: 45, itens: offset === 0 ? ITENS : [TERCEIRA] });
});
afterEach(() => vi.useRealTimers());

const montar = (props = {}) => render(
  <DescobrirRfb onAcompanhar={props.onAcompanhar || vi.fn()} canCriar={props.canCriar ?? true} refreshKey={props.refreshKey ?? 0} />
);
const esperarLinhas = () => waitFor(() => expect(screen.getByText("Metal Forte")).toBeInTheDocument());

describe("DescobrirRfb", () => {
  it("lista com divisão, porte, ano, capital, situação e score; padrão situação 02, 20 por página", async () => {
    montar();
    await esperarLinhas();
    expect(ultimo()).toEqual({ situacao: "02", limit: 20, offset: 0 });
    expect(cell("Fabricação de produtos de metal")).toBeInTheDocument();
    expect(cell("Média")).toBeInTheDocument();
    expect(cell("2000")).toBeInTheDocument();
    expect(cell(/R\$\s5\.000\.000/)).toBeInTheDocument();   // \s casa o NBSP do formato pt-BR
    expect(cell("Inapta")).toBeInTheDocument();
    expect(cell("43")).toBeInTheDocument();
    expect(cell(/^Padaria Pão\s*·\s*Pão Quente$/)).toBeInTheDocument();   // accname apara o espaço do 2º span
    expect(screen.getByText(/45 empresas na base RFB ainda não acompanhadas/)).toBeInTheDocument();
  });

  it("filtros e busca enviam os parâmetros; busca só com 2+ caracteres e com debounce", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();
    await esperarLinhas();
    fireEvent.change(screen.getByRole("combobox", { name: "Situação cadastral" }), { target: { value: "todas" } });
    await waitFor(() => expect(ultimo()).toEqual({ situacao: "todas", limit: 20, offset: 0 }));
    fireEvent.change(screen.getByRole("combobox", { name: "Porte" }), { target: { value: "05" } });
    await waitFor(() => expect(ultimo()).toEqual({ situacao: "todas", porte: "05", limit: 20, offset: 0 }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Comércio varejista · 8.123" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Divisão CNAE" }), { target: { value: "47" } });
    await waitFor(() => expect(ultimo()).toEqual({ situacao: "todas", porte: "05", divisao: "47", limit: 20, offset: 0 }));

    const chamadasAntes = params(BASE).length;
    const busca = screen.getByRole("textbox", { name: "Buscar na base RFB" });
    fireEvent.change(busca, { target: { value: "p" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(params(BASE).length).toBe(chamadasAntes);              // 1 caractere: nada enviado
    fireEvent.change(busca, { target: { value: "padaria" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    await waitFor(() => expect(ultimo()).toEqual({ situacao: "todas", porte: "05", divisao: "47", q: "padaria", limit: 20, offset: 0 }));
  });

  it("Carregar mais envia offset = itens carregados e anexa", async () => {
    montar();
    await esperarLinhas();
    fireEvent.click(screen.getByRole("button", { name: /Carregar mais/ }));
    await waitFor(() => expect(screen.getByText("Terceira")).toBeInTheDocument());
    expect(ultimo()).toEqual({ situacao: "02", limit: 20, offset: 2 });
    expect(screen.getByText("Metal Forte")).toBeInTheDocument();       // anexou, não substituiu
  });

  it("sem mais páginas o botão Carregar mais não aparece", async () => {
    respostas[BASE] = () => ({ total: 2, itens: ITENS });
    montar();
    await esperarLinhas();
    expect(screen.queryByRole("button", { name: /Carregar mais/ })).toBeNull();
  });

  it("Acompanhar chama onAcompanhar com o item inteiro", async () => {
    const onAcompanhar = vi.fn();
    montar({ onAcompanhar });
    await esperarLinhas();
    fireEvent.click(screen.getByRole("button", { name: "Acompanhar Metal Forte" }));
    expect(onAcompanhar).toHaveBeenCalledWith(ITENS[0]);
  });

  it("sem canCriar não há botão Acompanhar", async () => {
    montar({ canCriar: false });
    await esperarLinhas();
    expect(screen.queryByRole("button", { name: /^Acompanhar/ })).toBeNull();
  });

  it("refreshKey recarrega a primeira página", async () => {
    const { rerender } = render(<DescobrirRfb onAcompanhar={vi.fn()} canCriar refreshKey={0} />);
    await esperarLinhas();
    const antes = params(BASE).length;
    rerender(<DescobrirRfb onAcompanhar={vi.fn()} canCriar refreshKey={1} />);
    await waitFor(() => expect(params(BASE).length).toBe(antes + 1));
    expect(ultimo()).toEqual({ situacao: "02", limit: 20, offset: 0 });
  });

  it("estado vazio distingue 'sem filtro' de 'filtro sem resultado'", async () => {
    respostas[BASE] = () => ({ total: 0, itens: [] });
    montar();
    await waitFor(() => expect(screen.getByText(/já estão acompanhadas — ou a base ainda não foi coletada/)).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Porte" }), { target: { value: "05" } });
    await waitFor(() => expect(screen.getByText("Nenhuma empresa da base RFB corresponde aos filtros.")).toBeInTheDocument());
  });

  it("erro de carga é avisado", async () => {
    respostas[BASE] = () => Promise.reject(new Error("500"));
    montar();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a base RFB."));
  });

  it("troca de filtro que falha limpa as linhas do filtro anterior", async () => {
    montar();
    await esperarLinhas();
    respostas[BASE] = () => Promise.reject(new Error("500"));
    fireEvent.change(screen.getByRole("combobox", { name: "Porte" }), { target: { value: "05" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a base RFB."));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: /Carregar mais/ })).toBeNull();
    expect(screen.queryByText("Metal Forte")).toBeNull();
  });

  it("erro no Carregar mais avisa sem derrubar a tabela nem o botão; retry limpa o aviso", async () => {
    montar();
    await esperarLinhas();
    respostas[BASE] = () => Promise.reject(new Error("500"));
    fireEvent.click(screen.getByRole("button", { name: /Carregar mais/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a base RFB."));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Metal Forte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Carregar mais/ })).toBeInTheDocument();

    respostas[BASE] = ({ offset }) => ({ total: 45, itens: offset === 0 ? ITENS : [TERCEIRA] });
    fireEvent.click(screen.getByRole("button", { name: /Carregar mais/ }));
    await waitFor(() => expect(screen.getByText("Terceira")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
