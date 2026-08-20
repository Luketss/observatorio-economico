// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "PREFEITO" } }),
}));
vi.mock("../../components/nid/charts", () => ({
  MultiLineChart: (props) => (
    <div data-testid="chart" data-series={(props.series || []).join("|")} />
  ),
  Sparkline: () => null,
  fmtMoneyShort: (v) => `R$ ${v}`,
  fmtMoneyFull: (v) => `R$ ${v}`,
  fmtNumber: (v) => String(v),
  fmtNumberShort: (v) => String(v),
}));

const ENVELOPE = {
  indicador: { key: "pib", label: "PIB Total", unidade: "brl" },
  foco: { municipio_id: 1, nome: "Alfa", estado: "MG" },
  pares: [{ municipio_id: 2, nome: "Beta", estado: "MG" }],
  fixados: [],
  criterio_pares: "mesma UF · faixa FPM 10.189–13.584 hab",
  motivo: null,
  posicao: { ano: 2023, nacional: { rank: 2, total: 10 }, estadual: { rank: 1, total: 3 } },
  itens: [
    { ano: 2021, municipio_id: 1, cidade: "Alfa", valor: 100 },
    { ano: 2022, municipio_id: 1, cidade: "Alfa", valor: 110 },
    { ano: 2023, municipio_id: 1, cidade: "Alfa", valor: 121 },
    { ano: 2023, municipio_id: 2, cidade: "Beta", valor: 90 },
  ],
};
const INDICADORES = [
  { key: "pib", label: "PIB Total", unidade: "brl" },
  { key: "caged", label: "Saldo CAGED", unidade: "numero" },
];

vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url) =>
      Promise.resolve({ data: url.endsWith("/indicadores") ? INDICADORES : ENVELOPE })
    ),
  },
}));

import api from "../../services/api";
import ComparacaoPares from "./ComparacaoPares";

beforeEach(() => vi.clearAllMocks());

describe("ComparacaoPares", () => {
  it("mostra posição nacional e estadual e o subtítulo dos pares", async () => {
    render(<ComparacaoPares />);
    expect(await screen.findByText("#2 de 10")).toBeInTheDocument();
    expect(screen.getByText("#1 de 3")).toBeInTheDocument();
    expect(screen.getByText(/Alfa vs\. 1 par/)).toBeInTheDocument();
  });

  it("monta o gráfico com foco e par e a leitura derivada", async () => {
    render(<ComparacaoPares />);
    const chart = await screen.findByTestId("chart");
    expect(chart.dataset.series).toBe("Alfa|Beta");
    expect(screen.getByText(/acima da mediana/)).toBeInTheDocument();
  });

  it("trocar o indicador refaz a busca com a chave nova", async () => {
    render(<ComparacaoPares />);
    await screen.findByText("#2 de 10");
    fireEvent.change(screen.getByLabelText("Escolher indicador"), {
      target: { value: "caged" },
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/benchmark/comparativo", {
        params: { indicador: "caged" },
      })
    );
  });

  it("posição ausente mostra travessão", async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve({
        data: url.endsWith("/indicadores")
          ? INDICADORES
          : { ...ENVELOPE, posicao: null, motivo: "sem_serie", foco: null, pares: [], itens: [] },
      })
    );
    render(<ComparacaoPares />);
    expect((await screen.findAllByText("—")).length).toBeGreaterThanOrEqual(2);
  });
});
