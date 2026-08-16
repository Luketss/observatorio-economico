# Trilha de auditoria de ações + documentação LGPD — Design

**Data:** 2026-08-16
**Status:** design aprovado em chat pelo usuário (2026-08-16); spec aguardando revisão

## Objetivo

Completar a trilha de auditoria da plataforma — hoje limitada a logins e operações de
ingestão — cobrindo **ações administrativas sobre usuários** (criar, editar, excluir,
troca de role/senha) e **leituras de dados pessoais** (listagem de usuários, consulta
da própria auditoria), com política de retenção aplicada de verdade (purga automática).
Junto, produzir o **documento institucional de LGPD** (`docs/lgpd.md`) que descreve o
tratamento de dados pessoais da plataforma — o artefato que se anexa em contrato/parecer
jurídico e se apresenta a controle interno das prefeituras.

Motivação de produto: higiene institucional para contrato público (item 10 do
brainstorm de melhorias de 16/08). Sem LGPD documentada e trilha de acessos, o produto
fica restrito a uso informal pelos gabinetes.

## Decisões de escopo (fechadas com o usuário)

1. **Cobertura**: ações administrativas + leitura de dados pessoais. Navegação em
   páginas/datasets fica FORA — os datasets do observatório são agregados públicos,
   auditar navegação neles é analytics, não LGPD.
2. **Doc LGPD**: institucional, no repo (`docs/lgpd.md`). Política de privacidade
   visível no app (página para usuário final) fica para depois, derivada deste doc.
3. **Retenção**: 12 meses para acessos (logins e leituras — carregam IP/user-agent e
   volume; Marco Civil art. 15 pede mínimo de 6); **5 anos** para ações administrativas
   (histórico institucional). Purga automática.
4. **UI**: a tela `/admin/login-audit` evolui para "Auditoria" com abas
   **Logins | Ações**, ADMIN_GLOBAL-only como hoje. Sem visão escopada para
   ADMIN_MUNICIPIO nesta frente (fast-follow possível; lição do fail-closed c6a3ab7).
5. **Mecanismo**: tabela nova + gravação explícita nos pontos auditados (abordagem A),
   espelhando o padrão `LoginAudit`/`IngestaoAudit` existente. Middleware genérico e
   triggers de banco foram descartados (sem acesso ao diff/ator; padrão estranho ao repo
   para ~7 pontos de escrita).

**Correção de rota durante o design**: o "view-as" da plataforma não é impersonação de
usuário — é só o `?municipio_id=` que o ADMIN_GLOBAL manda em endpoints de dados
agregados (`municipio_scope` em `app/api/deps.py`). Não há evento de view-as a auditar.

## O que já existe

- **`LoginAudit`** (`backend/app/models/login_audit.py`, migração 0025): toda tentativa
  de login (sucesso/falha, motivo, IP, user-agent), gravada por
  `AuthService._record_attempt` — try/except que **nunca deixa falha de auditoria
  quebrar o login** (padrão a espelhar). Router `GET /admin/login-audit` (ADMIN_GLOBAL,
  paginado, filtros sucesso/email/role) + `GET .../summary`. Página
  `/admin/login-audit` ("Logins / Auditoria") no menu admin.
- **`IngestaoAudit`** (migração 0028): reingest CSV, wipes e auto-ingest — quem fez o
  quê em qual município. Intocado nesta frente.
- **`AuditMiddleware`** (`backend/app/api/middleware.py`): loga request lifecycle +
  correlation ID **nos logs de aplicação** (stdout/Railway). Complementar — não é
  trilha persistida nem consultável; permanece como está.
- **Captura de IP/user-agent** no router de auth (`auth.py:24-30`): `x-forwarded-for`
  com fallback para `request.client.host`. Reusar via helper (ver §2).
- **Hard delete de usuário** (`UsuarioService.delete` → `repository.delete`). A FK
  `login_audit.usuario_id` (0025) **não tem `ondelete`** → excluir usuário com
  histórico de login estoura FK hoje (bug latente; provável 500). Esta frente corrige.
- **bcrypt via passlib** (`app/core/security.py`), com hash dummy contra enumeração por
  timing — entra no doc LGPD como medida de segurança.
- **Sem lifespan/startup hook** em `app/main.py` — a purga introduz um (ver §3).

## Componentes da solução

### 1. Modelo `AcaoAudit` + migração 0037

`backend/app/models/acao_audit.py`, tabela `acao_audit`:

