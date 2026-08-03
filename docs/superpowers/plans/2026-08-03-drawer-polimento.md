# Polimento do drawer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o backlog do shell do drawer: trap de Tab em nível de documento com recaptura, seletor de focáveis com filtro de visibilidade, títulos normalizados (h2 18px) nos 8 drawers, `###` legível e wrapper da descrição do PlanoGov.

**Architecture:** 2 tasks de código — (1) componentes de shell (`NidDrawer` + `MarkdownLite`), (2) 6 páginas com edições de 1 linha cada — e verificação final. Spec: `docs/superpowers/specs/2026-08-03-drawer-polimento-design.md`.

**Tech Stack:** React 18 (JSX), framer-motion, Tailwind + tokens nid.

## Global Constraints

- **Zero backend, zero dependência nova, zero `dangerouslySetInnerHTML`.**
- Gates por task: `npm run test` (95) exit 0 e `npm run build` exit 0, de `frontend-observatorio/`. Sem testes novos (política do projeto). Eslint baseline sujo NÃO é gate.
- Branch: `feat/drawer-polimento`, criada na Task 1 a partir da `main`.
- WIP do usuário — NÃO commitar: `.claude/settings.local.json`, `README.md`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`.
- API pública do `NidDrawer` inalterada (`open onClose ariaLabel hero? footer?` + children); os 8 call-sites não mudam por causa da Task 1. Escape continua com as páginas.

---

## File Map

| File | Action |
|---|---|
| `frontend-observatorio/src/components/nid/NidDrawer.jsx` | Modify — trap no documento + seletor filtrado |
| `frontend-observatorio/src/components/nid/MarkdownLite.jsx` | Modify — h4 (`###`) 12.5→13.5px |
| `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx` | Modify — título do drawer h3→h2 |
| `frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx` | Modify — idem |
| `frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx` | Modify — idem |
| `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx` | Modify — idem |
| `frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx` | Modify — idem |
| `frontend-observatorio/src/pages/dados-internos/PlanoGovPage.jsx` | Modify — wrapper `border-t pt-3` na descrição |

---

### Task 1: Shell — `NidDrawer` trap robusto + `MarkdownLite` 13.5px

**Files:**
- Modify: `frontend-observatorio/src/components/nid/NidDrawer.jsx` (arquivo inteiro substituído)
- Modify: `frontend-observatorio/src/components/nid/MarkdownLite.jsx` (1 linha)

**Interfaces:**
- Consumes: nada novo.
- Produces: mesma API pública do `NidDrawer`. Comportamento novo: trap de Tab via `document.addEventListener("keydown", ..., true)` ativo enquanto o painel existe, com recaptura quando o foco está fora do painel; focáveis filtrados por `offsetParent !== null` e `:not([disabled])`.

- [ ] **Step 0: Criar a branch**

```bash
cd c:\Users\lucas\Documents\projetos\dashboard_prefeituras
git checkout main && git checkout -b feat/drawer-polimento
```

- [ ] **Step 1: Substituir `NidDrawer.jsx` por inteiro**

```jsx
// frontend-observatorio/src/components/nid/NidDrawer.jsx
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveisVisiveis(panel) {
  return Array.from(panel.querySelectorAll(FOCAVEIS)).filter((el) => el.offsetParent !== null);
}

function DrawerPanel({ onClose, ariaLabel, hero, footer, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Foco entra no X ao abrir; trap de Tab no documento (recaptura quando o foco
  // escapa do painel); foco volta ao elemento anterior ao desmontar.
  useEffect(() => {
    const anterior = document.activeElement;
    closeRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focaveis = focaveisVisiveis(panelRef.current);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      if (!panelRef.current.contains(ativo)) {
        e.preventDefault();
        primeiro.focus();
        return;
      }
      if (e.shiftKey && ativo === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (anterior instanceof HTMLElement && document.contains(anterior)) anterior.focus();
    };
  }, []);

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
 * Foco: entra no X, Tab preso no painel (trap no documento, com recaptura
 * quando o foco escapa), devolvido ao gatilho ao fechar.
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

(Diferenças vs atual: seletor com `:not([disabled])` nos 3 controles; helper `focaveisVisiveis` com filtro `offsetParent`; handler movido do `onKeyDown` do painel para listener de documento em capture, com branch de recaptura; `onKeyDown` removido do `motion.div`.)

- [ ] **Step 2: `MarkdownLite.jsx` — 1 linha**

No bloco `if (b.tipo === "h3")`, trocar:

```jsx
<h4 key={i} style={{ font: "700 12.5px/1.3 var(--font-display)", color: "var(--text)", margin: "4px 0 0" }}>
```

por:

```jsx
<h4 key={i} style={{ font: "700 13.5px/1.3 var(--font-display)", color: "var(--text)", margin: "4px 0 0" }}>
```

- [ ] **Step 3: Gates**

```bash
cd frontend-observatorio && npm run test && npm run build
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/components/nid/NidDrawer.jsx \
        frontend-observatorio/src/components/nid/MarkdownLite.jsx
