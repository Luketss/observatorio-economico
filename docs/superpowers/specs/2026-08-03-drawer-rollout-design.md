# Rollout do NidDrawer — 6 telas de detalhes — Design

**Data:** 2026-08-03
**Escopo:** frontend apenas (1 upgrade de shell + 6 telas; zero backend)
**Contexto:** 2º ciclo do drawer. O 1º (spec 2026-08-03-projetos-drawer-detalhes) criou
`NidDrawer`/`MarkdownLite` e converteu Acervo + Acompanhamento. Restam os modais de
detalhes ad-hoc (copy-paste do mesmo bloco `AnimatePresence` + `max-w-lg` centralizado)
em 5 telas, e a Retenção, que não tem modal — usa accordion inline no card.

## Decisões (validadas com o usuário)

1. **Retenção entra no ciclo**: accordion → drawer (a timeline de visitas com fotos é o
   melhor caso de uso de altura total; precedente de edição embutida = checklist no
   Acompanhamento).
2. **Hero só com imagem real**: Retenção usa a foto da visita mais recente (quando
   houver); as outras 5 telas abrem direto no header de pills + título, sem hero
   decorativo.
3. **Focus-trap no shell neste ciclo** (backlog do review final do ciclo 1), antes de
   multiplicar o shell por 8 usos.
4. Drawer continua **somente para visualizar** nas 5 telas (mutações ficam no card/linha,
   como hoje); exceção deliberada: o form de nova visita da Retenção vive no corpo do
   drawer (paridade com o accordion atual).

## 1. `NidDrawer` — contenção de foco (upgrade do shell)

`components/nid/NidDrawer.jsx`, sem dependência nova (~30 linhas):

- Ao abrir: guarda `document.activeElement` e move o foco para o botão X.
- Tab/Shift+Tab ciclam apenas pelos focáveis dentro do painel (handler de `keydown` no
  próprio painel; seletor padrão `a[href], button:not([disabled]), input, select,
  textarea, [tabindex]:not([tabindex="-1"])`).
- Ao fechar/desmontar: devolve o foco ao elemento guardado (se ainda no DOM).
- `aria-modal="true"` passa a ser honesto. Escape permanece com as páginas
  (`useEscapeKey`), como no ciclo 1 — o shell não instala listener de Escape.
- Benefício retroativo: Acervo/Acompanhamento ganham a contenção sem mudança nas páginas.

## 2. Conversões modal→drawer (5 telas somente-leitura)

Mapeamento 1:1 do conteúdo atual do modal para o body do drawer, na mesma ordem.
Sem hero, sem footer. `descricao` passa por `MarkdownLite` (texto puro renderiza
idêntico; morre o `whitespace-pre-line`). Placeholder do campo descrição nos forms de
criar/editar de cada tela ganha a dica "… Aceita ## títulos, - listas e **negrito**".

| Tela (state) | Conteúdo do drawer (ordem atual do modal) |
|---|---|
| **CaptacaoTab** (`viewingItem`) | pill de tipo (`TIPO_LABEL`) + `EstagioPill`; título + `entidade_origem`; `descricao` (markdown); metadados: `valor_estimado`, `prazo` (com realce "vence em até 30 dias" via `isVencendoEm30`), link "Ver edital" (`target="_blank"`). |
| **FunilTab** (`viewingItem`) | `EstagioPill`; `empresa_nome` + `setor`; `descricao` (markdown); metadados: `valor_estimado`, `responsavel`, `proxima_acao` + `proxima_acao_data`. |
| **EscritaTab** (`viewingItem`) | `EstagioPill` + pill de `resultado` (se houver); título + linha "Captação vinculada" (lookup em `captacoes` por `oportunidade_captacao_id`); `descricao` (markdown); metadados: `responsavel`, `prazo`, `valor_pleiteado`. |
| **PremiacoesTab** (`viewingItem`) | pill de tipo + pill de status; título + `entidade`; `descricao` (markdown); metadados: `prazo` (com realce 30 dias), link "Ver detalhes". |
| **PlanoGovPage** (`viewingAcao`) | pill de status; título + departamento; `descricao` (markdown — **hoje sem `pre-line`, quebras passam a ser preservadas: delta visual esperado e desejado**); metadados: `responsavel`, `data_inicio`, `data_prazo`, `departamentos_envolvidos` (join ", "). |

