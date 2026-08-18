# Reorganização em 5 Eixos — Fase 1 (Esqueleto da Sidebar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar do app reorganizada em 5 seções-eixo (Visão Executiva, Indicadores Internos, Dados Econômicos, Desenv. Empresarial, Gestão) com renomeações de labels e títulos de página, sem mudar nenhuma URL nem chave de plano.

**Architecture:** A `NAV_STRUCTURE` sai do `DashboardLayout.jsx` para um módulo puro novo (`navStructure.jsx`, testável como dados) com um nível novo `section`; a renderização da nav vira um componente próprio (`SidebarNav.jsx`, testável com MemoryRouter sem mock de API); o `DashboardLayout` vira consumidor. Grupos colapsáveis passam a ser chaveados por `label` (estável) em vez de índice.

**Tech Stack:** React 19 + react-router-dom v7 + Tailwind/tokens CSS do tema (`.nid-nav-section`, `.nid-nav-item`, `.nid-nav-children`, `.nid-nav-child` já existem em `src/styles/themes.css`). Testes: Vitest (config `environment: "node"`; arquivos DOM levam `// @vitest-environment jsdom` na primeira linha), @testing-library/react, jest-dom.

**Spec:** `docs/superpowers/specs/2026-08-18-reorganizacao-eixos-design.md`

## Global Constraints

- **Nenhuma URL muda.** Zero alterações em `AppRouter.jsx`, zero redirects novos, zero backend.
- **Chaves de plano (`modulo`) byte-idênticas às atuais** — elas acoplam sidebar ↔ `plano_config.modulos` (banco) ↔ `scoped_modulo()` (backend). O teste de invariantes da Task 1 congela isso.
- **Nenhum item de navegação removido** (regra do usuário: nenhum descarte silencioso). As 31 entradas navegáveis atuais continuam todas na sidebar.
- Comportamentos preservados verbatim: teaser de cadeado por plano (item visível com `opacity 0.7` + `LockClosedIcon` + `title="Recurso bloqueado — disponível em um plano superior"`), `hideForAdmin` de Releases, bloco Admin por `temPermissaoAdmin`, auto-abertura de grupo na rota ativa, fechamento da sidebar mobile ao navegar.
- Todos os comandos de frontend rodam de `frontend-observatorio/`. Suite completa: `npx vitest run` (baseline atual: 221 testes verdes — deve terminar verde com os novos).
- **`npm run lint` do repo JÁ FALHA (débito pré-existente) — não é gate.** Critério: arquivo tocado não ganha erro NOVO em relação à versão dele no commit base (Task 5 mostra como comparar).
- Copy em pt-BR; commits frequentes com prefixo convencional (`feat(nav):`, `refactor(nav):`, `test(nav):`).

---

### Task 1: `navStructure.jsx` — dados puros da nova navegação + teste de invariantes

**Files:**
- Create: `frontend-observatorio/src/app/layouts/navStructure.jsx`
- Test: `frontend-observatorio/src/app/layouts/navStructure.test.js`

**Interfaces:**
- Consumes: nada (só ícones de `@heroicons/react/24/outline`).
- Produces (Tasks 2 e 3 dependem destes nomes exatos):
  - `NAV_STRUCTURE`: array de `{ type: "section", label: string, items: Item[] }`, onde `Item` é `{ type: "link", to, label, icon, modulo?, end?, hideForAdmin? }` ou `{ type: "group", label, icon, children: Child[] }` e `Child` é `{ to, label, icon, modulo?, end? }`.
  - `NAV_FLAT`: array plano de todos os links + filhos de grupo (31 itens).
  - `isChildActive(children, pathname): boolean`
  - `isModuloLocked({ isGlobal, modulos, modulo }): boolean`

- [ ] **Step 1: Escrever o teste de invariantes (falhando)**

Criar `frontend-observatorio/src/app/layouts/navStructure.test.js`:

