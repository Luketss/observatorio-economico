# Suporte com formulário de atendimento (tickets) — Design

**Data:** 2026-10-19
**Status:** design aprovado em chat pelo usuário (19/10/2026); spec aguardando revisão
**Repositório:** `dashboard_prefeituras` (NID)

## Objetivo

Hoje o botão "Falar com o suporte" no rodapé da sidebar (`SuporteWhatsAppButton`) abre
direto o WhatsApp. A partir desta frente, o botão passa a oferecer uma escolha: abrir uma
solicitação de atendimento dentro da plataforma (ticket), acompanhar as solicitações já
abertas, ou ir ao WhatsApp como hoje.

O ticket fica salvo no banco. O ADMIN_GLOBAL tem uma tela própria em `/admin` com KPIs de
atendimento, lista de tickets e o detalhe de cada solicitação com os contatos do usuário.
Ele responde **fora da plataforma** (e-mail ou WhatsApp) e registra na plataforma o que fez
(status + anotações internas). O usuário que abriu vê apenas o status atual do próprio ticket.

Sucesso: um secretário abre um ticket contando o problema em 30 segundos; o ADMIN_GLOBAL vê
o ticket na lista, abre, clica em "Chamar no WhatsApp" ou "Responder por e-mail", marca como
"Em atendimento", anota "liguei 19/10, vai mandar print", e ao final marca "Resolvido". O
secretário, em "Meus atendimentos", vê o status mudar.

## Decisões de escopo (fechadas com o usuário)

1. **Dois caminhos + acompanhamento no mesmo botão.** "Falar com o suporte" abre um menu com
   três opções: "Abrir solicitação", "Meus atendimentos" e "WhatsApp". Nada de item novo na
   sidebar para o usuário comum.
2. **Formulário mínimo.** Um campo de texto livre ("Conte o que aconteceu ou o que você
   precisa"), um campo "WhatsApp para contato" (opcional, o cadastro de usuário não tem
   telefone) e a escolha do canal preferido (e-mail ou WhatsApp). Nome, e-mail, município e
   papel vêm do usuário logado.
3. **Resposta fora da plataforma.** Não há campo de resposta nem conversa dentro do sistema.
   O admin responde por e-mail/WhatsApp e registra na plataforma o status e anotações internas.
4. **Usuário acompanha pela plataforma.** Em "Meus atendimentos" vê os próprios tickets com
   data, texto enviado e status atual. Não vê anotações internas nem histórico de ações.
5. **Admin controla tudo.** Status (Aberto → Em atendimento → Resolvido, com reabrir),
   anotações internas e histórico de cada ação com data e autor. Só ADMIN_GLOBAL.
6. **Quem pode abrir:** qualquer usuário logado (VISUALIZADOR, ADMIN_MUNICIPIO e
   ADMIN_GLOBAL). O botão já aparece em `DashboardLayout` e `AdminLayout`.
7. **Sem e-mails nesta frente.** Aviso ao suporte ao abrir ticket e aviso ao usuário ao mudar
   status ficam registrados como necessidade futura (ver "Fora do escopo").

## Contexto encontrado

- `frontend-observatorio/src/components/SuporteWhatsAppButton.jsx`: `<a>` para
  `linkWhatsApp(mensagem)` com mensagem pré-preenchida com nome e e-mail do usuário
  (`useAuth().user`). Teste em `SuporteWhatsAppButton.test.jsx` cobre a mensagem com e sem
  usuário. Número centralizado em `src/config/contato.js` (`WHATSAPP_NUMERO`, `linkWhatsApp`).
- Renderizado em `DashboardLayout.jsx` (linha ~230, rodapé da sidebar, acima de tema/logout) e
  `AdminLayout.jsx` (linha ~351).
- `AuthContext.user` expõe `nome`, `email`, `role` (string: `ADMIN_GLOBAL` etc.) e
  `municipio_id`; `user.role` é usado como string em `DashboardLayout`.
