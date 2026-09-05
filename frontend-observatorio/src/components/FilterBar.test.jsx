// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterBar from "./FilterBar";
import { janela12m } from "../utils/periodoCards";

const mensal = (d) => ({ ano: d.ano, mes: d.mes });

// Série mensal Jan/2024..Ago/2025 — o default da página é Set/2024–Ago/2025.
const serieMensal = [];
for (let m = 1; m <= 12; m++) serieMensal.push({ ano: 2024, mes: m });
for (let m = 1; m <= 8; m++) serieMensal.push({ ano: 2025, mes: m });

describe("FilterBar — botão 12m reproduz a janela ancorada da página (range12m)", () => {
  it("voltar de '5a' para '12m' devolve a MESMA janela do default (série mensal)", () => {
    const range12m = janela12m(serieMensal, mensal);
    expect(range12m).toEqual({ yearFrom: "2024", monthFrom: "9", yearTo: "2025", monthTo: "8" });

    const onChange = vi.fn();
    // Estado após o usuário clicar em "5a".
    const aposCincoAnos = { yearFrom: "2021", yearTo: "2025", monthFrom: "", monthTo: "" };
    const { rerender } = render(
      <FilterBar years={[2024, 2025]} showMonths range12m={range12m} value={aposCincoAnos} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "12m" }));
    expect(onChange).toHaveBeenCalledWith({
      yearFrom: "2024", monthFrom: "9", yearTo: "2025", monthTo: "8",
    });

    // Com a janela aplicada, a pill "12m" fica acesa (não cai em "Personalizar").
    rerender(
      <FilterBar years={[2024, 2025]} showMonths range12m={range12m} value={onChange.mock.calls[0][0]} onChange={onChange} />
    );
    expect(screen.getByRole("button", { name: "12m" })).toHaveAttribute("aria-pressed", "true");
  });

  it("série anual: '12m' volta ao último ano com dado, não a dois anos", () => {
    const range12m = janela12m([{ ano: 2023 }, { ano: 2024 }, { ano: 2025 }], (d) => ({ ano: d.ano }));
    expect(range12m).toEqual({ yearFrom: "2025", monthFrom: "", yearTo: "2025", monthTo: "" });

    const onChange = vi.fn();
    render(
      <FilterBar years={[2023, 2024, 2025]} range12m={range12m}
        value={{ yearFrom: "2021", yearTo: "2025", monthFrom: "", monthTo: "" }} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "12m" }));
    expect(onChange).toHaveBeenCalledWith({
      yearFrom: "2025", monthFrom: "", yearTo: "2025", monthTo: "",
    });
  });

  it("sem range12m mantém o legado: {anoMax-1 .. anoMax} sem meses", () => {
    const onChange = vi.fn();
    render(
      <FilterBar years={[2023, 2024, 2025]}
        value={{ yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" }} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "12m" }));
    expect(onChange).toHaveBeenCalledWith({
      yearFrom: "2024", yearTo: "2025", monthFrom: "", monthTo: "",
    });
  });
});
