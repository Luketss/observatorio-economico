// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import CertificacoesShell from "./CertificacoesShell";

function Sonda() {
  const { pathname } = useLocation();
  return <div data-testid="rota">{pathname}</div>;
}

const montar = (rotaInicial) =>
  render(
    <MemoryRouter initialEntries={[rotaInicial]}>
      <CertificacoesShell>
        <Sonda />
      </CertificacoesShell>
    </MemoryRouter>
  );

describe("CertificacoesShell", () => {
  it("mostra o header único e as 5 abas na ordem", () => {
    montar("/app/desenvolvimento-economico/premiacoes");
    expect(screen.getByText("Certificações e Premiações")).toBeInTheDocument();
    const abas = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(abas).toEqual([
      "Premiações", "Captação de Recursos", "Escrita de Projetos",
      "Dinheiro na Mesa", "Emendas",
    ]);
  });

  it("aba ativa deriva da rota inicial", () => {
    montar("/app/emendas");
    expect(screen.getByRole("tab", { name: "Emendas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Premiações" })).toHaveAttribute("aria-selected", "false");
  });

  it("clicar numa aba navega para a rota dela (children re-renderiza)", () => {
    montar("/app/desenvolvimento-economico/premiacoes");
    fireEvent.click(screen.getByRole("tab", { name: "Dinheiro na Mesa" }));
    expect(screen.getByTestId("rota").textContent).toBe("/app/dinheiro-na-mesa");
  });
});
