# Painel do Prefeito — Modos Gerencial/Detalhado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toggle Gerencial/Detalhado no Painel do Prefeito — gerencial default (prioridades, KPIs macro, alertas, funil-resumo, projetos), detalhado = página atual intocada; escolha persistida por dispositivo.

**Architecture:** Estado `modo` na página com lazy-init de `localStorage` (`nid-painel-modo`, padrão do ThemeContext) e toggle via `chips` do `NidPageHeader` (prop existente — zero mudança de componente). Blocos comuns (Prioridades, AlertaFpm, DnM, Emendas) ficam nos dois modos; gerencial adiciona 4 KPIs macro (subconjunto do registry `METRICS` existente) + 2 cards novos autossuficientes (`FunilResumoCard`, `ProjetosResumoCard`) que só buscam quando montam. Zero backend.

**Tech Stack:** React 18, react-router-dom, vitest (node + jsdom).

**Spec:** `docs/superpowers/specs/2026-08-13-painel-prefeito-modos-design.md`

## Global Constraints

- **Zero backend**; endpoints usados já existem: `GET /desenvolvimento-economico/funil/resumo` (shape `{por_estagio:{lead,contato,negociacao,implantacao}, valor_total_estimado, taxa_conversao}`) e `GET /projetos` (lista `ProjetoOut`: `titulo`, `status` string livre — convenção `nao_iniciado|em_andamento|concluido` —, `data_prazo`, `tarefas:[{concluida,...}]`).
- Modo detalhado = render atual BYTE-IDÊNTICO (Panorama 13 KPIs + Por secretaria/área, linhas ~375-424 de `PainelPrefeitoPage.jsx`).
- Persistência: chave `localStorage` **`nid-painel-modo`**; default `"gerencial"`; leitura/escrita à prova de localStorage indisponível (try/catch).
- Toggle via `chips` do `NidPageHeader` (`src/components/nid/Panel.jsx:4-48`, shape `{label, active, onClick}`) — `NidPageHeader` NÃO muda.
- Cards novos reusam `diasAtraso`/`progresso` de `src/utils/projetoStatus.js` (existentes); estados vazios discretos (card não some).
- Fetches dos cards novos só quando o card monta (modo gerencial).
- Testes: vitest; jsdom via `// @vitest-environment jsdom` na 1ª linha; componentes com `<MemoryRouter>` (react-router-dom) por causa dos `<Link>`. **`npm run lint` não é gate.**
- Textos pt-BR; UTF-8; branch `feat/painel-prefeito-modos` de `main`; commit só dos arquivos de cada task (nunca `.claude/settings.local.json`).

---

### Task 1: Utils puros `painelModo` + `projetosResumo`

**Files:**
- Create: `frontend-observatorio/src/utils/painelModo.js`
- Create: `frontend-observatorio/src/utils/projetosResumo.js`
- Test: `frontend-observatorio/src/utils/painelModo.test.js`
- Test: `frontend-observatorio/src/utils/projetosResumo.test.js`

**Interfaces:**
- Produces: `MODO_DEFAULT = "gerencial"`, `lerModo() -> "gerencial"|"detalhado"`, `persistirModo(modo)`; `resumoProjetos(projetos, hoje?) -> { total, em_andamento, concluidos, atrasados, top }` com `top` = até 3 itens `{ id, titulo, pct, diasAtraso }` (em_andamento, ordenados por diasAtraso desc — null por último —, depois maior pct).

- [ ] **Step 1: Testes que falham** — criar os dois arquivos de teste:

`frontend-observatorio/src/utils/painelModo.test.js`:

```js
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODO_DEFAULT, lerModo, persistirModo } from "./painelModo";

// node env: localStorage não existe por padrão — simulamos com um stub global.
function stubStorage(inicial = {}) {
  const mapa = new Map(Object.entries(inicial));
  globalThis.localStorage = {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
  };
  return mapa;
}

afterEach(() => {
  delete globalThis.localStorage;
  vi.restoreAllMocks();
});

describe("painelModo", () => {
  it("default é gerencial (sem storage e sem valor salvo)", () => {
    expect(MODO_DEFAULT).toBe("gerencial");
    expect(lerModo()).toBe("gerencial"); // sem localStorage no ambiente
    stubStorage();
    expect(lerModo()).toBe("gerencial");
  });

  it("lê valor salvo válido e ignora inválido", () => {
    stubStorage({ "nid-painel-modo": "detalhado" });
    expect(lerModo()).toBe("detalhado");
    stubStorage({ "nid-painel-modo": "banana" });
    expect(lerModo()).toBe("gerencial");
  });

  it("persistirModo grava na chave nid-painel-modo", () => {
    const mapa = stubStorage();
    persistirModo("detalhado");
    expect(mapa.get("nid-painel-modo")).toBe("detalhado");
  });

  it("storage que lança não quebra leitura nem escrita", () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
    };
    expect(lerModo()).toBe("gerencial");
    expect(() => persistirModo("detalhado")).not.toThrow();
  });
});
```

