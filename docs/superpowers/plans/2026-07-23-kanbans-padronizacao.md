# Kanbans: Padronização + Emendas na Captação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paridade funcional dos kanbans (modal de detalhes + view tabela em Captação/Funil/Escrita; select de estágio e empty-box no Funil) e seção "Oportunidades de emendas" na Captação com envio pro kanban sem sair da tela.

**Architecture:** Zero backend. Cada tab ganha as features no próprio idioma Tailwind (sem componente kanban genérico — fica para o ciclo do DnD). `BarraExecucao` extraída para componente compartilhado; `CriarOportunidadeCaptacao` ganha prop opcional `onCreated` (fallback = navigate atual).

**Tech Stack:** React + Tailwind + framer-motion + heroicons.

**Spec:** `docs/superpowers/specs/2026-07-23-kanbans-padronizacao-design.md`

## Global Constraints

- Branch: `feat/kanbans-padronizacao` a partir de `main`. ZERO backend.
- Idioma visual: os 3 tabs usam Tailwind puro (`bg-[var(--panel)] rounded-2xl`, modais `bg-black/40 backdrop-blur-sm`) — seguir o padrão de cada arquivo, NÃO usar classes `nid-modal` neles.
- Modal de detalhes: título do card clicável (`cursor-pointer`), read-only, todos os campos sem truncar (`whitespace-pre-line` na descrição), fecha por X/backdrop/Escape. Escape chain em cada tab: `deleteConfirmId → viewingItem → showForm`.
- View tabela: toggle kanban↔tabela com ícones `ViewColumnsIcon`/`TableCellsIcon` (import de heroicons), estado `viewMode` default `"kanban"`, botões com `aria-pressed`; título da linha clicável abre o modal de detalhes; ações (lápis/lixeira) por permissão.
- Seção de emendas: `canAccess("emendas")` do `usePlan()` decide tabela vs teaser com cadeado (`LockClosedIcon`); dados de `GET /emendas/radar` (+`?ano=`); shape: `{disponivel, anos[], emendas[{ano, codigo, numero, autor, tipo, funcao, empenhado, pago_total, pct_pago}]}`; `radar.disponivel === false` ou erro → estado vazio discreto, página não quebra. Sem dedup.
- `CriarOportunidadeCaptacao`: prop nova opcional `onCreated`; quando presente, chama `onCreated()` em vez de `navigate(...)` após sucesso — EmendasPage NÃO muda de comportamento.
- Erros lidos de `err?.response?.data?.detail` com toast. Gates: de `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.
- Não tocar/commitar: `.claude/settings.local.json`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md` (WIP do usuário).
- Commits em pt-BR `feat(escopo): descrição`, um por task.

---

### Task 1: `BarraExecucao` compartilhada + prop `onCreated` no CTA

**Files:**
- Create: `frontend-observatorio/src/components/nid/BarraExecucao.jsx`
- Modify: `frontend-observatorio/src/pages/emendas/EmendasPage.jsx` (remover função local linhas 14-25; adicionar import)
- Modify: `frontend-observatorio/src/components/CriarOportunidadeCaptacao.jsx` (assinatura linha 15; função `criar` linhas 24-34)

**Interfaces:**
- Produces (Tasks 3 consome): `<BarraExecucao pct={number|null} />`; `<CriarOportunidadeCaptacao payload onCreated compact />` — `onCreated?: () => void`, chamado após POST com sucesso NO LUGAR do navigate.

- [ ] **Step 1: Branch**

```powershell
git checkout -b feat/kanbans-padronizacao
```

- [ ] **Step 2: Criar `frontend-observatorio/src/components/nid/BarraExecucao.jsx`** (código movido de EmendasPage.jsx:14-25, verbatim + export)

```jsx
/** Barra de execução (empenhado → pago). pct null = sem empenho. */
export default function BarraExecucao({ pct }) {
  if (pct == null) return <span className="text-xs text-[var(--text-dim)]">—</span>;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-[var(--panel-2)] overflow-hidden" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "rgba(16,185,129,.8)" : "var(--accent-1)" }} />
      </div>
      <span className="text-xs text-[var(--text-dim)] w-10 text-right">{Number(pct).toLocaleString("pt-BR")}%</span>
    </div>
  );
}
```

