# Análise Econômica (Fase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/app/analise-economica` consolidando KPIs e insights das 6 bases econômicas (PIB, VAF, Empresas, ESTBAN, COMEX, PIX) com componentes/endpoints existentes, mais o item na sidebar.

**Architecture:** Um módulo puro novo (`metricasEconomicas.js`) extrai do Painel do Prefeito os 6 normalizadores econômicos + helpers de formatação (DRY, comportamento byte-idêntico); a página nova consome esse registry com o padrão `Promise.all`+`safeGet` da casa, `PlanGate` por base e um `InsightsPanel` único com chips de dataset; por fim rota + item de navegação (sem chave de plano) entram no ar.

**Tech Stack:** React 19 + react-router-dom v7; Vitest (config `environment: "node"`; arquivos DOM levam `// @vitest-environment jsdom` na 1ª linha) + @testing-library/react + jest-dom.

**Spec:** `docs/superpowers/specs/2026-08-19-analise-economica-design.md`

## Global Constraints

- **Zero backend.** Os 6 `/resumo` já existem (`/pib/resumo`, `/vaf/resumo`, `/empresas/resumo`, `/estban/resumo`, `/comex/resumo`, `/pix/resumo`) e já são gateados por `scoped_modulo` das chaves das próprias bases.
- **Nenhuma URL existente muda; nenhuma chave de plano nova.** A rota nova `/app/analise-economica` entra SEM `modulo` (sempre livre, como FPM). ROTA_MODULO do teste de invariantes não muda.
- **Refactor do Painel byte-idêntico:** os `pick()` extraídos devem produzir exatamente a mesma saída; a suite existente do Painel é o gate.
- Erro/403 em base individual NUNCA quebra a página: `safeGet` → `null` → card "—" (padrão `DashboardGeralPage.jsx:89-90` / `PainelPrefeitoPage.jsx:300`).
- Copy em pt-BR. Comandos de frontend rodam de `frontend-observatorio/`. Suite completa `npx vitest run` (baseline 252) deve terminar verde.
- `npm run lint` do repo JÁ FALHA (débito, não é gate): critério é "arquivo tocado sem erro NOVO"; arquivos novos saem limpos.
- Commits com prefixo convencional + trailers padrão da sessão.

---

### Task 1: `metricasEconomicas.js` — extração dos normalizadores + refactor do Painel

**Files:**
- Create: `frontend-observatorio/src/utils/metricasEconomicas.js`
- Test: `frontend-observatorio/src/utils/metricasEconomicas.test.js`
- Modify: `frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx:31-97` (helpers e 6 entradas do METRICS; linhas da versão atual)

