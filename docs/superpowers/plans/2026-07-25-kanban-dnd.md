# Drag-and-drop nos 4 kanbans (ciclo 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrastar cards entre estágios nos 4 kanbans (Captação, Funil, Escrita, Projetos) com atualização otimista e reversão em erro, embutindo os residuais do ciclo 1 (a11y de teclado nos títulos, colSpan condicional, EstagioPill extraída, `detail` no toast de erro).

**Architecture:** `@dnd-kit/core` (única dependência nova) com primitivas finas compartilhadas em `components/kanban/`; cada tab mantém seu próprio markup de card e ganha um `moverCard` que unifica DnD e select num fluxo otimista. Zero backend.

**Tech Stack:** React 19 + Vite, TailwindCSS, @dnd-kit/core ^6, vitest (helpers puros), axios via `services/api`.

**Spec:** `docs/superpowers/specs/2026-07-25-kanban-dnd-design.md`

## Global Constraints

- Única dependência nova: `@dnd-kit/core`. **NÃO** instalar `@dnd-kit/sortable` (reordenação está fora do escopo).
- Zero mudança de backend, zero migration.
- O select de estágio nos cards **permanece** (fallback mobile/teclado) e passa a chamar `moverCard`.
- **Sem** `KeyboardSensor` do dnd-kit (o caminho de teclado é o select; Enter no título abre o modal).
- Sensores: `PointerSensor` com `activationConstraint: { distance: 8 }`; `TouchSensor` com `{ delay: 200, tolerance: 8 }`.
- Toast de sucesso: `"Estágio atualizado"` (Projetos: `"Status atualizado"`). Toast de erro: `err?.response?.data?.detail || "Erro ao atualizar estágio"` (Projetos: `... || "Erro ao atualizar status"`).
- Layouts preservados: Captação/Escrita 4 colunas, Funil linhas horizontais, Projetos 3 colunas. Sem dedup de board entre tabs.
- Gates de cada task: `npm run test` (vitest) exit 0 e `npm run build` exit 0, rodados de `frontend-observatorio/`. Eslint tem baseline sujo conhecido ("motion unused" e set-state-in-effect são falsos-positivos endêmicos) — não é gate.
- Working dir do frontend: `frontend-observatorio/`. Commits pequenos e frequentes, escopo `feat(kanban):`/`fix(kanban):`.
- NÃO commitar WIP do usuário: `.claude/settings.local.json`, `README.md`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`, `IDEAS.md`.

---

### Task 1: Branch + helpers puros (`kanbanMove` e `cliqueAcessivel`) — TDD

**Files:**
- Create: `frontend-observatorio/src/utils/kanbanMove.js`
- Create: `frontend-observatorio/src/utils/kanbanMove.test.js`
- Create: `frontend-observatorio/src/utils/cliqueAcessivel.js`
- Create: `frontend-observatorio/src/utils/cliqueAcessivel.test.js`

**Interfaces:**
- Consumes: nada (funções puras).
- Produces:
  - `aplicarMovimento(items: Array<{id, ...}>, id: number, campo: string, valor: string) => Array` — retorna **novo array** com o item `id` tendo `campo` = `valor`; retorna o **mesmo array (mesma referência)** quando `id` não existe ou o valor já é o atual (no-op). Não muta entradas; itens não afetados mantêm a mesma referência.
  - `propsTituloClicavel(abrir: () => void) => { role, tabIndex, onClick, onKeyDown }` — props para tornar título clicável acessível: `role="button"`, `tabIndex={0}`, `onClick` chama `abrir`, `onKeyDown` chama `abrir` com `preventDefault()` em Enter/Espaço.

- [ ] **Step 1: Criar a branch a partir do main**

```bash
git checkout main
git checkout -b feat/kanban-dnd
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `frontend-observatorio/src/utils/kanbanMove.test.js`:

```js
import { describe, it, expect } from "vitest";
import { aplicarMovimento } from "./kanbanMove";

const base = [
  { id: 1, estagio: "lead", empresa_nome: "A" },
  { id: 2, estagio: "contato", empresa_nome: "B" },
];

describe("aplicarMovimento", () => {
  it("move item para outro estágio", () => {
    const out = aplicarMovimento(base, 1, "estagio", "negociacao");
    expect(out.find((i) => i.id === 1).estagio).toBe("negociacao");
    expect(out.find((i) => i.id === 2).estagio).toBe("contato");
  });

  it("funciona com campo status (Projetos)", () => {
    const projetos = [{ id: 7, status: "nao_iniciado" }];
    const out = aplicarMovimento(projetos, 7, "status", "concluido");
    expect(out[0].status).toBe("concluido");
  });

  it("retorna o MESMO array quando o valor não muda (no-op)", () => {
    expect(aplicarMovimento(base, 1, "estagio", "lead")).toBe(base);
  });

  it("retorna o MESMO array quando o id não existe", () => {
    expect(aplicarMovimento(base, 999, "estagio", "contato")).toBe(base);
  });

  it("não muta o array nem os objetos originais; preserva referência dos não afetados", () => {
    const antes = JSON.parse(JSON.stringify(base));
    const out = aplicarMovimento(base, 1, "estagio", "implantacao");
    expect(base).toEqual(antes);
    expect(out).not.toBe(base);
    expect(out.find((i) => i.id === 2)).toBe(base.find((i) => i.id === 2));
  });
});
```

