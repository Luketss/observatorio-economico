import { describe, expect, it } from "vitest";
import { mensagemErroApi } from "./erroApi";

const err = (status, data) => ({ response: { status, data } });

describe("mensagemErroApi", () => {
  it("429 do slowapi vira texto amigavel mesmo sem detail", () => {
    expect(mensagemErroApi(err(429, { error: "Rate limit exceeded: 5 per 1 hour" })))
      .toBe("Você enviou muitas solicitações. Aguarde um pouco e tente de novo.");
  });
  it("422 do pydantic junta as mensagens sem o prefixo Value error", () => {
    const e = err(422, { detail: [{ msg: "Value error, Informe o WhatsApp para ser contatado por esse canal" }] });
    expect(mensagemErroApi(e)).toBe("Informe o WhatsApp para ser contatado por esse canal");
  });
  it("detail string e fallback", () => {
    expect(mensagemErroApi(err(404, { detail: "Ticket nao encontrado" }))).toBe("Ticket nao encontrado");
    expect(mensagemErroApi({}, "Falhou")).toBe("Falhou");
  });
});
