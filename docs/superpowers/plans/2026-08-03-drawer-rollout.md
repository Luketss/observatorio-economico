# Rollout do NidDrawer — 6 telas de detalhes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter os 5 modais de detalhes restantes (Captação, Funil, Escrita, Premiações, PlanoGov) e o accordion da Retenção para o `NidDrawer`, com contenção de foco no shell.

**Architecture:** Upgrade único no shell (`NidDrawer` ganha focus-trap + devolução de foco) e conversões 1:1 por tela — o conteúdo atual de cada modal vai para o body do drawer com as mesmas classes Tailwind, `descricao` passa por `MarkdownLite`, sem hero (exceto Retenção: foto da visita mais recente). Spec: `docs/superpowers/specs/2026-08-03-drawer-rollout-design.md`.

**Tech Stack:** React 18 (JSX), framer-motion, Tailwind + tokens nid, `NidDrawer`/`MarkdownLite` do ciclo anterior.

## Global Constraints

- **Zero backend, zero migração, zero dependência nova, zero `dangerouslySetInnerHTML`.**
- Gates por task: `npm run test` (95 atuais) exit 0 e `npm run build` exit 0, de `frontend-observatorio/`. Eslint baseline sujo NÃO é gate. Sem testes novos (decisão da spec: shell/conversões visuais).
- Branch: `feat/drawer-rollout`, criada na Task 1 a partir da `main`.
- WIP do usuário — NÃO commitar: `.claude/settings.local.json`, `README.md`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`.
- Cadeias de `useEscapeKey` das páginas NÃO mudam (exceto Retenção, que GANHA o estado novo na posição do meio: deleteConfirm → viewing → form). O drawer não instala listener de Escape.
- Modais de criar/editar e delete-confirm de cada tela ficam **byte-intactos** (continuam modais centralizados).
- Em cada conversão: `XMarkIcon` continua importado (usado pelos modais remanescentes); adicionar apenas os imports novos indicados.

---

## File Map

| File | Action |
|---|---|
| `frontend-observatorio/src/components/nid/NidDrawer.jsx` | Modify — focus-trap + devolução de foco |
| `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx` | Modify — modal→drawer + placeholder |
| `frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx` | Modify — modal→drawer + placeholder |
| `frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx` | Modify — modal→drawer + placeholder |
| `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx` | Modify — modal→drawer + a11y triggers + placeholder |
| `frontend-observatorio/src/pages/dados-internos/PlanoGovPage.jsx` | Modify — modal→drawer + a11y triggers + placeholder |
| `frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx` | Modify — accordion→drawer |

---

### Task 1: `NidDrawer` — contenção de foco

**Files:**
- Modify: `frontend-observatorio/src/components/nid/NidDrawer.jsx` (arquivo inteiro substituído; 42 linhas hoje)

**Interfaces:**
- Consumes: nada novo.
- Produces: MESMA API pública de antes — `<NidDrawer open onClose ariaLabel hero? footer?>{children}</NidDrawer>` (Tasks 2-4 e os usos existentes em AcervoTab/AcompanhamentoTab não mudam). Novo comportamento: foco vai ao X ao abrir, Tab/Shift+Tab ciclam dentro do painel, foco devolvido ao elemento anterior ao fechar.

- [ ] **Step 0: Criar a branch**

```bash
cd c:\Users\lucas\Documents\projetos\dashboard_prefeituras
git checkout main && git checkout -b feat/drawer-rollout
```

- [ ] **Step 1: Substituir `NidDrawer.jsx` por inteiro**

```jsx
// frontend-observatorio/src/components/nid/NidDrawer.jsx
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