| Coluna            | Tipo                       | Notas                                             |
|-------------------|----------------------------|---------------------------------------------------|
| `id`              | Integer PK                 |                                                   |
| `categoria`       | String(10), NOT NULL, idx  | `'acao'` \| `'leitura'` — dirige a purga          |
| `acao`            | String(40), NOT NULL, idx  | ver vocabulário abaixo                            |
| `ator_id`         | FK usuarios `SET NULL`     | nullable                                          |
| `ator_email`      | String(150), NOT NULL      | snapshot — sobrevive ao hard delete do ator       |
| `alvo_usuario_id` | FK usuarios `SET NULL`     | nullable (leituras não têm alvo único)            |
| `alvo_email`      | String(150), nullable      | snapshot                                          |
| `municipio_id`    | FK municipios, nullable    | município do alvo (contexto), sem ondelete extra  |
| `detalhe`         | Text, nullable             | ver regras de conteúdo abaixo                     |
| `ip`              | String(64), nullable       |                                                   |
| `user_agent`      | String(512), nullable      |                                                   |
| `criado_em`       | DateTime(tz), server_now, idx |                                                |

Vocabulário de `acao` (fechado nesta frente):
- categoria `acao`: `usuario_criado`, `usuario_atualizado`, `usuario_excluido`
- categoria `leitura`: `usuarios_listados`, `auditoria_consultada`

Troca de role e de senha NÃO são ações separadas — são `usuario_atualizado` com o campo
nomeado no `detalhe` (o PUT é um só; separar criaria eventos sintéticos).

Regras do `detalhe`:
- `usuario_atualizado`: nomes dos campos presentes no payload (`exclude_unset`), ex.
  `"campos: nome, senha"`. Para `role_id`, registrar de→para por NOME da role
  (`"role: VISUALIZADOR → ADMIN_MUNICIPIO"`); para `ativo`, de→para. **Valor de senha
  jamais aparece** — só o nome do campo.
- `usuario_criado` / `usuario_excluido`: role e município do alvo.
- `usuarios_listados`: total retornado + filtro de município aplicado.
- `auditoria_consultada`: qual aba/endpoint (`logins` | `acoes`).

Migração `0037_acao_audit`:
- cria `acao_audit` com os índices (`id`, `categoria`, `acao`, `ator_id`,
  `alvo_usuario_id`, `criado_em`);
- **recria a FK `login_audit.usuario_id` com `ondelete="SET NULL"`** (drop + create
  constraint), corrigindo o bug latente do hard delete;
- ajusta o modelo `LoginAudit` para refletir o `ondelete`.

### 2. Serviço de gravação (`backend/app/services/audit_service.py`, novo)

```python
def registrar_acao(db, *, categoria, acao, ator, alvo=None, detalhe=None, request=None) -> None
```

- Espelha `_record_attempt`: `try/add/commit/except rollback` — **falha de auditoria
  nunca propaga** para a operação principal.
- Extrai IP/user-agent do `request` com a mesma regra do login (`x-forwarded-for` →
  `request.client.host`); a extração vira helper compartilhado (`ip_do_request(request)`
  em `audit_service.py` ou `api/deps.py`) e o router de auth passa a usá-lo — hoje a
  lógica está inline em `auth.py`.
- Snapshots: `ator_email = ator.email`; `alvo_email`/`municipio_id` do alvo quando há.

Pontos de chamada (todos no router `usuarios.py` + `login_audit.py`, após o sucesso da
operação, antes do return):
1. `POST /usuarios` → `usuario_criado`
2. `PUT /usuarios/{id}` → `usuario_atualizado` (diff conforme regras acima; capturar
   role/ativo ANTES do `service.update` para o de→para)
3. `DELETE /usuarios/{id}` → `usuario_excluido` (capturar snapshot do alvo antes)
4. `GET /usuarios` → `usuarios_listados`
5. `GET /admin/login-audit` → `auditoria_consultada` (`logins`)
6. `GET /admin/auditoria/acoes` (novo, ver §4) → `auditoria_consultada` (`acoes`)

Os handlers ganham o parâmetro `request: Request` onde ainda não têm.

### 3. Purga automática (retenção aplicada)

`purgar_auditoria(db)` em `audit_service.py`:
- `DELETE FROM login_audit WHERE criado_em < now() - 12 meses`
- `DELETE FROM acao_audit WHERE categoria = 'leitura' AND criado_em < now() - 12 meses`
- `DELETE FROM acao_audit WHERE categoria = 'acao' AND criado_em < now() - 5 anos`
- loga o total removido por tabela/categoria (logger da app); erro é logado e engolido
  (purga não pode derrubar o boot).

Gatilho: **lifespan do FastAPI** em `main.py` (primeiro lifespan do app). Railway
redeploya a cada push, então "na inicialização" honra os prazos na prática. Quando
existir scheduler real (frente do cron das fontes), migra para job diário — o doc LGPD
descreve a purga como "na inicialização da aplicação, com tolerância operacional", sem
prometer periodicidade que não existe.

Constantes `RETENCAO_ACESSOS_MESES = 12` e `RETENCAO_ACOES_ANOS = 5` no serviço — o
doc LGPD referencia esses nomes para manter doc e código amarrados.

### 4. API + UI

