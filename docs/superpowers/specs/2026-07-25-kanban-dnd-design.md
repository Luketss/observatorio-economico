# Drag-and-drop nos 4 kanbans (ciclo 2) — Design

**Data:** 2026-07-25
**Escopo:** frontend apenas (zero backend, zero migration)
**Kanbans:** Captação (`CaptacaoTab.jsx`), Funil (`FunilTab.jsx`), Escrita (`EscritaTab.jsx`), Projetos/Acompanhamento (`AcompanhamentoTab.jsx`)

## Objetivo

Arrastar cards entre estágios nos 4 kanbans com atualização otimista, mantendo o select
de estágio como fallback (mobile/teclado). Levar junto os residuais acordados do ciclo 1
(ledger `.superpowers/sdd/progress.md`, seção kanbans-padronizacao).

## Decisões de escopo (validadas com o usuário)

1. **Só movimento entre estágios.** Sem reordenação dentro da coluna (nem visual, nem
   persistida). A ordem dentro da coluna segue a atual (ordem do array retornado pela API).
   Consequência: **não** usamos `@dnd-kit/sortable`; só `@dnd-kit/core`.
2. **Funil mantém o layout de linhas horizontais** (cada estágio é uma seção com grid de
   cards). O DnD arrasta entre linhas; a linha inteira é a zona de soltar.
3. **Select de estágio permanece** em todos os cards como caminho de mobile/teclado/precisão.
   Sem `KeyboardSensor` do dnd-kit (o teclado já tem caminho via select; Enter no título
   abre o modal de detalhes).
4. **Pós-drop otimista com reversão:** card muda de coluna na hora; `PUT` em background;
   sucesso = refetch silencioso; erro = card volta + toast com `detail` do backend.

## Arquitetura

Dependência nova única: **`@dnd-kit/core`** (^6.x). Nenhuma mudança de backend — os
endpoints existentes já aceitam atualização parcial:

| Kanban   | Endpoint                                        | Campo     |
|----------|--------------------------------------------------|-----------|
| Captação | `PUT /desenvolvimento-economico/captacao/{id}`   | `estagio` |
| Funil    | `PUT /desenvolvimento-economico/funil/{id}`      | `estagio` |
| Escrita  | `PUT /desenvolvimento-economico/escrita/{id}`    | `estagio` |
| Projetos | `PUT /projetos/{id}`                             | `status`  |

### Arquivos novos (`frontend-observatorio/src/`)

- `components/kanban/KanbanDndContext.jsx` — envolve `DndContext` + `DragOverlay` + sensores
- `components/kanban/DraggableCard.jsx` — wrapper `useDraggable` para o card de cada tab
- `components/kanban/DroppableColumn.jsx` — zona de soltar (coluna, ou linha no Funil)
- `components/kanban/EstagioPill.jsx` — pill de estágio extraída (residual do ledger)
- `utils/kanbanMove.js` — helpers puros do movimento otimista (testados com vitest)

### Arquivos alterados

Os 4 tabs. Cada um **mantém seu markup de card próprio** (Escrita tem pill de resultado e
captação vinculada; Projetos tem capa de eixo etc.) — as primitivas só envolvem. Sem
pretensão de dedup de board (decisão herdada do ciclo 1).

## Primitivas compartilhadas

### `KanbanDndContext`

Props: `onMove(id, novoValor)`, `renderOverlay(item)`, `items`, `disabled`.

- Sensores: `PointerSensor` com `activationConstraint: { distance: 8 }` (clique em
  título/botões/select continua funcionando — só vira drag após 8px de movimento) e
  `TouchSensor` com `delay: 200, tolerance: 8` (long-press para arrastar no touch).
- `onDragStart`: guarda o item ativo (para o overlay).
- `onDragEnd`: chama `onMove(activeId, overId)` **somente** se soltou sobre uma zona
  (`over != null`) e `overId !== estagio/status atual do item`. Caso contrário, no-op.
- `DragOverlay` (portal, evita clipping por `overflow`): renderiza `renderOverlay(item)` —
  clone do card com sombra elevada e ~2° de rotação. Card original fica com opacidade
  reduzida durante o drag.
- Autoscroll default do dnd-kit permanece ativo (útil no Funil, verticalmente longo).

### `DraggableCard`

Props: `id`, `data` (item), `disabled`, `children`. `useDraggable`; aplica
`setNodeRef/listeners/attributes` na div externa; `cursor-grab` apenas quando habilitado.
`disabled` quando `!canEditar` (mesmo gating do select). Sem handle dedicado: o card
inteiro é a alça (a activation distance resolve o conflito com cliques).