**Interfaces:**
- Consumes: `fmtNumberShort` de `src/components/nid/charts` (já existe).
- Produces (Task 2 depende):
  - `fmtBR(v, opts?): string` · `moneyDisplay(v): {value, unit}` · `kpiDelta(p): {value:number, direction:"up"|"down"|"flat"}|null`
  - `METRICAS_ECONOMICAS`: objeto com chaves `pib|vaf|empresas|estban|comex|pix`, cada uma `{ label, route, resumoPath, planKey, pick(resumo) → { value, unit?, delta, foot } }` (formato de delta do `KpiCard`).
  - `ORDEM_ECONOMICA = ["pib","vaf","empresas","estban","comex","pix"]`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `frontend-observatorio/src/utils/metricasEconomicas.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  fmtBR, moneyDisplay, kpiDelta,
  METRICAS_ECONOMICAS, ORDEM_ECONOMICA,
} from "./metricasEconomicas";

describe("helpers de formatação", () => {
  it("fmtBR formata pt-BR e devolve — para nulo", () => {
    expect(fmtBR(1234.5, { maximumFractionDigits: 1 })).toBe("1.234,5");
    expect(fmtBR(null)).toBe("—");
  });

  it("moneyDisplay escolhe a escala", () => {
    expect(moneyDisplay(2500000)).toEqual({ value: "R$ 2,5", unit: "Mi" });
    expect(moneyDisplay(1234567890.5)).toEqual({ value: "R$ 1,2", unit: "Bi" });
    expect(moneyDisplay(null)).toEqual({ value: "—", unit: "" });
  });

  it("kpiDelta mapeia direção e preserva zero", () => {
    expect(kpiDelta(5.2)).toEqual({ value: 5.2, direction: "up" });
    expect(kpiDelta(-3.1)).toEqual({ value: -3.1, direction: "down" });
    expect(kpiDelta(0)).toEqual({ value: 0, direction: "flat" });
    expect(kpiDelta(null)).toBeNull();
  });
});

describe("METRICAS_ECONOMICAS", () => {
  it("tem as 6 bases na ordem canônica, com rota/endpoint/chave", () => {
    expect(ORDEM_ECONOMICA).toEqual(["pib", "vaf", "empresas", "estban", "comex", "pix"]);
    ORDEM_ECONOMICA.forEach((key) => {
      const m = METRICAS_ECONOMICAS[key];
      expect(typeof m.label).toBe("string");
      expect(m.route).toBe(`/app/${key}`);
      expect(m.resumoPath).toBe(`/${key}/resumo`);
      expect(m.planKey).toBe(key);
      expect(typeof m.pick).toBe("function");
    });
  });

  it("pib.pick — payload completo", () => {
    const p = METRICAS_ECONOMICAS.pib.pick({ ultimo_ano: 2021, pib_ultimo_ano: 1234567890.5, crescimento_percentual: 5.2 });
    expect(p).toEqual({ value: "R$ 1,2", unit: "Bi", delta: { value: 5.2, direction: "up" }, foot: "2021" });
  });

  it("vaf.pick — IPM com 4 casas e delta negativo", () => {
    const p = METRICAS_ECONOMICAS.vaf.pick({ ultimo_ano: 2023, ipm_ultimo_ano: 0.012345, variacao_ipm_percentual: -3.1 });
    expect(p).toEqual({ value: "0,0123", unit: "", delta: { value: -3.1, direction: "down" }, foot: "2023" });
  });

  it("empresas.pick e estban.pick — valores e foots", () => {
    expect(METRICAS_ECONOMICAS.empresas.pick({ total_ativas: 585, total_mei: 320 }))
      .toEqual({ value: "585", unit: "", delta: null, foot: "320 MEI" });
    expect(METRICAS_ECONOMICAS.estban.pick({ total_operacoes_credito: 2500000, qtd_agencias: 3 }))
      .toEqual({ value: "R$ 2,5", unit: "Mi", delta: null, foot: "3 agências" });
  });

  it("comex.pick — balança em USD", () => {
    const p = METRICAS_ECONOMICAS.comex.pick({ balanca_comercial: 1500000 });
    expect(p).toEqual({ value: "US$ 1.500.000", unit: "", delta: null, foot: "exportação − importação" });
  });

  it("pix.pick — valor presente e foot fixo", () => {
    const p = METRICAS_ECONOMICAS.pix.pick({ total_transacoes: 12345 });
    expect(p.value).not.toBe("—");
    expect(p.foot).toBe("PF + PJ");
  });

  it("todo pick com resumo nulo/vazio degrada para —", () => {
    ORDEM_ECONOMICA.forEach((key) => {
      const p = METRICAS_ECONOMICAS[key].pick(null);
      expect(p.value).toBe("—");
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/utils/metricasEconomicas.test.js`
Expected: FAIL — módulo `./metricasEconomicas` não existe.

- [ ] **Step 3: Implementar `metricasEconomicas.js`**

Conteúdo completo — os corpos de `fmtBR`/`moneyDisplay`/`kpiDelta` e dos 6 `pick` são **cópia byte-idêntica** dos que vivem hoje em `PainelPrefeitoPage.jsx:32-47` e `:61-97` (conferir contra o arquivo ao transcrever):

```js
import { fmtNumberShort } from "../components/nid/charts";

// Helpers de formatação e normalizadores das 6 bases econômicas.
// Extraídos de PainelPrefeitoPage (METRICS) sem mudança de comportamento —
// compartilhados entre o Painel (Visão do Prefeito) e a Análise Econômica.
export const fmtBR = (v, opts = {}) =>
  v != null ? Number(v).toLocaleString("pt-BR", opts) : "—";

export function moneyDisplay(v) {
  if (v == null) return { value: "—", unit: "" };
  const a = Math.abs(v);
  if (a >= 1e9) return { value: `R$ ${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, unit: "Bi" };
  if (a >= 1e6) return { value: `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, unit: "Mi" };
  if (a >= 1e3) return { value: `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, unit: "k" };
  return { value: `R$ ${fmtBR(v)}`, unit: "" };
}

export function kpiDelta(p) {
  if (p == null) return null;
  return { value: Number(p), direction: p > 0 ? "up" : p < 0 ? "down" : "flat" };
}

