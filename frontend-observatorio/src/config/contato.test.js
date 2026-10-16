import { describe, expect, it } from "vitest";
import { linkWhatsApp } from "./contato";

describe("linkWhatsApp", () => {
  it("sem texto devolve apenas o link base", () => {
    expect(linkWhatsApp()).toBe("https://wa.me/5537998720903");
  });

  it("com texto codifica o parametro text", () => {
    expect(linkWhatsApp("Olá! x")).toBe("https://wa.me/5537998720903?text=Ol%C3%A1!%20x");
  });
});
