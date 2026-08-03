# Polimento do drawer — Design

**Data:** 2026-08-03
**Escopo:** frontend apenas (1 componente shell + 1 componente de render + 6 títulos + 1 wrapper; zero backend)
**Contexto:** 3º e último ciclo da frente do drawer. Fecha o backlog não-bloqueante triado
pelo review final do rollout (ledger `== PLANO 2026-08-03 drawer-rollout ==`): M1 trap
escapável, M2 seletor pega hidden, M3 headings inconsistentes, M4 border-t do PlanoGov,
e o quirk do `###` menor que o corpo.

## Decisões (validadas com o usuário)

1. **Trap em nível de documento com recaptura** (M1+M2) — o trap deixa de depender do
   foco estar dentro do painel.
2. **Títulos dos drawers normalizados para `h2` 18px** nos 5 que ficaram com `h3` 16px (M3).
3. **`###` do MarkdownLite sobe para 13.5px** (hoje 12.5px, menor que o corpo de 13px).
4. **PlanoGov ganha o wrapper `border-t pt-3` na descrição** (M4).
5. **Fora do escopo:** `visitaForm` compartilhado entre empresas na Retenção
   (pré-existente, sem bug real — segue no backlog); testes de componente (política do
   projeto mantida).

## 1. `NidDrawer` — trap robusto (`components/nid/NidDrawer.jsx`)

- O seletor `FOCAVEIS` ganha `:not([disabled])` em `input`, `select` e `textarea`
  (button já tem), e o resultado do `querySelectorAll` é filtrado por visibilidade:
  `el.offsetParent !== null` (elimina `display: none` — o file input `hidden` da
  Retenção — e subtree escondida; nenhum filho do painel usa `position: fixed`, então
  o falso-negativo clássico do `offsetParent` não se aplica).
- O handler de Tab sai do `onKeyDown` do painel e vira
  `document.addEventListener("keydown", handler, true)` no `useEffect` do `DrawerPanel`
  (removido no cleanup, junto da devolução de foco). Comportamento:
  - `key !== "Tab"` → ignora.
  - Sem focáveis visíveis → ignora.
  - `document.activeElement` fora do painel (ex.: clique em texto jogou o foco no body)
    → `preventDefault()` + foca o primeiro focável (recaptura).
  - No primeiro com Shift+Tab → wrap para o último; no último com Tab → wrap para o
    primeiro (comportamento atual).
- Escape continua sem tratamento no shell (páginas mantêm o `useEscapeKey`).
- API pública inalterada; os 8 usos não mudam por causa desta parte.

## 2. Títulos `h2` 18px (5 arquivos)

Nos drawers de CaptacaoTab, FunilTab, EscritaTab, PremiacoesTab e RetencaoTab, o título
`<h3 className="text-base font-bold text-[var(--text)] leading-snug">` vira
`<h2 className="text-lg font-bold text-[var(--text)] leading-snug">` (tag e tamanho;
demais classes idênticas). PlanoGov, Acervo e Acompanhamento já usam `h2` 18px — os 8
ficam iguais, e o `##` do MarkdownLite (`h3`) fica um nível abaixo do título no outline.
Delta visual esperado: título 16→18px nas 5 telas.

## 3. `MarkdownLite` — `###` legível (`components/nid/MarkdownLite.jsx`)

No bloco `h3` do render (elemento `h4`), `font: "700 12.5px/1.3 var(--font-display)"`
vira `font: "700 13.5px/1.3 var(--font-display)"`. Nada mais muda.

## 4. PlanoGov — wrapper da descrição (`pages/dados-internos/PlanoGovPage.jsx`)

No drawer, `{acao.descricao && <MarkdownLite texto={acao.descricao} />}` vira:

```jsx
{acao.descricao && (
  <div className="border-t border-[var(--border)] pt-3">
    <MarkdownLite texto={acao.descricao} />
  </div>
)}
```

(mesmo wrapper dos outros 4 drawers de detalhes com descrição).

## Testes e gates

- Sem testes novos (trap é DOM/efeito; política do projeto exclui testes de componente).
  Gates: vitest atual (95) exit 0 + `npm run build` exit 0. Zero backend.
- **Checklist visual (usuário):** clicar em texto do body do drawer e apertar Tab — foco
  volta para dentro do painel (não vaza para a página); Shift+Tab a partir do X vai para
  o último focável visível; títulos dos 8 drawers no mesmo tamanho; `###` maior que o
  corpo; descrição do PlanoGov com separador como as demais.

## Fora de escopo

- `visitaForm` compartilhado entre empresas (Retenção); `contenteditable` no seletor
  (sem ocorrência no app); sentinelas de foco; testes de componente. Zero backend.
