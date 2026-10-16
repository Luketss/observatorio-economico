// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SuporteWhatsAppButton from "./SuporteWhatsAppButton";
import { linkWhatsApp } from "../config/contato";

let mockUser = null;
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: mockUser }) }));

afterEach(cleanup);

describe("SuporteWhatsAppButton", () => {
  it("com usuario: mensagem personalizada, nova aba e rel seguro", () => {
    mockUser = { nome: "Ana Souza", email: "ana@prefeitura.gov.br" };
    render(<SuporteWhatsAppButton />);
    const link = screen.getByRole("link", { name: /Falar com o suporte/i });
    expect(link.getAttribute("href")).toBe(
      linkWhatsApp("Olá! Sou Ana Souza (ana@prefeitura.gov.br) e preciso de atendimento no NID.")
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toContain("Falar com o suporte");
  });

  it("sem usuario: mensagem generica", () => {
    mockUser = null;
    render(<SuporteWhatsAppButton />);
    const link = screen.getByRole("link", { name: /Falar com o suporte/i });
    expect(link.getAttribute("href")).toBe(linkWhatsApp("Olá! Preciso de atendimento no NID."));
  });
});