const FOCAVEIS =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function DrawerPanel({ onClose, ariaLabel, hero, footer, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Foco entra no X ao abrir; volta ao elemento anterior ao desmontar.
  useEffect(() => {
    const anterior = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (anterior instanceof HTMLElement && document.contains(anterior)) anterior.focus();
    };
  }, []);

  function handleKeyDown(e) {
    if (e.key !== "Tab") return;
    const focaveis = panelRef.current?.querySelectorAll(FOCAVEIS);
    if (!focaveis || focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="nid-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      ref={panelRef}
      onKeyDown={handleKeyDown}
    >
      <button ref={closeRef} onClick={onClose} className="nid-drawer__close" aria-label="Fechar">
        <XMarkIcon className="w-5 h-5" />
      </button>
      {hero && <div className="nid-drawer__hero">{hero}</div>}
      <div className="nid-drawer__body">{children}</div>
      {footer && <div className="nid-drawer__footer">{footer}</div>}
    </motion.div>
  );
}

/**
 * Painel lateral de detalhes (desliza da direita, altura total).
 * AnimatePresence embutido — a página só alterna `open`.
 * Foco: entra no X, Tab preso no painel, devolvido ao gatilho ao fechar.
 * Escape fica a cargo da página (useEscapeKey), como nos modais.
 */
export default function NidDrawer({ open, onClose, ariaLabel, hero, footer, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="nid-drawer-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <DrawerPanel onClose={onClose} ariaLabel={ariaLabel} hero={hero} footer={footer}>
            {children}
          </DrawerPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

(O painel vira componente interno para o efeito de foco rodar no mont/desmonte do painel — inclusive durante o freeze de exit do AnimatePresence. Animação, classes e props idênticas às atuais.)

- [ ] **Step 2: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: ambos exit 0 (95 testes; nenhum teste novo).

- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/components/nid/NidDrawer.jsx
git commit -m "feat(nid): NidDrawer com contencao de foco (trap + devolucao ao gatilho)"
```

---

### Task 2: Kanbans — Captação, Funil e Escrita → drawer

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx` (modal ~linhas 529-584; textarea descrição ~linha 679)
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx` (modal ~linhas 437-487; textarea ~linha 589)
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx` (modal ~linhas 435-485; textarea ~linha 584)

**Interfaces:**
- Consumes: `NidDrawer` (Task 1, mesma API), `MarkdownLite` (`components/nid/MarkdownLite.jsx`, prop `texto`). Tudo mais que os blocos usam (`ESTAGIO_CONFIG`, `TIPO_LABEL`, `RESULTADO_CONFIG`, `EstagioPill`, `fmtMoeda`, `fmtDate`, `isVencendoEm30`, `captacoes`, ícones) já existe em cada arquivo.
- Produces: nada.

Os 3 arquivos já abrem por `propsTituloClicavel` (card e tabela) — gatilhos NÃO mudam. Em cada arquivo: (a) adicionar 2 imports, (b) substituir o bloco `{/* Detail modal */}` (o `<AnimatePresence>` inteiro de `viewingItem`) pelo bloco novo, (c) placeholder no textarea de descrição do form. A primeira linha do body tem `pr-8` para não passar por baixo do X absoluto do drawer.

- [ ] **Step 1: Imports (nos 3 arquivos)**

```jsx
import NidDrawer from "../../components/nid/NidDrawer";
import MarkdownLite from "../../components/nid/MarkdownLite";
```

- [ ] **Step 2: CaptacaoTab — substituir o bloco `{/* Detail modal */}` por:**

```jsx
{/* Detail drawer */}
{(() => {
  const item = viewingItem;
  const cfg = item ? (ESTAGIO_CONFIG[item.estagio] || ESTAGIO_CONFIG.oportunidade) : null;
  return (
    <NidDrawer
      open={!!item}
      onClose={() => setViewingItem(null)}
      ariaLabel={item ? `Detalhes da oportunidade ${item.titulo}` : "Detalhes da oportunidade"}
    >
      {item && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 flex-wrap pr-8">
            <span className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">{TIPO_LABEL[item.tipo] || item.tipo}</span>
            <EstagioPill label={cfg.label} className={cfg.color} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text)] leading-snug">{item.titulo}</h3>
            {item.entidade_origem && <p className="text-xs text-slate-400 mt-1">{item.entidade_origem}</p>}
          </div>
          {item.descricao && (
            <div className="border-t border-[var(--border)] pt-3">
              <MarkdownLite texto={item.descricao} />
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
            {item.valor_estimado != null && <span className="font-semibold text-[var(--text-dim)]">Valor estimado: {fmtMoeda(item.valor_estimado)}</span>}
            {item.prazo && (
              <span className={`flex items-center gap-1 ${isVencendoEm30(item.prazo) ? "text-amber-600 font-medium" : ""}`}>
                <CalendarDaysIcon className="w-3.5 h-3.5" /> Prazo: {fmtDate(item.prazo)}
                {isVencendoEm30(item.prazo) && " · vence em até 30 dias"}
              </span>
            )}
            {item.link && (
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline"><LinkIcon className="w-3.5 h-3.5" /> Ver edital</a>
            )}
          </div>
        </div>
      )}
    </NidDrawer>
  );
})()}
```

- [ ] **Step 3: FunilTab — substituir o bloco `{/* Detail modal */}` por:**

```jsx
{/* Detail drawer */}
{(() => {
  const item = viewingItem;
  const cfg = item ? (ESTAGIO_CONFIG[item.estagio] || ESTAGIO_CONFIG.lead) : null;
  return (
    <NidDrawer
      open={!!item}
      onClose={() => setViewingItem(null)}
      ariaLabel={item ? `Detalhes da empresa ${item.empresa_nome}` : "Detalhes da empresa"}
    >
      {item && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 flex-wrap pr-8">
            <EstagioPill label={cfg.label} color={cfg.color} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text)] leading-snug">{item.empresa_nome}</h3>
            {item.setor && <p className="text-xs text-slate-400 mt-1">{item.setor}</p>}
          </div>
          {item.descricao && (
            <div className="border-t border-[var(--border)] pt-3">
              <MarkdownLite texto={item.descricao} />
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
            {item.valor_estimado != null && <span className="font-semibold text-[var(--text-dim)]">Valor estimado: {fmtMoeda(item.valor_estimado)}</span>}
            {item.responsavel && <span className="flex items-center gap-1"><UserIcon className="w-3.5 h-3.5" /> {item.responsavel}</span>}
            {(item.proxima_acao || item.proxima_acao_data) && (
              <span className="flex items-center gap-1">
                <CalendarDaysIcon className="w-3.5 h-3.5" />
                {item.proxima_acao || "Próxima ação"}{item.proxima_acao_data ? ` · ${fmtDate(item.proxima_acao_data)}` : ""}
              </span>
            )}
          </div>
        </div>
      )}
    </NidDrawer>
  );
})()}
```

- [ ] **Step 4: EscritaTab — substituir o bloco `{/* Detail modal */}` por:**

```jsx
{/* Detail drawer */}
{(() => {
  const item = viewingItem;
  const cfg = item ? (ESTAGIO_CONFIG[item.estagio] || ESTAGIO_CONFIG.ideia) : null;
  const resCfg = item?.resultado ? RESULTADO_CONFIG[item.resultado] : null;
  const cap = item ? captacoes.find((c) => c.id === item.oportunidade_captacao_id) : null;
  return (
    <NidDrawer
      open={!!item}
      onClose={() => setViewingItem(null)}
      ariaLabel={item ? `Detalhes do projeto ${item.titulo}` : "Detalhes do projeto"}
    >
      {item && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 flex-wrap pr-8">
            <EstagioPill label={cfg.label} className={cfg.color} />
            {resCfg && <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${resCfg.color}`}>{resCfg.label}</span>}
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text)] leading-snug">{item.titulo}</h3>
            {cap && <p className="text-xs text-[var(--accent-1)] mt-1">Captação vinculada: {cap.titulo}</p>}
          </div>
          {item.descricao && (
            <div className="border-t border-[var(--border)] pt-3">
              <MarkdownLite texto={item.descricao} />
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
            {item.responsavel && <span>Responsável: {item.responsavel}</span>}
            {item.prazo && <span>Prazo: {fmtDate(item.prazo)}</span>}
            {item.valor_pleiteado != null && <span className="font-semibold text-[var(--text-dim)]">Valor pleiteado: {fmtMoeda(item.valor_pleiteado)}</span>}
          </div>
        </div>
      )}
    </NidDrawer>
  );
})()}
```

- [ ] **Step 5: Placeholder de markdown nos 3 forms**

No textarea da Descrição do form de cada arquivo (Captação ~679, Funil ~589, Escrita ~584), adicionar o atributo:

```jsx
placeholder="Aceita ## títulos, - listas e **negrito**"
```

- [ ] **Step 6: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: ambos exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx \
        frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx \
        frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx
git commit -m "feat(deseco): drawers de detalhes nos kanbans Captacao/Funil/Escrita"
```