- **A11y padronizada**: Premiações (título e parágrafo clamp do card) e PlanoGov (título
  do `AcaoCard` e célula da tabela) trocam `onClick` cru por `propsTituloClicavel`
  (Captação/Funil/Escrita já usam; mesmo idioma do fix do Acervo no ciclo 1).
- As aberturas via view-tabela dos kanbans usam o mesmo state — nada muda além do
  componente de destino.
- Cadeias de `useEscapeKey` (deleteConfirm → viewing → form) intactas em todas.
- Modais de criar/editar e delete-confirm continuam modais centralizados.

## 3. Retenção — accordion → drawer (`RetencaoTab.jsx`)

O accordion inline (`expandedId` + `motion.div` de altura no card) morre; o título do
card ganha `propsTituloClicavel` e abre o drawer (state novo `viewingEmpresa`, objeto da
empresa, entra na cadeia do Escape: deleteConfirm → viewingEmpresa → showForm).

Conteúdo do drawer, de cima para baixo:

- **Hero**: foto (`foto_base64`) da visita mais recente que tiver foto; sem nenhuma
  foto → sem hero (não inventa placeholder).
- Dados da empresa: exatamente os campos que o header do card mostra hoje — paridade,
  sem campo novo (o plano transcreve a lista real do arquivo).
- **Timeline de visitas** (mesmo dado do accordion): data, responsável, `observacoes`
  (texto simples, como hoje — sem markdown; é registro operacional), foto da visita
  (miniatura clicável não entra — mesma renderização atual).
- **Form de nova visita** no corpo do drawer (mesmos campos: `data_visita`,
  `responsavel`, `observacoes`, `foto_base64` via file input; mesmo gating de permissão
  do accordion atual). Ao salvar: mesmo fluxo de hoje (recarrega o detalhe; drawer
  permanece aberto).
- **Fetch/cache**: mantém o padrão atual `detalhe[id]` — abre o drawer, dispara o fetch
  se ainda não cacheado, mostra loading padrão enquanto isso.

## Casos de borda

- Campos ausentes (`descricao`, links, prazos): seções omitidas, como hoje.
- Retenção sem visitas: timeline vazia com a mensagem atual do accordion; sem hero.
- Conteúdo antigo de `descricao` com linhas começando em `- `/`## `: passa a estilizar
  (mesmo trade-off aceito no ciclo 1 — conferir no checklist visual).
- Focus-trap × modais da página: com o drawer aberto, ações que abrem form/delete ficam
  inalcançáveis por Tab (correto — elas vivem nos cards, atrás do backdrop).

## Testes e gates

- **Sem testes novos** — shell/conversões visuais; o focus-trap é DOM/efeito (decisão de
  projeto exclui testes de componente React). Gates: vitest atual (95) exit 0 +
  `npm run build` exit 0. Zero backend.
- **Checklist visual (usuário):** abrir os 6 drawers (card e, nos kanbans, via view
  tabela); foco vai ao X e Tab não escapa do painel; foco volta ao gatilho ao fechar;
  markdown na descrição (e texto antigo inalterado); realces de prazo e links externos
  preservados; Premiações/PlanoGov abrem por teclado; Retenção: hero com foto, timeline,
  nova visita salva sem fechar o drawer; Escape/backdrop/X; 5 temas.

## Fora de escopo

- Editar/trocar estágio-status por dentro do drawer (segue no card/select, como hoje).
- Miniaturas/lightbox de fotos na timeline da Retenção; markdown em `observacoes`.
- Telas admin, ComparativoPage, modais de form/delete.
- Zero backend.
