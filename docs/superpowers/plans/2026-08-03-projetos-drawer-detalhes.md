# Projetos — Drawer de detalhes (Acervo + Acompanhamento) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os modais centralizados de detalhes de projeto (Acervo 520px, Acompanhamento 680px) por um drawer lateral de altura total com capa em destaque, markdown leve e dados do acompanhamento vinculado.

**Architecture:** Um shell `NidDrawer` (framer-motion, AnimatePresence embutido) + parser puro `markdownLite.js` + render `MarkdownLite.jsx`, aplicados nos 2 tabs de Projetos. Modais de criar/editar e confirmar exclusão permanecem modais. Spec: `docs/superpowers/specs/2026-08-03-projetos-drawer-detalhes-design.md`.

**Tech Stack:** React 18 (JSX), framer-motion (já no projeto), Tailwind + tokens nid (`styles/themes.css`), vitest.

## Global Constraints

- **Zero backend, zero migração, zero dependência nova.**
- Gates por task: `npm run test` exit 0 e `npm run build` exit 0, rodados de `frontend-observatorio/`. Eslint baseline sujo (falsos-positivos "motion unused") NÃO é gate.
- **Zero `dangerouslySetInnerHTML`** — todo render por nós React.
- Branch: `feat/projetos-drawer`, criada na Task 1 a partir da `main`.
- WIP do usuário — NÃO commitar: `.claude/settings.local.json`, `README.md`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`.
- A cadeia de Escape das páginas (`useEscapeKey`: deleteConfirm → viewing → form) NÃO muda — o drawer não instala listener próprio de teclado.
- Sem scroll-lock do fundo (paridade com os modais atuais).

---

## File Map

| File | Action |
|---|---|
| `frontend-observatorio/src/utils/markdownLite.js` | Create — parser puro |
| `frontend-observatorio/src/utils/markdownLite.test.js` | Create — 9 testes vitest |
| `frontend-observatorio/src/components/nid/NidDrawer.jsx` | Create — shell do drawer |
| `frontend-observatorio/src/components/nid/MarkdownLite.jsx` | Create — render dos blocos |
| `frontend-observatorio/src/styles/themes.css` | Modify — classes `.nid-drawer*` |
| `frontend-observatorio/src/pages/projetos/AcervoTab.jsx` | Modify — modal de detalhes → drawer |
| `frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx` | Modify — modal de detalhes → drawer |

---

### Task 1: Parser puro `markdownLite.js` (TDD)

**Files:**
- Create: `frontend-observatorio/src/utils/markdownLite.js`
- Test: `frontend-observatorio/src/utils/markdownLite.test.js`

**Interfaces:**
- Consumes: nada (puro).
- Produces: `parseMarkdownLite(texto: string|null) -> Bloco[]` e `parseInline(texto: string) -> Seg[]`, onde `Seg = { negrito: boolean, texto: string }` e `Bloco` é um de:
  - `{ tipo: "h2", inline: Seg[] }` (linha `## `)
  - `{ tipo: "h3", inline: Seg[] }` (linha `### `)
  - `{ tipo: "lista", itens: Seg[][] }` (linhas `- ` consecutivas agrupadas)
  - `{ tipo: "paragrafo", linhas: Seg[][] }` (linhas comuns; quebra simples = nova entrada em `linhas`)

- [ ] **Step 0: Criar a branch**

```bash
cd c:\Users\lucas\Documents\projetos\dashboard_prefeituras
git checkout main && git checkout -b feat/projetos-drawer
```

- [ ] **Step 1: Escrever os testes que falham**