// pick(resumo) → { value, unit, delta, foot } no formato do KpiCard.
export const METRICAS_ECONOMICAS = {
  pib: {
    label: "PIB", route: "/app/pib", resumoPath: "/pib/resumo", planKey: "pib",
    pick: (r) => ({ ...moneyDisplay(r?.pib_ultimo_ano), delta: kpiDelta(r?.crescimento_percentual), foot: r?.ultimo_ano ? String(r.ultimo_ano) : "" }),
  },
  vaf: {
    label: "VAF · IPM", route: "/app/vaf", resumoPath: "/vaf/resumo", planKey: "vaf",
    pick: (r) => ({ value: r?.ipm_ultimo_ano != null ? fmtBR(r.ipm_ultimo_ano, { maximumFractionDigits: 4 }) : "—", unit: "", delta: kpiDelta(r?.variacao_ipm_percentual), foot: r?.ultimo_ano ? String(r.ultimo_ano) : "" }),
  },
  empresas: {
    label: "Empresas ativas", route: "/app/empresas", resumoPath: "/empresas/resumo", planKey: "empresas",
    pick: (r) => ({ value: r?.total_ativas != null ? fmtBR(r.total_ativas) : "—", unit: "", delta: null, foot: r?.total_mei != null ? `${fmtBR(r.total_mei)} MEI` : "" }),
  },
  estban: {
    label: "Crédito bancário", route: "/app/estban", resumoPath: "/estban/resumo", planKey: "estban",
    pick: (r) => ({ ...moneyDisplay(r?.total_operacoes_credito), delta: null, foot: r?.qtd_agencias != null ? `${fmtBR(r.qtd_agencias)} agências` : "" }),
  },
  comex: {
    label: "Balança comercial", route: "/app/comex", resumoPath: "/comex/resumo", planKey: "comex",
    pick: (r) => ({ value: r?.balanca_comercial != null ? `US$ ${fmtBR(r.balanca_comercial, { maximumFractionDigits: 0 })}` : "—", unit: "", delta: null, foot: "exportação − importação" }),
  },
  pix: {
    label: "Transações PIX", route: "/app/pix", resumoPath: "/pix/resumo", planKey: "pix",
    pick: (r) => ({ value: r?.total_transacoes != null ? fmtNumberShort(r.total_transacoes) : "—", unit: "", delta: null, foot: "PF + PJ" }),
  },
};

export const ORDEM_ECONOMICA = ["pib", "vaf", "empresas", "estban", "comex", "pix"];
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/utils/metricasEconomicas.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Refactor do Painel para consumir o módulo**

Em `PainelPrefeitoPage.jsx`:
1. **Deletar** as definições locais `fmtBR` (linhas 32-33), `moneyDisplay` (35-42) e `kpiDelta` (44-47). A função `norm` (50-57) FICA.
2. **Adicionar** ao bloco de imports:

```jsx
import { fmtBR, moneyDisplay, kpiDelta, METRICAS_ECONOMICAS } from "../../utils/metricasEconomicas";
```

3. No objeto `METRICS` (linhas 61-114), **deletar** as 6 entradas `pib`, `vaf`, `empresas`, `estban`, `comex`, `pix` e espalhar o módulo no lugar (a ordem de exibição vem de `PANORAMA`, não do objeto):

```jsx
const METRICS = {
  ...METRICAS_ECONOMICAS,
  arrecadacao: { /* entrada atual inalterada */ },
  caged: { /* inalterada */ },
  rais: { /* inalterada */ },
  bolsa_familia: { /* inalterada */ },
  pe_de_meia: { /* inalterada */ },
  inss: { /* inalterada */ },
  ips: { /* inalterada */ },
};
```

4. `fmtNumberShort` só era usado pelo pick do pix: **remover** da linha de import de `../../components/nid/charts` se nenhum outro uso restar no arquivo (grep antes); `fmtMoneyShort` continua usado (bolsa/pdm/inss).

- [ ] **Step 6: Rodar a suite do Painel e a completa**

Run: `npx vitest run src/pages/painel-prefeito/PainelPrefeitoPage.test.jsx`
Expected: PASS (byte-idêntico — nenhuma asserção muda).
Run: `npx vitest run`
Expected: PASS, 252 + 9 novos = 261, zero falhas.

- [ ] **Step 7: Commit**