git commit -m "fix(nid): trap de foco do drawer em nivel de documento + '###' legivel"
```

---

### Task 2: Títulos h2 nos 5 drawers + wrapper do PlanoGov

**Files:**
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx`
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx`
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx`
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx`
- Modify: `frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx`
- Modify: `frontend-observatorio/src/pages/dados-internos/PlanoGovPage.jsx`

**Interfaces:**
- Consumes: nada das tasks anteriores (mudanças independentes de marcação).
- Produces: nada.

- [ ] **Step 1: Título do drawer h3→h2 (5 arquivos)**

Em cada arquivo, DENTRO do bloco `{/* Detail drawer */}`, existe exatamente um título com esta assinatura (o conteúdo varia por tela):

```jsx
<h3 className="text-base font-bold text-[var(--text)] leading-snug">…</h3>
```

Trocar tag e tamanho, mantendo o resto:

```jsx
<h2 className="text-lg font-bold text-[var(--text)] leading-snug">…</h2>
```

Conteúdos por arquivo (para localizar sem ambiguidade): Captação `{item.titulo}`; Funil `{item.empresa_nome}`; Escrita `{item.titulo}`; Premiações `{item.titulo}`; Retenção `{empresa.nome}`. NÃO tocar nos `<h3>` dos modais de form ("Editar…"/"Novo…"/"Nova Empresa") nem nos `<h4>` dos cards.

- [ ] **Step 2: PlanoGov — wrapper da descrição**

No bloco `{/* Detail drawer */}` de `PlanoGovPage.jsx`, trocar:

```jsx
{acao.descricao && <MarkdownLite texto={acao.descricao} />}
```

por:

```jsx
{acao.descricao && (
  <div className="border-t border-[var(--border)] pt-3">
    <MarkdownLite texto={acao.descricao} />
  </div>
)}
```

- [ ] **Step 3: Gates + grep de sanidade**

```bash
cd frontend-observatorio && npm run test && npm run build
grep -rn "text-base font-bold text-\[var(--text)\] leading-snug" src/pages/
```

Expected: gates exit 0; grep → 0 ocorrências (as 5 viraram `text-lg` em `h2`).

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/desenvolvimento-economico/CaptacaoTab.jsx \
        frontend-observatorio/src/pages/desenvolvimento-economico/FunilTab.jsx \
        frontend-observatorio/src/pages/desenvolvimento-economico/EscritaTab.jsx \
        frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx \
        frontend-observatorio/src/pages/desenvolvimento-economico/RetencaoTab.jsx \
        frontend-observatorio/src/pages/dados-internos/PlanoGovPage.jsx
git commit -m "feat(uxui): titulos h2 nos 8 drawers + separador na descricao do PlanoGov"
```

---

### Task 3: Verificação final

**Files:** nenhum.

- [ ] **Step 1: Gates completos**

De `frontend-observatorio/`: `npm run test` → exit 0; `npm run build` → exit 0.

- [ ] **Step 2: Greps**

```bash
grep -c "offsetParent" frontend-observatorio/src/components/nid/NidDrawer.jsx
grep -rn "12.5px" frontend-observatorio/src/components/nid/MarkdownLite.jsx
grep -rn "onKeyDown" frontend-observatorio/src/components/nid/NidDrawer.jsx
```

Expected: `offsetParent` ≥ 1; `12.5px` → 0; `onKeyDown` → 0 (handler agora é listener de documento).

- [ ] **Step 3: Sanity backend**

```bash
venv\Scripts\python -m pytest backend/tests -q
```

Expected: exit 0.

- [ ] **Step 4: Reportar pendências**

Checklist visual (spec, "Testes e gates"): clique em texto do body + Tab → foco recapturado; Shift+Tab do X → último focável visível; títulos dos 8 drawers iguais; `###` maior que o corpo; PlanoGov com separador. Registrar no ledger.

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** trap documento/recaptura/seletor → Task 1 Step 1; `###` 13.5px → Task 1 Step 2; h2 18px nas 5 → Task 2 Step 1; wrapper PlanoGov → Task 2 Step 2; gates/checklist → Task 3.
- **Placeholders:** nenhum.
- **Consistência:** assinatura do título idêntica nos 5 arquivos (conferida no código real — vem verbatim dos blocos do rollout); `focaveisVisiveis`/`FOCAVEIS` usados só na Task 1; API do NidDrawer inalterada.