### `DroppableColumn`

Props: `id` (= estagio/status), `disabled`, `children`. `useDroppable`; quando `isOver`
durante um drag, a área ganha realce (anel/borda accent + fundo suave). O placeholder
"Vazio" tracejado existente já serve de alvo visual em coluna vazia — permanece.

### `EstagioPill`

Pill visual `px-2 py-0.5 rounded-full text-[11px] font-medium` com `background:
var(--panel-2)` e cor do estágio. Props: `label`, `color`. Substitui as duplicações em:
tabela + modal do Funil, tabela da Captação, tabela + modal da Escrita (pills de
**estágio**; a pill de *resultado* da Escrita e o `StatusPill` nid de Projetos ficam
como estão).

## Fluxo de dados por tab

Cada tab ganha `moverCard(id, novoValor)` que **unifica DnD e select**:

1. Snapshot do array atual; `setItems(aplicarMovimento(items, id, campo, novoValor))`
   (helper puro; `campo` = `"estagio"` ou `"status"`).
2. `await api.put(endpoint, { [campo]: novoValor })`.
3. Sucesso: toast "Estágio atualizado" (Projetos: "Status atualizado") + `load()` — o
   `load()` dos tabs já é silencioso após a primeira carga (o spinner só existe no mount),
   e re-sincroniza KPIs/resumo/funnel chart com a verdade do servidor.
4. Erro: `setItems(snapshot)` + toast de erro com
   `err?.response?.data?.detail || "Erro ao atualizar estágio"` — corrige o residual
   "detail engolido no handleEstagioChange" nos 4 tabs.

Os `handleEstagioChange`/`handleStatusChange` atuais são substituídos por `moverCard`
(o select ganha o comportamento otimista de graça).

Casos de borda:

- Soltar fora de qualquer zona ou na mesma coluna → no-op (nenhum request).
- Drags concorrentes: o `DndContext` só permite um drag por vez; um segundo `moverCard`
  antes do primeiro resolver usa snapshot próprio — reversões parciais são aceitáveis
  (janela minúscula, mesmo padrão serializado não é necessário aqui).
- Projetos com filtro de eixo ativo: zonas e movimento inalterados; só a visibilidade
  dos cards muda.
- Funil: `isGlobal` já não vê o board (inalterado); demais tabs sem `canEditar` têm
  `DraggableCard` desabilitado.

## Residuais do ledger incluídos neste ciclo

1. **A11y dos títulos clicáveis** (cards e linhas de tabela, 4 kanbans): `role="button"`,
   `tabIndex={0}`, Enter/Espaço abre o modal de detalhes, `focus-visible` ring.
2. **`colSpan` condicional** nos empty rows das 4 tabelas: base + 1 somente se
   `canEditar || canExcluir` (Captação 6+1, Funil 6+1, Escrita 7+1, Projetos 5+1).
3. **`EstagioPill` extraída** (ver acima).
4. **`detail` no toast de erro** de mudança de estágio (via `moverCard`).

Fora de escopo: indentação de fragments (cosmético), demais residuais do ledger.

## Testes e gates

- `utils/kanbanMove.js` com vitest (~6 testes): mover para outro estágio, mesma coluna
  (retorna array original), id inexistente (no-op), campo `status` vs `estagio`,
  imutabilidade (array/objetos originais intactos).
- **Sem simulação de drag em jsdom** — pesado e frágil; padrão do projeto é lógica pura
  + `npm run build` como gate.
- Gates: vitest (32 existentes + novos) exit 0; `npm run build` exit 0; eslint baseline
  sujo conhecido (falsos-positivos "motion unused"/set-state-in-effect documentados).

## Checklist visual (usuário, pós-implementação)

1. Arrastar card entre colunas nos 4 kanbans (Captação, Funil entre linhas, Escrita,
   Projetos) — card muda na hora, toast de sucesso, KPIs/contadores atualizam.
2. Highlight da zona ao pairar; ghost com sombra/rotação; original semitransparente.
3. Soltar fora / na mesma coluna → nada acontece.
4. Com rede offline (DevTools), arrastar → card volta + toast de erro.
5. Select de estágio continua funcionando (agora otimista).
6. Clique simples no título ainda abre modal (não inicia drag); Tab + Enter no título
   abre modal.
7. Sem `canEditar` (role restrita): cards não arrastam, select oculto como antes.
8. Touch (se disponível): long-press ~200ms inicia drag.
