// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authState = { user: { role: "ADMIN_MUNICIPIO" } };
const respostas = { corpo: [] };

vi.mock("../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: respostas.corpo })) },
}));

import api from "../services/api";
import MandatoTimeline from "./MandatoTimeline";

const montar = () => render(<MemoryRouter><MandatoTimeline /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  respostas.corpo = [];
  authState.user = { role: "ADMIN_MUNICIPIO" };
});

describe("MandatoTimeline — abas dinâmicas por tipo", () => {
  it("marcos de 2 tipos geram 3 abas (Todos + 2); tipo ausente não vira aba", async () => {
    respostas.corpo = [
      { id: 1, data: "2024-01-10", titulo: "Posse", descricao: "", tipo: "inicio_mandato" },
      { id: 2, data: "2024-03-05", titulo: "Obra da praça", descricao: "", tipo: "obras" },
    ];
    montar();

    await waitFor(() => expect(screen.getByText("Posse")).toBeInTheDocument());

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(within(tabs[0]).getByText("Todos")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Início de Mandato/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Obra/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Política Pública/ })).toBeNull();
  });
});

describe("MandatoTimeline — filtro de ano", () => {
  const marcosMultiAno = [
    { id: 1, data: "2023-05-01", titulo: "Evento 2023", descricao: "", tipo: "evento" },
    { id: 2, data: "2024-05-01", titulo: "Evento 2024", descricao: "", tipo: "evento" },
    { id: 3, data: "2024-06-01", titulo: "Obra 2024", descricao: "", tipo: "obras" },
  ];

  it("selecionar um ano esconde marcos de outros anos e recalcula counts", async () => {
    respostas.corpo = marcosMultiAno;
    montar();
    await waitFor(() => expect(screen.getByText("Evento 2023")).toBeInTheDocument());

    // Todos os anos: aba "Todos" com count 3
    expect(screen.getByRole("tab", { name: /Todos/ })).toHaveTextContent("3");

    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por ano" }), {
      target: { value: "2024" },
    });

    await waitFor(() => expect(screen.queryByText("Evento 2023")).toBeNull());
    expect(screen.getByText("Evento 2024")).toBeInTheDocument();
    expect(screen.getByText("Obra 2024")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Todos/ })).toHaveTextContent("2");
  });

  it("trocar de ano zera o tipo ativo quando ele deixa de existir, sem crash", async () => {
    respostas.corpo = marcosMultiAno;
    montar();
    await waitFor(() => expect(screen.getByText("Evento 2023")).toBeInTheDocument());

    // ativa a aba "Obra" (só existe em 2024)
    fireEvent.click(screen.getByRole("tab", { name: /^Obra/ }));
    await waitFor(() => expect(screen.getByText("Obra 2024")).toBeInTheDocument());
    expect(screen.queryByText("Evento 2023")).toBeNull();
    expect(screen.queryByText("Evento 2024")).toBeNull();

    // troca para o ano 2023, onde não há marcos do tipo "obras"
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por ano" }), {
      target: { value: "2023" },
    });

    await waitFor(() => expect(screen.getByText("Evento 2023")).toBeInTheDocument());
    expect(screen.queryByRole("tab", { name: /^Obra/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /Todos/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("MandatoTimeline — card link e tipos novos", () => {
  it("renderiza 'Ver mais →' com href quando marco.link presente, e nenhum link quando ausente", async () => {
    respostas.corpo = [
      { id: 1, data: "2024-01-10", titulo: "Com link", descricao: "", tipo: "evento", link: "https://exemplo.com/noticia" },
      { id: 2, data: "2024-02-10", titulo: "Sem link", descricao: "", tipo: "evento", link: null },
    ];
    montar();
    await waitFor(() => expect(screen.getByText("Com link")).toBeInTheDocument());

    const links = screen.getAllByText("Ver mais →");
    expect(links).toHaveLength(1);
    expect(links[0].closest("a")).toHaveAttribute("href", "https://exemplo.com/noticia");
  });

  it("tipo novo (premiacao) renderiza eyebrow 'Premiação'", async () => {
    respostas.corpo = [
      { id: 1, data: "2024-01-10", titulo: "Prêmio nacional", descricao: "", tipo: "premiacao" },
    ];
    montar();
    await waitFor(() => expect(screen.getByText("Prêmio nacional")).toBeInTheDocument());

    expect(screen.getAllByText(/Premiação/).length).toBeGreaterThan(0);
  });
});
