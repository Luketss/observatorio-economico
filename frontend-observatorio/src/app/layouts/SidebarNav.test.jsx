// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SidebarNav from "./SidebarNav";

const LOCK_TITLE = "Recurso bloqueado — disponível em um plano superior";
const USER_COMUM = { role: "SECRETARIO", permissoes: {} };
const USER_ADMIN_MUN = { role: "SECRETARIO", permissoes: { usuarios: ["criar"] } };
const USER_GLOBAL = { role: "ADMIN_GLOBAL" };

function renderNav({ user = USER_COMUM, modulos = null, route = "/app" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SidebarNav user={user} modulos={modulos} />
    </MemoryRouter>
  );
}

describe("SidebarNav — seções", () => {
  it("renderiza os 5 headers de seção na ordem do design (sem Admin p/ usuário comum)", () => {
    const { container } = renderNav();
    const headers = [...container.querySelectorAll(".nid-nav-section")].map(
      (el) => el.textContent
    );
    expect(headers).toEqual([
      "Visão Executiva",
      "Indicadores Internos",
      "Dados Econômicos",
      "Desenv. Empresarial",
      "Gestão",
    ]);
  });
});

describe("SidebarNav — grupos colapsáveis", () => {
  it("grupo abre automaticamente quando a rota ativa é um filho", () => {
    renderNav({ route: "/app/caged" });
    expect(screen.getByText("CAGED")).toBeInTheDocument();
    expect(screen.getByText("RAIS")).toBeInTheDocument(); // mesmo grupo Emprego
    expect(screen.queryByText("Arrecadação")).toBeNull(); // Fiscal continua fechado
  });

  it("clique no header do grupo abre e fecha os filhos", () => {
    renderNav({ route: "/app" });
    expect(screen.queryByText("IPS")).toBeNull();
    fireEvent.click(screen.getByText("Contexto Socioeconômico"));
    expect(screen.getByText("IPS")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Contexto Socioeconômico"));
    expect(screen.queryByText("IPS")).toBeNull();
  });
});

describe("SidebarNav — cadeado de plano", () => {
  it("link de seção fora do plano fica visível com tooltip de bloqueio", () => {
    renderNav({ modulos: ["geral"], route: "/app" });
    const pib = screen.getByText("PIB").closest("a");
    expect(pib).toHaveAttribute("title", LOCK_TITLE);
    const central = screen.getByText("Central de Inteligência").closest("a");
    expect(central).not.toHaveAttribute("title");
  });

  it("filho de grupo fora do plano também mostra o bloqueio", () => {
    renderNav({ modulos: ["geral"], route: "/app/caged" });
    const caged = screen.getByText("CAGED").closest("a");
    expect(caged).toHaveAttribute("title", LOCK_TITLE);
  });

  it("ADMIN_GLOBAL nunca vê cadeado", () => {
    renderNav({ user: USER_GLOBAL, modulos: ["geral"], route: "/app" });
    const pib = screen.getByText("PIB").closest("a");
    expect(pib).not.toHaveAttribute("title");
  });
});

describe("SidebarNav — visibilidade por papel", () => {
  it("Releases some para ADMIN_GLOBAL e aparece para usuário comum", () => {
    const { unmount } = renderNav({ user: USER_GLOBAL });
    expect(screen.queryByText("Releases")).toBeNull();
    unmount();
    renderNav({ user: USER_COMUM });
    expect(screen.getByText("Releases")).toBeInTheDocument();
  });

  it("bloco Admin só aparece com permissão", () => {
    const { unmount } = renderNav({ user: USER_COMUM });
    expect(screen.queryByText("Painel Admin")).toBeNull();
    unmount();
    renderNav({ user: USER_ADMIN_MUN });
    expect(screen.getByText("Painel Admin")).toBeInTheDocument();
  });
});
