# Roles com permissões por área para usuários de município + alterar senha — Design

**Data:** 2026-07-23
**Branch alvo:** nova branch a partir de `main`
**Status:** aprovado pelo usuário (2026-07-23)

## Contexto

Hoje o controle de acesso tem 3 roles globais fixas (`ADMIN_GLOBAL`, `ADMIN_MUNICIPIO`,
`VISUALIZADOR`) e o escopo municipal vem de `usuario.municipio_id`. Na prática, dentro de um
município só o ADMIN_MUNICIPIO edita conteúdo (kanbans, dados internos, mandato) e só o
ADMIN_GLOBAL gerencia usuários. Não existe meio-termo: não dá para liberar edição de Projetos
para um assessor sem entregar tudo. Também não existe troca de senha self-service — usuário
comum depende do admin global resetar.

Este design cobre o item 4 do backlog de 2026-07-23 (roles por município + alterar senha +
side menu por permissão). A padronização de kanbans (item 5) consumirá as permissões daqui.

## Objetivos

1. **Roles customizadas nomeadas** com matriz de permissões **área × verbo**
   (criar/editar/excluir), criadas e atribuídas **somente pelo ADMIN_GLOBAL**.
2. **Catálogo híbrido**: roles globais (atribuíveis em qualquer município) e roles específicas
   de um município.
3. **Delegação de gestão de usuários**: quem tem permissão na área `usuarios` gerencia os
   usuários do próprio município (sem mexer em roles).
4. **Alterar senha self-service** para todos os usuários.
5. **Side menu por permissão**: "Painel admin" aparece para quem tem alguma permissão
   administrativa; cada seção interna respeita a permissão correspondente.

## Não-objetivos (decididos)

- Permissão de **visualização** por usuário — o que o usuário vê continua controlado pelo
  plano do município (módulos). Roles controlam apenas escrita.
- Delegar criação/atribuição de roles a usuários de município — só ADMIN_GLOBAL.
- Usuário em múltiplos municípios — segue 1 usuário : 1 município.
- Auditoria de mudanças de permissão (fica para rodada futura, junto com login_audit).
- Recuperação de senha por e-mail ("esqueci minha senha") — fluxo separado, fora deste escopo.

## Arquitetura escolhida

**Permissões em JSON na própria tabela `roles`** (estendida), 1 migration, sem joins novos.
Roles atuais viram `builtin` e mantêm o comportamento de hoje; ADMIN_GLOBAL tem bypass total
no código (o JSON dele é irrelevante).

```
roles
├─ id, nome, descricao          (existentes)
├─ municipio_id  FK nullable    NULL = catálogo global
├─ builtin       bool           roles do sistema, imutáveis
└─ permissoes    JSON           {"projetos": ["criar","editar"], "captacao": [...], ...}

usuario.role_id → roles.id      (inalterado)
```

Alternativas rejeitadas:
- *Tabelas normalizadas* (`role_permissoes` com 1 linha por área×verbo): integridade
  relacional, mas mais migration/ORM/joins para o mesmo comportamento — peso desnecessário
  na escala atual (7 cidades cliente).
- *Permissões direto no usuário* (sem entidade role): mais simples, porém abandona roles
  nomeadas reutilizáveis, que são o requisito.

### Áreas e verbos (enums em código, não no banco)

| Área (`AreaPermissao`) | Recurso | Router backend |
|---|---|---|
| `projetos` | Kanban de acompanhamento de projetos | `projetos.py` |
| `captacao` | Captação de Recursos (`CaptacaoRecurso`) | `desenvolvimento_economico.py` |
| `funil` | Funil de Investimentos (`InvestimentoFunil`) | `desenvolvimento_economico.py` |
| `escrita` | Escrita de Projetos (`EscritaProjeto`) | `desenvolvimento_economico.py` |
| `premiacoes` | Premiações (`Premiacao`) | `desenvolvimento_economico.py` |
| `retencao` | Retenção & Expansão (empresas + visitas) | `desenvolvimento_economico.py` |
| `dados_internos` | Lançamentos de dados internos | `dados_internos.py` |
| `mandato` | Timeline do mandato (marcos) | `marcos.py` |
| `usuarios` | Usuários do próprio município | `usuarios.py` |