---

### Task 3: Premiações e PlanoGov → drawer (+ teclado nos gatilhos)

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx` (gatilhos ~linhas 251-256 e 275-282; modal ~linhas 314-382; textarea ~linha 472)
- Modify: `frontend-observatorio/src/pages/dados-internos/PlanoGovPage.jsx` (gatilhos ~linhas 166-171 e ~linha 294; modal ~linhas 316-346; textarea ~linha 395)

**Interfaces:**
- Consumes: `NidDrawer`, `MarkdownLite` (como na Task 2) e `propsTituloClicavel` de `utils/cliqueAcessivel` (assinatura: `propsTituloClicavel(abrir)` → `{ role, tabIndex, onClick, onKeyDown }` — NÃO fornece cursor; manter `cursor-pointer` nas classes).
- Produces: nada.

- [ ] **Step 1: Imports**

Nos 2 arquivos:

```jsx
import NidDrawer from "../../components/nid/NidDrawer";
import MarkdownLite from "../../components/nid/MarkdownLite";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";
```

(Atenção ao path relativo: em `PlanoGovPage.jsx` os imports também são `../../` — mesma profundidade.)

- [ ] **Step 2: PremiacoesTab — gatilhos por teclado**

Título do card (~linha 251-256) — trocar:

```jsx
<h4
  className="font-semibold text-[var(--text)] text-sm leading-snug line-clamp-2 cursor-pointer"
  onClick={() => setViewingItem(item)}
