// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const authState = { user: { role: "ADMIN_GLOBAL" } };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));
vi.mock("./ComparacaoPares", () => ({ default: () => <div data-testid="aba-pares" /> }));
vi.mock("./RankingTab", () => ({ default: () => <div data-testid="aba-ranking" /> }));

import BenchmarkPage from "./ComparativoPage";

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { role: "ADMIN_GLOBAL" };
  viewAsState.viewAsId = null;
});

describe("BenchmarkPage — shell de abas", () => {
  it("header e as 2 abas presentes; pares é a default", () => {
    viewAsState.viewAsId = 42;
    render(<BenchmarkPage />);
    expect(screen.getByText("Benchmark Municipal")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Comparação com pares" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ranking nacional" })).toBeInTheDocument();
    expect(screen.getByTestId("aba-pares")).toBeInTheDocument();
  });

  it("global sem view-as: aba pares mostra SelecioneMunicipio, sem montar o componente", () => {
    render(<BenchmarkPage />);
    expect(screen.getByText("Selecione um município")).toBeInTheDocument();
    expect(screen.queryByTestId("aba-pares")).toBeNull();
  });

  it("ranking nacional continua acessível para global sem view-as", () => {
    render(<BenchmarkPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Ranking nacional" }));
    expect(screen.getByTestId("aba-ranking")).toBeInTheDocument();
    expect(screen.queryByText("Selecione um município")).toBeNull();
  });

  it("usuário municipal vê a aba pares direto", () => {
    authState.user = { role: "PREFEITO" };
    render(<BenchmarkPage />);
    expect(screen.getByTestId("aba-pares")).toBeInTheDocument();
  });
});