- Modais existentes seguem `AlterarSenhaModal.jsx` / `MfaModal.jsx`: `framer-motion`
  `AnimatePresence`, `useEscapeKey`, `useToast`, `XMarkIcon`, estilos via variáveis CSS
  (`--panel`, `--panel-2`, `--border`, `--text-dim`, `--text-mute`).
- Páginas admin com lista + filtros + paginação: `LoginAuditAdminPage.jsx` (PAGE_SIZE 25,
  `fmtDateTime` pt-BR, `ROLE_LABELS`). `KpiCard.jsx` é o card de KPI compartilhado.
- Nav do admin em `AdminLayout.jsx`: grupos `GESTAO_ITEMS`, `DADOS_ITEMS`, `EXTRA_ITEMS`;
  ADMIN_MUNICIPIO vê só Mandato e Usuários (linhas ~275-278).
- Backend: `Usuario` (`nome`, `email`, `municipio_id`, `role_id`, sem telefone);
  `Municipio.nome`; `Role.nome`. Deps em `app/api/deps.py`: `get_current_user`,
  `require_role("ADMIN_GLOBAL")`. Exceções em `app/core/exceptions.py`
  (`ForbiddenException`, `UnauthorizedException`).
- Padrão de histórico/auditoria: `models/acao_audit.py` + `services/audit_service.py`
  (`registrar_acao(...)`), com snapshot de e-mail e FK `SET NULL`.
- Rotas registradas em `app/main.py` via `app.include_router(x.router, prefix=API_PREFIX)`.
- Alembic: head atual `0044_usuario_mfa_email`. Migrações numeradas `00NN_descricao`.
- Testes backend: pytest sem Postgres; testes de endpoint usam SQLite em memória com
  `Base.metadata.create_all(engine, tables=[...])` e chamam as funções do router diretamente
  (molde: `tests/test_cidade_inteligente_endpoints.py`). Frontend: vitest + Testing Library.
- Já existe `models/notificacao.py` (avisos por município), mas é broadcast, não serve para
  avisar um usuário específico sobre o ticket dele; não reaproveitar.

## Modelo de dados

### `suporte_tickets`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | int PK | |
| `usuario_id` | FK `usuarios.id` ON DELETE SET NULL, nullable, index | quem abriu |
| `usuario_nome` | String(150) not null | snapshot |
| `usuario_email` | String(150) not null | snapshot |
| `usuario_role` | String(50) not null | snapshot de `role.nome` |
| `municipio_id` | FK `municipios.id` ON DELETE SET NULL, nullable, index | |
| `municipio_nome` | String(150) nullable | snapshot (ADMIN_GLOBAL não tem município) |
| `mensagem` | Text not null | o que o usuário escreveu (10 a 4000 caracteres) |
| `whatsapp` | String(20) nullable | só dígitos, **sempre com DDI 55** (12 ou 13 dígitos); ver normalização em "API" |
| `canal_preferido` | String(10) not null | `email` \| `whatsapp` |
| `status` | String(20) not null, index, default `aberto` | `aberto` \| `em_atendimento` \| `resolvido` |
| `criado_em` | DateTime(tz) server_default now, index | |
| `atualizado_em` | DateTime(tz) server_default now, onupdate now | |
| `primeiro_contato_em` | DateTime(tz) nullable | preenchido na **primeira** vez que o status vai para `em_atendimento`; nunca sobrescrito (base do KPI de tempo até primeiro contato) |
| `resolvido_em` | DateTime(tz) nullable | preenchido ao ir para `resolvido`; zerado ao reabrir |

Snapshots existem para que o ticket continue legível se o usuário ou município for excluído
(mesma filosofia de `AcaoAudit`).