- [ ] **Step 3: `EmendasPage.jsx`** — deletar a função local `BarraExecucao` (linhas 14-25, incluindo o comentário JSDoc) e adicionar o import junto aos demais:

```jsx
import BarraExecucao from "../../components/nid/BarraExecucao";
```

(Os usos existentes no arquivo não mudam.)

- [ ] **Step 4: `CriarOportunidadeCaptacao.jsx`** — assinatura (linha 15) vira:

```jsx
export default function CriarOportunidadeCaptacao({ payload, label = "Registrar no funil de captação", compact = false, onCreated }) {
```

E em `criar`, o pós-sucesso (linhas 28-29) vira:

```jsx
      addToast("Oportunidade criada no funil de captação", "success");
      if (onCreated) {
        onCreated();
        setSaving(false);
      } else {
        navigate("/app/desenvolvimento-economico/captacao");
      }
```

(sem `onCreated`, comportamento byte-idêntico ao atual — EmendasPage não passa a prop.)

- [ ] **Step 5: Gates + commit**

De `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.

```powershell
git add frontend-observatorio/src/components/nid/BarraExecucao.jsx frontend-observatorio/src/pages/emendas/EmendasPage.jsx frontend-observatorio/src/components/CriarOportunidadeCaptacao.jsx
git commit -m "feat(kanbans): BarraExecucao compartilhada e CTA com callback onCreated"
```

---

### Task 2: CaptacaoTab — modal de detalhes + view tabela

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx` (imports linhas 3-12; estados ~74; escape 76-79; toolbar 229-240; board 242-322; novos blocos antes do "Delete confirm" linha 324)

**Interfaces:**
- Consumes: helpers do próprio arquivo (`ESTAGIO_CONFIG`, `TIPO_LABEL`, `fmtMoeda`, `fmtDate`, `isVencendoEm30`).
- Produces: `viewingItem`/`setViewingItem` e `viewMode` — a Task 3 adiciona a seção de emendas DEPOIS do board no mesmo arquivo.

- [ ] **Step 1: Imports** — adicionar `ViewColumnsIcon, TableCellsIcon` ao bloco heroicons (linhas 3-12).

- [ ] **Step 2: Estados + Escape**

Após `deleteConfirmId` (linha 74):

```jsx
  const [viewingItem, setViewingItem] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");
```

`useEscapeKey` (76-79) vira:

```jsx
  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingItem) { setViewingItem(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingItem, showForm]));
```

- [ ] **Step 3: Toolbar com toggle** — o bloco (linhas 229-240) vira:

```jsx
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setViewMode("kanban")}
            aria-label="Kanban"
            aria-pressed={viewMode === "kanban"}
            className={`px-3 py-2 cursor-pointer transition-colors ${viewMode === "kanban" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--text-mute)] hover:bg-[var(--panel-2)]"}`}
          >
            <ViewColumnsIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            aria-label="Tabela"
            aria-pressed={viewMode === "table"}
            className={`px-3 py-2 cursor-pointer transition-colors ${viewMode === "table" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--text-mute)] hover:bg-[var(--panel-2)]"}`}
          >
            <TableCellsIcon className="w-4 h-4" />
          </button>
        </div>
        {canCriar && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Nova Oportunidade
          </button>
        )}
      </div>
```

- [ ] **Step 4: Título do card clicável** — no card (linha 268):

```jsx
                          <h4 className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer" onClick={() => setViewingItem(item)}>{item.titulo}</h4>