```js
// frontend-observatorio/src/utils/markdownLite.test.js
import { describe, it, expect } from "vitest";
import { parseMarkdownLite, parseInline } from "./markdownLite";

describe("parseInline", () => {
  it("texto sem marcação vira 1 segmento não-negrito", () => {
    expect(parseInline("olá mundo")).toEqual([{ negrito: false, texto: "olá mundo" }]);
  });

  it("dois negritos na mesma linha", () => {
    expect(parseInline("a **b** c **d**")).toEqual([
      { negrito: false, texto: "a " },
      { negrito: true, texto: "b" },
      { negrito: false, texto: " c " },
      { negrito: true, texto: "d" },
    ]);
  });

  it("asteriscos sem par ficam literais", () => {
    expect(parseInline("2 ** 3 * 4")).toEqual([{ negrito: false, texto: "2 ** 3 * 4" }]);
  });
});

describe("parseMarkdownLite", () => {
  it("string vazia e null viram []", () => {
    expect(parseMarkdownLite("")).toEqual([]);
    expect(parseMarkdownLite(null)).toEqual([]);
  });

  it("h2 e h3", () => {
    const b = parseMarkdownLite("## Objetivos\n### Meta 1");
    expect(b).toEqual([
      { tipo: "h2", inline: [{ negrito: false, texto: "Objetivos" }] },
      { tipo: "h3", inline: [{ negrito: false, texto: "Meta 1" }] },
    ]);
  });

  it("linhas '- ' consecutivas agrupam numa lista; '- ' solta vira lista de 1 item", () => {
    const b = parseMarkdownLite("- a\n- b\n\n- c");
    expect(b.length).toBe(2);
    expect(b[0]).toEqual({
      tipo: "lista",
      itens: [[{ negrito: false, texto: "a" }], [{ negrito: false, texto: "b" }]],
    });
    expect(b[1].itens.length).toBe(1);
  });

  it("linha em branco separa parágrafos; quebra simples vira linha do mesmo parágrafo", () => {
    const b = parseMarkdownLite("linha 1\nlinha 2\n\noutro");
    expect(b.length).toBe(2);
    expect(b[0].tipo).toBe("paragrafo");
    expect(b[0].linhas.length).toBe(2);
    expect(b[1].linhas).toEqual([[{ negrito: false, texto: "outro" }]]);
  });

  it("texto sem marcação nenhuma vira só parágrafos (passthrough)", () => {
    const b = parseMarkdownLite("a\nb\n\nc");
    expect(b.every((x) => x.tipo === "paragrafo")).toBe(true);
  });

  it("negrito funciona dentro de título e item de lista", () => {
    const b = parseMarkdownLite("## Meta **1**\n- item **x**");
    expect(b[0].inline[1]).toEqual({ negrito: true, texto: "1" });
    expect(b[1].itens[0][1]).toEqual({ negrito: true, texto: "x" });
  });

  it("HTML não é interpretado — tag vira texto literal", () => {
    const b = parseMarkdownLite("<script>alert(1)</script>");
    expect(b).toEqual([
      { tipo: "paragrafo", linhas: [[{ negrito: false, texto: "<script>alert(1)</script>" }]] },
    ]);
  });

  it("lista interrompe parágrafo e vice-versa (sem linha em branco)", () => {
    const b = parseMarkdownLite("texto\n- item\ntexto2");
    expect(b.map((x) => x.tipo)).toEqual(["paragrafo", "lista", "paragrafo"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd frontend-observatorio && npm run test
```

Expected: FAIL — `markdownLite` não existe.

- [ ] **Step 3: Implementar o parser**

```js
// frontend-observatorio/src/utils/markdownLite.js
// Parser puro do markdown leve dos conteúdos de projeto.
// Gramática: "## "/"### " títulos, "- " itens de lista (consecutivos agrupam),
// linha em branco separa parágrafos, quebra simples vira nova linha do mesmo
// parágrafo, **negrito** em qualquer bloco. Sem HTML, links ou imagens —
// o que não casar com a gramática é texto literal.

export function parseInline(texto) {
  const segmentos = [];
  const re = /\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) segmentos.push({ negrito: false, texto: texto.slice(ultimo, m.index) });
    segmentos.push({ negrito: true, texto: m[1] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) segmentos.push({ negrito: false, texto: texto.slice(ultimo) });
  if (segmentos.length === 0) segmentos.push({ negrito: false, texto: "" });
  return segmentos;
}

export function parseMarkdownLite(texto) {
  const blocos = [];
  if (!texto) return blocos;

  let paragrafo = null;
  let lista = null;
  const fechaParagrafo = () => { if (paragrafo) { blocos.push(paragrafo); paragrafo = null; } };
  const fechaLista = () => { if (lista) { blocos.push(lista); lista = null; } };

  for (const linha of texto.split(/\r?\n/)) {
    const t = linha.trim();
    if (t === "") { fechaParagrafo(); fechaLista(); continue; }
    if (t.startsWith("### ")) { fechaParagrafo(); fechaLista(); blocos.push({ tipo: "h3", inline: parseInline(t.slice(4)) }); continue; }
    if (t.startsWith("## ")) { fechaParagrafo(); fechaLista(); blocos.push({ tipo: "h2", inline: parseInline(t.slice(3)) }); continue; }
    if (t.startsWith("- ")) {
      fechaParagrafo();
      if (!lista) lista = { tipo: "lista", itens: [] };
      lista.itens.push(parseInline(t.slice(2)));
      continue;
    }
    fechaLista();
    if (!paragrafo) paragrafo = { tipo: "paragrafo", linhas: [] };
    paragrafo.linhas.push(parseInline(t));
  }
  fechaParagrafo();
  fechaLista();
  return blocos;
}
```