```js
import { describe, it, expect } from "vitest";
import { NAV_STRUCTURE, NAV_FLAT, isModuloLocked } from "./navStructure";

// Congela o mapa rota → chave de plano. Estas chaves acoplam sidebar,
// plano_config (banco) e scoped_modulo (backend): mudar QUALQUER valor aqui
// exige migração de dados — é exatamente o que a Fase 1 proíbe.
const ROTA_MODULO = {
  "/app": "geral",
  "/app/painel-prefeito": "painel_prefeito",
  "/app/benchmark": "benchmark",
  "/app/ips": "ips",
  "/app/bolsa-familia": "bolsa_familia",
  "/app/pe-de-meia": "pe_de_meia",
  "/app/inss": "inss",
  "/app/dados-internos/indicadores": "dados_internos.indicadores",
  "/app/pib": "pib",
  "/app/vaf": "vaf",
  "/app/empresas": "empresas",
  "/app/estban": "estban",
  "/app/comex": "comex",
  "/app/pix": "pix",
  "/app/caged": "caged",
  "/app/rais": "rais",
  "/app/arrecadacao": "arrecadacao",
  "/app/desenvolvimento-economico/retencao": "desenvolvimento_economico.retencao",
  "/app/desenvolvimento-economico/funil": "desenvolvimento_economico.funil",
  "/app/desenvolvimento-economico/premiacoes": "desenvolvimento_economico.premiacoes",
  "/app/desenvolvimento-economico/captacao": "desenvolvimento_economico.captacao",
  "/app/desenvolvimento-economico/escrita": "desenvolvimento_economico.escrita",
  "/app/dinheiro-na-mesa": "captacao_federal",
  "/app/emendas": "emendas",
  "/app/projetos": "projetos",
  "/app/dados-internos/plano-gov": "dados_internos.plano_gov",
  "/app/timeline": "timeline_mandato",
  "/app/dados-internos/calendario": "dados_internos.calendario",
  "/app/impacto": "impacto",
  "/app/releases": "releases",
};

describe("NAV_STRUCTURE — 5 eixos", () => {
  it("tem as 5 seções na ordem do design", () => {
    expect(NAV_STRUCTURE.map((s) => s.label)).toEqual([
      "Visão Executiva",
      "Indicadores Internos",
      "Dados Econômicos",
      "Desenv. Empresarial",
      "Gestão",
    ]);
    NAV_STRUCTURE.forEach((s) => expect(s.type).toBe("section"));
  });

  it("preserva TODAS as rotas atuais com as MESMAS chaves de plano", () => {
    const mapa = Object.fromEntries(
      NAV_FLAT.filter((i) => i.modulo != null).map((i) => [i.to, i.modulo])
    );
    expect(mapa).toEqual(ROTA_MODULO);
    // 30 com chave + FPM (única rota sem gate de plano) = 31 navegáveis
    expect(NAV_FLAT).toHaveLength(31);
  });

  it("flags pontuais preservadas e itens bem formados", () => {
    const porRota = Object.fromEntries(NAV_FLAT.map((i) => [i.to, i]));
    expect(porRota["/app"].end).toBe(true);
    expect(porRota["/app/releases"].hideForAdmin).toBe(true);
    expect(porRota["/app/fpm"].modulo).toBeUndefined();
    NAV_FLAT.forEach((i) => {
      expect(typeof i.to).toBe("string");
      expect(typeof i.label).toBe("string");
      expect(i.icon).toBeTruthy();
    });
  });

  it("labels renomeados do design presentes; antigos ausentes", () => {
    const labels = NAV_FLAT.map((i) => i.label);
    expect(labels).toContain("Central de Inteligência");
    expect(labels).toContain("Memória Institucional");
    expect(labels).toContain("Atração de Investimentos");
    expect(labels).toContain("Inteligência Empresarial");
    expect(labels).toContain("Indicadores & Cidade Inteligente");
    expect(labels).not.toContain("Dashboard");
    expect(labels).not.toContain("Timeline");
    expect(labels).not.toContain("Funil de Investimentos");
    expect(labels).not.toContain("Retenção & Expansão");
  });
});

describe("isModuloLocked", () => {
  it("global, catálogo nulo ou item sem chave nunca bloqueiam", () => {
    expect(isModuloLocked({ isGlobal: true, modulos: [], modulo: "pib" })).toBe(false);
    expect(isModuloLocked({ isGlobal: false, modulos: null, modulo: "pib" })).toBe(false);
    expect(isModuloLocked({ isGlobal: false, modulos: [], modulo: undefined })).toBe(false);
  });

  it("bloqueia chave fora do plano e libera chave dentro", () => {
    expect(isModuloLocked({ isGlobal: false, modulos: ["pib"], modulo: "vaf" })).toBe(true);
    expect(isModuloLocked({ isGlobal: false, modulos: ["pib"], modulo: "pib" })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/layouts/navStructure.test.js`
Expected: FAIL — `Cannot find module './navStructure'` (ou equivalente de resolução).

- [ ] **Step 3: Implementar `navStructure.jsx`**

Criar `frontend-observatorio/src/app/layouts/navStructure.jsx` (conteúdo completo):

