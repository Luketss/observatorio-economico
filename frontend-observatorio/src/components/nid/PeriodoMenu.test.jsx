// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PeriodoMenu from "./PeriodoMenu";

describe("PeriodoMenu", () => {
  it("renderiza as 4 pills, nenhuma ativa sem value", () => {
    render(<PeriodoMenu value={null} onChange={() => {}} />);
    for (const label of ["12m", "5a", "10a", "Tudo"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeTruthy();
    }
    expect(document.querySelectorAll("[aria-pressed='true']")).toHaveLength(0);
  });

  it("clicar numa pill chama onChange com a key; pill ativa fica aria-pressed", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodoMenu value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /5a/i }));
    expect(onChange).toHaveBeenCalledWith("5a");
    rerender(<PeriodoMenu value="5a" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /5a/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("clicar na pill ativa desliga (onChange(null))", () => {
    const onChange = vi.fn();
    render(<PeriodoMenu value="10a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /10a/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