>
```

por:

```jsx
<h4
  className="font-semibold text-[var(--text)] text-sm leading-snug line-clamp-2 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  {...propsTituloClicavel(() => setViewingItem(item))}
>
```

Parágrafo clamp da descrição (~linha 275-282) — trocar:

```jsx
<p
  className="text-xs text-[var(--text-dim)] leading-relaxed line-clamp-3 cursor-pointer"
  onClick={() => setViewingItem(item)}
>
```

por:

```jsx
<p
  className="text-xs text-[var(--text-dim)] leading-relaxed line-clamp-3 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  {...propsTituloClicavel(() => setViewingItem(item))}
>
```

- [ ] **Step 3: PremiacoesTab — substituir o bloco `{/* Detail modal */}` por:**

```jsx
{/* Detail drawer */}
{(() => {
  const item = viewingItem;
  const st = item ? (STATUS_CONFIG[item.status] || STATUS_CONFIG.oportunidade) : null;
  return (
    <NidDrawer
      open={!!item}
      onClose={() => setViewingItem(null)}
      ariaLabel={item ? `Detalhes da premiação ${item.titulo}` : "Detalhes da premiação"}
    >
      {item && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 flex-wrap pr-8">
            <span className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
              {TIPO_LABEL[item.tipo] || item.tipo}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.color}`}>{st.label}</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text)] leading-snug">{item.titulo}</h3>
            {item.entidade && <p className="text-xs text-slate-400 mt-1">{item.entidade}</p>}
          </div>
          {item.descricao && (
            <div className="border-t border-[var(--border)] pt-3">
              <MarkdownLite texto={item.descricao} />
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
            {item.prazo && (
              <span className={`flex items-center gap-1 ${isVencendoEm30(item.prazo) ? "text-amber-600 font-medium" : ""}`}>
                <CalendarDaysIcon className="w-3.5 h-3.5" /> Prazo: {fmtDate(item.prazo)}
                {isVencendoEm30(item.prazo) && " · vence em até 30 dias"}
              </span>
            )}
            {item.link && (
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                <LinkIcon className="w-3.5 h-3.5" /> Ver detalhes
              </a>
            )}
          </div>
        </div>
      )}
    </NidDrawer>
  );
})()}
```

- [ ] **Step 4: PlanoGovPage — gatilhos por teclado**

Título do `AcaoCard` (~linha 166-171) — trocar:

```jsx
<h4
  className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer hover:text-blue-600 transition-colors flex-1"
  onClick={() => setViewingAcao(acao)}
>
```

por:

```jsx
<h4
  className="font-medium text-[var(--text)] text-sm leading-snug cursor-pointer hover:text-blue-600 transition-colors flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  {...propsTituloClicavel(() => setViewingAcao(acao))}
>
```

Célula da tabela (~linha 294) — trocar:

```jsx
<td className="px-6 py-3 font-medium text-[var(--text)] cursor-pointer hover:text-blue-600" onClick={() => setViewingAcao(a)}>{a.titulo}</td>
```

por:

```jsx
<td className="px-6 py-3 font-medium text-[var(--text)] cursor-pointer hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" {...propsTituloClicavel(() => setViewingAcao(a))}>{a.titulo}</td>
```

- [ ] **Step 5: PlanoGovPage — substituir o bloco `{/* Detail modal */}` por:**

```jsx
{/* Detail drawer */}
{(() => {
  const acao = viewingAcao;
  const st = acao ? STATUS_CONFIG[acao.status] : null;
  return (
    <NidDrawer
      open={!!acao}
      onClose={() => setViewingAcao(null)}
      ariaLabel={acao ? `Detalhes da ação ${acao.titulo}` : "Detalhes da ação"}
    >
      {acao && (
        <div className="space-y-4">
          <div className="pr-8">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st?.color}`}>{st?.label}</span>
            <h2 className="text-lg font-bold text-[var(--text)] mt-2">{acao.titulo}</h2>
            <p className="text-sm text-slate-400">{acao.departamento}</p>
          </div>
          {acao.descricao && <MarkdownLite texto={acao.descricao} />}
          <div className="flex flex-wrap gap-4 text-xs text-slate-400 border-t border-[var(--border)] pt-3">
            {acao.responsavel && <span><span className="font-medium">Responsável:</span> {acao.responsavel}</span>}
            {acao.data_inicio && <span><span className="font-medium">Início:</span> {fmtDate(acao.data_inicio)}</span>}
            {acao.data_prazo && <span><span className="font-medium">Prazo:</span> {fmtDate(acao.data_prazo)}</span>}
            {acao.departamentos_envolvidos?.length > 0 && (
              <span className="w-full"><span className="font-medium">Depts. envolvidos:</span> {acao.departamentos_envolvidos.join(", ")}</span>
            )}
          </div>
        </div>
      )}
    </NidDrawer>
  );
})()}
```

(A descrição do PlanoGov passa a preservar quebras de linha — delta esperado da spec.)

- [ ] **Step 6: Placeholder de markdown nos 2 forms**

No textarea da Descrição (Premiações ~472, PlanoGov ~395), adicionar:

```jsx
placeholder="Aceita ## títulos, - listas e **negrito**"
```

- [ ] **Step 7: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: ambos exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx \
        frontend-observatorio/src/pages/dados-internos/PlanoGovPage.jsx
git commit -m "feat(uxui): drawers de detalhes em Premiacoes e PlanoGov + abertura por teclado"
```