`frontend-observatorio/src/utils/projetosResumo.test.js`:

```js
import { describe, expect, it } from "vitest";
import { resumoProjetos } from "./projetosResumo";

const HOJE = new Date("2026-08-13");
const t = (concluidas, total) =>
  Array.from({ length: total }, (_, i) => ({ id: i, titulo: `t${i}`, concluida: i < concluidas }));

const PROJETOS = [
  { id: 1, titulo: "Creche Norte", status: "em_andamento", data_prazo: "2026-07-01", tarefas: t(1, 4) },   // atrasado 43d, 25%
  { id: 2, titulo: "Recapeamento", status: "em_andamento", data_prazo: "2026-12-01", tarefas: t(3, 4) },   // no prazo, 75%
  { id: 3, titulo: "Portal", status: "concluido", data_prazo: "2026-05-01", tarefas: t(4, 4) },
  { id: 4, titulo: "UBS Sul", status: "em_andamento", data_prazo: null, tarefas: [] },                     // sem prazo, 0%
  { id: 5, titulo: "Praça", status: "nao_iniciado", data_prazo: "2026-10-01", tarefas: t(0, 2) },
];

describe("resumoProjetos", () => {
  it("contadores por status + atrasados", () => {
    const r = resumoProjetos(PROJETOS, HOJE);
    expect(r.total).toBe(5);
    expect(r.em_andamento).toBe(3);
    expect(r.concluidos).toBe(1);
    expect(r.atrasados).toBe(1); // só o 1 (concluído não conta, sem prazo não conta)
  });

  it("top = em_andamento por atenção: atrasado primeiro, depois maior %", () => {
    const r = resumoProjetos(PROJETOS, HOJE);
    expect(r.top.map((p) => p.id)).toEqual([1, 2, 4]);
    expect(r.top[0]).toMatchObject({ titulo: "Creche Norte", pct: 25 });
    expect(r.top[0].diasAtraso).toBeGreaterThan(0);
    expect(r.top[2]).toMatchObject({ pct: 0, diasAtraso: null });
  });

  it("limita o top a 3 e aceita lista vazia", () => {
    const muitos = Array.from({ length: 6 }, (_, i) => ({
      id: i, titulo: `p${i}`, status: "em_andamento", data_prazo: null, tarefas: t(i, 6),
    }));
    expect(resumoProjetos(muitos, HOJE).top).toHaveLength(3);
    expect(resumoProjetos([], HOJE)).toMatchObject({ total: 0, em_andamento: 0, atrasados: 0, top: [] });
    expect(resumoProjetos(null, HOJE).total).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend-observatorio
npx vitest run src/utils/painelModo.test.js src/utils/projetosResumo.test.js
```

Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`frontend-observatorio/src/utils/painelModo.js`:

```js
// Persistência por dispositivo do modo do Painel do Prefeito
// (padrão do ThemeContext: chave nid-*, leitura validada, default seguro).
const CHAVE = "nid-painel-modo";
const MODOS = ["gerencial", "detalhado"];

export const MODO_DEFAULT = "gerencial";

export function lerModo() {
  try {
    const salvo = globalThis.localStorage?.getItem(CHAVE);
    return MODOS.includes(salvo) ? salvo : MODO_DEFAULT;
  } catch {
    return MODO_DEFAULT;
  }
}

export function persistirModo(modo) {
  try {
    globalThis.localStorage?.setItem(CHAVE, modo);
  } catch {
    // storage indisponível (modo privado etc.) — preferência só não persiste
  }
}
```

`frontend-observatorio/src/utils/projetosResumo.js`:

