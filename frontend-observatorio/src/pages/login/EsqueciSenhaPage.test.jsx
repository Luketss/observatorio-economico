// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EsqueciSenhaPage from "./EsqueciSenhaPage";
import api from "../../services/api";

vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("framer-motion", () => ({ motion: new Proxy({}, { get: () => ({ children, ...p }) => <div {...Object.fromEntries(Object.entries(p).filter(([k]) => !["initial","animate","transition","exit","whileHover","whileTap"].includes(k)))}>{children}</div> }) }));
vi.mock("../../assets/bg.jpeg", () => ({ default: "" }));
vi.mock("../../assets/nid_fundo_transparente.png", () => ({ default: "" }));
vi.mock("../../assets/logo_uaizi.png", () => ({ default: "" }));

function montar() {
  return render(<MemoryRouter><EsqueciSenhaPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe("EsqueciSenhaPage", () => {
  it("envia o e-mail e mostra a mensagem generica", async () => {
    api.post.mockResolvedValueOnce({ data: { message: "ok" } });
    montar();
    expect(screen.getByRole("button", { name: "Enviar instruções" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@x.gov.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Se o e-mail estiver cadastrado/);
    expect(api.post).toHaveBeenCalledWith("/auth/esqueci-senha", { email: "ana@x.gov.br" });
    expect(screen.getByRole("link", { name: "Voltar ao login" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("erro de rede mostra alerta e mantem o formulario", async () => {
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    montar();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@x.gov.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível enviar agora/);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("422 mostra e-mail inválido", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 422, data: {} } });
    montar();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@x.gov.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe um e-mail válido.");
  });

  it("429 mostra aviso de muitas tentativas", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 429, data: {} } });
    montar();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@x.gov.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Muitas tentativas/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar instruções" })).not.toBeDisabled());
  });
});
