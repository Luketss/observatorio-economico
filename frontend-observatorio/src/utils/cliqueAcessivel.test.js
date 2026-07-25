import { describe, it, expect, vi } from "vitest";
import { propsTituloClicavel } from "./cliqueAcessivel";

describe("propsTituloClicavel", () => {
  it("expõe role button e tabIndex 0", () => {
    const props = propsTituloClicavel(() => {});
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
  });

  it("onClick chama abrir", () => {
    const abrir = vi.fn();
    propsTituloClicavel(abrir).onClick();
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("Enter e Espaço acionam abrir com preventDefault", () => {
    const abrir = vi.fn();
    const { onKeyDown } = propsTituloClicavel(abrir);
    const evEnter = { key: "Enter", preventDefault: vi.fn() };
    const evSpace = { key: " ", preventDefault: vi.fn() };
    onKeyDown(evEnter);
    onKeyDown(evSpace);
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(evEnter.preventDefault).toHaveBeenCalled();
    expect(evSpace.preventDefault).toHaveBeenCalled();
  });

  it("outras teclas não acionam", () => {
    const abrir = vi.fn();
    const ev = { key: "a", preventDefault: vi.fn() };
    propsTituloClicavel(abrir).onKeyDown(ev);
    expect(abrir).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });
});