- [ ] **Step 4: Rodar e confirmar que passam (suite inteira)**

```bash
npm run test
```

Expected: exit 0, 12 testes novos passando + suite anterior intacta.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/markdownLite.js frontend-observatorio/src/utils/markdownLite.test.js
git commit -m "test(projetos): parser puro de markdown leve (markdownLite.js)"
```

---

### Task 2: `NidDrawer` + `MarkdownLite` + CSS

**Files:**
- Create: `frontend-observatorio/src/components/nid/NidDrawer.jsx`
- Create: `frontend-observatorio/src/components/nid/MarkdownLite.jsx`
- Modify: `frontend-observatorio/src/styles/themes.css` (após o bloco `.nid-modal__footer`, ~linha 1327)

**Interfaces:**
- Consumes: `parseMarkdownLite` da Task 1.
- Produces:
  - `<NidDrawer open={bool} onClose={fn} ariaLabel={string} hero={node?} footer={node?}>{children}</NidDrawer>` — `AnimatePresence` embutido: a página só alterna `open`; o conteúdo do exit é preservado pelo AnimatePresence.
  - `<MarkdownLite texto={string?} />` — devolve `null` para texto vazio/null.

- [ ] **Step 1: CSS — adicionar em `themes.css`, logo após o bloco `.nid-modal__footer` (~linha 1327)**

```css
/* NidDrawer — painel lateral de detalhes (desliza da direita) */
.nid-drawer-backdrop {
  position: fixed; inset: 0;
  z-index: 100;
  background: rgba(5, 6, 16, 0.6);
  backdrop-filter: blur(8px);
  display: flex; justify-content: flex-end;
}
body.theme-light .nid-drawer-backdrop { background: rgba(15, 23, 42, 0.45); }

.nid-drawer {
  position: relative;
  height: 100dvh;
  width: 100vw;
  background: var(--panel);
  border-left: 1px solid var(--border-strong);
  box-shadow: var(--shadow-card);
  display: flex; flex-direction: column;
  overflow: hidden;
}
@media (min-width: 768px)  { .nid-drawer { width: 560px; } }
@media (min-width: 1280px) { .nid-drawer { width: 680px; } }
@media (min-width: 1600px) { .nid-drawer { width: 800px; } }

.nid-drawer__close {
  position: absolute; top: 14px; right: 14px; z-index: 2;
  background: color-mix(in oklab, var(--panel) 78%, transparent);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px; cursor: pointer;
  color: var(--text-dim);
  transition: color 0.12s, background 0.12s;
}
.nid-drawer__close:hover { color: var(--text); background: var(--panel-2); }

.nid-drawer__hero { flex-shrink: 0; }

.nid-drawer__body {
  flex: 1; min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
}

.nid-drawer__footer {
  flex-shrink: 0;
  padding: 14px 24px;
  border-top: 1px solid var(--border);
  background: var(--panel-2);
}
```

- [ ] **Step 2: Criar `NidDrawer.jsx`**

```jsx
// frontend-observatorio/src/components/nid/NidDrawer.jsx
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

