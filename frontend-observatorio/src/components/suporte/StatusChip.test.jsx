// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusChip from "./StatusChip";

describe("StatusChip", () => {
  it("mostra o rotulo do status", () => {
    render(<StatusChip status="em_atendimento" />);
    expect(screen.getByText("Em atendimento")).toHaveAttribute("data-status", "em_atendimento");
  });
  it("status desconhecido cai no proprio valor", () => {
    render(<StatusChip status="xyz" />);
    expect(screen.getByText("xyz")).toBeInTheDocument();
  });
});
