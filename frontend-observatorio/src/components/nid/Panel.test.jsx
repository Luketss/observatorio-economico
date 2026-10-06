// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../ChartInfoIcon", () => ({
  default: ({ dataset, indicadorKey }) => (
    <span data-testid="chart-info" data-dataset={dataset} data-key={indicadorKey} />
  ),
}));

import { NidPanel, NidKpiHero } from "./Panel";

describe("NidPanel + ChartInfoIcon", () => {
  afterEach(() => cleanup());
  it("sem dataset/indicadorKey não renderiza o ícone", () => {
    render(<NidPanel title="Meu Painel">conteúdo</NidPanel>);
    expect(screen.getByText("Meu Painel")).toBeTruthy();
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });

  it("com dataset e indicadorKey renderiza o ícone com as props", () => {
    render(
      <NidPanel title="Saldo" dataset="caged" indicadorKey="chart_saldo">x</NidPanel>
    );
    const icon = screen.getByTestId("chart-info");
    expect(icon.getAttribute("data-dataset")).toBe("caged");
    expect(icon.getAttribute("data-key")).toBe("chart_saldo");
  });

  it("só uma das props não renderiza o ícone", () => {
    render(<NidPanel title="X" dataset="caged">x</NidPanel>);
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });
});

describe("NidKpiHero + ChartInfoIcon", () => {
  afterEach(() => cleanup());

  it("sem dataset/indicadorKey não renderiza o ícone (comportamento atual preservado)", () => {
    render(<NidKpiHero label="Saldo · Acumulado" value="123" />);
    expect(screen.getByText("Saldo · Acumulado")).toBeTruthy();
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });

  it("com dataset e indicadorKey renderiza o ícone com as props", () => {
    render(
      <NidKpiHero
        label="Saldo · Acumulado"
        value="123"
        dataset="caged"
        indicadorKey="kpi_saldo_acumulado"
      />
    );
    const icon = screen.getByTestId("chart-info");
    expect(icon.getAttribute("data-dataset")).toBe("caged");
    expect(icon.getAttribute("data-key")).toBe("kpi_saldo_acumulado");
  });

  it("só uma das props não renderiza o ícone", () => {
    render(<NidKpiHero label="Saldo · Acumulado" value="123" dataset="caged" />);
    expect(screen.queryByTestId("chart-info")).toBeNull();
  });
});

describe("NidKpiHero — abas de período", () => {
  afterEach(() => cleanup());

  it("sem tabs não renderiza tablist (comportamento atual preservado)", () => {
    render(<NidKpiHero label="Saldo" value="1" />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renderiza as abas, marca a primeira como ativa e avisa a troca", () => {
    const onTabChange = vi.fn();
    render(<NidKpiHero label="Saldo" value="1" tabs={["2026", "Histórico"]} onTabChange={onTabChange} />);
    const abas = screen.getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual(["2026", "Histórico"]);
    expect(abas[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(abas[1]);
    expect(onTabChange).toHaveBeenCalledWith(1);
    expect(abas[1].getAttribute("aria-selected")).toBe("true");
    expect(abas[0].getAttribute("aria-selected")).toBe("false");
  });
});