```js
// Resumo puro de projetos para o card do modo gerencial do Painel.
// Reusa as derivações oficiais de status/atraso/progresso do app.
import { diasAtraso, progresso } from "./projetoStatus";

export function resumoProjetos(projetos, hoje = new Date()) {
  const lista = projetos || [];
  const emAndamento = lista.filter((p) => p.status === "em_andamento");
  const atrasados = lista.filter((p) => diasAtraso(p, hoje) !== null).length;
  const top = emAndamento
    .map((p) => ({
      id: p.id,
      titulo: p.titulo,
      pct: progresso(p.tarefas || []).pct,
      diasAtraso: diasAtraso(p, hoje),
    }))
    .sort((a, b) => (b.diasAtraso ?? -1) - (a.diasAtraso ?? -1) || b.pct - a.pct)
    .slice(0, 3);
  return {
    total: lista.length,
    em_andamento: emAndamento.length,
    concluidos: lista.filter((p) => p.status === "concluido").length,
    atrasados,
    top,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd frontend-observatorio
npx vitest run src/utils/painelModo.test.js src/utils/projetosResumo.test.js
```

Expected: PASS (7 testes). NOTA: se `progresso().pct` real arredondar diferente do esperado (25/75/0), ajuste os DADOS do teste (não o util) — a fonte de verdade é `projetoStatus.js`.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/painelModo.js frontend-observatorio/src/utils/painelModo.test.js frontend-observatorio/src/utils/projetosResumo.js frontend-observatorio/src/utils/projetosResumo.test.js
git commit -m "feat(painel): utils puros de modo persistido e resumo de projetos"
```

---

### Task 2: Cards `FunilResumoCard` e `ProjetosResumoCard`

**Files:**
- Create: `frontend-observatorio/src/components/FunilResumoCard.jsx`
- Create: `frontend-observatorio/src/components/ProjetosResumoCard.jsx`
- Test: `frontend-observatorio/src/components/FunilResumoCard.test.jsx`
- Test: `frontend-observatorio/src/components/ProjetosResumoCard.test.jsx`

**Interfaces:**
- Consumes: `resumoProjetos` (Task 1); `api` (`../services/api`); `diasAtraso`/`progresso` via util; `NidPanel` de `./nid/Panel`.
- Produces: `<FunilResumoCard />` e `<ProjetosResumoCard />` — sem props, fetch próprio no mount, usados pela Task 3.

- [ ] **Step 1: Testes que falham** — criar:

`frontend-observatorio/src/components/FunilResumoCard.test.jsx`:

```jsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  default: { get: vi.fn() },
}));
import api from "../services/api";
import FunilResumoCard from "./FunilResumoCard";

const montar = () => render(<MemoryRouter><FunilResumoCard /></MemoryRouter>);

describe("FunilResumoCard", () => {
  it("mostra os números do resumo", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        por_estagio: { lead: 4, contato: 2, negociacao: 1, implantacao: 3 },
        valor_total_estimado: 1500000,
        taxa_conversao: 30.0,
      },
    });
    montar();
    await waitFor(() => expect(screen.getByText("10")).toBeTruthy()); // leads somados
    expect(screen.getByText(/30%/)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy(); // em implantação
    expect(screen.getByRole("link", { name: /ver funil/i })).toBeTruthy();
  });

  it("funil vazio mostra estado vazio (card não some)", async () => {
    api.get.mockResolvedValueOnce({
      data: { por_estagio: { lead: 0, contato: 0, negociacao: 0, implantacao: 0 }, valor_total_estimado: 0, taxa_conversao: 0 },
    });
    montar();
    await waitFor(() => expect(screen.getByText(/nenhuma oportunidade/i)).toBeTruthy());
  });

  it("erro de API vira estado vazio, sem crash", async () => {
    api.get.mockRejectedValueOnce(new Error("falha"));
    montar();
    await waitFor(() => expect(screen.getByText(/nenhuma oportunidade/i)).toBeTruthy());
  });
});
```

`frontend-observatorio/src/components/ProjetosResumoCard.test.jsx`:

```jsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  default: { get: vi.fn() },
}));
import api from "../services/api";
import ProjetosResumoCard from "./ProjetosResumoCard";

const montar = () => render(<MemoryRouter><ProjetosResumoCard /></MemoryRouter>);