---

### Task 4: Retenção — accordion → drawer

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx`

**Interfaces:**
- Consumes: `NidDrawer` (com `hero`), `propsTituloClicavel`. `detalhe`/`loadDetalhe`/`visitaForm`/`handleAddVisita`/`handleDeleteVisita`/`handleFotoChange`/`RISCO_CONFIG`/`EXPANSAO_CONFIG` já existem no arquivo. SEM `MarkdownLite` nesta tela (observações são texto simples — decisão da spec).
- Produces: nada.

- [ ] **Step 1: Imports**

Adicionar:

```jsx
import NidDrawer from "../../components/nid/NidDrawer";
import { propsTituloClicavel } from "../../utils/cliqueAcessivel";
```

Remover `ChevronDownIcon` e `ChevronUpIcon` do import de heroicons (ficam sem uso após o Step 2). `CameraIcon`, `XMarkIcon` e os demais continuam usados.

- [ ] **Step 2: Estado e handlers**

- Trocar `const [expandedId, setExpandedId] = useState(null);` por `const [viewingEmpresa, setViewingEmpresa] = useState(null);` (o state `detalhe` fica).
- Substituir a função `toggleExpand` inteira por:

```jsx
function abrirEmpresa(empresa) {
  setViewingEmpresa(empresa);
  if (!detalhe[empresa.id]) loadDetalhe(empresa.id);
}
```

- No `useEscapeKey`, inserir o estado novo no meio da cadeia:

```jsx
useEscapeKey(useCallback(() => {
  if (deleteConfirmId) { setDeleteConfirmId(null); return; }
  if (viewingEmpresa) { setViewingEmpresa(null); return; }
  if (showForm) closeForm();
}, [deleteConfirmId, viewingEmpresa, showForm]));
```

- Em `handleDelete`, trocar a linha `setExpandedId(null);` por `setViewingEmpresa(null);` (limpeza defensiva equivalente).

- [ ] **Step 3: Card — título abre o drawer, accordion morre**

No map de `empresas`: remover as consts `const isExpanded = expandedId === empresa.id;` e `const det = detalhe[empresa.id];` (não são mais usadas no card). Trocar o `<h4>` do card:

```jsx
<h4 className="font-semibold text-[var(--text)] text-sm leading-snug">{empresa.nome}</h4>
```

por:

```jsx
<h4
  className="font-semibold text-[var(--text)] text-sm leading-snug cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
  {...propsTituloClicavel(() => abrirEmpresa(empresa))}