```

- [ ] **Step 5: Envolver o board no viewMode + adicionar a tabela**

O bloco do kanban (linhas 242-322, do `{items.length === 0 ? (...)}` até o fechamento do grid) fica envolvido por `{viewMode === "kanban" && (<> ... </>)}`. Logo após, a view tabela:

```jsx
      {viewMode === "table" && (
        <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--panel-2)] text-[10px] uppercase tracking-wider text-[var(--text-mute)] text-left">
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Entidade</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Prazo</th>
                <th className="px-4 py-2.5">Estágio</th>
                {(canEditar || canExcluir) && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">Nenhuma oportunidade cadastrada ainda.</td></tr>
              ) : (
                items.map((item) => {
                  const cfg = ESTAGIO_CONFIG[item.estagio] || ESTAGIO_CONFIG.oportunidade;
                  return (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text)] cursor-pointer" onClick={() => setViewingItem(item)}>{item.titulo}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{TIPO_LABEL[item.tipo] || item.tipo}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{item.entidade_origem || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado) || "—"}</td>
                      <td className={`px-4 py-2.5 text-xs ${isVencendoEm30(item.prazo) ? "text-amber-600 font-medium" : "text-[var(--text-mute)]"}`}>{fmtDate(item.prazo) || "—"}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span></td>
                      {(canEditar || canExcluir) && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            {canEditar && (
                              <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-blue-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><PencilIcon className="w-3.5 h-3.5" /></button>
                            )}
                            {canExcluir && (
                              <button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-red-400 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><TrashIcon className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 6: Modal de detalhes** — novo `AnimatePresence` antes do "Delete confirm" (linha 324):

```jsx
      {/* Detail modal */}
      <AnimatePresence>
        {viewingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setViewingItem(null); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-4"
            >
              {(() => {
                const cfg = ESTAGIO_CONFIG[viewingItem.estagio] || ESTAGIO_CONFIG.oportunidade;
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">{TIPO_LABEL[viewingItem.tipo] || viewingItem.tipo}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <button onClick={() => setViewingItem(null)} className="p-1.5 rounded-lg text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer shrink-0">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[var(--text)] leading-snug">{viewingItem.titulo}</h3>
                      {viewingItem.entidade_origem && <p className="text-xs text-slate-400 mt-1">{viewingItem.entidade_origem}</p>}
                    </div>
                    {viewingItem.descricao && (
                      <p className="text-sm text-[var(--text-dim)] leading-relaxed whitespace-pre-line border-t border-[var(--border)] pt-3">{viewingItem.descricao}</p>
                    )}
                    <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
                      {viewingItem.valor_estimado != null && <span className="font-semibold text-[var(--text-dim)]">Valor estimado: {fmtMoeda(viewingItem.valor_estimado)}</span>}
                      {viewingItem.prazo && (
                        <span className={`flex items-center gap-1 ${isVencendoEm30(viewingItem.prazo) ? "text-amber-600 font-medium" : ""}`}>
                          <CalendarDaysIcon className="w-3.5 h-3.5" /> Prazo: {fmtDate(viewingItem.prazo)}
                          {isVencendoEm30(viewingItem.prazo) && " · vence em até 30 dias"}
                        </span>
                      )}
                      {viewingItem.link && (
                        <a href={viewingItem.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline"><LinkIcon className="w-3.5 h-3.5" /> Ver edital</a>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
```

- [ ] **Step 7: Gates + commit**

De `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.

```powershell
git add frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx
git commit -m "feat(captacao): modal de detalhes e view tabela"
```

---

### Task 3: CaptacaoTab — seção "Oportunidades de emendas"

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx` (imports; estados; seção nova após o bloco da view tabela da Task 2, antes do "Detail modal")

**Interfaces:**
- Consumes: `BarraExecucao` e `CriarOportunidadeCaptacao{onCreated}` (Task 1), `usePlan().canAccess("emendas")`, `GET /emendas/radar`.

- [ ] **Step 1: Imports**

```jsx
import { LockClosedIcon } from "@heroicons/react/24/outline";   // adicionar ao bloco heroicons existente
import { usePlan } from "../../context/PlanContext";
import BarraExecucao from "../../components/nid/BarraExecucao";
import CriarOportunidadeCaptacao from "../../components/CriarOportunidadeCaptacao";
```

- [ ] **Step 2: Estados + fetch**

No componente: `const { canAccess } = usePlan();` e `const temEmendas = canAccess("emendas");`. Estados:

```jsx
  const [radar, setRadar] = useState(null);
  const [anoEmendas, setAnoEmendas] = useState("");
```

Fetch (novo `useEffect`, roda só com módulo e não-global):

```jsx
  useEffect(() => {
    if (!temEmendas || isGlobal) return;
    api.get("/emendas/radar", { params: anoEmendas ? { ano: anoEmendas } : {} })
      .then((r) => setRadar(r.data))
      .catch(() => setRadar(null));
  }, [temEmendas, isGlobal, anoEmendas]);
```

Helper local (junto aos demais no topo do arquivo):

```jsx
const tipoCurto = (t) => (t || "").split(" - ")[0];
```

- [ ] **Step 3: Seção** — inserida DEPOIS do bloco da view tabela (Task 2) e ANTES do "Detail modal":

```jsx
      {/* Oportunidades de emendas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-[var(--text-dim)]">Oportunidades de emendas destinadas ao município</h2>
          {temEmendas && radar?.anos?.length > 0 && (
            <select
              value={anoEmendas}
              onChange={(e) => setAnoEmendas(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">Todos os anos</option>
              {radar.anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </div>

        {!temEmendas ? (
          <div className="bg-[var(--panel)] rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
            <LockClosedIcon className="w-8 h-8 mx-auto mb-2 text-[var(--text-mute)] opacity-60" />
            <p className="text-sm font-medium text-[var(--text-dim)]">Radar de Emendas disponível em planos superiores.</p>
            <p className="text-xs text-[var(--text-mute)] mt-1">Prospecte emendas parlamentares destinadas ao município e envie direto para o funil.</p>
          </div>
        ) : !radar?.disponivel || !radar?.emendas?.length ? (
          <p className="text-xs text-[var(--text-mute)]">Nenhuma emenda encontrada para o município.</p>
        ) : (
          <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--panel-2)] text-[10px] uppercase tracking-wider text-[var(--text-mute)] text-left">
                  <th className="px-4 py-2.5">Ano</th>
                  <th className="px-4 py-2.5">Autor</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="px-4 py-2.5">Área</th>
                  <th className="px-4 py-2.5">Empenhado</th>
                  <th className="px-4 py-2.5">Pago</th>
                  <th className="px-4 py-2.5">Execução</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {radar.emendas.map((e) => (
                  <tr key={`${e.codigo}-${e.ano}`} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2.5 text-xs text-[var(--text-mute)]">{e.ano}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-[var(--text)]">{e.autor}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{tipoCurto(e.tipo)}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{e.funcao || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{fmtMoeda(e.empenhado) || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{fmtMoeda(e.pago_total) || "—"}</td>
                    <td className="px-4 py-2.5"><BarraExecucao pct={e.pct_pago} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <CriarOportunidadeCaptacao
                        compact
                        onCreated={load}
                        payload={{
                          tipo: "emenda",
                          titulo: `Emenda ${e.numero || e.codigo} — ${e.autor} (${e.ano})`,
                          entidade_origem: e.autor,
                          valor_estimado: e.empenhado || null,
                          descricao: `Emenda ${tipoCurto(e.tipo)} · área ${e.funcao || "n/d"} · pago ${fmtMoeda(e.pago_total) || "R$ 0"} de ${fmtMoeda(e.empenhado) || "R$ 0"}.`,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
```

(`onCreated={load}` recarrega o kanban — o card novo aparece na coluna Oportunidade sem navegar.)

- [ ] **Step 4: Gates + commit**

De `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.

```powershell
git add frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx
git commit -m "feat(captacao): secao de oportunidades de emendas com envio pro kanban"
```

---

### Task 4: FunilTab — select de estágio, empty-box, modal de detalhes e view tabela

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx`

**Interfaces:** consome só o próprio arquivo (`ESTAGIOS`, `ESTAGIO_CONFIG`, `fmtMoeda`, `fmtDate`).

- [ ] **Step 1: Imports** — adicionar `ViewColumnsIcon, TableCellsIcon` ao bloco heroicons.

- [ ] **Step 2: Estados + Escape** — após `deleteConfirmId` (linha 66):

```jsx
  const [viewingItem, setViewingItem] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");
```

E o `useEscapeKey` (linhas 68-71) vira:

```jsx
  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingItem) { setViewingItem(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingItem, showForm]));
```

- [ ] **Step 3: `handleEstagioChange` novo** (após `handleSubmit`, linha ~154 — padrão do CaptacaoTab):

```jsx
  async function handleEstagioChange(id, newEstagio) {
    try {
      await api.put(`/desenvolvimento-economico/funil/${id}`, { estagio: newEstagio });
      addToast("Estágio atualizado", "success");
      await load();
    } catch {
      addToast("Erro ao atualizar estágio", "error");
    }
  }
```

- [ ] **Step 4: Toolbar com toggle** — o bloco Toolbar (linhas 219-230) vira:

```jsx
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setViewMode("kanban")}
            aria-label="Kanban"
            aria-pressed={viewMode === "kanban"}
            className={`px-3 py-2 cursor-pointer transition-colors ${viewMode === "kanban" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--text-mute)] hover:bg-[var(--panel-2)]"}`}
          >
            <ViewColumnsIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            aria-label="Tabela"
            aria-pressed={viewMode === "table"}
            className={`px-3 py-2 cursor-pointer transition-colors ${viewMode === "table" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--text-mute)] hover:bg-[var(--panel-2)]"}`}
          >
            <TableCellsIcon className="w-4 h-4" />
          </button>
        </div>
        {canCriar && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Lead
          </button>
        )}
      </div>
```

- [ ] **Step 5: Cards — empty-box, select e título clicável** (bloco linhas 240-294):

1. Remover `if (cols.length === 0) return null;` (linha 244); em vez disso, dentro do grid de cards, após o `.map`, adicionar:

```jsx
              {cols.length === 0 && (
                <div className="h-20 border-2 border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-xs text-[var(--text-mute)]">
                  Vazio
                </div>
              )}
```

2. Título do card (linha 257) vira clicável:

```jsx
                      <h4 className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer" onClick={() => setViewingItem(item)}>{item.empresa_nome}</h4>
```

3. No rodapé de cada card (após o bloco de meta, linha ~288), o select de estágio:

```jsx
                  {canEditar && (
                    <div className="pt-1.5 border-t border-[var(--border)]">
                      <select
                        value={item.estagio}
                        onChange={(e) => handleEstagioChange(item.id, e.target.value)}
                        className="w-full text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[var(--panel-2)] text-[var(--text)] cursor-pointer"
                      >
                        {ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_CONFIG[e].label}</option>)}
                      </select>
                    </div>
                  )}
```

4. Envolver TODO o bloco de estágios (o `.map` das linhas 241-294 + o empty geral 296-301) em `{viewMode === "kanban" && (<> ... </>)}`. O gráfico `NidFunnel` (linhas 232-238) fica FORA — visível nas duas views.

- [ ] **Step 6: View tabela** — após o bloco kanban:

```jsx
      {viewMode === "table" && (
        <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--panel-2)] text-[10px] uppercase tracking-wider text-[var(--text-mute)] text-left">
                <th className="px-4 py-2.5">Empresa</th>
                <th className="px-4 py-2.5">Setor</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Responsável</th>
                <th className="px-4 py-2.5">Próxima ação</th>
                <th className="px-4 py-2.5">Estágio</th>
                {(canEditar || canExcluir) && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">Nenhum lead no funil ainda.</td></tr>
              ) : (
                items.map((item) => {
                  const cfg = ESTAGIO_CONFIG[item.estagio] || ESTAGIO_CONFIG.lead;
                  return (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text)] cursor-pointer" onClick={() => setViewingItem(item)}>{item.empresa_nome}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{item.setor || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{fmtMoeda(item.valor_estimado)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{item.responsavel || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-mute)]">{item.proxima_acao || "—"}{item.proxima_acao_data ? ` · ${fmtDate(item.proxima_acao_data)}` : ""}</td>
                      <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "var(--panel-2)", color: cfg.color }}>{cfg.label}</span></td>
                      {(canEditar || canExcluir) && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            {canEditar && (<button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><PencilIcon className="w-3.5 h-3.5" /></button>)}
                            {canExcluir && (<button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><TrashIcon className="w-3.5 h-3.5" /></button>)}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 7: Modal de detalhes** — antes do "Delete confirm" (mesma casca visual da Task 2 Step 6; corpo específico):

```jsx
      {/* Detail modal */}
      <AnimatePresence>
        {viewingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setViewingItem(null); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-4"
            >
              {(() => {
                const cfg = ESTAGIO_CONFIG[viewingItem.estagio] || ESTAGIO_CONFIG.lead;
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "var(--panel-2)", color: cfg.color }}>{cfg.label}</span>
                      <button onClick={() => setViewingItem(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer shrink-0">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[var(--text)] leading-snug">{viewingItem.empresa_nome}</h3>
                      {viewingItem.setor && <p className="text-xs text-slate-400 mt-1">{viewingItem.setor}</p>}
                    </div>
                    {viewingItem.descricao && (
                      <p className="text-sm text-[var(--text-dim)] leading-relaxed whitespace-pre-line border-t border-[var(--border)] pt-3">{viewingItem.descricao}</p>
                    )}
                    <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
                      {viewingItem.valor_estimado != null && <span className="font-semibold text-[var(--text-dim)]">Valor estimado: {fmtMoeda(viewingItem.valor_estimado)}</span>}
                      {viewingItem.responsavel && <span className="flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {viewingItem.responsavel}</span>}
                      {(viewingItem.proxima_acao || viewingItem.proxima_acao_data) && (
                        <span className="flex items-center gap-1">
                          <CalendarDaysIcon className="w-3.5 h-3.5" />
                          {viewingItem.proxima_acao || "Próxima ação"}{viewingItem.proxima_acao_data ? ` · ${fmtDate(viewingItem.proxima_acao_data)}` : ""}
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
```

- [ ] **Step 8: Gates + commit**

De `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.

```powershell
git add frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx
git commit -m "feat(funil): select de estagio, coluna vazia, modal de detalhes e view tabela"
```

---

### Task 5: EscritaTab — modal de detalhes + view tabela

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx`

**Interfaces:** consome o próprio arquivo (`ESTAGIO_CONFIG`, `RESULTADO_CONFIG`, `fmtMoeda`, `captacoes`). Nota: o arquivo NÃO tem `fmtDate` — adicionar (código da Task 4, mesmo helper):

```jsx
function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}
```

- [ ] **Step 1: Imports** — `ViewColumnsIcon, TableCellsIcon` no bloco heroicons; helper `fmtDate` acima (junto ao `fmtMoeda`, linha 42).

- [ ] **Step 2: Estados + Escape** — após `deleteConfirmId` (linha 64):

```jsx
  const [viewingItem, setViewingItem] = useState(null);
  const [viewMode, setViewMode] = useState("kanban");
```

E o `useEscapeKey` (linhas 66-69) vira:

```jsx
  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingItem) { setViewingItem(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingItem, showForm]));
```

- [ ] **Step 3: Toolbar com toggle** — o bloco Toolbar (linhas 224-235) vira:

```jsx
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setViewMode("kanban")}
            aria-label="Kanban"
            aria-pressed={viewMode === "kanban"}
            className={`px-3 py-2 cursor-pointer transition-colors ${viewMode === "kanban" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--text-mute)] hover:bg-[var(--panel-2)]"}`}
          >
            <ViewColumnsIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            aria-label="Tabela"
            aria-pressed={viewMode === "table"}
            className={`px-3 py-2 cursor-pointer transition-colors ${viewMode === "table" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--text-mute)] hover:bg-[var(--panel-2)]"}`}
          >
            <TableCellsIcon className="w-4 h-4" />
          </button>
        </div>
        {canCriar && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            Novo Projeto
          </button>
        )}
      </div>
