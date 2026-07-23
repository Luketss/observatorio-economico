# Notificações: página "Todas" + datas — Design

**Data:** 2026-07-23
**Branch alvo:** nova branch a partir de `main`
**Status:** aprovado pelo usuário (2026-07-23)

## Contexto

O sino (`NotificationBell.jsx`) mostra as notificações com tempo relativo ("há 3h") e tem um
botão "Ver todas as notificações →" **morto** — sem `onClick` e sem página de destino (a única
tela de notificações é a admin). O backend `GET /notificacoes` já devolve a lista completa
visível ao usuário (não expiradas, com `lida` e `criado_em`).

Item 3 do backlog de 2026-07-23. Quick win: **zero mudança de backend**.

## Objetivos

1. Página `/app/notificacoes` ("Todas as notificações"): lista completa com **data/hora
   absoluta** ("23/07/2026 14:32"), filtro Todas/Não lidas, clique marca como lida, botão
   "Marcar tudo como lido".
2. Botão do sino passa a navegar para a página (e fecha o painel).
3. Sino permanece com tempo relativo (decisão do usuário).

## Não-objetivos (decididos)

- Histórico com notificações expiradas (exigiria backend) — rejeitado.
- Data absoluta no sino — rejeitado (só na página).
- Paginação — volume atual não justifica; o GET devolve tudo.

## Componentes

1. **`frontend-observatorio/src/services/notificacoesApi.js`** (novo): helpers compartilhados
   `fetchNotificacoes()`, `marcarLida(id)`, `marcarTodasLidas(notifs)` (o loop de N requests
   hoje inline no sino). Sino e página consomem daqui.
2. **`frontend-observatorio/src/pages/notificacoes/NotificacoesPage.jsx`** (nova): rota
   `/app/notificacoes` no `AppRouter` (filha do `DashboardLayout`, `ProtectedRoute` — sem
   gating de plano). Lista com o padrão visual dos itens do sino (ícone por tipo/glyph,
   título, mensagem completa sem truncar), data/hora `toLocaleString("pt-BR")`, filtro
   Todas/Não lidas via `NidTabBar` com contagens, clique marca como lida, "Marcar tudo como
   lido" quando houver não lidas, estado vazio amigável.
3. **`NotificationBell.jsx`**: botão do rodapé ganha `onClick` → `navigate("/app/notificacoes")`
   + `setOpen(false)`; handlers passam a usar `notificacoesApi`; **remoção do bloco morto da
   tag `dataset`** (linhas 176-180 — o schema `NotificacaoOut` nunca envia `dataset`; a tag
   nunca renderizou).

## Erros e testes

Falhas de API seguem o padrão do sino (silent fail no fetch; na página, toast de erro nas
ações). Gates: `npx vitest run` + `npm run build`. Verificação visual (sino → página →
filtro → marcar lida) fica com o usuário, junto do checklist pendente das outras features.