```jsx
import {
  AcademicCapIcon,
  BanknotesIcon,
  BoltIcon,
  BriefcaseIcon,
  BuildingLibraryIcon,
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ChartBarIcon,
  ChartBarSquareIcon,
  ChartPieIcon,
  ClipboardDocumentListIcon,
  FolderOpenIcon,
  FunnelIcon,
  GlobeAltIcon,
  HeartIcon,
  HomeIcon,
  NewspaperIcon,
  PencilSquareIcon,
  PresentationChartBarIcon,
  ShieldCheckIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";

// Navegação do app em 5 seções-eixo (spec 2026-08-18-reorganizacao-eixos).
// As chaves `modulo` acoplam este arquivo a plano_config.modulos (banco) e a
// scoped_modulo() no backend — NÃO renomear sem migração de dados.
export const NAV_STRUCTURE = [
  {
    type: "section",
    label: "Visão Executiva",
    items: [
      { type: "link", to: "/app", label: "Central de Inteligência", icon: HomeIcon, end: true, modulo: "geral" },
      { type: "link", to: "/app/painel-prefeito", label: "Painel do Prefeito", icon: BuildingLibraryIcon, modulo: "painel_prefeito" },
      { type: "link", to: "/app/benchmark", label: "Benchmark", icon: ChartBarSquareIcon, modulo: "benchmark" },
      {
        type: "group", label: "Contexto Socioeconômico", icon: HeartIcon,
        children: [
          { to: "/app/ips", label: "IPS", icon: PresentationChartBarIcon, modulo: "ips" },
          { to: "/app/bolsa-familia", label: "Bolsa Família", icon: HeartIcon, modulo: "bolsa_familia" },
          { to: "/app/pe-de-meia", label: "Pé-de-Meia", icon: AcademicCapIcon, modulo: "pe_de_meia" },
          { to: "/app/inss", label: "INSS", icon: ShieldCheckIcon, modulo: "inss" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "Indicadores Internos",
    items: [
      { type: "link", to: "/app/dados-internos/indicadores", label: "Indicadores & Cidade Inteligente", icon: ChartPieIcon, modulo: "dados_internos.indicadores" },
    ],
  },
  {
    type: "section",
    label: "Dados Econômicos",
    items: [
      { type: "link", to: "/app/pib", label: "PIB", icon: ChartBarIcon, modulo: "pib" },
      { type: "link", to: "/app/vaf", label: "VAF", icon: ChartPieIcon, modulo: "vaf" },
      { type: "link", to: "/app/empresas", label: "Empresas", icon: BuildingStorefrontIcon, modulo: "empresas" },
      { type: "link", to: "/app/estban", label: "Bancos", icon: BuildingOfficeIcon, modulo: "estban" },
      { type: "link", to: "/app/comex", label: "Comércio Exterior", icon: GlobeAltIcon, modulo: "comex" },
      { type: "link", to: "/app/pix", label: "PIX", icon: BanknotesIcon, modulo: "pix" },
      {
        type: "group", label: "Emprego", icon: BriefcaseIcon,
        children: [
          { to: "/app/caged", label: "CAGED", icon: BriefcaseIcon, modulo: "caged" },
          { to: "/app/rais", label: "RAIS", icon: BuildingLibraryIcon, modulo: "rais" },
        ],
      },
      {
        type: "group", label: "Fiscal", icon: BanknotesIcon,
        children: [
          { to: "/app/arrecadacao", label: "Arrecadação", icon: BanknotesIcon, modulo: "arrecadacao" },
          { to: "/app/fpm", label: "FPM", icon: BanknotesIcon },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "Desenv. Empresarial",
    items: [
      { type: "link", to: "/app/desenvolvimento-economico/retencao", label: "Inteligência Empresarial", icon: BuildingOffice2Icon, modulo: "desenvolvimento_economico.retencao" },
      { type: "link", to: "/app/desenvolvimento-economico/funil", label: "Atração de Investimentos", icon: FunnelIcon, modulo: "desenvolvimento_economico.funil" },
      {
        type: "group", label: "Programas & Premiações", icon: TrophyIcon,
        children: [
          { to: "/app/desenvolvimento-economico/premiacoes", label: "Premiações", icon: TrophyIcon, modulo: "desenvolvimento_economico.premiacoes" },
          { to: "/app/desenvolvimento-economico/captacao", label: "Captação de Recursos", icon: BanknotesIcon, modulo: "desenvolvimento_economico.captacao" },
          { to: "/app/desenvolvimento-economico/escrita", label: "Escrita de Projetos", icon: PencilSquareIcon, modulo: "desenvolvimento_economico.escrita" },
          { to: "/app/dinheiro-na-mesa", label: "Dinheiro na Mesa", icon: BanknotesIcon, modulo: "captacao_federal" },
          { to: "/app/emendas", label: "Emendas", icon: BuildingLibraryIcon, modulo: "emendas" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "Gestão",
    items: [
      { type: "link", to: "/app/projetos", label: "Projetos", icon: FolderOpenIcon, modulo: "projetos" },
      { type: "link", to: "/app/dados-internos/plano-gov", label: "Plano de Governo", icon: ClipboardDocumentListIcon, modulo: "dados_internos.plano_gov" },
      { type: "link", to: "/app/timeline", label: "Memória Institucional", icon: CalendarDaysIcon, modulo: "timeline_mandato" },
      { type: "link", to: "/app/dados-internos/calendario", label: "Calendário", icon: CalendarIcon, modulo: "dados_internos.calendario" },
      { type: "link", to: "/app/impacto", label: "Impacto de Ações", icon: BoltIcon, modulo: "impacto" },
      { type: "link", to: "/app/releases", label: "Releases", icon: NewspaperIcon, modulo: "releases", hideForAdmin: true },
    ],
  },
];

// Lista plana de tudo que é navegável (links + filhos de grupo) — mapeia a
// rota atual para seu módulo (teaser de bloqueio por plano no layout).
export const NAV_FLAT = NAV_STRUCTURE.flatMap((section) =>
  section.items.flatMap((item) =>
    item.type === "group" ? item.children : item.type === "link" ? [item] : []
  )
);

export function isChildActive(children, pathname) {
  return children.some(
    (c) => pathname === c.to || (c.to !== "/" && pathname.startsWith(c.to))
  );
}

// Semântica idêntica ao isLocked que vivia no DashboardLayout: global,
// catálogo ainda não carregado (null) ou item sem chave nunca bloqueiam.
export function isModuloLocked({ isGlobal, modulos, modulo }) {
  if (isGlobal || modulos === null || modulo == null) return false;
  return !modulos.includes(modulo);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/layouts/navStructure.test.js`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/app/layouts/navStructure.jsx frontend-observatorio/src/app/layouts/navStructure.test.js