### `suporte_ticket_eventos`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | int PK | |
| `ticket_id` | FK `suporte_tickets.id` ON DELETE CASCADE, not null, index | |
| `tipo` | String(20) not null | `abertura` \| `status` \| `anotacao` |
| `status_de` | String(20) nullable | só em `tipo=status` |
| `status_para` | String(20) nullable | só em `tipo=status` |
| `texto` | Text nullable | anotação interna (obrigatório em `tipo=anotacao`, 1 a 2000 chars); opcional em `status` (motivo) |
| `autor_id` | FK `usuarios.id` ON DELETE SET NULL, nullable | |
| `autor_email` | String(150) not null | snapshot |
| `criado_em` | DateTime(tz) server_default now, index | |

O evento `abertura` é gravado junto com o ticket (autor = o próprio usuário). Eventos são
**append-only**: não há endpoint de editar/excluir evento.

### Migração

`backend/alembic/versions/0045_suporte_tickets.py`, `down_revision = "0044_usuario_mfa_email"`.
Cria as duas tabelas e índices. Downgrade derruba as duas.

## API (`/api/v1/suporte`)

Router novo `backend/app/api/v1/routers/suporte.py`, prefix `/suporte`, tag `Suporte`.
Schemas em `backend/app/schemas/suporte.py`. Registrar em `main.py`.

### Lado do usuário (qualquer usuário logado, `get_current_user`)

- `POST /suporte/tickets` → 201 `TicketMeuOut`
  Body `TicketCreate { mensagem: str (10..4000, strip), whatsapp: str | None, canal_preferido:
  "email" | "whatsapp" }`.
  Validações (Pydantic): `whatsapp` recebe qualquer formatação e normaliza assim (decisão
  minha, para o link `wa.me` do admin funcionar sempre): remove tudo que não é dígito; se
  sobrarem 10 ou 11 dígitos (DDD + número), prefixa `55`; se sobrarem 12 ou 13 dígitos
  começando com `55`, mantém; qualquer outra coisa → 422 "Informe um número brasileiro com
  DDD". Só números brasileiros nesta frente. Se `canal_preferido == "whatsapp"`, `whatsapp`
  é obrigatório (422 com mensagem em português). Preenche snapshots a partir de
  `current_user`; grava evento `abertura`.
  Rate limit `5/hour` **por usuário** com o `limiter` de `core/rate_limit.py` (slowapi
  aceita `key_func` por decorator: usar o `sub` do bearer; cair para IP se não houver
  token). Chave por IP sozinha limitaria uma prefeitura inteira atrás de um NAT.
- `GET /suporte/tickets/meus` → `list[TicketMeuOut]`, só os do `current_user.id`,
  mais recente primeiro. Sem paginação (volume por usuário é pequeno).

`TicketMeuOut { id, mensagem, whatsapp, canal_preferido, status, criado_em, atualizado_em }`.
Nunca expõe eventos/anotações.

### Lado do admin (`require_role("ADMIN_GLOBAL")`)

- `GET /suporte/admin/kpis` → `KpisOut { abertos: int, em_atendimento: int,
  abertos_30d: int, resolvidos_30d: int, tempo_medio_primeiro_contato_horas: float | None }`.
  `abertos` e `em_atendimento` são contagens atuais por status. `abertos_30d` = criados nos
  últimos 30 dias. `resolvidos_30d` = `resolvido_em` nos últimos 30 dias. Tempo médio = média
  de `(primeiro_contato_em - criado_em)` em horas, sobre tickets criados nos últimos 30 dias
  que tenham `primeiro_contato_em`; `None` se não houver nenhum.
- `GET /suporte/admin/tickets?status=&municipio_filtro=&skip=0&limit=25` →
  `PaginatedResponse[TicketAdminOut]` (`app/api/pagination.py`: `items, total, skip,
  limit`), mais recente primeiro. `status` vazio = todos.
  **Atenção:** o parâmetro de município se chama `municipio_filtro`, não `municipio_id`.
  O interceptor do Axios (`src/services/api.js`) injeta `municipio_id=` do "view-as"
  (`ViewAsProvider`, `sessionStorage`) em todo GET que não tenha esse parâmetro, inclusive
  em `/admin`; com o nome padrão a lista ficaria filtrada em silêncio.