describe("ProjetosResumoCard", () => {
  it("mostra contadores e o top de projetos em andamento", async () => {
    api.get.mockResolvedValueOnce({
      data: [
        { id: 1, titulo: "Creche Norte", status: "em_andamento", data_prazo: "2000-01-01", tarefas: [{ id: 1, concluida: true }, { id: 2, concluida: false }] },
        { id: 2, titulo: "Portal", status: "concluido", data_prazo: null, tarefas: [] },
      ],
    });
    montar();
    await waitFor(() => expect(screen.getByText("Creche Norte")).toBeTruthy());
    expect(screen.getByText(/atrasad/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /ver projetos/i })).toBeTruthy();
  });

  it("sem projetos mostra estado vazio (card não some)", async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    montar();
    await waitFor(() => expect(screen.getByText(/nenhum projeto/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd frontend-observatorio
npx vitest run src/components/FunilResumoCard.test.jsx src/components/ProjetosResumoCard.test.jsx
```

Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar os cards**

`frontend-observatorio/src/components/FunilResumoCard.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { NidPanel } from "./nid/Panel";

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Resumo do Funil de Investimentos para o modo gerencial do Painel do
 *  Prefeito. Fetch próprio; funil vazio ou erro viram estado vazio discreto
 *  (o card não some — o prefeito deve saber que o funil existe). */
export default function FunilResumoCard() {
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .get("/desenvolvimento-economico/funil/resumo")
      .then((r) => setResumo(r.data))
      .catch(() => setResumo(null))
      .finally(() => setCarregando(false));
  }, []);

  const totalLeads = Object.values(resumo?.por_estagio || {}).reduce((s, n) => s + (n || 0), 0);

  return (
    <NidPanel
      title="Funil de Investimentos"
      sub="Oportunidades em captação"
      right={
        <Link to="/app/desenvolvimento-economico/funil" className="nid-pill nid-pill--inner" aria-label="Ver funil">
          Ver funil →
        </Link>
      }
    >
      {carregando ? (
        <div className="text-sm text-[var(--text-dim)] py-3">Carregando…</div>
      ) : totalLeads === 0 ? (
        <div className="text-sm text-[var(--text-dim)] py-3">
          Nenhuma oportunidade no funil ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-1">
          <div>
            <div className="text-2xl font-bold text-[var(--text)]">{totalLeads}</div>
            <div className="text-xs text-[var(--text-dim)]">Oportunidades</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--text)]">{fmtBRL(resumo.valor_total_estimado)}</div>
            <div className="text-xs text-[var(--text-dim)]">Valor potencial</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--text)]">{`${resumo.taxa_conversao ?? 0}%`}</div>
            <div className="text-xs text-[var(--text-dim)]">Taxa de conversão</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[var(--text)]">{resumo.por_estagio?.implantacao || 0}</div>
            <div className="text-xs text-[var(--text-dim)]">Em implantação</div>
          </div>
        </div>
      )}
    </NidPanel>
  );
}
```

`frontend-observatorio/src/components/ProjetosResumoCard.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { resumoProjetos } from "../utils/projetosResumo";
import { NidPanel } from "./nid/Panel";

/** Resumo de Projetos para o modo gerencial: contadores + os 3 em andamento
 *  que mais precisam de atenção (atraso primeiro). Fetch próprio. */