Verbos (`VerboPermissao`): `criar`, `editar`, `excluir`. Mapeamento HTTP: `POST` → criar,
`PUT/PATCH` → editar (inclui mudança de status/estágio), `DELETE` → excluir. `GET` continua
gated por plano/módulo, nunca por role. Validação dos JSONs contra os enums acontece no
schema Pydantic do CRUD de roles (banco não constrange o conteúdo do JSON).

## Componentes

### 1. Migration 0033 (`roles` estendida)

- `ALTER TABLE roles`: `municipio_id` (FK `municipios.id`, nullable, `ondelete="CASCADE"`),
  `builtin` (bool, NOT NULL, default `false`), `permissoes` (JSON, NOT NULL, default `{}`).
- Data migration: as 3 roles existentes recebem `builtin=true`; `ADMIN_MUNICIPIO.permissoes` =
  todas as áreas × todos os verbos (comportamento atual preservado); `VISUALIZADOR` e
  `ADMIN_GLOBAL` ficam `{}` (o global tem bypass em código).
- `seed.py` atualizado para criar as roles builtin já com flags/JSON corretos.
- Nenhuma mudança em `usuarios`; nenhum registro em `municipio_management` (roles não é
  dataset). Migration roda contra a Railway (`alembic upgrade head` de `backend/`).
- **Atenção ao cascade**: role com `municipio_id` só é atribuível a usuários daquele
  município; o fluxo de exclusão de município em `municipio_management` deve remover os
  usuários **antes** das roles municipais (ou na mesma transação), senão o FK
  `usuario.role_id` bloqueia o cascade. Conferir também o clone de município (roles
  municipais NÃO são clonadas).

### 2. Núcleo de autorização (`app/core/permissions.py`)

Funções puras (testáveis sem DB):

- `tem_permissao(role, area, verbo) -> bool` — `True` se `role.nome == "ADMIN_GLOBAL"`;
  senão consulta `role.permissoes.get(area, [])`.
- `permissoes_efetivas(role) -> dict` — o mapa completo para o `/auth/me` (ADMIN_GLOBAL
  retorna tudo).
- `valida_atribuicao(role, usuario) -> None|erro` — role builtin sempre ok; custom exige
  `role.municipio_id is None` ou `== usuario.municipio_id`.

Dependency factory FastAPI: `require_permissao(area, verbo)` → resolve o usuário atual,
403 `{"detail": "Sem permissão para <verbo> em <área>"}` quando negado. Substitui as
checagens `role == ADMIN_MUNICIPIO/ADMIN_GLOBAL` nos endpoints de escrita dos routers da
tabela de áreas. O "Ver como" do ADMIN_GLOBAL não muda nada (bypass se mantém).

### 3. CRUD de roles (novo router `roles.py`, prefixo `/roles`, ADMIN_GLOBAL only)

- `GET /roles` — lista com `?municipio_id=` opcional (retorna builtin + globais + do
  município). Inclui contagem de usuários por role (para a UI avisar antes de excluir).
- `POST /roles` — nome, descricao, municipio_id (nullable), permissoes (validado por enum).
- `PUT /roles/{id}` — mesmos campos; **400 se `builtin`**.
- `DELETE /roles/{id}` — **400 se `builtin`; 409 se houver usuário com a role**.
- Atribuição continua no `PUT /usuarios/{id}` (campo `role_id` existente), agora validando
  `valida_atribuicao` — 400 se a role for de outro município.

### 4. Delegação de usuários (`usuarios.py`)

Endpoints de usuários passam a aceitar, além do ADMIN_GLOBAL, quem tem permissão
`usuarios` no verbo correspondente — **escopados ao próprio município** e com guardas
anti-escalação:

- Listagem: só usuários do próprio município (ADMIN_GLOBAL segue vendo tudo).
- `POST /usuarios`: cria apenas no próprio município; role fixada em VISUALIZADOR
  (delegado não escolhe role).
- `PUT /usuarios/{id}`: **400 se o payload trouxer `role_id` diferente do atual** (delegado
  não mexe em role), não pode editar usuário ADMIN_GLOBAL nem de outro município, não pode
  desativar a si mesmo.
