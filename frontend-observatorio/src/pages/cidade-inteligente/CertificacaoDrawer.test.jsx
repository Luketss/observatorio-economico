// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const authState = { user: { role: "PREFEITO", permissoes: { cidade_inteligente: ["criar", "editar", "excluir"] } } };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => ({ viewAsId: null }) }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));

const DETALHE = {
  id: 1, nome: "ISO 37122", entidade: "ABNT", descricao: null,
  total: 2, atendidos: 1, em_andamento: 0, pendentes: 1,
  requisitos: [
    { id: 10, certificacao_id: 1, titulo: "Plano diretor", categoria: "Governança",
      status: "atendido", responsavel: null, evidencia_url: "https://x.gov.br", evidencia_nota: null },
    { id: 11, certificacao_id: 1, titulo: "Wi-Fi público", categoria: "Conectividade",
      status: "pendente", responsavel: null, evidencia_url: null, evidencia_nota: null },
  ],
};
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: DETALHE })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import api from "../../services/api";
import CertificacaoDrawer from "./CertificacaoDrawer";

const montar = () => render(<CertificacaoDrawer certId={1} onClose={() => {}} />);

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { role: "PREFEITO", permissoes: { cidade_inteligente: ["criar", "editar", "excluir"] } };
});

describe("CertificacaoDrawer", () => {
  it("renderiza requisitos com pill de status", async () => {
    montar();
    expect(await screen.findByText("Plano diretor")).toBeInTheDocument();
    expect(screen.getByText("Atendido")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
  });

  it("aba de status filtra a lista", async () => {
    montar();
    await screen.findByText("Plano diretor");
    fireEvent.click(screen.getByRole("tab", { name: /Atendidos/ }));
    expect(screen.getByText("Plano diretor")).toBeInTheDocument();
    expect(screen.queryByText("Wi-Fi público")).toBeNull();
  });

  it("Ver evidência só aparece quando há URL", async () => {
    montar();
    await screen.findByText("Plano diretor");
    const links = screen.getAllByRole("link", { name: /Ver evidência/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://x.gov.br");
  });

  it("ADMIN_GLOBAL não vê botões de escrita", async () => {
    authState.user = { role: "ADMIN_GLOBAL", permissoes: {} };
    montar();
    await screen.findByText("Plano diretor");
    expect(screen.queryByRole("button", { name: /Novo requisito/ })).toBeNull();
  });

  it("permissão só de editar (sem excluir) mostra Novo requisito mas não Excluir certificação", async () => {
    authState.user = { role: "PREFEITO", permissoes: { cidade_inteligente: ["editar"] } };
    montar();
    await screen.findByText("Plano diretor");
    expect(screen.getByRole("button", { name: "Novo requisito" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir certificação" })).toBeNull();
  });

  it("toggle de status do requisito chama api.put com o novo status", async () => {
    montar();
    await screen.findByText("Wi-Fi público");
    fireEvent.click(screen.getByRole("button", { name: /Editar status de Wi-Fi público/ }));
    const select = screen.getByRole("combobox", { name: /Status do requisito Wi-Fi público/ });
    fireEvent.change(select, { target: { value: "atendido" } });
    expect(api.put).toHaveBeenCalledWith("/cidade-inteligente/requisitos/11", { status: "atendido" });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });
});
