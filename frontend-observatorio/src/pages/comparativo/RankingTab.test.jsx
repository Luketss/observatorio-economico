// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const authState = { user: { municipio_id: null } };
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => authState,
}));

// 30 municípios mockados, ordem decrescente (rank = posição na lista).
const MUNICIPIOS = Array.from({ length: 30 }, (_, i) => ({
  municipio_id: i + 1,
  municipio: `Cidade ${i + 1}`,
  estado: "MG",
  total: 3000 - i * 10,
  pib_total: 3000 - i * 10,
  exportacoes: 3000 - i * 10,
}));

vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/municipios") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: MUNICIPIOS });
    }),
  },
}));

import api from "../../services/api";
import RankingTab from "./RankingTab";

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { municipio_id: null };
});

describe("RankingTab — paginação", () => {
  it("mostra 25 linhas na página 1 de 30 itens mockados", async () => {
    render(<RankingTab />);
    expect(await screen.findByText("Cidade 1")).toBeInTheDocument();
    expect(screen.getByText("Cidade 25")).toBeInTheDocument();
    expect(screen.queryByText("Cidade 26")).not.toBeInTheDocument();
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
  });

  it("rank global correto na página 2 (#26...)", async () => {
    render(<RankingTab />);
    await screen.findByText("Cidade 1");
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Cidade 26")).toBeInTheDocument();
    const row = screen.getByText("Cidade 26").closest("tr");
    expect(row).toHaveTextContent("26");
  });

  it("Anterior/Próxima funcionam e desabilitam nas pontas", async () => {
    render(<RankingTab />);
    await screen.findByText("Cidade 1");
    const anterior = screen.getByRole("button", { name: "Anterior" });
    const proxima = screen.getByRole("button", { name: "Próxima" });
    expect(anterior).toBeDisabled();
    expect(proxima).not.toBeDisabled();

    fireEvent.click(proxima);
    await screen.findByText("Cidade 26");
    expect(proxima).toBeDisabled();
    expect(anterior).not.toBeDisabled();

    fireEvent.click(anterior);
    await screen.findByText("Cidade 1");
    expect(anterior).toBeDisabled();
  });

  it('"Ir para meu município" salta para a página que o contém', async () => {
    authState.user = { municipio_id: 28 }; // índice 27 (0-based) → página 2
    render(<RankingTab />);
    await screen.findByText("Cidade 1");
    fireEvent.click(screen.getByRole("button", { name: "Ir para meu município" }));
    expect(await screen.findByText("Página 2 de 2")).toBeInTheDocument();
    expect(screen.getByText("Cidade 28")).toBeInTheDocument();
    expect(screen.getByText("(seu município)")).toBeInTheDocument();
  });

  it('"Ir para meu município" não aparece sem myId ou fora do chartData', async () => {
    render(<RankingTab />);
    await screen.findByText("Cidade 1");
    expect(screen.queryByRole("button", { name: "Ir para meu município" })).not.toBeInTheDocument();
  });

  it("trocar de dataset reseta a página", async () => {
    render(<RankingTab />);
    await screen.findByText("Cidade 1");
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByText("Cidade 26");

    fireEvent.click(screen.getByText("PIB"));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/pib/ranking", expect.anything())
    );
    await screen.findByText("Cidade 1");
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
  });

  it("comex formata em USD", async () => {
    render(<RankingTab />);
    await screen.findByText("Cidade 1");
    fireEvent.click(screen.getByText("Comex"));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/comex/comparativo", expect.anything())
    );
    await screen.findByText("Cidade 1");
    const row = screen.getByText("Cidade 1").closest("tr");
    expect(row).toHaveTextContent("US$");
  });
});