**Endpoint novo** `GET /admin/auditoria/acoes` (router `login_audit.py`, mesmo arquivo
— a tela é uma só):
- ADMIN_GLOBAL (`require_role`), `PaginatedResponse`, ordenado por `criado_em desc`
- filtros: `categoria`, `acao`, `email` (ilike em `ator_email` OU `alvo_email`)
- response `AcaoAuditOut`: id, categoria, acao, ator (id/email/nome se vivo),
  alvo (id/email), municipio_id, detalhe, ip, criado_em (user_agent fica fora da
  listagem — disponível no banco)

**Front** (`LoginAuditAdminPage.jsx`):
- título vira "Auditoria"; rota `/admin/login-audit` e label do menu mantidos
  (link não quebra; renomear rota é cosmético e fica fora)
- abas **Logins | Ações** no padrão de tabs existente (`nid-tab`); aba Logins =
  conteúdo atual intocado; aba Ações = tabela paginada com filtros (categoria, ação,
  busca por e-mail), colunas: quando, ator, ação (badge por categoria), alvo,
  detalhe, IP
- estado de erro/vazio no padrão da página atual

### 5. Documento LGPD (`docs/lgpd.md`, novo)

Institucional, em português, seções:

1. **Papéis** (art. 39): prefeitura contratante = **controladora**; plataforma =
   **operadora**. Responsabilidades de cada um.
2. **Inventário de tratamento** (art. 37): contas de usuário (nome, e-mail, hash
   bcrypt de senha, role, município, last_login), trilha de acesso (e-mail, IP,
   user-agent em `login_audit`/`acao_audit`), notificações in-app. **Nota
   delimitadora**: os datasets do observatório (PIB, CAGED, FPM etc.) são agregados
   públicos por município — não são dados pessoais; `empresas` é dado cadastral de PJ
   da base pública da RFB, **sem quadro societário** (verificar na implementação que
   nenhuma coluna de sócio/CPF existe no modelo e afirmar só o que for confirmado).
3. **Bases legais** (art. 7º): execução de contrato/procedimentos preliminares para as
   contas; obrigação legal (Marco Civil art. 15) e legítimo interesse (segurança) para
   os logs.
4. **Retenção e descarte**: 12 meses acessos / 5 anos ações, purga automática na
   inicialização — referencia `RETENCAO_ACESSOS_MESES`/`RETENCAO_ACOES_ANOS` e o
   mecanismo real. Exclusão de conta: hard delete com trilha preservada por snapshot
   de e-mail (base legal: obrigação legal/legítimo interesse pelos prazos acima).
5. **Medidas de segurança** (art. 46): bcrypt + defesa a enumeração por timing, JWT,
   RBAC fail-closed (áreas/verbos; escopo por município), rate limiting (slowapi),
   TLS no Railway, docs da API desligadas em produção, trilha de auditoria (esta
   frente), logs de aplicação com correlation ID.
6. **Direitos do titular** (art. 18) e canal de atendimento (fluxo: titular →
   controladora → operadora). **Ponto em aberto para a implementação: o e-mail
   oficial de contato do operador — perguntar ao usuário; não inventar.**
7. **Incidentes** (art. 48): detecção (logs/trilha), comunicação à controladora e
   avaliação de comunicação à ANPD em prazo razoável.

SEM seção de pendências internas (rotação de SECRET_KEY etc. são tarefas operacionais,
não entram em doc que a prefeitura vê).

### 6. Testes

Backend (pytest, padrão da suíte):
- `registrar_acao` engole exceção (sessão quebrada → operação principal sobrevive)
- cada um dos 6 pontos gera a linha certa: categoria, acao, ator/alvo, snapshots
- PUT com senha: `detalhe` contém `senha` como NOME e nunca o valor; role de→para
- DELETE de usuário com histórico de login E de auditoria: não estoura (FK SET NULL),
  linhas antigas preservam `ator_email`/`alvo_email`
- purga: linha `leitura` de 13 meses some, `acao` de 13 meses fica, `acao` de 6 anos
  some; erro de purga não propaga
- endpoint novo: 403 para não-global; filtros e paginação

Front (vitest + jsdom, padrão das páginas):
- abas alternam Logins/Ações; aba Ações renderiza linhas e aplica filtro
- badge/rotulagem por categoria

Gates: `venv/Scripts/python -m pytest backend/tests -q` + `npx vitest run` verdes;
lint = nenhum erro NOVO nos arquivos tocados (suite global já quebra, não é gate).

## Fora de escopo (anotado, não silencioso)

- Visão de auditoria escopada para ADMIN_MUNICIPIO (fast-follow possível)
- Política de privacidade visível no app para usuário final (deriva do doc)
- Auditoria de navegação em páginas/datasets (analytics, outra feature)
- Job diário de purga (depende da frente de scheduler/cron das fontes)
- Renomear a rota `/admin/login-audit` (cosmético)
- 2FA, rotação de SECRET_KEY (tarefas operacionais já rastreadas fora desta frente)