Criar `frontend-observatorio/src/utils/cliqueAcessivel.test.js`:

```js
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
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd frontend-observatorio && npm run test
```

Expected: FAIL — `Cannot find module './kanbanMove'` (e `./cliqueAcessivel`).

- [ ] **Step 4: Implementar**

Criar `frontend-observatorio/src/utils/kanbanMove.js`:

```js
// Movimento otimista dos kanbans: novo array com o item movido, ou o array
// original (mesma referência) quando o movimento é um no-op — o caller usa
// a identidade para pular request/re-render.
export function aplicarMovimento(items, id, campo, valor) {
  const item = items.find((i) => i.id === id);
  if (!item || item[campo] === valor) return items;
  return items.map((i) => (i.id === id ? { ...i, [campo]: valor } : i));
}
```

Criar `frontend-observatorio/src/utils/cliqueAcessivel.js`:

```js
// Props para título clicável acessível por teclado (Enter/Espaço = clique).
export function propsTituloClicavel(abrir) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: abrir,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir();
      }
    },
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd frontend-observatorio && npm run test
```

Expected: PASS — 41 testes (32 existentes + 9 novos), exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/utils/kanbanMove.js frontend-observatorio/src/utils/kanbanMove.test.js frontend-observatorio/src/utils/cliqueAcessivel.js frontend-observatorio/src/utils/cliqueAcessivel.test.js
git commit -m "feat(kanban): helpers puros de movimento otimista e clique acessivel"
```

---

### Task 2: Dependência @dnd-kit/core + primitivas compartilhadas

**Files:**
- Modify: `frontend-observatorio/package.json` (via npm install)
- Create: `frontend-observatorio/src/components/kanban/KanbanDndContext.jsx`
- Create: `frontend-observatorio/src/components/kanban/DraggableCard.jsx`
- Create: `frontend-observatorio/src/components/kanban/DroppableColumn.jsx`
- Create: `frontend-observatorio/src/components/kanban/EstagioPill.jsx`

**Interfaces:**
- Consumes: `@dnd-kit/core` (`DndContext`, `DragOverlay`, `PointerSensor`, `TouchSensor`, `useSensor`, `useSensors`, `useDraggable`, `useDroppable`).
- Produces (usados nas Tasks 3–6):
  - `<KanbanDndContext items campo onMove renderOverlay>children</KanbanDndContext>` — `items`: array de objetos com `id`; `campo`: `"estagio"` ou `"status"`; `onMove(id, novoValor)`: chamado só quando o drop é em zona diferente do valor atual; `renderOverlay(item) => JSX`: ghost do card.
  - `<DraggableCard id disabled>children</DraggableCard>` — `id` = item.id; `disabled` = `!canEditar`.
  - `<DroppableColumn id disabled className style>children</DroppableColumn>` — `id` = valor do estágio/status; realce quando `isOver`.
  - `<EstagioPill label color />` (Funil: `color` é valor CSS tipo `"#f59e0b"`) ou `<EstagioPill label className />` (Captação/Escrita: `className` é string Tailwind tipo `"bg-[var(--panel-2)] text-amber-400"`).

- [ ] **Step 1: Instalar a dependência**

```bash
cd frontend-observatorio && npm install @dnd-kit/core
```

Expected: `package.json` ganha `"@dnd-kit/core"` em dependencies; exit 0.

- [ ] **Step 2: Criar `KanbanDndContext.jsx`**

```jsx
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

