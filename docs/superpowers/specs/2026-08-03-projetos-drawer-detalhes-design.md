# Projetos — Drawer de detalhes (Acervo + Acompanhamento) — Design

**Data:** 2026-08-03
**Escopo:** frontend apenas (1 componente shell + 1 util puro + 1 componente de render + 2 tabs; zero backend)
**Contexto:** o modal de detalhes de projeto é centralizado (Acervo 520px, Acompanhamento 680px),
só texto, e desperdiça telas grandes — a capa que o card mostra nem aparece no modal. O mesmo
padrão de "modal de detalhes centralizado" existe em 8 lugares (Acervo, Acompanhamento,
Captação, Funil, Escrita, Premiações, Retenção, PlanoGov).

## Decisões (validadas com o usuário)

1. **Escopo: Projetos primeiro** — novo componente aplicado em Acervo + Acompanhamento neste
   ciclo; kanbans/Premiações/Retenção/PlanoGov migram num ciclo seguinte com o shell validado.
2. **Conteúdo além do texto:** imagem de capa em destaque (hero), conteúdo com formatação
   rica (markdown leve) e dados do acompanhamento vinculado no drawer do Acervo.
3. **Forma: drawer lateral** (painel deslizante da direita, altura total) — aproveita a
   altura da tela, mantém o grid visível atrás e vira shell reutilizável para a família toda.
4. Modais de **criar/editar** e **confirmar exclusão** continuam modais centralizados —
   o drawer é só para *visualizar* detalhes.

## 1. `NidDrawer` — shell reutilizável

`frontend-observatorio/src/components/nid/NidDrawer.jsx`; classes CSS novas em
`styles/themes.css` junto das `.nid-modal*` (`.nid-drawer-backdrop`, `.nid-drawer`,
`.nid-drawer__close`, `.nid-drawer__body`, `.nid-drawer__footer`).

- **Props:** `open` (bool), `onClose` (fn), `ariaLabel` (string, obrigatória),
  `hero?` (node edge-to-edge no topo), `footer?` (node em barra fixa no rodapé),
  `children` (corpo rolável).
- **`AnimatePresence` embutido** no componente — a página só alterna `open`
  (diferente do idioma atual dos modais; simplifica os 2 usos e os próximos 6).
- **Layout:** painel fixo à direita, altura 100dvh, `display: flex; flex-direction: column`;
  hero não encolhe; `__body` com `flex: 1; overflow-y: auto`; `__footer` (quando presente)
  fixo abaixo do body com borda superior.
- **Larguras (CSS):** base 100vw; `min-width: 768px` → 560px; `min-width: 1280px` → 680px;
  `min-width: 1600px` → 800px.
- **Animação:** backdrop com fade (mesmo visual do `nid-modal-backdrop`, sem centralizar);
  painel com spring framer-motion `x: "100%" → 0`, `stiffness: 300, damping: 30`
  (paridade com os modais atuais).
- **Interações/a11y:** clique no backdrop fecha (`e.target === e.currentTarget`);
  botão X sobreposto ao canto superior direito (acima do hero quando houver) com
  `aria-label="Fechar"`; `role="dialog"` + `aria-modal="true"` + `aria-label` no painel.
  Escape permanece nas páginas via `useEscapeKey` — a cadeia existente
  (deleteConfirm → viewing → form) não muda.
- **Sem scroll-lock** do fundo (paridade com os modais atuais).

## 2. Markdown leve — `utils/markdownLite.js` + `components/nid/MarkdownLite.jsx`

- **Parser puro** (padrão `chartHover`/`kanbanMove`/`tableSort`): recebe string, devolve
  árvore de blocos `[{ tipo: "h2"|"h3"|"lista"|"paragrafo", ... }]` com inline `**negrito**`.
  Gramática: linha iniciada em `## ` → h2; `### ` → h3; `- ` → item de lista (linhas
  consecutivas agrupam numa lista); linha em branco separa parágrafos; quebras simples
  dentro do parágrafo viram `<br>`; `**texto**` vira negrito em qualquer bloco.
  Sem HTML, sem links, sem imagens — o que não casar com a gramática é texto literal.