>
  {empresa.nome}
</h4>
```

Trocar o botão "Ver histórico de visitas" (o `<button onClick={() => toggleExpand(empresa.id)}>` com os chevrons) por:

```jsx
<button
  onClick={() => abrirEmpresa(empresa)}
  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
>
  Ver histórico de visitas
</button>
```

Remover POR INTEIRO o bloco `{/* Expanded visit timeline */}` (o `<AnimatePresence>` com `isExpanded`, ~linhas 347-438) — a timeline e o form de visita renascem dentro do drawer no Step 4.

- [ ] **Step 4: Drawer (inserir logo antes do bloco `{/* Delete confirm */}`)**

```jsx
{/* Detail drawer */}
{(() => {
  const empresa = viewingEmpresa;
  const det = empresa ? detalhe[empresa.id] : null;
  const risco = empresa ? (RISCO_CONFIG[empresa.status_risco] || RISCO_CONFIG.baixo) : null;
  const expansao = empresa ? (EXPANSAO_CONFIG[empresa.potencial_expansao] || EXPANSAO_CONFIG.baixo) : null;
  const fotoHero = det?.visitas?.find((v) => v.foto_base64)?.foto_base64 || null;
  return (
    <NidDrawer
      open={!!empresa}
      onClose={() => setViewingEmpresa(null)}
      ariaLabel={empresa ? `Detalhes da empresa ${empresa.nome}` : "Detalhes da empresa"}
      hero={fotoHero && (
        <img
          src={fotoHero}
          alt={`Foto de visita a ${empresa.nome}`}
          style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
        />
      )}
    >
      {empresa && (
        <div className="space-y-4">
          <div className="pr-8">
            <h3 className="text-base font-bold text-[var(--text)] leading-snug">{empresa.nome}</h3>
            {empresa.setor && <p className="text-xs text-slate-400 mt-1">{empresa.setor}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${risco.color}`}>{risco.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${expansao.color}`}>{expansao.label}</span>
          </div>
          {empresa.num_empregos != null && (
            <p className="text-xs text-slate-400">{empresa.num_empregos.toLocaleString("pt-BR")} emprego(s)</p>
          )}

          {/* Timeline de visitas */}
          <div className="border-t border-[var(--border)] pt-3 space-y-4">
            <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Histórico de visitas</p>
            {det ? (
              det.visitas.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Nenhuma visita registrada.</p>
              ) : (
                <div className="space-y-3">
                  {det.visitas.map((v) => (
                    <div key={v.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                        <div className="w-px flex-1 bg-[var(--panel-2)] mt-1" />
                      </div>
                      <div className="flex-1 pb-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-[var(--text-dim)]">{fmtDate(v.data_visita)}</p>
                          {canEditar && (
                            <button
                              onClick={() => handleDeleteVisita(v, empresa.id)}
                              disabled={deletingVisitaId === v.id}
                              className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                            >
                              <TrashIcon className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {v.responsavel && <p className="text-xs text-slate-400">{v.responsavel}</p>}
                        {v.observacoes && <p className="text-xs text-[var(--text-dim)]">{v.observacoes}</p>}
                        {v.foto_base64 && (
                          <img src={v.foto_base64} alt="Foto da visita" className="w-16 h-16 object-cover rounded mt-1" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Add visit form (backend: visitas exigem retencao/editar) */}
            {canEditar && (
              <div className="border-t border-[var(--border)] pt-3 space-y-2">
                <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Registrar nova visita</p>
                <input
                  type="date"
                  value={visitaForm.data_visita}
                  onChange={(e) => setVisitaForm((p) => ({ ...p, data_visita: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={visitaForm.responsavel}
                  onChange={(e) => setVisitaForm((p) => ({ ...p, responsavel: e.target.value }))}
                  placeholder="Responsável"
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <textarea
                  value={visitaForm.observacoes}
                  onChange={(e) => setVisitaForm((p) => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Observações"
                  rows={2}
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs bg-[var(--panel-2)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                  <CameraIcon className="w-4 h-4" />
                  {visitaForm.foto_base64 ? "Foto selecionada ✓" : "Adicionar foto"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
                </label>
                <button
                  onClick={() => handleAddVisita(empresa.id)}
                  disabled={savingVisita}
                  className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer"
                >
                  {savingVisita ? "Registrando..." : "Registrar visita"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </NidDrawer>
  );
})()}
```

(Timeline e form são o markup atual do accordion, com `empresa.id` no lugar dos usos antigos. Registrar visita recarrega o detalhe e o drawer permanece aberto — comportamento de `handleAddVisita` inalterado. O hero usa a primeira visita com foto na ordem em que a timeline exibe.)

- [ ] **Step 5: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: ambos exit 0. Grep de sanidade: `grep -n "expandedId\|toggleExpand\|ChevronDownIcon\|ChevronUpIcon" frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx` → 0 ocorrências.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx
git commit -m "feat(deseco): Retencao com drawer de detalhes (hero de foto, timeline e nova visita)"
```

---

### Task 5: Verificação final

**Files:** nenhum (só verificação; correções pontuais se algo falhar).

- [ ] **Step 1: Gates completos**

De `frontend-observatorio/`: `npm run test` → exit 0; `npm run build` → exit 0.

- [ ] **Step 2: Greps de conferência**

```bash
grep -rln "NidDrawer" frontend-observatorio/src/pages/
grep -rn "Detail modal" frontend-observatorio/src/pages/desenvolvimento-economico frontend-observatorio/src/pages/dados-internos
grep -c "AnimatePresence" frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx
grep -rn "whitespace-pre-line" frontend-observatorio/src/pages/desenvolvimento-economico frontend-observatorio/src/pages/dados-internos
```

Expected: `NidDrawer` em 8 páginas (Acervo, Acompanhamento + as 6 novas); "Detail modal" → 0 ocorrências (todos viraram "Detail drawer"); RetencaoTab ainda usa `AnimatePresence` (delete/form) mas sem o accordion; `whitespace-pre-line` → 0 nos modais de detalhes convertidos (podem restar hits fora deles — conferir cada hit remanescente e justificar).

- [ ] **Step 3: Sanity backend intacto**

```bash
venv\Scripts\python -m pytest backend/tests -q
```

Expected: exit 0.

- [ ] **Step 4: Reportar pendências para o usuário**

Checklist visual (seção "Testes e gates" da spec): 6 drawers abrindo (card e view-tabela nos kanbans); foco no X/Tab preso/foco devolvido; markdown nas descrições (texto antigo inalterado); realces de prazo e links preservados; Premiações/PlanoGov por teclado; Retenção (hero com foto, timeline, nova visita sem fechar); Escape/backdrop/X; 5 temas. Registrar no ledger.

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** focus-trap → Task 1; 5 conversões 1:1 com markdown/pr-8/sem hero → Tasks 2-3; a11y Premiações/PlanoGov (card + tabela) → Task 3; PlanoGov preserva quebras → Task 3 Step 5; placeholders dos 5 forms → Tasks 2 Step 5 + 3 Step 6; Retenção (hero foto, timeline, form no body, cache `detalhe`, Escape com estado novo, accordion morto) → Task 4; casos de borda (campos ausentes omitidos = condicionais preservadas; sem visitas = mensagem atual; sem foto = sem hero) → embutidos nos códigos; gates/checklist → Task 5.
- **Placeholders:** nenhum — todo step de código tem o código completo.
- **Consistência de tipos/nomes:** `NidDrawer` com a MESMA API da Task 1 em todas as conversões; `MarkdownLite texto=`; `propsTituloClicavel(abrir)` idêntico ao idioma de AcompanhamentoTab/AcervoTab; `abrirEmpresa`/`viewingEmpresa` usados de forma consistente na Task 4 (estado, Escape, card, drawer, handleDelete); `EstagioPill` com `className` em Captação/Escrita e `color` no Funil (formatos reais de cada `ESTAGIO_CONFIG` — conferidos no código atual).
- **Nota:** números de linha são âncoras aproximadas (o texto dos blocos é o identificador normativo).