git commit -m "feat(nav): estrutura de navegacao em 5 eixos como dados puros (navStructure)"
```

---

### Task 2: Componente `SidebarNav` + testes de comportamento

**Files:**
- Create: `frontend-observatorio/src/app/layouts/SidebarNav.jsx`
- Test: `frontend-observatorio/src/app/layouts/SidebarNav.test.jsx`

**Interfaces:**
- Consumes (da Task 1): `NAV_STRUCTURE`, `isChildActive(children, pathname)`, `isModuloLocked({ isGlobal, modulos, modulo })` de `./navStructure`; `temPermissaoAdmin(user)` de `../../hooks/usePermissao` (já existe).
- Produces (Task 3 depende): `export default function SidebarNav({ user, modulos })` — precisa estar dentro de um Router (usa `useLocation`/`NavLink`). `modulos` é `string[] | null` (null = plano ainda não carregado → nada bloqueado), mesmo valor que o `DashboardLayout` guarda hoje em `setModulos`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `frontend-observatorio/src/app/layouts/SidebarNav.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SidebarNav from "./SidebarNav";

const LOCK_TITLE = "Recurso bloqueado — disponível em um plano superior";
const USER_COMUM = { role: "SECRETARIO", permissoes: {} };
const USER_ADMIN_MUN = { role: "SECRETARIO", permissoes: { usuarios: ["criar"] } };
const USER_GLOBAL = { role: "ADMIN_GLOBAL" };

function renderNav({ user = USER_COMUM, modulos = null, route = "/app" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SidebarNav user={user} modulos={modulos} />
    </MemoryRouter>
  );
}

describe("SidebarNav — seções", () => {
  it("renderiza os 5 headers de seção na ordem do design (sem Admin p/ usuário comum)", () => {
    const { container } = renderNav();
    const headers = [...container.querySelectorAll(".nid-nav-section")].map(
      (el) => el.textContent
    );
    expect(headers).toEqual([
      "Visão Executiva",
      "Indicadores Internos",
      "Dados Econômicos",
      "Desenv. Empresarial",
      "Gestão",
    ]);
  });
});