- `DELETE`/desativação: mesmas guardas.

### 5. Alterar senha (`auth.py`)

- `POST /auth/alterar-senha` `{senha_atual, nova_senha}` — qualquer usuário autenticado.
- Verifica `senha_atual` contra o hash (passlib/bcrypt como no login); 400 se incorreta.
- `nova_senha` com a mesma validação mínima do campo `senha` de `schemas/usuario.py`.

### 6. `/auth/me` estendido

Retorna também `permissoes` (mapa efetivo) e `role_nome`. O frontend deixa de comparar
nomes de role espalhados e passa a consultar o mapa (exceto checagens explícitas de
ADMIN_GLOBAL, que continuam por nome).

### 7. Frontend

- **`AuthContext`**: expõe `permissoes`; hook `usePermissao(area, verbo)` e helper
  `temAlgumaPermissaoAdmin()` (mandato ou usuarios).
- **Kanbans/telas editáveis** (AcompanhamentoTab, CaptacaoTab, FunilTab, EscritaTab,
  PremiacoesTab, RetencaoTab, dados internos, mandato): o `canEdit` único vira três checks —
  botão "novo" com `criar`, lápis/select de estágio com `editar`, lixeira com `excluir`.
- **Nova página `/admin/roles`** (`RolesAdminPage.jsx`, ADMIN_GLOBAL): lista de roles
  (badge global/município, contagem de usuários) + formulário com matriz de checkboxes
  áreas × verbos e seletor de escopo. Builtin aparecem somente-leitura.
- **`UsuariosAdminPage`**: seletor de role filtrado pelo município do usuário em edição
  (builtin + globais + as daquele município).
- **Side menu (`DashboardLayout.jsx`)**: bloco "Painel admin" visível se ADMIN_GLOBAL **ou**
  `temAlgumaPermissaoAdmin()`; item "**Alterar senha**" (todos os usuários) junto ao logout,
  abrindo modal (senha atual, nova, confirmação, com feedback de erro).
- **`AppRouter.jsx`**: guardas migram de role para permissão — `/admin` acessível com
  qualquer permissão admin; `/admin/mandato` exige `mandato`; `/admin/usuarios` exige
  `usuarios`; `/admin/roles` e as demais seções seguem ADMIN_GLOBAL.

## Erros e segurança

- Backend é a fonte de verdade; o gating do frontend é só UX. Toda rota de escrita das áreas
  da tabela valida `require_permissao` no servidor.
- 403 padronizado para permissão ausente; 400 para role builtin imutável e atribuição
  inválida; 409 para exclusão de role em uso.
- Anti-escalação na delegação: delegado nunca altera `role_id`, nunca toca ADMIN_GLOBAL,
  nunca cruza município, nunca se desativa.
- Troca de senha exige a senha atual (token válido não basta).

## Testes

- **backend/tests (pure-logic, sem DB — padrão do projeto)**: `tem_permissao` (bypass do
  global, área ausente, verbo ausente), `permissoes_efetivas`, `valida_atribuicao` (global,
  mesmo município, município errado), guardas de builtin, regras anti-escalação da delegação
  (como funções puras extraídas), validação de payload de troca de senha.
- **Paridade de enums**: `permissoes.py` declara um mapa estático `AREA_LABELS` (área →
  label da UI); teste garante `set(AREA_LABELS) == set(AreaPermissao)` — área nova sem
  label/cobertura quebra o teste (mesmo padrão do teste de paridade do meta-job).
- **Frontend**: vitest para `usePermissao`; `npm run build` como gate.
- **E2E manual**: criar role "Assessor de Captação" (só `captacao`: criar/editar) na Railway,
  logar com usuário de teste, conferir kanban de captação editável, demais somente-leitura,
  side menu sem "Painel admin", alterar senha e relogar.

## Rollout

1. Migration 0033 + seed na Railway (roles builtin ganham flags/JSON — zero mudança de
   comportamento para usuários existentes).
2. Deploy backend (endpoints novos são aditivos; os antigos apenas trocam a checagem
   interna por `require_permissao`, com resultado idêntico para as roles builtin).
3. Deploy frontend.
4. ADMIN_GLOBAL cria as primeiras roles customizadas conforme demanda das 7 cidades.