- `GET /suporte/admin/tickets/{id}` → `TicketAdminDetalheOut` = `TicketAdminOut` +
  `eventos: list[EventoOut]` (ordem cronológica).
- `PATCH /suporte/admin/tickets/{id}/status` body `{ status, texto: str | None }` →
  `TicketAdminDetalheOut`. Transições permitidas: qualquer → qualquer diferente do atual
  (inclui reabrir `resolvido → aberto` ou `→ em_atendimento`). Mesmo status → 400. Efeitos:
  grava evento `status`; se for a primeira ida a `em_atendimento`, seta
  `primeiro_contato_em`; ao ir a `resolvido` seta `resolvido_em`; ao sair de `resolvido`
  zera `resolvido_em`.
- `POST /suporte/admin/tickets/{id}/anotacoes` body `{ texto }` → `TicketAdminDetalheOut`.
  Grava evento `anotacao`.

`TicketAdminOut { id, usuario_id, usuario_nome, usuario_email, usuario_role, municipio_id,
municipio_nome, mensagem, whatsapp, canal_preferido, status, criado_em, atualizado_em,
primeiro_contato_em, resolvido_em }`.
`EventoOut { id, tipo, status_de, status_para, texto, autor_email, criado_em }`.

Não há DELETE de ticket nesta frente (histórico é o produto).

### Auditoria e LGPD

Segue a convenção do projeto (`docs/lgpd.md` seções 2 e 4; `usuarios_listados` e
`auditoria_consultada` nos routers existentes): o admin lendo dado pessoal gera trilha.

- Mudança de status e anotação: `registrar_acao` com `categoria = "acao"`, `acao =
  "suporte_ticket_status"` / `"suporte_ticket_anotacao"`, `alvo` = o usuário que abriu o
  ticket, `detalhe` = `ticket #id: aberto -> em_atendimento`.
- Leituras do admin: `GET /suporte/admin/tickets` grava `categoria = "leitura"`, `acao =
  "suporte_tickets_listados"` (detalhe com os filtros usados); `GET
  /suporte/admin/tickets/{id}` grava `acao = "suporte_ticket_consultado"` com `alvo` = o
  usuário do ticket. KPIs não geram trilha (são agregados).
- Todos os endpoints admin recebem `request: Request` e passam a `registrar_acao` para
  IP/user-agent, como `login_audit.py` faz (`registrar_acao` já aceita `request=None`).
- A abertura do ticket pelo usuário **não** vai para `AcaoAudit` (já tem o próprio evento).
- **`docs/lgpd.md` faz parte desta entrega** (decisão minha): adicionar a classe **(d)
  Solicitações de suporte** na seção 2 (nome, e-mail, papel e município do solicitante,
  WhatsApp informado voluntariamente, texto livre da solicitação, histórico de status e
  anotações do suporte, com base legal de execução de contrato/atendimento) e, na seção 4,
  a regra de retenção: ticket mantido enquanto a conta do município existir, sem purga
  automática nesta frente; o texto livre pode conter dado pessoal de terceiros digitado
  pelo usuário, e o formulário avisa "não inclua dados pessoais de terceiros". A purga
  automática entra no backlog.

## Frontend

### Botão e menu (`SuporteWhatsAppButton.jsx` → renomear para `SuporteButton.jsx`)

- O botão deixa de ser `<a>` e vira `<button>` com o mesmo visual e texto "Falar com o
  suporte". Ao clicar abre um menu (popover acima do botão, dentro da sidebar) com três
  itens, cada um com ícone Heroicons e uma linha de ajuda:
  1. **Abrir solicitação** — "Conte o problema e a gente entra em contato"
  2. **Meus atendimentos** — "Veja o status das solicitações que você abriu"
  3. **WhatsApp** — "Falar agora pelo WhatsApp" (mantém `linkWhatsApp(mensagem)` atual,
     `target="_blank"`, `rel="noopener noreferrer"`)