describe("SidebarNav — grupos colapsáveis", () => {
  it("grupo abre automaticamente quando a rota ativa é um filho", () => {
    renderNav({ route: "/app/caged" });
    expect(screen.getByText("CAGED")).toBeInTheDocument();
    expect(screen.getByText("RAIS")).toBeInTheDocument(); // mesmo grupo Emprego
    expect(screen.queryByText("Arrecadação")).toBeNull(); // Fiscal continua fechado
  });

  it("clique no header do grupo abre e fecha os filhos", () => {
    renderNav({ route: "/app" });
    expect(screen.queryByText("IPS")).toBeNull();
    fireEvent.click(screen.getByText("Contexto Socioeconômico"));
    expect(screen.getByText("IPS")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Contexto Socioeconômico"));
    expect(screen.queryByText("IPS")).toBeNull();
  });
});

describe("SidebarNav — cadeado de plano", () => {
  it("link de seção fora do plano fica visível com tooltip de bloqueio", () => {
    renderNav({ modulos: ["geral"], route: "/app" });
    const pib = screen.getByText("PIB").closest("a");
    expect(pib).toHaveAttribute("title", LOCK_TITLE);
    const central = screen.getByText("Central de Inteligência").closest("a");
    expect(central).not.toHaveAttribute("title");
  });

  it("filho de grupo fora do plano também mostra o bloqueio", () => {
    renderNav({ modulos: ["geral"], route: "/app/caged" });
    const caged = screen.getByText("CAGED").closest("a");
    expect(caged).toHaveAttribute("title", LOCK_TITLE);
  });

  it("ADMIN_GLOBAL nunca vê cadeado", () => {
    renderNav({ user: USER_GLOBAL, modulos: ["geral"], route: "/app" });
    const pib = screen.getByText("PIB").closest("a");
    expect(pib).not.toHaveAttribute("title");
  });
});

describe("SidebarNav — visibilidade por papel", () => {
  it("Releases some para ADMIN_GLOBAL e aparece para usuário comum", () => {
    const { unmount } = renderNav({ user: USER_GLOBAL });
    expect(screen.queryByText("Releases")).toBeNull();
    unmount();
    renderNav({ user: USER_COMUM });
    expect(screen.getByText("Releases")).toBeInTheDocument();
  });

  it("bloco Admin só aparece com permissão", () => {
    const { unmount } = renderNav({ user: USER_COMUM });
    expect(screen.queryByText("Painel Admin")).toBeNull();
    unmount();
    renderNav({ user: USER_ADMIN_MUN });
    expect(screen.getByText("Painel Admin")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/layouts/SidebarNav.test.jsx`
Expected: FAIL — `Cannot find module './SidebarNav'`.

- [ ] **Step 3: Implementar `SidebarNav.jsx`**

Criar `frontend-observatorio/src/app/layouts/SidebarNav.jsx` (conteúdo completo). A mecânica de link/grupo é a que vivia no `DashboardLayout` (linhas 308–398 da versão atual), com duas mudanças: iteração por seção e grupos chaveados por `label` em vez de índice.

```jsx
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ChevronDownIcon,
  Cog6ToothIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { temPermissaoAdmin } from "../../hooks/usePermissao";
import { NAV_STRUCTURE, isChildActive, isModuloLocked } from "./navStructure";

const LOCK_TITLE = "Recurso bloqueado — disponível em um plano superior";

function gruposAtivos(pathname) {
  const open = new Set();
  NAV_STRUCTURE.forEach((section) => {
    section.items.forEach((item) => {
      if (item.type === "group" && isChildActive(item.children, pathname)) {
        open.add(item.label);
      }
    });
  });
  return open;
}

export default function SidebarNav({ user, modulos }) {
  const location = useLocation();
  const isGlobal = user?.role === "ADMIN_GLOBAL";
  const [openGroups, setOpenGroups] = useState(() => gruposAtivos(location.pathname));

  useEffect(() => {
    const ativos = gruposAtivos(location.pathname);
    setOpenGroups((prev) => {
      const faltantes = [...ativos].filter((label) => !prev.has(label));
      if (faltantes.length === 0) return prev;
      const next = new Set(prev);
      faltantes.forEach((label) => next.add(label));
      return next;
    });
  }, [location.pathname]);

  // Itens fora do plano não somem — ficam visíveis com cadeado (teaser de
  // upgrade). Só hideForAdmin remove um item (Releases para ADMIN_GLOBAL).
  const isVisible = (item) => !(item.hideForAdmin && isGlobal);
  const locked = (modulo) => isModuloLocked({ isGlobal, modulos, modulo });

  const toggleGroup = (label) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderLink = (item, extraClass = "") => {
    const Icon = item.icon;
    const itemLocked = locked(item.modulo);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => `nid-nav-item ${extraClass} ${isActive ? "active" : ""}`}
        style={itemLocked ? { opacity: 0.7 } : undefined}
        title={itemLocked ? LOCK_TITLE : undefined}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
        {itemLocked && (
          <LockClosedIcon
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: "var(--text-mute)" }}
          />
        )}
      </NavLink>
    );
  };

  return (
    <nav className="px-3 py-3 space-y-0.5">
      {NAV_STRUCTURE.map((section) => {
        const visiveis = section.items.filter(isVisible);
        if (visiveis.length === 0) return null;
        return (
          <div key={section.label}>
            <p className="nid-nav-section">{section.label}</p>
            {visiveis.map((item) => {
              if (item.type === "link") return renderLink(item);

              const visibleChildren = item.children.filter(isVisible);
              if (visibleChildren.length === 0) return null;
              const Icon = item.icon;
              const isOpen = openGroups.has(item.label);
              const hasActive = isChildActive(visibleChildren, location.pathname);

              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className="nid-nav-item"
                    style={hasActive ? { color: "var(--text)" } : undefined}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                    <ChevronDownIcon
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="nid-nav-children space-y-0.5">
                      {visibleChildren.map((child) => renderLink(child, "nid-nav-child"))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {temPermissaoAdmin(user) && (
        <div className="pt-3 mt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="nid-nav-section">Admin</p>
          <NavLink
            to="/admin"
            className={({ isActive }) => `nid-nav-item ${isActive ? "active" : ""}`}
          >
            <Cog6ToothIcon className="w-4 h-4 flex-shrink-0" />
            Painel Admin
          </NavLink>
        </div>
      )}
    </nav>
  );
}
```

Nota: o espaçamento entre seções vem do `padding: 14px 10px 6px` que `.nid-nav-section` já tem em `themes.css` — nenhuma mudança de CSS é necessária.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/layouts/SidebarNav.test.jsx`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/app/layouts/SidebarNav.jsx frontend-observatorio/src/app/layouts/SidebarNav.test.jsx
git commit -m "feat(nav): componente SidebarNav com secoes, grupos e cadeado de plano"
```

---

### Task 3: Religar o `DashboardLayout` na nova navegação

**Files:**
- Modify: `frontend-observatorio/src/app/layouts/DashboardLayout.jsx` (referências de linha abaixo são da versão ATUAL do arquivo, antes desta task)

**Interfaces:**
- Consumes: `SidebarNav` (Task 2); `NAV_FLAT` e `isModuloLocked` (Task 1).
- Produces: nada novo — o layout continua exportando o mesmo default; a sidebar nova entra no ar nesta task.

- [ ] **Step 1: Substituir dados e helpers locais pelos imports**

No topo do arquivo:
1. **Remover** da lista de imports de `@heroicons/react/24/outline` todos os ícones EXCETO: `PowerIcon`, `KeyIcon`, `XMarkIcon`, `Bars3Icon`, `SwatchIcon` (os demais agora vivem em `navStructure.jsx`/`SidebarNav.jsx`).
2. **Remover** `import { temPermissaoAdmin } from "../../hooks/usePermissao";` (só o bloco Admin usava, e ele foi para o `SidebarNav`).
3. **Adicionar**:

```jsx
import SidebarNav from "./SidebarNav";
import { NAV_FLAT, isModuloLocked } from "./navStructure";
```

4. **Deletar** as declarações locais `NAV_STRUCTURE` (linhas 50–112), `NAV_FLAT` (linhas 114–118) e `isChildActive` (linhas 120–124).

- [ ] **Step 2: Simplificar o estado do componente**

Dentro de `DashboardLayout()`:
1. **Deletar** o estado `openGroups` (linhas 211–219) e a função `toggleGroup` (linhas 266–273) — foram para o `SidebarNav`.
2. **Substituir** o efeito das linhas 221–233 (que fechava a sidebar mobile E abria grupos) por só o fechamento mobile:

```jsx
useEffect(() => {
  setSidebarOpen(false);
}, [location.pathname]);
```

3. **Deletar** `isVisible` e `isLocked` (linhas 248–258, incluindo o comentário) e **substituir** o cálculo de `currentLocked` (linhas 260–264) por:

```jsx
// Módulo da rota atual → decide o teaser de bloqueio na área de conteúdo.
const currentNav = NAV_FLAT
  .filter((n) => n.to && (location.pathname === n.to || location.pathname.startsWith(n.to + "/")))
  .sort((a, b) => b.to.length - a.to.length)[0];
const currentLocked = currentNav
  ? isModuloLocked({ isGlobal, modulos, modulo: currentNav.modulo })
  : false;
```

- [ ] **Step 3: Substituir o JSX da nav**

Em `sidebarContent`, **substituir** o bloco `<nav className="px-3 py-3 space-y-0.5"> … </nav>` inteiro (linhas 307–398, inclui o bloco Admin) por:

```jsx
{/* Nav */}
<SidebarNav user={user} modulos={modulos} />
```

Nada mais muda: logo, footer (ThemePicker/senha/logout), header, `ViewAsBanner`, `PlanContext.Provider`, `PlanLockedView` e `AlterarSenhaModal` ficam intocados.

- [ ] **Step 4: Rodar a suite completa**

Run: `npx vitest run`
Expected: PASS — 221 testes antigos + 14 novos (Tasks 1–2), zero falhas. Se algum teste antigo falhar, a causa provável é import/ícone esquecido no passo 1 — corrigir antes de seguir.

- [ ] **Step 5: Smoke manual mínimo**

Run: `npm run dev` e abrir o app logado.
Verificar: 5 seções na ordem; navegar para `/app/caged` abre o grupo Emprego; item fora do plano mostra cadeado; sidebar mobile fecha ao navegar. Encerrar o dev server.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/app/layouts/DashboardLayout.jsx
git commit -m "refactor(nav): DashboardLayout consome SidebarNav/navStructure — sidebar 5 eixos no ar"
```

---

### Task 4: Renomear títulos das páginas + card do Painel + teste estático de títulos

**Files:**
- Modify: `frontend-observatorio/src/pages/DashboardGeralPage.jsx:239`
- Modify: `frontend-observatorio/src/pages/timeline/TimelinePage.jsx:32`
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx:207-214`
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx:224-231`
- Modify: `frontend-observatorio/src/pages/dados-internos/IndicadoresInternosPage.jsx:305`
- Modify: `frontend-observatorio/src/components/FunilResumoCard.jsx:34`
- Modify: `frontend-observatorio/src/components/FunilResumoCard.test.jsx:67`
- Test: `frontend-observatorio/src/pages/titulosPaginas.test.js` (novo)

**Interfaces:**
- Consumes: nada das tasks anteriores (independente; pode rodar em paralelo à Task 3).
- Produces: títulos novos que o teste estático congela.

- [ ] **Step 1: Escrever o teste estático de títulos (falhando)**

Criar `frontend-observatorio/src/pages/titulosPaginas.test.js` — teste por fonte (fs), mesmo padrão dos testes de paridade do `indicadorCatalog`; roda em ambiente node, sem montar componente:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ler = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// [arquivo, título novo obrigatório, título antigo proibido (null = sem checagem
// de ausência — "Retenção"/"Indicadores" aparecem legitimamente em outros
// pontos desses arquivos)]
const CASOS = [
  ["./DashboardGeralPage.jsx", "Central de Inteligência Econômica", "Dashboard Geral"],
  ["./timeline/TimelinePage.jsx", "Memória Institucional", "Timeline do Mandato"],
  ["./desenvolvimento-economico/FunilTab.jsx", "Atração de Investimentos", "Funil de Investimentos"],
  ["./desenvolvimento-economico/RetencaoTab.jsx", "Inteligência Empresarial", null],
  ["./dados-internos/IndicadoresInternosPage.jsx", "Cidade Inteligente", "Indicadores Internos\n"],
];

describe("Títulos das páginas renomeadas (Fase 1 — 5 eixos)", () => {
  it.each(CASOS)("%s usa o título novo", (arquivo, novo) => {
    expect(ler(arquivo)).toContain(novo);
  });

  it.each(CASOS.filter(([, , antigo]) => antigo))(
    "%s não usa mais o título antigo",
    (arquivo, _novo, antigo) => {
      expect(ler(arquivo)).not.toContain(antigo);
    }
  );

  it("FunilResumoCard acompanha o nome novo da página de destino", () => {
    const src = ler("../components/FunilResumoCard.jsx");
    expect(src).toContain('title="Atração de Investimentos"');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/pages/titulosPaginas.test.js`
Expected: FAIL — asserções de "título novo" (nenhum arquivo tem os títulos ainda).

- [ ] **Step 3: Aplicar as renomeações**

1. `DashboardGeralPage.jsx` linha 239 — no `NidPageHeader`:

```jsx
title="Central de Inteligência Econômica"
```

(`sub="Indicadores econômicos consolidados do município"` fica como está.)

2. `TimelinePage.jsx` linha 32 — texto do `<h1>`:

```jsx
Memória Institucional
```

(O subtítulo da linha 43, "Marcos e eventos relevantes do mandato municipal.", já cumpre a spec — não mudar.)

3. `FunilTab.jsx` linhas 210–212 — texto do `<h1>`:

```jsx
<h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
  Atração de Investimentos
</h1>
```

4. `RetencaoTab.jsx` linhas 224–231 — o `header` ganha o título novo + subtítulo honesto sobre o recorte atual (spec: fusão real só na Fase 3):

```jsx
const header = (
  <div className="flex items-center gap-3">
    <BuildingOffice2Icon className="w-7 h-7 text-blue-600" />
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
        Inteligência Empresarial & Relacionamento
      </h1>
      <p className="text-xs mt-0.5 text-[var(--text-dim)]">
        Acompanhamento de empresas instaladas — retenção e expansão.
      </p>
    </div>
  </div>
);
```

5. `IndicadoresInternosPage.jsx` linha 305 — texto do `<h1>`:

```jsx
Indicadores & Cidade Inteligente
```

(Subtítulo da linha 308 fica como está.)

6. `FunilResumoCard.jsx` linha 34 — o card do Painel do Prefeito aponta para a página renomeada; o título acompanha para não divergir:

```jsx
title="Atração de Investimentos"
```

(`sub="Oportunidades em captação"` e o link `Ver funil →` ficam como estão.)

7. `FunilResumoCard.test.jsx` linha 67 — atualizar a expectativa:

```jsx
await waitFor(() => expect(screen.getByText("Atração de Investimentos")).toBeTruthy());
```

- [ ] **Step 4: Rodar o teste novo e a suite completa**

Run: `npx vitest run src/pages/titulosPaginas.test.js`
Expected: PASS (10 testes: 5 de título novo + 4 de título antigo ausente + 1 do card).

Run: `npx vitest run`
Expected: PASS — zero falhas (o único teste antigo afetado era o do FunilResumoCard, atualizado no passo 3.7).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/DashboardGeralPage.jsx frontend-observatorio/src/pages/timeline/TimelinePage.jsx frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx frontend-observatorio/src/pages/dados-internos/IndicadoresInternosPage.jsx frontend-observatorio/src/components/FunilResumoCard.jsx frontend-observatorio/src/components/FunilResumoCard.test.jsx frontend-observatorio/src/pages/titulosPaginas.test.js
git commit -m "feat(nav): titulos das paginas acompanham os nomes novos dos 5 eixos"
```

---

### Task 5: Verificação final (suite + lint comparativo)

**Files:**
- Nenhum arquivo novo; só verificação. Commit apenas se algo precisar de correção.

**Interfaces:**
- Consumes: tudo das Tasks 1–4.
- Produces: Fase 1 pronta para o checklist visual do usuário.

- [ ] **Step 1: Suite completa do frontend**

Run: `npx vitest run`
Expected: PASS, ~245 testes (221 baseline + 24 novos: 6 navStructure, 8 SidebarNav, 10 títulos), zero falhas.

- [ ] **Step 2: Lint comparativo dos arquivos tocados**

O lint do repo inteiro JÁ FALHA (débito pré-existente) — o critério é "nenhum erro NOVO nos arquivos tocados". Arquivos novos devem sair limpos; modificados não podem piorar:

```bash
cd frontend-observatorio
# Novos: precisam sair com zero erros
npx eslint src/app/layouts/navStructure.jsx src/app/layouts/SidebarNav.jsx src/app/layouts/navStructure.test.js src/app/layouts/SidebarNav.test.jsx src/pages/titulosPaginas.test.js
# Modificados: comparar contagem de erros com a versão base
for f in src/app/layouts/DashboardLayout.jsx src/pages/DashboardGeralPage.jsx src/pages/timeline/TimelinePage.jsx src/pages/desenvolvimento-economico/FunilTab.jsx src/pages/desenvolvimento-economico/RetencaoTab.jsx src/pages/dados-internos/IndicadoresInternosPage.jsx src/components/FunilResumoCard.jsx src/components/FunilResumoCard.test.jsx; do
  echo "== $f =="
  git show "HEAD~4:frontend-observatorio/$f" 2>/dev/null | npx eslint --stdin --stdin-filename "$f" | tail -1
  npx eslint "$f" | tail -1
done
```

(`HEAD~4` = commit base antes das 4 tasks; ajustar o número se a contagem de commits divergir — o alvo é o commit anterior ao primeiro desta fase.)
Expected: novos com zero erros; modificados com contagem ≤ à da versão base. Se um arquivo piorou, corrigir o erro novo e commitar `fix(nav): lint do arquivo X`.

- [ ] **Step 3: Confirmação de que nada saiu da navegação**

Run: `npx vitest run src/app/layouts/navStructure.test.js`
Expected: PASS — reconfirma as 31 rotas e as 30 chaves de plano congeladas.

- [ ] **Step 4: Relatar pendência do usuário**

Sem commit. Registrar no relato final: checklist visual do usuário (5 seções nos 5 temas de cor, mobile off-canvas, cadeados de plano free/pro, view-as) e push/deploy são dele.
