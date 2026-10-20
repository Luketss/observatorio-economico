import { describe, expect, it } from "vitest";
import { linkWhatsApp, linkWhatsAppPara } from "./contato";

describe("linkWhatsApp", () => {
  it("sem texto devolve apenas o link base", () => {
    expect(linkWhatsApp()).toBe("https://wa.me/5537998720903");
  });

  it("com texto codifica o parametro text", () => {
    expect(linkWhatsApp("Olá! x")).toBe("https://wa.me/5537998720903?text=Ol%C3%A1!%20x");
  });
});

describe("linkWhatsAppPara", () => {
  it("monta o link para um numero arbitrario", () => {
    expect(linkWhatsAppPara("5537999999999")).toBe("https://wa.me/5537999999999");
    expect(linkWhatsAppPara("5537999999999", "Olá x")).toBe("https://wa.me/5537999999999?text=Ol%C3%A1%20x");
  });
});