- Fecha com Esc, clique fora ou ao escolher. Em mobile (sidebar como drawer) o popover
  pode virar lista inline abaixo do botão; o construtor decide, desde que não corte no
  drawer.
- Atualizar `DashboardLayout.jsx` e `AdminLayout.jsx` para o novo nome. Atualizar o teste
  existente: o link do WhatsApp agora está dentro do menu.

### Modal "Abrir solicitação" (`SuporteTicketModal.jsx`)

- Mesmo esqueleto de `AlterarSenhaModal`. Título "Abrir solicitação de suporte".
- Campos: textarea "Conte o que aconteceu ou o que você precisa" (obrigatório, contador
  até 4000, mínimo 10); input "WhatsApp para contato" com placeholder `(37) 99999-9999`
  (opcional); rádio "Prefiro ser contatado por": E-mail (padrão) / WhatsApp. Se marcar
  WhatsApp e o número estiver vazio, erro inline antes de enviar.
- Mostra, só leitura, "Vamos usar: {nome} · {email}" para o usuário saber o que vai junto,
  e a linha de ajuda "Não inclua dados pessoais de terceiros (CPF, telefone de outras
  pessoas)." abaixo do textarea.
- Ao enviar com sucesso: toast "Solicitação enviada. Vamos entrar em contato por {canal}."
  e fecha. Erros: 422 chega como lista em `detail` (mensagens de validator vêm com prefixo
  "Value error, " a remover); 429 do slowapi chega como `{ "error": "..." }`, que o
  interceptor não normaliza (ver tratamento em `EsqueciSenhaPage.jsx`). Mostrar texto
  amigável em ambos os casos.

### Modal "Meus atendimentos" (`SuporteMeusTicketsModal.jsx`)

- Lista de `GET /suporte/tickets/meus`: cada item com data (pt-BR), chip de status
  (Aberto / Em atendimento / Resolvido, cores distintas usando as variáveis do tema) e o
  texto enviado (truncado em 3 linhas, clique expande). Sem botão de responder.
- Estado vazio: "Você ainda não abriu nenhuma solicitação." com botão "Abrir solicitação"
  que troca para o outro modal.

### Página admin `/admin/suporte` (`SuporteAdminPage.jsx`)

- Entrada no nav: `GESTAO_ITEMS`, label "Atendimento", ícone `LifebuoyIcon` (Heroicons),
  logo após "Usuários". Rota em `AppRouter.jsx` sob `/admin` com o mesmo guard dos demais
  (ADMIN_GLOBAL).
- Topo: 4 `KpiCard`: "Em aberto" (abertos + em atendimento, com sub "{n} aguardando primeiro
  contato"), "Abertos (30 dias)", "Resolvidos (30 dias)", "Tempo até 1º contato" (horas com
  1 casa, ou "—").
- Filtros: chips de status (Todos / Abertos / Em atendimento / Resolvidos) e select de
  município (lista de `GET /municipios`, mesma fonte usada em outras telas admin).
- Tabela/lista paginada (`skip/limit`, 25 por página, mesmo padrão de
  `LoginAuditAdminPage`): data, usuário (nome + e-mail), município, canal preferido,
  início da mensagem, status. Clique abre o painel de detalhe. O filtro de município vai
  no parâmetro `municipio_filtro` (ver API).
