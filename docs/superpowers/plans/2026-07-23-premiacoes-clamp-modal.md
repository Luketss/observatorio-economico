# Premiações: Clamp + Modal de Detalhes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards de premiações com título/descrição clampados (2/3 linhas) e modal de detalhes com o conteúdo completo, aberto pelo título/descrição clicáveis.

**Architecture:** Mudança em um único arquivo (`PremiacoesTab.jsx`): classes `line-clamp-2`/`line-clamp-3` (Tailwind 3.4 — nativas), estado `viewingItem` + modal no padrão visual dos dois modais já existentes no arquivo.

**Tech Stack:** React + Tailwind 3.4 + framer-motion.

**Spec:** `docs/superpowers/specs/2026-07-23-premiacoes-clamp-modal-design.md`

## Global Constraints

- Branch: `feat/premiacoes-clamp` a partir de `main`. ZERO backend.
- Título do card: `line-clamp-2`; descrição: `line-clamp-3` (Tailwind 3.4.4 confirmado — utilitários nativos).
- Modal abre APENAS pelo título/descrição clicáveis (`cursor-pointer`) — card inteiro NÃO é clicável; lápis/lixeira/select/link intocados.
- Modal: conteúdo completo (tags tipo+status, título, entidade, descrição `whitespace-pre-line`, prazo com destaque `isVencendoEm30` existente, link); mesmo estilo dos modais do arquivo (`bg-black/40 backdrop-blur-sm`, painel `bg-[var(--panel)] rounded-2xl`); fecha por X, clique no backdrop e Escape.
- Escape: `viewingItem` entra na cadeia do `useEscapeKey` (linhas 69-72) ANTES do `showForm` (prioridade: deleteConfirm → viewing → form).
- Gates: de `frontend-observatorio/`: `npx vitest run` e `npm run build` → exit 0.
- Não tocar/commitar: `.claude/settings.local.json`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md` (WIP do usuário).

---

### Task 1: Clamp + modal de detalhes em `PremiacoesTab.jsx`

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx` (estado ~linha 67; useEscapeKey linhas 69-72; card linhas 249 e 268; modais após linha 324)

**Interfaces:**
- Consumes: `STATUS_CONFIG`, `TIPO_LABEL`, `fmtDate`, `isVencendoEm30` (já no arquivo).
- Produces: UI final.

- [ ] **Step 1: Criar a branch**

```powershell
git checkout -b feat/premiacoes-clamp
```

- [ ] **Step 2: Estado + Escape**

Junto aos estados (após `deleteConfirmId`, linha 67):

```jsx
  const [viewingItem, setViewingItem] = useState(null);
```

`useEscapeKey` (linhas 69-72) vira:

```jsx
  useEscapeKey(useCallback(() => {
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    if (viewingItem) { setViewingItem(null); return; }
    if (showForm) closeForm();
  }, [deleteConfirmId, viewingItem, showForm]));
```

- [ ] **Step 3: Card — clamp + clique**

Título (linha 249) vira:

```jsx
                    <h4
                      className="font-semibold text-[var(--text)] text-sm leading-snug line-clamp-2 cursor-pointer"
                      onClick={() => setViewingItem(item)}
                    >
                      {item.titulo}
                    </h4>
```

Descrição (linha 268) vira:

```jsx
                {item.descricao && (
                  <p
                    className="text-xs text-[var(--text-dim)] leading-relaxed line-clamp-3 cursor-pointer"
                    onClick={() => setViewingItem(item)}
                  >
                    {item.descricao}
                  </p>
                )}
```

- [ ] **Step 4: Modal de detalhes**

Novo bloco `AnimatePresence` ANTES do "Delete confirm" (linha ~300):

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
                const st = STATUS_CONFIG[viewingItem.status] || STATUS_CONFIG.oportunidade;
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
                          {TIPO_LABEL[viewingItem.tipo] || viewingItem.tipo}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.color}`}>{st.label}</span>
                      </div>
                      <button
                        onClick={() => setViewingItem(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--panel-2)] transition-colors cursor-pointer shrink-0"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-[var(--text)] leading-snug">{viewingItem.titulo}</h3>
                      {viewingItem.entidade && (
                        <p className="text-xs text-slate-400 mt-1">{viewingItem.entidade}</p>
                      )}
                    </div>

                    {viewingItem.descricao && (
                      <p className="text-sm text-[var(--text-dim)] leading-relaxed whitespace-pre-line border-t border-[var(--border)] pt-3">
                        {viewingItem.descricao}
                      </p>
                    )}

                    <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
                      {viewingItem.prazo && (
                        <span className={`flex items-center gap-1 ${isVencendoEm30(viewingItem.prazo) ? "text-amber-600 font-medium" : ""}`}>
                          <CalendarDaysIcon className="w-3.5 h-3.5" /> Prazo: {fmtDate(viewingItem.prazo)}
                          {isVencendoEm30(viewingItem.prazo) && " · vence em até 30 dias"}
                        </span>
                      )}
                      {viewingItem.link && (
                        <a href={viewingItem.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                          <LinkIcon className="w-3.5 h-3.5" /> Ver detalhes
                        </a>
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

- [ ] **Step 5: Gates**

De `frontend-observatorio/`:

```powershell
npx vitest run
npm run build
```

Expected: exit 0 nos dois.

- [ ] **Step 6: Commit**

```powershell
git add frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx
git commit -m "feat(premiacoes): clamp de titulo/descricao e modal de detalhes"
```

- [ ] **Step 7: Ledger + verificação de fiação**

```powershell
Select-String -Path frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx -Pattern "line-clamp|viewingItem" | Measure-Object
```

Expected: múltiplas ocorrências (clamp×2 + estado/modal). Checklist visual (clamp, clique, modal, Escape) fica para o usuário. Registrar no `.superpowers/sdd/progress.md`.
