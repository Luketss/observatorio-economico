# Premiações: clamp de texto + modal de detalhes — Design

**Data:** 2026-07-23
**Branch alvo:** nova branch a partir de `main`
**Status:** aprovado pelo usuário (2026-07-23)

## Contexto

Em `/app/desenvolvimento-economico/premiacoes` (`PremiacoesTab.jsx`), a descrição do card é
renderizada sem truncamento (linha 268) e o título sem clamp — textos longos deixam os cards
com alturas muito diferentes. Não existe modal de detalhes; o texto completo só é visível
editando.

Item 4 do backlog de 2026-07-23. Quick win, **zero backend**, um arquivo.

## Objetivos

1. Card uniforme: **descrição limitada a 3 linhas** e **título a 2 linhas** (line-clamp).
2. **Modal de detalhes** com o conteúdo completo: tags tipo+status, título, entidade,
   descrição inteira (`pre-line`), prazo (mantendo o destaque "vence em 30 dias" existente
   via `isVencendoEm30`), link.
3. Abertura: **título e descrição do card clicáveis** (`cursor-pointer`) — padrão do kanban
   de Projetos. Escape fecha (cadeia do `useEscapeKey` existente, prioridade acima do form).

## Não-objetivos (decididos)

- Card inteiro clicável (conflito com lápis/lixeira/select/link) — rejeitado.
- Botão "Ver mais" — rejeitado.
- Edição dentro do modal — o lápis do card já cobre.
- Altura fixa/igualada dos cards — o clamp resolve a variação relevante; a residual por
  campos opcionais é aceitável.

## Componentes (tudo em `frontend-observatorio/src/pages/desenvolvimento-economico/PremiacoesTab.jsx`)

1. **Clamp**: título (linha 249) e descrição (linha 268) ganham line-clamp (2 e 3 linhas).
   Usar utilitários `line-clamp-2`/`line-clamp-3` se o Tailwind do projeto for ≥ 3.3
   (conferir `package.json`); senão, style inline `display: "-webkit-box",
   WebkitLineClamp: N, WebkitBoxOrient: "vertical", overflow: "hidden"`.
2. **Estado + modal**: `viewingItem` (padrão `viewingProjeto` do AcompanhamentoTab); título
   e descrição com `onClick={() => setViewingItem(item)}` e `cursor-pointer`; modal com o
   mesmo estilo visual dos dois modais existentes no arquivo (`bg-black/40 backdrop-blur`,
   painel `bg-[var(--panel)] rounded-2xl`), fechando por X, clique no backdrop e Escape
   (adicionar `viewingItem` à cadeia do `useEscapeKey`, antes do `showForm`).

## Testes

Sem lógica pura nova. Gates: `npx vitest run` + `npm run build`. Visual fica com o usuário.