```bash
git add frontend-observatorio/src/utils/metricasEconomicas.js frontend-observatorio/src/utils/metricasEconomicas.test.js frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx
git commit -m "refactor(economia): normalizadores das 6 bases extraidos para metricasEconomicas (DRY Painel)"
```

---

### Task 2: `AnaliseEconomicaPage` — página + testes de comportamento

**Files:**
- Create: `frontend-observatorio/src/pages/analise-economica/AnaliseEconomicaPage.jsx`
- Test: `frontend-observatorio/src/pages/analise-economica/AnaliseEconomicaPage.test.jsx`

**Interfaces:**
- Consumes (Task 1): `METRICAS_ECONOMICAS`, `ORDEM_ECONOMICA` de `../../utils/metricasEconomicas`. Componentes existentes: `NidPageHeader` (`../../components/nid/Panel`), `KpiCard` (default), `KpiSkeleton`, `SelecioneMunicipio` (`../../components/nid/…`), `PlanGate`, `InsightsPanel` (defaults), `useAuth`, `useViewAs`, `api` (default de `../../services/api`).
- Produces (Task 3 depende): `export default function AnaliseEconomicaPage()` — precisa de Router (usa `Link`) e é segura fora do `PlanContext.Provider` (default `canAccess: () => true`).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `frontend-observatorio/src/pages/analise-economica/AnaliseEconomicaPage.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlanContext } from "../../context/PlanContext";

const authState = { user: { role: "SECRETARIO", permissoes: {} } };
const viewAsState = { viewAsId: null };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("../../context/ViewAsContext", () => ({ useViewAs: () => viewAsState }));

// Mapa url → resposta; Error = rejeição (simula 403 de plano).
const respostas = {};
vi.mock("../../services/api", () => ({
  default: {
    get: vi.fn((url) => {
      const r = respostas[url];
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve({ data: r ?? null });
    }),
  },
}));

import api from "../../services/api";
import AnaliseEconomicaPage from "./AnaliseEconomicaPage";

const RESUMOS_OK = {
  "/pib/resumo": { ultimo_ano: 2021, pib_ultimo_ano: 1234567890.5, crescimento_percentual: 5.2 },
  "/vaf/resumo": { ultimo_ano: 2023, ipm_ultimo_ano: 0.012345, variacao_ipm_percentual: -3.1 },
  "/empresas/resumo": { total_ativas: 585, total_mei: 320 },
  "/estban/resumo": { total_operacoes_credito: 2500000, qtd_agencias: 3 },
  "/comex/resumo": { balanca_comercial: 1500000 },
  "/pix/resumo": { total_transacoes: 12345 },
  "/insights": { bullets: ["insight um", "insight dois"], gerado_em: "2026-08-01T00:00:00" },
};

function montar() {
  return render(
    <MemoryRouter>
      <AnaliseEconomicaPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
  Object.assign(respostas, RESUMOS_OK);
  authState.user = { role: "SECRETARIO", permissoes: {} };
  viewAsState.viewAsId = null;
});

describe("AnaliseEconomicaPage — cards das 6 bases", () => {
  it("renderiza os 6 cards com valores dos resumos e links de aprofundamento", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("PIB")).toBeInTheDocument());
    expect(screen.getByText("VAF · IPM")).toBeInTheDocument();
    expect(screen.getByText("Empresas ativas")).toBeInTheDocument();
    expect(screen.getByText("Crédito bancário")).toBeInTheDocument();
    expect(screen.getByText("Balança comercial")).toBeInTheDocument();
    expect(screen.getByText("Transações PIX")).toBeInTheDocument();
    expect(screen.getByText("585")).toBeInTheDocument(); // empresas ativas
    expect(screen.getByText("PIB").closest("a")).toHaveAttribute("href", "/app/pib");
  });

  it("base com erro (403) degrada para — sem quebrar as demais", async () => {
    respostas["/pix/resumo"] = new Error("403");
    montar();
    await waitFor(() => expect(screen.getByText("585")).toBeInTheDocument());
    const cardPix = screen.getByText("Transações PIX").closest("a");
    expect(cardPix.textContent).toContain("—");
  });

  it("base bloqueada por plano mostra o teaser do PlanGate", async () => {
    render(
      <MemoryRouter>
        <PlanContext.Provider value={{ modulos: ["pib"], canAccess: (k) => k !== "pix" }}>
          <AnaliseEconomicaPage />
        </PlanContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("585")).toBeInTheDocument());
    expect(screen.getAllByText("Disponível apenas no plano pago")).toHaveLength(1);
  });
});

describe("AnaliseEconomicaPage — insights por base", () => {
  it("carrega insights do PIB por padrão e troca de base pelo chip", async () => {
    montar();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/insights",
        expect.objectContaining({ params: expect.objectContaining({ dataset: "pib" }) })
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "VAF" }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/insights",
        expect.objectContaining({ params: expect.objectContaining({ dataset: "vaf" }) })
      )
    );
  });
});

describe("AnaliseEconomicaPage — ADMIN_GLOBAL sem view-as", () => {
  it("mostra o guard de município e não busca resumos", () => {
    authState.user = { role: "ADMIN_GLOBAL" };
    montar();
    expect(screen.queryByText("PIB")).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith("/pib/resumo");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/pages/analise-economica/AnaliseEconomicaPage.test.jsx`
