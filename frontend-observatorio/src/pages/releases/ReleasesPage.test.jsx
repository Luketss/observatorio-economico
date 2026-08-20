// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "SECRETARIO", municipio: { nome: "Cidade Teste" } } }),
}));

const addToast = vi.fn();
vi.mock("../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));

const RELEASES = [
  {
    id: 1,
    dataset: "release_caged",
    periodo: "2026-06",
    gerado_em: "2026-06-01T10:00:00Z",
    modelo: "ia",
    ativo: true,
    bullets: ["CAGED parágrafo 1.", "CAGED parágrafo 2."],
  },
  {
    id: 2,
    dataset: "release_geral",
    periodo: "2026-08",
    gerado_em: "2026-08-15T10:00:00Z",
    modelo: "especialista",
    ativo: true,
    bullets: ["Geral parágrafo único."],
  },
];

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: RELEASES })) },
}));

import ReleasesPage from "./ReleasesPage";

const montar = () => render(<MemoryRouter><ReleasesPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(() => Promise.resolve()) },
    configurable: true,
  });
});

describe("ReleasesPage — ordenação, filtro, período e link", () => {
  it("ordena os cards por gerado_em desc, mesmo o backend devolvendo em ordem alfabética de dataset", async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId("release-card-caged")).toBeInTheDocument());
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    // "geral" foi gerado depois (2026-08-15) que "caged" (2026-06-01) — mesmo
    // vindo antes no array (backend ordena por dataset, não por data).
    expect(headings.indexOf("Visão Geral")).toBeLessThan(headings.indexOf("CAGED"));
  });

  it("filtro por dataset esconde os outros cards", async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId("release-card-caged")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Filtrar por tema"), { target: { value: "caged" } });

    expect(screen.getByTestId("release-card-caged")).toBeInTheDocument();
    expect(screen.queryByTestId("release-card-geral")).toBeNull();
  });

  it("exibe o período do release no card", async () => {
    montar();
    const card = await screen.findByTestId("release-card-caged");
    expect(within(card).getByText(/2026-06/)).toBeInTheDocument();
  });

  it("link 'Ver os dados' aponta pra rota mapeada e não aparece quando não há rota", async () => {
    montar();
    const cagedCard = await screen.findByTestId("release-card-caged");
    expect(within(cagedCard).getByRole("link", { name: /Ver os dados/ })).toHaveAttribute("href", "/app/caged");

    const geralCard = screen.getByTestId("release-card-geral");
    expect(within(geralCard).queryByRole("link", { name: /Ver os dados/ })).toBeNull();
  });

  it("avisa via toast quando o pop-up de impressão é bloqueado", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    montar();
    const cagedCard = await screen.findByTestId("release-card-caged");

    fireEvent.click(within(cagedCard).getByRole("button", { name: "Baixar PDF" }));

    expect(addToast).toHaveBeenCalledWith("Habilite pop-ups para baixar o PDF.", "error");
  });
});

describe("ReleasesPage — copiar texto no modal", () => {
  it("'Copiar tudo' junta os parágrafos com linha em branco e mostra 'Copiado!'", async () => {
    montar();
    const cagedCard = await screen.findByTestId("release-card-caged");
    fireEvent.click(within(cagedCard).getByRole("button", { name: "Visualizar" }));

    const copiarTudo = await screen.findByRole("button", { name: /Copiar tudo/ });
    fireEvent.click(copiarTudo);

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "CAGED parágrafo 1.\n\nCAGED parágrafo 2."
      )
    );
    expect(await screen.findByText("Copiado!")).toBeInTheDocument();
  });

  it("botão de copiar por parágrafo copia só aquele parágrafo e mostra feedback", async () => {
    montar();
    const cagedCard = await screen.findByTestId("release-card-caged");
    fireEvent.click(within(cagedCard).getByRole("button", { name: "Visualizar" }));

    const botoesParagrafo = await screen.findAllByRole("button", { name: "Copiar parágrafo" });
    fireEvent.click(botoesParagrafo[1]);

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("CAGED parágrafo 2.")
    );
    expect(await screen.findByText("Copiado!")).toBeInTheDocument();
  });

  it("sem navigator.clipboard, os botões de copiar não são renderizados", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    montar();
    const cagedCard = await screen.findByTestId("release-card-caged");
    fireEvent.click(within(cagedCard).getByRole("button", { name: "Visualizar" }));

    await screen.findByText("CAGED parágrafo 2.");
    expect(screen.queryByRole("button", { name: /Copiar tudo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copiar parágrafo" })).toBeNull();
  });
});