```

- [ ] **Step 4: Título do card clicável** (linha 268):

```jsx
                            <h4 className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer" onClick={() => setViewingItem(item)}>{item.titulo}</h4>
```

- [ ] **Step 5: Envolver o board (linhas 237-316) em `{viewMode === "kanban" && (<> ... </>)}` e adicionar a view tabela:**

```jsx
      {viewMode === "table" && (
        <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--panel-2)] text-[10px] uppercase tracking-wider text-[var(--text-mute)] text-left">
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Captação vinculada</th>
                <th className="px-4 py-2.5">Resultado</th>
                <th className="px-4 py-2.5">Responsável</th>
                <th className="px-4 py-2.5">Prazo</th>
                <th className="px-4 py-2.5">Valor</th>
                <th className="px-4 py-2.5">Estágio</th>
                {(canEditar || canExcluir) && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Nenhum projeto de escrita cadastrado ainda.</td></tr>
              ) : (
                items.map((item) => {
                  const cfg = ESTAGIO_CONFIG[item.estagio] || ESTAGIO_CONFIG.ideia;
                  const resCfg = item.resultado ? RESULTADO_CONFIG[item.resultado] : null;
                  const cap = captacoes.find((c) => c.id === item.oportunidade_captacao_id);
                  return (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text)] cursor-pointer" onClick={() => setViewingItem(item)}>{item.titulo}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--accent-1)]">{cap?.titulo || "—"}</td>
                      <td className="px-4 py-2.5">{resCfg ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${resCfg.color}`}>{resCfg.label}</span> : <span className="text-xs text-[var(--text-mute)]">—</span>}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{item.responsavel || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-mute)]">{fmtDate(item.prazo) || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-dim)]">{fmtMoeda(item.valor_pleiteado) || "—"}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span></td>
                      {(canEditar || canExcluir) && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            {canEditar && (<button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><PencilIcon className="w-3.5 h-3.5" /></button>)}
                            {canExcluir && (<button onClick={() => setDeleteConfirmId(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-[var(--panel-2)] transition-colors cursor-pointer"><TrashIcon className="w-3.5 h-3.5" /></button>)}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 6: Modal de detalhes** — antes do "Delete confirm":

```jsx
      {/* Detail modal */}
      <AnimatePresence>
        {viewingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setViewingItem(null); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-[var(--panel)] rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-4"
            >
              {(() => {
                const cfg = ESTAGIO_CONFIG[viewingItem.estagio] || ESTAGIO_CONFIG.ideia;
                const resCfg = viewingItem.resultado ? RESULTADO_CONFIG[viewingItem.resultado] : null;
                const cap = captacoes.find((c) => c.id === viewingItem.oportunidade_captacao_id);
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                        {resCfg && <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${resCfg.color}`}>{resCfg.label}</span>}
                      </div>
                      <button onClick={() => setViewingItem(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer shrink-0">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[var(--text)] leading-snug">{viewingItem.titulo}</h3>
                      {cap && <p className="text-xs text-[var(--accent-1)] mt-1">Captação vinculada: {cap.titulo}</p>}
                    </div>
                    {viewingItem.descricao && (
                      <p className="text-sm text-[var(--text-dim)] leading-relaxed whitespace-pre-line border-t border-[var(--border)] pt-3">{viewingItem.descricao}</p>
                    )}
                    <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
                      {viewingItem.responsavel && <span>Responsável: {viewingItem.responsavel}</span>}
                      {viewingItem.prazo && <span>Prazo: {fmtDate(viewingItem.prazo)}</span>}
                      {viewingItem.valor_pleiteado != null && <span className="font-semibold text-[var(--text-dim)]">Valor pleiteado: {fmtMoeda(viewingItem.valor_pleiteado)}</span>}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
```

- [ ] **Step 7: Gates + commit**

De `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.

```powershell
git add frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx
git commit -m "feat(escrita): modal de detalhes e view tabela"
```

---

### Task 6: Verificação final

**Files:** nenhum novo.

- [ ] **Step 1: Gates completos** — de `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0. De `backend/`: `..\venv\Scripts\python.exe -m pytest tests -q` → exit 0 (sanidade, nada de backend mudou).

- [ ] **Step 2: Greps de fiação**

```powershell
Select-String -Path frontend-observatorio/src/pages/emendas/EmendasPage.jsx -Pattern "function BarraExecucao|import BarraExecucao"
Select-String -Path frontend-observatorio/src/pages/desenvolvimento-economico/*.jsx -Pattern "viewingItem|viewMode" | Measure-Object
Select-String -Path frontend-observatorio/src/components/CriarOportunidadeCaptacao.jsx -Pattern "onCreated"
```

Expected: EmendasPage só com o import (função local removida); múltiplas ocorrências de viewingItem/viewMode nos 3 tabs; `onCreated` presente no CTA.

- [ ] **Step 3: Checklist visual (usuário)** — 3 modais de detalhes, 3 toggles de tabela, select/empty do Funil, seção de emendas (com módulo: tabela + "+ funil" cria card na tela; sem módulo: teaser com cadeado), EmendasPage inalterada.

- [ ] **Step 4: Ledger** — registrar no `.superpowers/sdd/progress.md`.