Expected: FAIL — `Cannot find module './AnaliseEconomicaPage'`.

- [ ] **Step 3: Implementar a página**

Criar `frontend-observatorio/src/pages/analise-economica/AnaliseEconomicaPage.jsx` (conteúdo completo):

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { NidPageHeader } from "../../components/nid/Panel";
import KpiCard from "../../components/KpiCard";
import KpiSkeleton from "../../components/nid/KpiSkeleton";
import SelecioneMunicipio from "../../components/nid/SelecioneMunicipio";
import PlanGate from "../../components/PlanGate";
import InsightsPanel from "../../components/InsightsPanel";
import { METRICAS_ECONOMICAS, ORDEM_ECONOMICA } from "../../utils/metricasEconomicas";

// Labels curtos dos chips do seletor de insights (os labels dos cards são os
// do registry, mais descritivos).
const CHIP_LABELS = { pib: "PIB", vaf: "VAF", empresas: "Empresas", estban: "Bancos", comex: "COMEX", pix: "PIX" };

const HEADER = (
  <NidPageHeader
    title="Análise Econômica"
    sub="Leitura consolidada das bases econômicas do município"
  />
);

export default function AnaliseEconomicaPage() {
  const { user } = useAuth();
  const { viewAsId } = useViewAs();
  const needsMunicipio = user?.role === "ADMIN_GLOBAL" && viewAsId == null;

  const [resumos, setResumos] = useState({});
  const [loading, setLoading] = useState(true);
  const [dataset, setDataset] = useState("pib");

  useEffect(() => {
    if (needsMunicipio) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const safeGet = (url) => api.get(url).then((r) => r.data).catch(() => null);
    Promise.all(ORDEM_ECONOMICA.map((key) => safeGet(METRICAS_ECONOMICAS[key].resumoPath))).then((res) => {
      if (!alive) return;
      const map = {};
      ORDEM_ECONOMICA.forEach((key, i) => { map[key] = res[i]; });
      setResumos(map);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [needsMunicipio]);

  if (needsMunicipio) {
    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {HEADER}
        <SelecioneMunicipio />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {HEADER}

      <div className="grid gap-4 md:grid-cols-3">
        {loading
          ? ORDEM_ECONOMICA.map((key) => <KpiSkeleton key={key} height={110} />)
          : ORDEM_ECONOMICA.map((key, i) => {
              const m = METRICAS_ECONOMICAS[key];
              const p = m.pick(resumos[key]);
              return (
                <PlanGate key={key} planKey={m.planKey}>
                  <Link to={m.route} className="block" aria-label={`Aprofundar em ${m.label}`}>
                    <KpiCard
                      label={m.label}
                      value={p.value}
                      unit={p.unit}
                      delta={p.delta}
                      sub={p.foot}
                      delay={i * 0.03}
                    />
                  </Link>
                </PlanGate>
              );
            })}
      </div>

      <div>
        <div className="nid-panel-actions mb-3" role="group" aria-label="Base dos insights">
          {ORDEM_ECONOMICA.map((key) => (
            <button
              key={key}
              type="button"
              className={`nid-tab ${dataset === key ? "active" : ""}`}
              aria-pressed={dataset === key}
              onClick={() => setDataset(key)}
            >
              {CHIP_LABELS[key]}
            </button>
          ))}
        </div>
        <InsightsPanel key={dataset} dataset={dataset} />
      </div>
    </motion.div>
  );
}
```

Notas de implementação:
- `InsightsPanel` recebe `key={dataset}` para remontar limpo a cada troca (evita flash do insight anterior; o componente refaz o fetch de qualquer forma pelo dep array).
- Chips seguem o padrão visual do `PeriodoMenu` (`.nid-panel-actions` + `.nid-tab` + `aria-pressed`).
- Sem `dataset`/`indicadorKey` nos `KpiCard` (decisão da spec: evita requests extras de tooltip; opt-in editorial futuro).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/pages/analise-economica/AnaliseEconomicaPage.test.jsx`
Expected: PASS (5 testes). Se o teste do PlanGate falhar por copy, conferir o texto exato do overlay em `src/components/PlanGate.jsx` e alinhar a asserção (a fonte de verdade é o componente).

- [ ] **Step 5: Suite completa**

Run: `npx vitest run`
Expected: PASS, 261 + 5 = 266, zero falhas.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/analise-economica/
git commit -m "feat(economia): pagina Analise Economica — curadoria das 6 bases com insights por base"
```

---

### Task 3: Rota + item na sidebar + invariantes de navegação

**Files:**
- Modify: `frontend-observatorio/src/app/router/AppRouter.jsx` (import no topo + rota junto às econômicas, ~linha 134, ao lado de `/app/pix`)
- Modify: `frontend-observatorio/src/app/layouts/navStructure.jsx` (seção "Dados Econômicos", entre o item PIX e o grupo Emprego)
- Test: `frontend-observatorio/src/app/layouts/navStructure.test.js` (modificar)

**Interfaces:**
- Consumes: `AnaliseEconomicaPage` (Task 2); `PresentationChartBarIcon` (já importado em `navStructure.jsx`).
- Produces: rota e item vivos; NAV_FLAT com 32 itens.

- [ ] **Step 1: Atualizar o teste de invariantes (falhando)**

Em `navStructure.test.js`:
1. No teste de preservação de rotas: `expect(NAV_FLAT).toHaveLength(31)` → `toHaveLength(32)` e atualizar o comentário ("30 com chave + FPM e Análise Econômica sem = 32 navegáveis"). `ROTA_MODULO` NÃO muda (o mapa filtra `modulo != null`).
2. No teste de flags: adicionar

```js
    expect(porRota["/app/analise-economica"].modulo).toBeUndefined();
```

3. No teste de labels: adicionar

```js
    expect(labels).toContain("Análise Econômica");
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/layouts/navStructure.test.js`
Expected: FAIL — length 31 ≠ 32; label ausente; rota ausente.

- [ ] **Step 3: Adicionar item e rota**

Em `navStructure.jsx`, seção "Dados Econômicos", inserir entre o item PIX e o grupo Emprego:

```jsx
      { type: "link", to: "/app/analise-economica", label: "Análise Econômica", icon: PresentationChartBarIcon },
```

(Sem `modulo` — deliberado: página livre com degradação por base via PlanGate; o comentário do arquivo sobre chaves continua válido.)

Em `AppRouter.jsx`: adicionar o import junto aos demais de páginas:

```jsx
import AnaliseEconomicaPage from "../../pages/analise-economica/AnaliseEconomicaPage";
```

e declarar a rota imediatamente após a rota de `/app/pix`, espelhando EXATAMENTE a forma das rotas vizinhas (mesmo estilo relativo/absoluto de `path` que a rota do PIX usa no arquivo):

```jsx
<Route path="/app/analise-economica" element={<AnaliseEconomicaPage />} />
```

- [ ] **Step 4: Rodar invariantes + suite completa**

Run: `npx vitest run src/app/layouts/navStructure.test.js`
Expected: PASS (7 testes).
Run: `npx vitest run`
Expected: PASS, 266 total, zero falhas.

- [ ] **Step 5: Lint comparativo**

```bash
cd frontend-observatorio
npx eslint src/utils/metricasEconomicas.js src/utils/metricasEconomicas.test.js src/pages/analise-economica/AnaliseEconomicaPage.jsx src/pages/analise-economica/AnaliseEconomicaPage.test.jsx
```
Expected: zero erros nos novos. Para `PainelPrefeitoPage.jsx`, `AppRouter.jsx` e `navStructure.jsx` (modificados): comparar contagem com a versão base via `git show <base>:frontend-observatorio/<path> | npx eslint --stdin --stdin-filename "<path>"` — nenhum erro novo.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/app/router/AppRouter.jsx frontend-observatorio/src/app/layouts/navStructure.jsx frontend-observatorio/src/app/layouts/navStructure.test.js
git commit -m "feat(nav): rota e item Analise Economica no Eixo 3 (livre, degradacao por base)"
```