- **`MarkdownLite.jsx`** mapeia os blocos para nós React estilizados na escala nid
  (h2/h3 com peso 700 e cores `var(--text)`, corpo 13px `var(--text-dim)` line-height 1.6,
  listas com marcador). **Zero `dangerouslySetInnerHTML`** — render por nós React,
  sem risco de injeção.
- **Compatibilidade:** texto sem marcação renderiza como hoje (parágrafos com quebras) —
  conteúdo existente não muda de aparência.
- Placeholder do campo "Conteúdo detalhado" no form do Acervo ganha a dica
  (ex.: "… Aceita ## títulos, - listas e **negrito**"). Sem editor/preview.

## 3. Acervo — conteúdo do drawer (`AcervoTab.jsx`)

Substitui o modal `viewingTemplate` (nid-modal 520px). De cima para baixo:

- **Hero:** capa do eixo (mesma lógica `eixoImagemMap` do card, `object-fit: cover`,
  altura ~180–220px); sem imagem → gradiente placeholder com o accent do eixo
  (mesmo visual do `proj-card__img`).
- Tag do eixo (accent atual), título, descrição.
- **Conteúdo** via `MarkdownLite`.
- **Seção "Acompanhamento"** (só não-global e se `selectedTemplateIds.has(id)`):
  `StatusPill` do status, prazo formatado e barra de progresso `feitas/total` do checklist —
  dados do projeto vinculado já carregado em `acompanhamentos` (match por `template_id`),
  helpers `progresso`/`diasAtraso` de `utils/projetoStatus.js`.
- **Footer** (só não-global e não adicionado): botão "Selecionar projeto"
  (mesmo `handleSelecionar`; fecha o drawer imediatamente ao clicar, sem esperar a
  request — comportamento atual do modal, toast reporta o resultado).
- Ações de admin (lápis/lixeira) continuam só no card, como hoje.

## 4. Acompanhamento — mesmo shell (`AcompanhamentoTab.jsx`)

Substitui o modal `viewingProjeto` (nid-modal 680px):

- **Hero:** capa do eixo do projeto — o tab passa a buscar `/projetos/imagens` no `load`
  (mesmo `.catch(() => ({ data: [] }))` tolerante do Acervo) e monta o mesmo
  `eixoImagemMap`; sem imagem → gradiente placeholder com accent.
- Depois, o conteúdo atual do modal na mesma ordem: pills de status/atraso + título +
  barra de progresso; metadados (eixo, departamento, responsável, início, prazo com
  vermelho quando atrasado); descrição; **`ChecklistProjeto` editável inalterado**
  (mesmas props/`handleTarefasChange`); "Notas" (`conteudo`) via `MarkdownLite`.
- Sem footer.

## Casos de borda

- Template/projeto sem `conteudo`/`descricao`: seções omitidas (como hoje).
- Eixo sem imagem ou template sem eixo: placeholder gradiente (accent fallback `--accent-1`).
- Drawer aberto e dado excluído/atualizado por trás: sem tratamento novo (paridade com o
  modal atual — estado local fecha no `load()`/ação).
- Mobile: drawer ocupa 100vw (vira "tela cheia" deslizante).

## Testes e gates

- **vitest:** ~8 testes puros de `markdownLite.js` — h2/h3, lista agrupada, negrito,
  parágrafos/quebras, texto sem marcação (passthrough), linha `-` solta vs lista,
  string vazia, sem interpretação de HTML (tag literal vira texto).
- Sem testes de componente React (decisão de projeto). Gates: suite vitest atual + novos
  exit 0; `npm run build` exit 0. Eslint baseline sujo não é gate. Zero backend.
- **Checklist visual (usuário):** drawer nos 2 tabs em tela grande e mobile; hero com capa
  e placeholder; markdown renderizado (e conteúdo antigo inalterado); seção Acompanhamento
  no Acervo (adicionado vs não); "Selecionar projeto" no footer funciona e fecha; checklist
  editável no drawer do Acompanhamento; Escape/backdrop/X fecham; cadeia com deleteConfirm
  e form preservada; 5 temas sem bloco claro no dark.

## Fora de escopo

- Migração de Captação/Funil/Escrita/Premiações/Retenção/PlanoGov (próximo ciclo).
- Editor/preview de markdown no form; links/imagens/tabelas no parser.
- Deep-link por URL do drawer; scroll-lock do fundo.
- Zero backend.