// Contexto de drag-and-drop dos kanbans. `campo` é a propriedade do item que
// as zonas representam ("estagio" ou "status"); onMove(id, novoValor) só
// dispara quando o card é solto numa zona diferente do valor atual do item.
// Sem KeyboardSensor de propósito: o caminho de teclado é o select do card.
export default function KanbanDndContext({ items, campo, onMove, renderOverlay, children }) {
  const [activeItem, setActiveItem] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  function handleDragStart({ active }) {
    setActiveItem(items.find((i) => i.id === active.id) || null);
  }

  function handleDragEnd({ active, over }) {
    setActiveItem(null);
    if (!over) return;
    const item = items.find((i) => i.id === active.id);
    if (!item || item[campo] === over.id) return;
    onMove(active.id, over.id);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveItem(null)}
    >
      {children}
      <DragOverlay>
        {activeItem ? <div className="rotate-2 shadow-2xl">{renderOverlay(activeItem)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
```

- [ ] **Step 3: Criar `DraggableCard.jsx`**

```jsx
import { useDraggable } from "@dnd-kit/core";

// Torna o card arrastável. Não espalha `attributes` do useDraggable de
// propósito: sem KeyboardSensor, role/tabIndex criariam um alvo de foco
// que não faz nada (o título dentro do card tem o próprio role="button").
export default function DraggableCard({ id, disabled = false, children }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      style={{ touchAction: "manipulation" }}
      className={disabled ? undefined : `cursor-grab ${isDragging ? "opacity-40" : ""}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Criar `DroppableColumn.jsx`**

```jsx
import { useDroppable } from "@dnd-kit/core";

// Zona de soltar de um estágio/status. `id` é o valor que a zona representa.
export default function DroppableColumn({ id, disabled = false, className = "", style, children }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl transition-colors ${isOver ? "ring-2 ring-blue-500/60 bg-blue-500/5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Criar `EstagioPill.jsx`**

```jsx
// Pill de estágio compartilhada pelos kanbans.
// Funil passa `color` (valor CSS, ex.: "#f59e0b"); Captação/Escrita passam
// `className` (classes Tailwind, ex.: "bg-[var(--panel-2)] text-amber-400").
export default function EstagioPill({ label, color, className = "" }) {
  if (color) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={{ background: "var(--panel-2)", color }}
      >
        {label}
      </span>
    );
  }
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${className}`}>{label}</span>;
}
```

- [ ] **Step 6: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 41 testes PASS; build exit 0 (componentes ainda sem uso — tree-shaken, sem erro).

- [ ] **Step 7: Commit**

```bash
git add frontend-observatorio/package.json frontend-observatorio/package-lock.json frontend-observatorio/src/components/kanban/
git commit -m "feat(kanban): @dnd-kit/core + primitivas compartilhadas de DnD e EstagioPill"
```

---

### Task 3: CaptacaoTab — DnD + moverCard + residuais

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx`

**Interfaces:**
- Consumes: `KanbanDndContext`, `DraggableCard`, `DroppableColumn`, `EstagioPill` (Task 2); `aplicarMovimento`, `propsTituloClicavel` (Task 1).
- Produces: nada (folha).

- [ ] **Step 1: Adicionar imports**

Depois de `import { emendaParaCaptacaoPayload } from "../../utils/emendaCaptacao";` (linha 24), adicionar:

```jsx
import KanbanDndContext from "../../components/kanban/KanbanDndContext";
import DraggableCard from "../../components/kanban/DraggableCard";
import DroppableColumn from "../../components/kanban/DroppableColumn";
import EstagioPill from "../../components/kanban/EstagioPill";
import { aplicarMovimento } from "../../utils/kanbanMove";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";
```

- [ ] **Step 2: Ghost do card (nível de módulo)**

Depois da função `tipoCurto` (linha 65), adicionar:

```jsx
function renderOverlayCaptacao(item) {
  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-1 w-64">
      <span className="inline-block text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
        {TIPO_LABEL[item.tipo] || item.tipo}
      </span>
      <h4 className="font-medium text-[var(--text)] text-sm leading-snug">{item.titulo}</h4>
      {fmtMoeda(item.valor_estimado) && (
        <p className="text-xs font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado)}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Substituir `handleEstagioChange` por `moverCard`**

Substituir a função inteira (linhas 187–195):

```jsx
async function moverCard(id, novoEstagio) {
  const anterior = items;
  const otimista = aplicarMovimento(items, id, "estagio", novoEstagio);
  if (otimista === anterior) return;
  setItems(otimista);
  try {
    await api.put(`/desenvolvimento-economico/captacao/${id}`, { estagio: novoEstagio });
    addToast("Estágio atualizado", "success");
    await load();
  } catch (err) {
    setItems(anterior);
    addToast(err?.response?.data?.detail || "Erro ao atualizar estágio", "error");
  }
}
```

- [ ] **Step 4: Envolver o board com DnD**

O bloco do kanban (após `{items.length === 0 ? ( ... ) : (`, linhas 298–370) muda de `<div className="grid ...">` para (mudanças: wrapper `KanbanDndContext`, coluna vira `DroppableColumn`, card envolto em `DraggableCard`, título com `propsTituloClicavel` + classes de foco, select chama `moverCard`):

```jsx
<KanbanDndContext items={items} campo="estagio" onMove={moverCard} renderOverlay={renderOverlayCaptacao}>
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
    {ESTAGIOS.map((estagio) => {
      const cfg = ESTAGIO_CONFIG[estagio];
      const cols = items.filter((i) => i.estagio === estagio);
      return (
        <div key={estagio} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <h3 className="font-semibold text-[var(--text-dim)] text-sm">{cfg.label}</h3>
            <span className="ml-auto text-xs text-[var(--text-mute)] bg-[var(--panel-2)] px-2 py-0.5 rounded-full">{cols.length}</span>
          </div>
          <DroppableColumn id={estagio} disabled={!canEditar} className="space-y-3 min-h-[80px]">
            {cols.map((item) => (
              <DraggableCard key={item.id} id={item.id} disabled={!canEditar}>
                <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-2.5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="inline-block text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded mb-1">
                        {TIPO_LABEL[item.tipo] || item.tipo}
                      </span>
                      <h4
                        className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        {...propsTituloClicavel(() => setViewingItem(item))}
                      >
                        {item.titulo}
                      </h4>
                    </div>
                    {(canEditar || canExcluir) && (
                      <div className="flex gap-1 shrink-0">
                        {canEditar && (
                          <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-blue-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canExcluir && (
                          <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-red-400 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-slate-400">
                    {item.entidade_origem && <span>{item.entidade_origem}</span>}
                    {item.valor_estimado && <span className="font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado)}</span>}
                    {item.prazo && (
                      <span className={`flex items-center gap-1 ${isVencendoEm30(item.prazo) ? "text-amber-600 font-medium" : ""}`}>
                        <CalendarDaysIcon className="w-3.5 h-3.5" /> {fmtDate(item.prazo)}
                      </span>
                    )}
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                        <LinkIcon className="w-3.5 h-3.5" /> Ver edital
                      </a>
                    )}
                  </div>
                  {canEditar && (
                    <div className="pt-1.5 border-t border-[var(--border)]">
                      <select
                        value={item.estagio}
                        onChange={(e) => moverCard(item.id, e.target.value)}
                        className="w-full text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--panel-2)] text-[var(--text)] cursor-pointer"
                      >
                        {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </DraggableCard>
            ))}
            {cols.length === 0 && (
              <div className="h-20 border-2 border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-xs text-[var(--text-mute)]">
                Vazio
              </div>
            )}
          </DroppableColumn>
        </div>
      );
    })}
  </div>
</KanbanDndContext>
```

- [ ] **Step 5: Tabela — a11y do título, colSpan condicional e EstagioPill**

Na view de tabela:

1. Empty row (linha 391): `colSpan={7}` → `colSpan={6 + ((canEditar || canExcluir) ? 1 : 0)}`.
2. Célula do título (linha 397) vira:

```jsx
<td
  className="px-4 py-2.5 font-medium text-[var(--text)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  {...propsTituloClicavel(() => setViewingItem(item))}
>
  {item.titulo}
</td>
```

3. Célula do estágio (linha 402) vira:

```jsx
<td className="px-4 py-2.5"><EstagioPill label={cfg.label} className={cfg.color} /></td>
```

- [ ] **Step 6: Modal de detalhes — EstagioPill**

No detail modal (linha 514), substituir
`<span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>`
por:

```jsx
<EstagioPill label={cfg.label} className={cfg.color} />
```

- [ ] **Step 7: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 41 PASS; build exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx
git commit -m "feat(kanban): drag-and-drop otimista na Captacao + a11y titulos, colSpan condicional e EstagioPill"
```

---

### Task 4: EscritaTab — DnD + moverCard + residuais

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx`

**Interfaces:**
- Consumes: mesmos módulos da Task 3.
- Produces: nada (folha).

- [ ] **Step 1: Adicionar imports**

Depois de `import { usePermissao } from "../../hooks/usePermissao";` (linha 17), adicionar:

```jsx
import KanbanDndContext from "../../components/kanban/KanbanDndContext";
import DraggableCard from "../../components/kanban/DraggableCard";
import DroppableColumn from "../../components/kanban/DroppableColumn";
import EstagioPill from "../../components/kanban/EstagioPill";
import { aplicarMovimento } from "../../utils/kanbanMove";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";
```

- [ ] **Step 2: Ghost do card (nível de módulo)**

Depois da função `fmtDate` (linha 52), adicionar:

```jsx
function renderOverlayEscrita(item) {
  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-1 w-64">
      <h4 className="font-medium text-[var(--text)] text-sm leading-snug">{item.titulo}</h4>
      {fmtMoeda(item.valor_pleiteado) && (
        <p className="text-xs font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_pleiteado)}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Substituir `handleEstagioChange` por `moverCard`**

Substituir a função inteira (linhas 163–171):

```jsx
async function moverCard(id, novoEstagio) {
  const anterior = items;
  const otimista = aplicarMovimento(items, id, "estagio", novoEstagio);
  if (otimista === anterior) return;
  setItems(otimista);
  try {
    await api.put(`/desenvolvimento-economico/escrita/${id}`, { estagio: novoEstagio });
    addToast("Estágio atualizado", "success");
    await load();
  } catch (err) {
    setItems(anterior);
    addToast(err?.response?.data?.detail || "Erro ao atualizar estágio", "error");
  }
}
```

- [ ] **Step 4: Envolver o board com DnD**

O bloco do kanban (após `{items.length === 0 ? ( ... ) : (`, linhas 274–345) muda para (mesmo padrão da Task 3; único conteúdo específico: badge da captação vinculada e pill de resultado — que permanece inline por ser pill de *resultado*, não de estágio):

```jsx
<KanbanDndContext items={items} campo="estagio" onMove={moverCard} renderOverlay={renderOverlayEscrita}>
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
    {ESTAGIOS.map((estagio) => {
      const cfg = ESTAGIO_CONFIG[estagio];
      const cols = items.filter((i) => i.estagio === estagio);
      return (
        <div key={estagio} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <h3 className="font-semibold text-[var(--text-dim)] text-sm">{cfg.label}</h3>
            <span className="ml-auto text-xs text-slate-400 bg-[var(--panel-2)] px-2 py-0.5 rounded-full">{cols.length}</span>
          </div>
          <DroppableColumn id={estagio} disabled={!canEditar} className="space-y-3 min-h-[80px]">
            {cols.map((item) => {
              const resCfg = item.resultado ? RESULTADO_CONFIG[item.resultado] : null;
              const cap = captacoes.find((c) => c.id === item.oportunidade_captacao_id);
              return (
                <DraggableCard key={item.id} id={item.id} disabled={!canEditar}>
                  <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-2.5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {cap && (
                          <span className="inline-block text-[10px] font-medium text-[var(--accent-1)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded mb-1">
                            {cap.titulo}
                          </span>
                        )}
                        <h4
                          className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          {...propsTituloClicavel(() => setViewingItem(item))}
                        >
                          {item.titulo}
                        </h4>
                      </div>
                      {(canEditar || canExcluir) && (
                        <div className="flex gap-1 shrink-0">
                          {canEditar && (
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canExcluir && (
                            <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {resCfg && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${resCfg.color}`}>{resCfg.label}</span>
                    )}
                    <div className="flex flex-col gap-1 text-xs text-slate-400">
                      {item.responsavel && <span>{item.responsavel}</span>}
                      {item.valor_pleiteado && <span className="font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_pleiteado)}</span>}
                    </div>
                    {canEditar && (
                      <div className="pt-1.5 border-t border-[var(--border)]">
                        <select
                          value={item.estagio}
                          onChange={(e) => moverCard(item.id, e.target.value)}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--panel-2)] text-[var(--text)] cursor-pointer"
                        >
                          {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </DraggableCard>
              );
            })}
            {cols.length === 0 && (
              <div className="h-20 border-2 border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-xs text-[var(--text-mute)]">
                Vazio
              </div>
            )}
          </DroppableColumn>
        </div>
      );
    })}
  </div>
</KanbanDndContext>
```

- [ ] **Step 5: Tabela — a11y, colSpan e EstagioPill**

1. Empty row (linha 367): `colSpan={8}` → `colSpan={7 + ((canEditar || canExcluir) ? 1 : 0)}`.
2. Célula do título (linha 375) vira:

```jsx
<td
  className="px-4 py-2.5 font-medium text-[var(--text)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  {...propsTituloClicavel(() => setViewingItem(item))}
>
  {item.titulo}
</td>
```

3. Célula do estágio (linha 381) vira (a pill de *resultado* na linha 377 fica como está):

```jsx
<td className="px-4 py-2.5"><EstagioPill label={cfg.label} className={cfg.color} /></td>
```

- [ ] **Step 6: Modal de detalhes — EstagioPill**

No detail modal (linha 424), substituir
`<span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>`
por (a pill de resultado ao lado, linha 425, fica como está):

```jsx
<EstagioPill label={cfg.label} className={cfg.color} />
```

- [ ] **Step 7: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 41 PASS; build exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx
git commit -m "feat(kanban): drag-and-drop otimista na Escrita + a11y titulos, colSpan condicional e EstagioPill"
```

---

### Task 5: FunilTab — DnD entre linhas + moverCard + residuais

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx`

**Interfaces:**
- Consumes: mesmos módulos da Task 3.
- Produces: nada (folha).

Particularidade: o Funil usa **linhas horizontais** por estágio (grid de cards por linha). A `DroppableColumn` envolve o grid da linha inteira — o realce cobre a linha. A pill do Funil usa a variante `color` (hex) da `EstagioPill`.

- [ ] **Step 1: Adicionar imports**

Depois de `import { usePermissao } from "../../hooks/usePermissao";` (linha 20), adicionar:

```jsx
import KanbanDndContext from "../../components/kanban/KanbanDndContext";
import DraggableCard from "../../components/kanban/DraggableCard";
import DroppableColumn from "../../components/kanban/DroppableColumn";
import EstagioPill from "../../components/kanban/EstagioPill";
import { aplicarMovimento } from "../../utils/kanbanMove";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";
```

- [ ] **Step 2: Ghost do card (nível de módulo)**

Depois da função `fmtDate` (linha 49), adicionar:

```jsx
function renderOverlayFunil(item) {
  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-1 w-64">
      <h4 className="font-medium text-[var(--text)] text-sm leading-snug">{item.empresa_nome}</h4>
      {item.setor && <p className="text-xs text-slate-400">{item.setor}</p>}
      {item.valor_estimado && (
        <p className="text-xs font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado)}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Substituir `handleEstagioChange` por `moverCard`**

Substituir a função inteira (linhas 161–169):

```jsx
async function moverCard(id, novoEstagio) {
  const anterior = items;
  const otimista = aplicarMovimento(items, id, "estagio", novoEstagio);
  if (otimista === anterior) return;
  setItems(otimista);
  try {
    await api.put(`/desenvolvimento-economico/funil/${id}`, { estagio: novoEstagio });
    addToast("Estágio atualizado", "success");
    await load();
  } catch (err) {
    setItems(anterior);
    addToast(err?.response?.data?.detail || "Erro ao atualizar estágio", "error");
  }
}
```

- [ ] **Step 4: Envolver as linhas com DnD**

Dentro de `{viewMode === "kanban" && (<> ... </>)}` (linhas 273–353), envolver o `ESTAGIOS.map` com `KanbanDndContext` e trocar o grid interno por `DroppableColumn`. O bloco vira:

```jsx
{viewMode === "kanban" && (
  <>
    <KanbanDndContext items={items} campo="estagio" onMove={moverCard} renderOverlay={renderOverlayFunil}>
      {/* Cards por estágio */}
      {ESTAGIOS.map((estagio) => {
        const cfg = ESTAGIO_CONFIG[estagio];
        const cols = items.filter((i) => i.estagio === estagio);
        return (
          <div key={estagio} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
              <h3 className="font-semibold text-[var(--text-dim)] text-sm">{cfg.label}</h3>
              <span className="ml-auto text-xs text-slate-400 bg-[var(--panel-2)] px-2 py-0.5 rounded-full">{cols.length}</span>
            </div>
            <DroppableColumn id={estagio} disabled={!canEditar} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {cols.map((item) => (
                <DraggableCard key={item.id} id={item.id} disabled={!canEditar}>
                  <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-2.5 hover:shadow-md transition-shadow h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4
                          className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          {...propsTituloClicavel(() => setViewingItem(item))}
                        >
                          {item.empresa_nome}
                        </h4>
                        {item.setor && <p className="text-xs text-slate-400 mt-0.5">{item.setor}</p>}
                      </div>
                      {(canEditar || canExcluir) && (
                        <div className="flex gap-1 shrink-0">
                          {canEditar && (
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canExcluir && (
                            <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-slate-400">
                      {item.valor_estimado && (
                        <span className="font-semibold text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado)}</span>
                      )}
                      {item.responsavel && (
                        <span className="flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {item.responsavel}</span>
                      )}
                      {item.proxima_acao_data && (
                        <span className="flex items-center gap-1"><CalendarDaysIcon className="w-3.5 h-3.5" /> {fmtDate(item.proxima_acao_data)}</span>
                      )}
                      {item.proxima_acao && (
                        <span className="italic text-[var(--text-mute)]">{item.proxima_acao}</span>
                      )}
                    </div>
                    {canEditar && (
                      <div className="pt-1.5 border-t border-[var(--border)]">
                        <select
                          value={item.estagio}
                          onChange={(e) => moverCard(item.id, e.target.value)}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--panel-2)] text-[var(--text)] cursor-pointer"
                        >
                          {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </DraggableCard>
              ))}
              {cols.length === 0 && (
                <div className="h-20 border-2 border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-xs text-[var(--text-mute)]">
                  Vazio
                </div>
              )}
            </DroppableColumn>
          </div>
        );
      })}
    </KanbanDndContext>

    {items.length === 0 && (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">Nenhum lead no funil ainda.</p>
        {canCriar && <p className="text-xs mt-1">Clique em "Novo Lead" para começar.</p>}
      </div>
    )}
  </>
)}
```

Notas: o card ganhou `h-full` (novo wrapper `DraggableCard` vira o filho do grid; `h-full` mantém as alturas uniformes por linha como antes). O restante do markup é idêntico ao atual.

- [ ] **Step 5: Tabela — a11y, colSpan e EstagioPill**

1. Empty row (linha 371): `colSpan={7}` → `colSpan={6 + ((canEditar || canExcluir) ? 1 : 0)}`.
2. Célula do título (linha 377) vira:

```jsx
<td
  className="px-4 py-2.5 font-medium text-[var(--text)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  {...propsTituloClicavel(() => setViewingItem(item))}
>
  {item.empresa_nome}
</td>
```

3. Célula do estágio (linha 382) vira (variante `color` — o Funil usa hex):

```jsx
<td className="px-4 py-2.5"><EstagioPill label={cfg.label} color={cfg.color} /></td>
```

- [ ] **Step 6: Modal de detalhes — EstagioPill**

No detail modal (linha 422), substituir
`<span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "var(--panel-2)", color: cfg.color }}>{cfg.label}</span>`
por:

```jsx
<EstagioPill label={cfg.label} color={cfg.color} />
```

- [ ] **Step 7: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 41 PASS; build exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx
git commit -m "feat(kanban): drag-and-drop otimista entre linhas do Funil + a11y titulos, colSpan condicional e EstagioPill"
```

---

### Task 6: AcompanhamentoTab (Projetos) — DnD + moverCard(status) + residuais

**Files:**
- Modify: `frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx`

**Interfaces:**
- Consumes: `KanbanDndContext`, `DraggableCard`, `DroppableColumn` (Task 2); `aplicarMovimento`, `propsTituloClicavel` (Task 1). **Não** usa `EstagioPill` — Projetos já usa o `StatusPill` do nid (mantido).
- Produces: nada (folha).

- [ ] **Step 1: Adicionar imports**

Depois de `import { diasAtraso, progresso } from "../../utils/projetoStatus";` (linha 23), adicionar:

```jsx
import KanbanDndContext from "../../components/kanban/KanbanDndContext";
import DraggableCard from "../../components/kanban/DraggableCard";
import DroppableColumn from "../../components/kanban/DroppableColumn";
import { aplicarMovimento } from "../../utils/kanbanMove";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";
```

- [ ] **Step 2: Ghost do card (nível de módulo)**

`StatusPill` já é importado no arquivo. Depois da função `fmtDate` (linha 50), adicionar:

```jsx
function renderOverlayProjeto(projeto) {
  const st = STATUS_CONFIG[projeto.status] || STATUS_CONFIG.nao_iniciado;
  return (
    <div className="proj-card" style={{ width: 280 }}>
      <h3 className="proj-card__title" style={{ margin: 0 }}>{projeto.titulo}</h3>
      <StatusPill kind={st.kind} dot label={st.label} />
    </div>
  );
}
```

- [ ] **Step 3: Substituir `handleStatusChange` por `moverCard`**

Substituir a função inteira (linhas 176–184):

```jsx
async function moverCard(id, novoStatus) {
  const anterior = projetos;
  const otimista = aplicarMovimento(projetos, id, "status", novoStatus);
  if (otimista === anterior) return;
  setProjetos(otimista);
  try {
    await api.put(`/projetos/${id}`, { status: novoStatus });
    addToast("Status atualizado", "success");
    await load();
  } catch (err) {
    setProjetos(anterior);
    addToast(err?.response?.data?.detail || "Erro ao atualizar status", "error");
  }
}
```

- [ ] **Step 4: `ProjetoCard` — título acessível e select via `moverCard`**

Dentro de `ProjetoCard` (linhas 241–350):

1. O `<h3 className="proj-card__title" onClick={...} style={{ cursor: "pointer" }}>` (linhas 277–283) vira:

```jsx
<h3
  className="proj-card__title rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  style={{ cursor: "pointer" }}
  {...propsTituloClicavel(() => setViewingProjeto(projeto))}
>
  {projeto.titulo}
</h3>
```

2. O select do footer (linha 338): `onChange={(e) => handleStatusChange(projeto.id, e.target.value)}` → `onChange={(e) => moverCard(projeto.id, e.target.value)}`.

- [ ] **Step 5: Envolver o board com DnD**

Na kanban view (linhas 418–440), o bloco `<div className="grid grid-cols-1 md:grid-cols-3 gap-6">...` vira:

```jsx
<KanbanDndContext items={projetos} campo="status" onMove={moverCard} renderOverlay={renderOverlayProjeto}>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
      const cols = filtrados.filter((p) => p.status === status);
      return (
        <div key={status} className="space-y-3">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, display: "inline-block", flexShrink: 0 }} />
            <h3 style={{ fontWeight: 600, color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{cfg.label}</h3>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-mute)", background: "var(--panel-2)", border: "1px solid var(--border)", padding: "1px 7px", borderRadius: 999 }}>{cols.length}</span>
          </div>
          <DroppableColumn id={status} disabled={!canEditar} className="space-y-3" style={{ minHeight: 80 }}>
            {cols.map((p) => (
              <DraggableCard key={p.id} id={p.id} disabled={!canEditar}>
                <ProjetoCard projeto={p} />
              </DraggableCard>
            ))}
            {cols.length === 0 && (
              <div style={{ height: 80, border: "2px dashed var(--border)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-mute)" }}>
                Vazio
              </div>
            )}
          </DroppableColumn>
        </div>
      );
    })}
  </div>
</KanbanDndContext>
```

Nota: `items={projetos}` (lista completa, não `filtrados`) — o lookup do `onDragEnd` precisa achar qualquer card renderizado, e `filtrados ⊆ projetos`.

- [ ] **Step 6: Tabela — a11y e colSpan**

1. Empty row (linha 462): `colSpan={6}` → `colSpan={5 + ((canEditar || canExcluir) ? 1 : 0)}`.
2. Célula do título (linhas 471–476) vira:

```jsx
<td
  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  style={{ padding: "10px 20px", fontWeight: 500, color: "var(--text)", cursor: "pointer" }}
  {...propsTituloClicavel(() => setViewingProjeto(p))}
>
  {p.titulo}
</td>
```

- [ ] **Step 7: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 41 PASS; build exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx
git commit -m "feat(kanban): drag-and-drop otimista nos Projetos + a11y titulos e colSpan condicional"
```

---

### Task 7: Verificação final (sem commit de código)

**Files:** nenhum (somente verificação).

**Interfaces:** n/a.

- [ ] **Step 1: Suite completa + build**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: 41 PASS, build exit 0.

- [ ] **Step 2: Greps de consistência**

```bash
cd frontend-observatorio
grep -rn "handleEstagioChange\|handleStatusChange" src/pages
grep -rn "colSpan={[0-9]" src/pages
grep -rn "px-2 py-0.5 rounded-full text-\[11px\]" src/pages
```

Expected:
1. Zero ocorrências (todos viraram `moverCard`).
2. Zero ocorrências (todos os `colSpan` de empty row agora são expressões condicionais).
3. Ocorrências restantes SOMENTE das pills de **resultado** da Escrita (2: tabela linha ~377 e modal linha ~425) — pills de estágio migraram para `EstagioPill`.

- [ ] **Step 3: Conferência de gating**

```bash
cd frontend-observatorio && grep -rn "disabled={!canEditar}" src/pages | wc -l
```

Expected: 8 (DroppableColumn + DraggableCard em cada um dos 4 tabs).

- [ ] **Step 4: Suite backend intacta (sanity — zero mudança de backend)**

```bash
venv\Scripts\python -m pytest backend/tests -q
```

Expected: exit 0 (o resumo "N passed" é engolido nesta máquina — usar exit code).

- [ ] **Step 5: Reportar pendências para o usuário**

Checklist visual (browser, contra a Railway) — seção "Checklist visual" da spec:
arrastar nos 4 kanbans, highlight de zona, ghost, no-op fora de zona/mesma coluna,
revert offline com toast de erro, select otimista, título por teclado (Tab + Enter),
role restrita sem drag, touch (long-press) se disponível.

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** decisões 1–4 da spec → Global Constraints + Tasks 2–6; tabela de endpoints → Tasks 3–6 (paths conferidos no código real); primitivas → Task 2; `moverCard` → Tasks 3–6; residuais 1–4 → Tasks 3–6 (a11y/colSpan/pill/detail); testes → Tasks 1 e 7; checklist visual → Task 7.
- **Placeholders:** nenhum (todo step de código tem o código completo).
- **Consistência de tipos/nomes:** `aplicarMovimento(items, id, campo, valor)` e `propsTituloClicavel(abrir)` idênticos em todas as tasks; `KanbanDndContext` props (`items`, `campo`, `onMove`, `renderOverlay`) iguais nos 4 tabs; variantes da `EstagioPill` (`className` em Captação/Escrita, `color` no Funil) conferem com os formatos reais de `ESTAGIO_CONFIG` de cada arquivo.
