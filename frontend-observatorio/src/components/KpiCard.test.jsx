// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN_GLOBAL" } }),
}));

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import KpiCard from "./KpiCard";
import api from "../services/api";

const mockApi = api;

describe("KpiCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({
      data: { tooltip: "PIB a preços correntes", descricao: "", fonte: "" },
    });
  });

  it("bolha do tooltip segue o tema (.nid-info-tip) e não usa cor hardcoded", async () => {
    render(
      <KpiCard
        label="PIB Último Ano"
        value="R$ 1,2 bi"
        dataset="pib"
        indicadorKey="ultimo_ano"
      />
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    const icon = screen.getByRole("button", { name: "Ver descrição" });
    fireEvent.mouseEnter(icon);

    const tip = await screen.findByText("PIB a preços correntes");
    expect(tip.className).toContain("nid-info-tip");
    expect(tip.className).not.toContain("bg-[var(--panel)]");
  });

  it("botão de info não usa mais o atributo title nativo (tooltip custom cobre o hover)", async () => {
    render(
      <KpiCard
        label="PIB Último Ano"
        value="R$ 1,2 bi"
        dataset="pib"
        indicadorKey="ultimo_ano"
      />
    );

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalled();
    });

    const icon = screen.getByRole("button", { name: "Ver descrição" });
    expect(icon).not.toHaveAttribute("title");
  });
});