- Detalhe (painel lateral ou modal largo, construtor decide): mensagem completa; bloco de
  contato com nome, e-mail, município, papel, WhatsApp e canal preferido; botões
  "Responder por e-mail" (`mailto:{email}?subject=Suporte NID – solicitação #{id}`) e
  "Chamar no WhatsApp" (`https://wa.me/{whatsapp}` com texto "Olá {nome}, aqui é o suporte
  do NID sobre a sua solicitação #{id}", desabilitado se não houver número); seletor de
  status com campo opcional "Motivo/observação"; caixa "Anotação interna" + botão
  "Registrar"; histórico cronológico dos eventos (abertura, mudanças de status, anotações)
  com data e autor.
- Mobile: `h-XX md:h-XX`, tabela vira cards abaixo de `md`.

## Testes

Backend (`backend/tests/test_suporte_endpoints.py`, molde `test_cidade_inteligente_endpoints.py`
com SQLite em memória):
- criar ticket preenche snapshots e evento `abertura`; `canal=whatsapp` sem número → 422;
  `(37) 99999-9999` vira `5537999999999`; `+55 37 3333-4444` vira `553733334444`; número
  com 8 dígitos ou DDI estrangeiro → 422; mensagem curta → 422.
- `meus` só devolve tickets do próprio usuário (tenancy).
- admin: lista filtra por status e `municipio_filtro`, devolve `items/total/skip/limit`;
  detalhe inclui eventos; mudança de status grava evento, seta `primeiro_contato_em` só na
  primeira vez e `resolvido_em`; reabrir zera `resolvido_em`; mesmo status → 400; anotação
  grava evento; não-ADMIN_GLOBAL → 403; listar e consultar gravam `AcaoAudit` de leitura;
  status/anotação gravam `AcaoAudit` de ação.
- KPIs: contagens e média de horas com cenário de 3 tickets (um sem primeiro contato).
- Rotas com `limiter`: desligar no teste com `monkeypatch.setattr(limiter, "enabled",
  False)`, como os testes existentes fazem.

Frontend (vitest):
- `SuporteButton.test.jsx`: menu abre com 3 opções; item WhatsApp mantém o `href` atual.
- `SuporteTicketModal.test.jsx`: bloqueia envio sem mensagem; WhatsApp obrigatório quando
  canal = whatsapp; envia payload correto.
- `SuporteAdminPage.test.jsx`: renderiza KPIs e lista a partir de respostas mockadas;
  mudança de status chama o PATCH.

## Fora do escopo (registrar no `IDEAS.md`)

- **E-mail para o suporte ao abrir ticket** (Resend já configurado; destino a definir:
  variável `SUPORTE_EMAIL` ou todos os ADMIN_GLOBAL).
- **E-mail para o usuário ao mudar status** ("sua solicitação está em atendimento /
  foi resolvida").
- Resposta dentro da plataforma / chat.
- Anexos (prints) no ticket.
- Categorias/assunto no formulário.
- Exclusão de tickets e purga automática (regra de retenção em `purgar_auditoria`).
- Números de WhatsApp fora do Brasil.

## Decisões tomadas por mim após a revisão do construtor (19/10/2026)

Confirmar ao ler; nenhuma veio do usuário.

1. WhatsApp sempre armazenado com DDI 55 (12 ou 13 dígitos); 10 ou 11 dígitos ganham o
   `55`; só Brasil.
2. Leituras do admin (lista e detalhe) geram `AcaoAudit` de leitura, e `docs/lgpd.md`
   ganha a classe (d) e a regra de retenção nesta entrega.
3. Paginação no padrão `PaginatedResponse` (`skip/limit`) do projeto.
4. Filtro de município chamado `municipio_filtro` para não colidir com o view-as.
5. Rate limit por usuário (chave = `sub` do token), não por IP.
6. Aviso "não inclua dados pessoais de terceiros" no formulário.

## O que fica a critério do construtor

- Popover vs lista inline no mobile; painel lateral vs modal no detalhe admin.
- Cores exatas dos chips de status (usar as variáveis do tema; distinguir os três).
- Nome exato das funções/arquivos internos, desde que sigam os padrões citados.
- Texto exato das entradas em `docs/lgpd.md`, desde que cubram o que a seção
  "Auditoria e LGPD" pede.