/**
 * Painel lateral de detalhes (desliza da direita, altura total).
 * AnimatePresence embutido — a página só alterna `open`.
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
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="nid-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
          >
            <button onClick={onClose} className="nid-drawer__close" aria-label="Fechar">
              <XMarkIcon className="w-5 h-5" />
            </button>
            {hero && <div className="nid-drawer__hero">{hero}</div>}
            <div className="nid-drawer__body">{children}</div>
            {footer && <div className="nid-drawer__footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Criar `MarkdownLite.jsx`**

```jsx
// frontend-observatorio/src/components/nid/MarkdownLite.jsx
import { parseMarkdownLite } from "../../utils/markdownLite";

function Inline({ segs }) {
  return segs.map((s, i) =>
    s.negrito
      ? <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>{s.texto}</strong>
      : <span key={i}>{s.texto}</span>
  );
}

/** Render dos blocos do markdown leve na escala nid. Zero dangerouslySetInnerHTML. */
export default function MarkdownLite({ texto }) {
  const blocos = parseMarkdownLite(texto);
  if (blocos.length === 0) return null;
  return (
    <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, display: "grid", gap: 10 }}>
      {blocos.map((b, i) => {
        if (b.tipo === "h2") {
          return (
            <h3 key={i} style={{ font: "700 14px/1.3 var(--font-display)", color: "var(--text)", margin: "6px 0 0" }}>
              <Inline segs={b.inline} />
            </h3>
          );
        }
        if (b.tipo === "h3") {
          return (
            <h4 key={i} style={{ font: "700 12.5px/1.3 var(--font-display)", color: "var(--text)", margin: "4px 0 0" }}>
              <Inline segs={b.inline} />
            </h4>
          );
        }
        if (b.tipo === "lista") {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, listStyle: "disc" }}>
              {b.itens.map((item, j) => <li key={j}><Inline segs={item} /></li>)}
            </ul>
          );
        }
        return (
          <p key={i} style={{ margin: 0 }}>
            {b.linhas.map((l, j) => (
              <span key={j}>{j > 0 && <br />}<Inline segs={l} /></span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
```

(Os elementos são `h3`/`h4` de propósito: o título do projeto no drawer é o `h2` da hierarquia.)

- [ ] **Step 4: Gates**

```bash
npm run test
npm run build
```

Expected: ambos exit 0 (nenhum teste novo nesta task — componentes React não são testados por decisão de projeto).

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/components/nid/NidDrawer.jsx \
        frontend-observatorio/src/components/nid/MarkdownLite.jsx \
        frontend-observatorio/src/styles/themes.css
git commit -m "feat(projetos): NidDrawer (shell lateral) + MarkdownLite (render nid)"
```

---

### Task 3: Acervo — modal de detalhes → drawer

**Files:**
- Modify: `frontend-observatorio/src/pages/projetos/AcervoTab.jsx`

**Interfaces:**
- Consumes: `NidDrawer`, `MarkdownLite` (Task 2); `StatusPill` (`components/nid/StatusPill`, props `kind`/`dot`/`label`); `diasAtraso`/`progresso` de `utils/projetoStatus`.
- Produces: nada para tasks seguintes (Task 4 é independente).

**Contexto do arquivo hoje:** o modal de detalhes é o bloco `{/* Template detail modal */}` (`<AnimatePresence>` com `viewingTemplate`, `nid-modal` maxWidth 520, linhas ~320–388). Os maps `eixoAccentMap`, `eixoImagemMap`, `eixoLabel`, `selectedTemplateIds`, `acompanhamentos` e `handleSelecionar` já existem. A cadeia do `useEscapeKey` (deleteConfirmId → viewingTemplate → showForm) NÃO muda.

- [ ] **Step 1: Imports e helpers novos**

Adicionar aos imports existentes:

```jsx
import NidDrawer from "../../components/nid/NidDrawer";
import MarkdownLite from "../../components/nid/MarkdownLite";
import StatusPill from "../../components/nid/StatusPill";
import { diasAtraso, progresso } from "../../utils/projetoStatus";
```

Adicionar após `const defaultForm = ...` (module scope, mesma tabela do AcompanhamentoTab — duplicação de 5 linhas aceita, mesmo padrão do `fmtMi` dos cards):

```jsx
const STATUS_CONFIG = {
  nao_iniciado: { label: "Não iniciado", kind: "draft" },
  em_andamento: { label: "Em andamento", kind: "warn" },
  concluido:    { label: "Concluído",    kind: "ok" },
};

function fmtDate(d) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}
```

- [ ] **Step 2: Substituir o bloco `{/* Template detail modal */}` inteiro (o `<AnimatePresence>` de `viewingTemplate`) por:**

```jsx
{/* Template detail drawer */}
{(() => {
  const t = viewingTemplate;
  const accentVar = t ? (eixoAccentMap[String(t.eixo_id)] || "--accent-1") : "--accent-1";
  const coverImg = t ? eixoImagemMap[String(t.eixo_id)] : null;
  const vinculado = t && !isGlobal
    ? acompanhamentos.find((p) => p.template_id === t.id)
    : null;
  const st = vinculado ? (STATUS_CONFIG[vinculado.status] || STATUS_CONFIG.nao_iniciado) : null;
  const atraso = vinculado ? diasAtraso(vinculado) : null;
  const prog = vinculado ? progresso(vinculado.tarefas) : null;
  const podeSelecionar = t && !isGlobal && !selectedTemplateIds.has(t.id);
  return (
    <NidDrawer
      open={!!t}
      onClose={() => setViewingTemplate(null)}
      ariaLabel={t ? `Detalhes do projeto ${t.titulo}` : "Detalhes do projeto"}
      hero={t && (
        coverImg ? (
          <img
            src={coverImg}
            alt={eixoLabel(t.eixo_id) || "capa do projeto"}
            style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            className="proj-card__img"
            style={{ "--proj-accent": `var(${accentVar})`, height: 200, borderRadius: 0, border: "none" }}
          >
            PROJETO · IMAGEM
          </div>
        )
      )}
      footer={podeSelecionar && (
        <button
          onClick={() => { handleSelecionar(t); setViewingTemplate(null); }}
          disabled={selecting === t.id}
          className="proj-card__select-btn"
          style={{ width: "100%" }}
        >
          Selecionar projeto
        </button>
      )}
    >
      {t && (
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            {eixoLabel(t.eixo_id) && (
              <span
                className="proj-card__eixo-tag"
                style={{
                  color: `var(${accentVar})`,
                  background: `color-mix(in oklab, var(${accentVar}) 14%, transparent)`,
                  borderColor: "transparent",
                  marginBottom: 8,
                  display: "inline-block",
                }}
              >
                {eixoLabel(t.eixo_id)}
              </span>
            )}
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>{t.titulo}</h2>
          </div>
          {t.descricao && (
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>{t.descricao}</p>
          )}
          {t.conteudo && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <MarkdownLite texto={t.conteudo} />
            </div>
          )}
          {vinculado && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gap: 10 }}>
              <p style={{ font: "600 10.5px/1 var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-mute)", margin: 0 }}>
                Acompanhamento
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <StatusPill kind={st.kind} dot label={st.label} />
                {atraso !== null && <StatusPill kind="err" dot label={`⚠ Atrasado há ${atraso}d`} />}
                {vinculado.data_prazo && (
                  <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: atraso !== null ? "var(--accent-2)" : "var(--text-dim)" }}>
                    Prazo: {fmtDate(vinculado.data_prazo)}
                  </span>
                )}
              </div>
              {prog && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
                    <div style={{ width: `${prog.pct}%`, height: "100%", borderRadius: 999, background: "var(--accent-1)" }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", flexShrink: 0 }}>
                    {prog.feitas}/{prog.total} tarefas · {prog.pct}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </NidDrawer>
  );
})()}
```

Notas de contrato: o botão do footer replica o comportamento atual do modal — fecha imediatamente ao clicar, sem esperar a request (toast reporta o resultado). O estado "Já adicionado" do modal antigo é substituído pela seção Acompanhamento. Ações de admin (lápis/lixeira) continuam só no card.

- [ ] **Step 3: Dica de markdown no form**

No textarea "Conteúdo detalhado" do form modal, trocar o placeholder:

```jsx
placeholder="Detalhes, objetivos, metodologia... Aceita ## títulos, - listas e **negrito**"
```

- [ ] **Step 4: Gates**

```bash
npm run test
npm run build
```

Expected: ambos exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/pages/projetos/AcervoTab.jsx
git commit -m "feat(projetos): drawer de detalhes no Acervo (hero, markdown, acompanhamento)"
```

---

### Task 4: Acompanhamento — modal de detalhes → drawer

**Files:**
- Modify: `frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx`

**Interfaces:**
- Consumes: `NidDrawer`, `MarkdownLite` (Task 2). `StatusPill`, `diasAtraso`, `progresso`, `fmtDate`, `eixoLabel`, `eixoAccentMap`, `eixoImagemMap`, `STATUS_CONFIG`, `ChecklistProjeto`, `handleTarefasChange`, `canEditar` **já existem** no arquivo.
- Produces: nada.

**Contexto do arquivo hoje:** o modal de detalhes é o bloco `{/* Project detail modal */}` (`<AnimatePresence>` com `viewingProjeto`, `nid-modal` maxWidth 680, linhas ~538–626). O tab JÁ busca `/projetos/imagens` e JÁ monta `eixoAccentMap`/`eixoImagemMap` (usados nos cards do kanban) — só reaproveitar. A cadeia do `useEscapeKey` NÃO muda.

- [ ] **Step 1: Imports**

```jsx
import NidDrawer from "../../components/nid/NidDrawer";
import MarkdownLite from "../../components/nid/MarkdownLite";
```

- [ ] **Step 2: Substituir o bloco `{/* Project detail modal */}` inteiro por:**

```jsx
{/* Project detail drawer */}
{(() => {
  const p = viewingProjeto;
  const accentVar = p ? (eixoAccentMap[String(p.eixo_id)] || "--accent-1") : "--accent-1";
  const coverImg = p ? eixoImagemMap[String(p.eixo_id)] : null;
  const st = p ? (STATUS_CONFIG[p.status] || STATUS_CONFIG.nao_iniciado) : null;
  const atraso = p ? diasAtraso(p) : null;
  const prog = p ? progresso(p.tarefas) : null;
  return (
    <NidDrawer
      open={!!p}
      onClose={() => setViewingProjeto(null)}
      ariaLabel={p ? `Detalhes do projeto ${p.titulo}` : "Detalhes do projeto"}
      hero={p && (
        coverImg ? (
          <img
            src={coverImg}
            alt={eixoLabel(p.eixo_id) || "capa do projeto"}
            style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            className="proj-card__img"
            style={{ "--proj-accent": `var(${accentVar})`, height: 200, borderRadius: 0, border: "none" }}
          >
            PROJETO · IMAGEM
          </div>
        )
      )}
    >
      {p && (
        <div style={{ display: "grid", gap: 14 }}>
          {/* Cabeçalho: pills + título + progresso */}
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <StatusPill kind={st.kind} dot label={st.label} />
              {atraso !== null && <StatusPill kind="err" dot label={`⚠ Atrasado há ${atraso}d`} />}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "8px 0 0" }}>{p.titulo}</h2>
            {prog && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--panel-2)", overflow: "hidden" }}>
                  <div style={{ width: `${prog.pct}%`, height: "100%", borderRadius: 999, background: "var(--accent-1)" }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", flexShrink: 0 }}>
                  {prog.feitas}/{prog.total} tarefas · {prog.pct}%
                </span>
              </div>
            )}
          </div>

          {/* Metadados */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            {eixoLabel(p.eixo_id) && <span><span style={{ fontWeight: 600 }}>Eixo:</span> {eixoLabel(p.eixo_id)}</span>}
            {p.departamento && <span><span style={{ fontWeight: 600 }}>Departamento:</span> {p.departamento}</span>}
            {p.responsavel && <span><span style={{ fontWeight: 600 }}>Responsável:</span> {p.responsavel}</span>}
            {p.data_inicio && <span><span style={{ fontWeight: 600 }}>Início:</span> {fmtDate(p.data_inicio)}</span>}
            {p.data_prazo && (
              <span style={{ color: atraso !== null ? "var(--accent-2)" : undefined }}>
                <span style={{ fontWeight: 600 }}>Prazo:</span> {fmtDate(p.data_prazo)}
              </span>
            )}
          </div>

          {/* Descrição */}
          {p.descricao && (
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0, borderTop: "1px solid var(--border)", paddingTop: 12 }}>{p.descricao}</p>
          )}

          {/* Checklist */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <ChecklistProjeto
              projeto={p}
              canEditar={canEditar}
              onChange={(tarefas) => handleTarefasChange(p.id, tarefas)}
            />
          </div>

          {/* Notas */}
          {p.conteudo && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-mute)", margin: "0 0 6px" }}>Notas</p>
              <MarkdownLite texto={p.conteudo} />
            </div>
          )}
        </div>
      )}
    </NidDrawer>
  );
})()}
```

Nota: o cabeçalho, os metadados, a descrição e o `ChecklistProjeto` são os mesmos do modal atual (mesma ordem, mesmos estilos) — as únicas mudanças de conteúdo são o hero no topo, título 17→18px e Notas via `MarkdownLite` (morre o `whiteSpace: "pre-line"`).

- [ ] **Step 3: Gates**

```bash
npm run test
npm run build
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx
git commit -m "feat(projetos): drawer de detalhes no Acompanhamento (hero + notas em markdown)"
```

---

### Task 5: Verificação final

**Files:** nenhum (só verificação; correções pontuais se algo falhar).

- [ ] **Step 1: Gates completos**

De `frontend-observatorio/`: `npm run test` → exit 0 (suite anterior + 12 novos); `npm run build` → exit 0.

- [ ] **Step 2: Greps de conferência**

```bash
grep -c "nid-modal" frontend-observatorio/src/pages/projetos/AcervoTab.jsx
grep -c "nid-modal" frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx
grep -rn "NidDrawer" frontend-observatorio/src/pages/
grep -n "pre-line" frontend-observatorio/src/pages/projetos/AcervoTab.jsx frontend-observatorio/src/pages/projetos/AcompanhamentoTab.jsx
```

Expected: `nid-modal` presente só nos modais de form + delete confirm dos 2 arquivos (detalhe virou drawer); `NidDrawer` em exatamente 2 páginas; `pre-line` → 0 ocorrências.

- [ ] **Step 3: Sanity backend intacto (zero mudança de backend)**

```bash
venv\Scripts\python -m pytest backend/tests -q
```

Expected: exit 0.

- [ ] **Step 4: Reportar pendências para o usuário**

Checklist visual (browser) — seção "Testes e gates" da spec: drawer nos 2 tabs em tela grande e mobile; hero com capa e placeholder; markdown renderizado (e conteúdo antigo sem marcação inalterado); seção Acompanhamento no Acervo (adicionado vs não); "Selecionar projeto" no footer funciona e fecha; checklist editável no drawer do Acompanhamento; Escape/backdrop/X fecham; cadeia com deleteConfirm e form preservada; 5 temas sem bloco claro no dark. Registrar no `.superpowers/sdd/progress.md`.

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** shell/CSS/larguras/animação → Task 2; parser/gramática/testes → Task 1; render nid sem innerHTML → Task 2; Acervo (hero, tag, markdown, seção Acompanhamento, footer CTA, placeholder do form) → Task 3; Acompanhamento (hero via maps existentes, conteúdo na mesma ordem, checklist intacto, Notas markdown) → Task 4; casos de borda (sem conteúdo/descrição → seções omitidas; sem imagem/eixo → placeholder com fallback `--accent-1`; mobile 100vw) → Tasks 2–4; gates/checklist visual → Task 5.
- **Desvio da spec (a favor):** a spec mandava o Acompanhamento passar a buscar `/projetos/imagens`; o arquivo real JÁ busca e já monta `eixoImagemMap` — Task 4 só reaproveita.
- **Placeholders:** nenhum (todo step de código tem o código completo).
- **Consistência de tipos/nomes:** `parseMarkdownLite`/`parseInline` e as shapes `{ tipo, inline|itens|linhas }` idênticas entre Task 1 (parser/testes) e Task 2 (render); props do `NidDrawer` (`open`/`onClose`/`ariaLabel`/`hero`/`footer`) iguais nas Tasks 2–4; `STATUS_CONFIG` do Acervo usa só `kind`/`label` (o `dot` do Acompanhamento é ignorado pelo uso `dot label` do StatusPill — mesma chamada nos 2 arquivos).