export default function ProjetosResumoCard() {
  const [projetos, setProjetos] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .get("/projetos")
      .then((r) => setProjetos(r.data || []))
      .catch(() => setProjetos([]))
      .finally(() => setCarregando(false));
  }, []);

  const r = resumoProjetos(projetos || []);

  return (
    <NidPanel
      title="Projetos"
      sub="Ações em execução no município"
      right={
        <Link to="/app/projetos" className="nid-pill nid-pill--inner" aria-label="Ver projetos">
          Ver projetos →
        </Link>
      }
    >
      {carregando ? (
        <div className="text-sm text-[var(--text-dim)] py-3">Carregando…</div>
      ) : r.total === 0 ? (
        <div className="text-sm text-[var(--text-dim)] py-3">Nenhum projeto cadastrado ainda.</div>
      ) : (
        <div className="space-y-3 py-1">
          <div className="flex gap-4 flex-wrap text-sm">
            <span className="text-[var(--text)]"><b>{r.em_andamento}</b> em andamento</span>
            <span className="text-[var(--text)]"><b>{r.concluidos}</b> concluídos</span>
            <span style={{ color: r.atrasados ? "var(--accent-2)" : "var(--text-dim)" }}>
              <b>{r.atrasados}</b> atrasado{r.atrasados === 1 ? "" : "s"}
            </span>
          </div>
          {r.top.length > 0 && (
            <ul className="space-y-2">
              {r.top.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--text)]">{p.titulo}</span>
                  <span className="shrink-0 text-xs text-[var(--text-dim)]">
                    {p.pct}%{p.diasAtraso != null ? ` · ${p.diasAtraso}d atrasado` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </NidPanel>
  );
}
```

- [ ] **Step 4: Rodar e ver passar + suíte**

```bash
cd frontend-observatorio
npx vitest run src/components/FunilResumoCard.test.jsx src/components/ProjetosResumoCard.test.jsx && npm test
```

Expected: PASS (5 testes novos), suíte verde.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/components/FunilResumoCard.jsx frontend-observatorio/src/components/FunilResumoCard.test.jsx frontend-observatorio/src/components/ProjetosResumoCard.jsx frontend-observatorio/src/components/ProjetosResumoCard.test.jsx
git commit -m "feat(painel): cards de resumo de funil e projetos para o modo gerencial"
```

---

### Task 3: Integração no `PainelPrefeitoPage`

**Files:**
- Modify: `frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx`

**Interfaces:**
- Consumes: `lerModo`/`persistirModo` (Task 1), `FunilResumoCard`/`ProjetosResumoCard` (Task 2), registry `METRICS`/`PANORAMA` e o map KpiCard+Link existentes (~L376-399).

- [ ] **Step 1: Imports + estado + toggle**

Adicionar imports:

```jsx
import FunilResumoCard from "../../components/FunilResumoCard";
import ProjetosResumoCard from "../../components/ProjetosResumoCard";
import { lerModo, persistirModo } from "../../utils/painelModo";
```

Junto às constantes do registry (após `PANORAMA`, ~L113-116):

```jsx
// Subconjunto macro do modo gerencial — mesmas entradas do METRICS.
const PANORAMA_GERENCIAL = ["pib", "arrecadacao", "caged", "vaf"];
```

No componente, junto aos states existentes:

```jsx
const [modo, setModo] = useState(lerModo);
useEffect(() => { persistirModo(modo); }, [modo]);
```

No `NidPageHeader` do branch normal (~L356), adicionar `chips` (o branch `needsMunicipio` NÃO ganha toggle):

```jsx
<NidPageHeader
  title="Painel do Prefeito"
  sub="Visão executiva de todas as áreas do município"
  chips={[
    { label: "Gerencial", active: modo === "gerencial", onClick: () => setModo("gerencial") },
    { label: "Detalhado", active: modo === "detalhado", onClick: () => setModo("detalhado") },
  ]}
/>
```

- [ ] **Step 2: Render condicional**

Os blocos comuns (Prioridades ~L359-361, AlertaFpm ~L364-366, DnM+Emendas ~L369-372) ficam FORA do condicional (aparecem nos dois modos, intocados). Em seguida, envolver o restante:

```jsx
{modo === "gerencial" ? (
  <>
    <SectionTitle>Visão geral</SectionTitle>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
      {loading
        ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
        : PANORAMA_GERENCIAL.map((key, i) => {
            const m = METRICS[key];
            const p = m.pick(resumo[key]);
            return (
              <Link key={key} to={m.route} className="block">
                <KpiCard label={m.label} value={p.value} unit={p.unit} delta={p.delta} sub={p.foot} delay={i * 0.03} />
              </Link>
            );
          })}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <FunilResumoCard />
      <ProjetosResumoCard />
    </div>
  </>
) : (
  <>
    {/* conteúdo atual EXATO: Panorama geral (SectionTitle + grid 13 KPIs)
        e Por secretaria/área (SectionTitle + grid AREAS) — mover para cá
        sem alterar uma linha */}
  </>
)}
```

IMPORTANTE: o bloco `detalhado` é o JSX atual das linhas ~375-424 movido para dentro do fragment SEM mudanças (o map do Panorama com os 13 `PANORAMA`, os `AreaCard`s, classes e delays idênticos). Confira que o map existente do Panorama usa exatamente o padrão `const m = METRICS[key]; const p = m.pick(resumo[key]);` — o bloco gerencial acima replica esse padrão; se o real divergir em algum detalhe (ex.: props extras no KpiCard ou no Link), copie o padrão REAL do bloco detalhado para o gerencial, mudando só a lista (`PANORAMA_GERENCIAL`) e o grid (`md:grid-cols-4`, `mb-7`).

- [ ] **Step 3: Rodar suíte completa (frontend e backend)**

```bash
cd frontend-observatorio && npm test
```

```bash
cd backend && ../venv/Scripts/python.exe -m pytest tests -q
```

Expected: verde nas duas.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/painel-prefeito/PainelPrefeitoPage.jsx
git commit -m "feat(painel): modos gerencial/detalhado com persistencia por dispositivo"
```

---

## Verificação manual (pós-implementação)

1. Painel abre no modo Gerencial (primeira visita): prioridades + alertas + 4 KPIs macro + cards de funil e projetos; sem os cards por secretaria.
2. Alternar para Detalhado: conteúdo idêntico ao atual; recarregar a página mantém o Detalhado (localStorage).
3. Município sem funil/projetos: os dois cards mostram estados vazios (não somem).
4. ADMIN_GLOBAL sem "ver como": tela de seleção de município, sem toggle.
