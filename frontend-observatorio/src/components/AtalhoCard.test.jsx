// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomeIcon } from "@heroicons/react/24/outline";
import { PlanContext } from "../context/PlanContext";
import AtalhoCard from "./AtalhoCard";

const montar = (planKey, canAccess = () => true) =>
  render(
    <MemoryRouter>
      <PlanContext.Provider value={{ modulos: [], canAccess }}>
        <AtalhoCard titulo="Benchmark" descricao="Compare seu município." icone={HomeIcon} to="/app/benchmark" planKey={planKey} />
      </PlanContext.Provider>
    </MemoryRouter>
  );

describe("AtalhoCard", () => {
  it("renderiza link com título e descrição", () => {
    montar("benchmark");
    const link = screen.getByRole("link", { name: /Benchmark/ });
    expect(link).toHaveAttribute("href", "/app/benchmark");
    expect(screen.getByText("Compare seu município.")).toBeInTheDocument();
    expect(link).not.toHaveAttribute("title");
  });

  it("bloqueado por plano mostra teaser mas continua navegável", () => {
    montar("benchmark", (k) => k !== "benchmark");
    const link = screen.getByRole("link", { name: /Benchmark/ });
    expect(link).toHaveAttribute("title", "Recurso bloqueado — disponível em um plano superior");
    expect(link).toHaveAttribute("href", "/app/benchmark");
  });

  it("sem planKey nunca bloqueia", () => {
    montar(undefined, () => false);
    expect(screen.getByRole("link", { name: /Benchmark/ })).not.toHaveAttribute("title");
  });
});
