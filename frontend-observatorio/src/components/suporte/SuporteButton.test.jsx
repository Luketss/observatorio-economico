// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SuporteButton from "./SuporteButton";
import { linkWhatsApp } from "../../config/contato";

let mockUser = null;
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

afterEach(cleanup);

function abrir() {
  fireEvent.click(screen.getByRole("button", { name: /Falar com o suporte/i }));
}

describe("SuporteButton", () => {
  it("menu fechado por padrao; ao clicar mostra as tres opcoes", () => {
    mockUser = { nome: "Ana Souza", email: "ana@prefeitura.gov.br" };
    render(<SuporteButton />);
    expect(screen.queryByRole("menu")).toBeNull();
    abrir();
    const itens = screen.getAllByRole("menuitem");
    expect(itens.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Abrir solicitação"),
      expect.stringContaining("Meus atendimentos"),
      expect.stringContaining("WhatsApp"),
    ]);
  });

  it("item WhatsApp mantem o link personalizado em nova aba", () => {
    mockUser = { nome: "Ana Souza", email: "ana@prefeitura.gov.br" };
    render(<SuporteButton />);
    abrir();
    const link = screen.getByRole("menuitem", { name: /WhatsApp/i });
    expect(link.getAttribute("href")).toBe(
      linkWhatsApp("Olá! Sou Ana Souza (ana@prefeitura.gov.br) e preciso de atendimento no NID.")
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("sem usuario: mensagem generica", () => {
    mockUser = null;
    render(<SuporteButton />);
    abrir();
    expect(screen.getByRole("menuitem", { name: /WhatsApp/i }).getAttribute("href"))
      .toBe(linkWhatsApp("Olá! Preciso de atendimento no NID."));
  });

  it("Esc fecha o menu", () => {
    render(<SuporteButton />);
    abrir();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
