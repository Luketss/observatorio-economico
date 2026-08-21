# Cidade Inteligente / ISO-ABNT (módulo 07, v1) — Design

**Data:** 2026-08-20
**Status:** aprovado pelo usuário (2026-08-20 — abordagem B1 módulo próprio; estrutura genérica cadastrada pelo município; requisito com status + evidência)

## Objetivo

Dar vida ao módulo 07 do documento do cliente (futuro do Eixo 2, até aqui
sem código): uma página onde o município acompanha certificações de cidade
(ABNT/ISO e afins) que está perseguindo — requisitos com status,
responsável e evidência, e progresso por certificação.

## Decisões aprovadas

- **Estrutura genérica, sem seed**: o município cria a certificação (ex.
  "ABNT NBR ISO 37122") e cadastra os próprios requisitos. Nada da norma é
  embutido no produto — as listas de indicadores ISO/ABNT são conteúdo
  protegido, e a estrutura genérica serve qualquer selo (ISO, prêmios
  estaduais, selos de gestão).
- **Shape do requisito**: título, categoria (o "eixo", texto livre),
  status `pendente | em_andamento | atendido`, responsável (texto),
  evidência (URL http(s) + nota). Certificação exibe % de atendidos.
- **Módulo próprio (B1)**: 2 tabelas novas, router novo, página nova no
  Eixo 2, chave de plano e área de permissão novas. Rejeitadas: hospedar
  em Planos de Desenvolvimento ou no Plano de Governo (mistura semântica;
  a v2 não teria onde crescer).

## Arquitetura — Dados (migração 0040)

Migração `0040_cidade_inteligente` (down_revision `0039_marco_link`):

- **`certificacao_cidade`**: id PK; municipio_id FK municipios idx NOT
  NULL; nome String(150) NOT NULL; entidade String(100) nullable (ex.
  "ABNT"); descricao Text nullable; ativo Boolean default True;
  criado_em/atualizado_em DateTime NOT NULL (server_default now, padrão
  0038).
- **`certificacao_requisito`**: id PK; certificacao_id FK
  certificacao_cidade CASCADE idx NOT NULL; titulo String(200) NOT NULL;
  categoria String(100) nullable; status String(20) NOT NULL default
  `pendente`; responsavel String(120) nullable; evidencia_url Text
  nullable; evidencia_nota Text nullable; criado_em/atualizado_em idem.

Models em `backend/app/models/cidade_inteligente.py` (2 classes,
relationship com cascade delete-orphan nos requisitos).

## Arquitetura — Backend

Router novo `backend/app/api/v1/routers/cidade_inteligente.py`
(`prefix="/cidade-inteligente"`, registrado no main.py):

- `GET /certificacoes` — `scoped_modulo("cidade_inteligente")` + view-as
  leitura (padrão listar_retencao: `municipio_id` query honrado só para
  ADMIN_GLOBAL). Retorna certificações ativas do município com contadores
  por status (`total`, `atendidos`, `em_andamento`, `pendentes`) numa
  query agregada — a barra de progresso do front não refaz a conta.
- `GET /certificacoes/{id}` — detalhe com a lista de requisitos (ordenados
  por categoria, titulo). Tenancy: 404/403 padrão F3.
- `POST/PUT/DELETE /certificacoes` e `POST/PUT/DELETE
  /certificacoes/{id}/requisitos[/{rid}]` —
  `require_permissao("cidade_inteligente", "criar|editar|excluir")`,
  tenancy inline (molde contatos/demandas da F3). DELETE de certificação
  leva os requisitos (CASCADE).
- Validações: `status` via Literal no schema Pydantic; `evidencia_url`
  mesma regra do link do marco (http(s) ou 400 legível; `""` → None —
  update com `""` limpa).
- Schemas em `backend/app/schemas/cidade_inteligente.py` (Create/Update/
  Out para os 2 recursos; `CertificacaoResumoOut` com os contadores).

## Arquitetura — Frontend

- **Página `src/pages/cidade-inteligente/CidadeInteligentePage.jsx`**:
  `NidPageHeader` título "Cidade Inteligente" + sub "Certificações e
  selos que o município acompanha."; guard `needsMunicipio` +
  `SelecioneMunicipio`; grid de cards de certificação (nome, entidade,
  barra de progresso % atendidos + contadores por status como pills);
  card abre o detalhe; botão "Nova certificação" com
  `usePermissao("cidade_inteligente","criar") && !isGlobal`.
- **Detalhe em `NidDrawer`** (`CertificacaoDrawer.jsx` na mesma pasta):
  cabeçalho com nome/entidade/descrição/progresso; tabela de requisitos
  (título, categoria, status como pill `pendente`=neutra /
  `em_andamento`=âmbar / `atendido`=verde com tokens, responsável, link
  da evidência "Ver evidência →" quando houver); filtro por status
  (NidTabBar com counts, "Todos" + presentes); CRUD inline de requisito
  (form no drawer, molde EmpresaDrawer/contatos da F3); editar/excluir
  certificação. Escrita toda com `!isGlobal`.
- Estados vazios acionáveis: sem certificação → CTA "Cadastrar a
  primeira"; certificação sem requisitos → CTA no drawer.

## Navegação, plano e permissões

- `navStructure.jsx`: item novo na seção **"Indicadores & Cidade Int."**
  (após Indicadores Internos): `{ to: "/app/cidade-inteligente", label:
  "Cidade Inteligente", modulo: "cidade_inteligente" }`. Invariantes
  atualizados DE PROPÓSITO: `NAV_FLAT` 32 → **33**, ROTA_MODULO ganha o
  par novo (comentário do teste explica a mudança).
- Rota em `App`/router com `PlanLockedView` via chave `cidade_inteligente`
  (mesmo mecanismo dos demais; gate server-side já nasce via
  `scoped_modulo`).
- `PlanoConfigAdminPage.jsx`: entrada nova em `MODULOS` — `{ key:
  "cidade_inteligente", label: "Cidade Inteligente — Certificações
  ISO/ABNT" }`.
- `RolesAdminPage.jsx`: área nova `["cidade_inteligente", "Cidade
  Inteligente"]` em `AREAS`.
- `titulosPaginas.test.js`: caso novo p/ o título da página (sem "antigo
  proibido").

## Testes

- Backend `test_cidade_inteligente_endpoints.py` (house-style sqlite,
  molde test_gestao_empresarial_endpoints): CRUD dos 2 recursos; tenancy
  (usuário de outro município → 403/404); permissão ausente → 403;
  contadores de progresso corretos; validação de status e de
  evidencia_url (http(s), "" limpa); view-as (global lê com
  municipio_id, não-global ignora o param); CASCADE no delete. (~12
  testes.)
- Front: página (guard, cards com progresso, CTA vazio), drawer
  (requisitos, filtro por status, pill de status, escrita oculta p/
  global). Invariantes de nav/títulos atualizados. (~8 testes.)
- Suites completas verdes (baselines ao escrever: back 467, front 386).

## Fora de escopo (v2 registrada)

- Mapeamento automático norma × indicadores da plataforma (cobertura e
  lacunas) — é a evolução natural deste módulo.
- Anexo de arquivo como evidência (hoje: URL + nota).
- Prazos/alertas por requisito.
- Template/seed de eixos da norma.

## Riscos

- **Colisão de nomes com "Certificações e Premiações"** (Eixo 4, módulo
  16): são coisas distintas — lá é premiação/captação do desenvolvimento
  econômico; aqui é certificação DE CIDADE (ISO/ABNT). Mitigação: rota e
  chave próprias (`cidade-inteligente`/`cidade_inteligente`), label
  "Cidade Inteligente" (sem a palavra "certificações" na sidebar).
- **Chave de plano nova**: municípios existentes não têm
  `cidade_inteligente` no plano até o admin habilitar — comportamento
  desejado (rollout controlado), igual ao precedente do benchmark.
- **Invariantes de nav**: mudam de propósito nesta frente (33 itens) — o
  plano deve tocar os testes de invariante no MESMO commit do
  navStructure, nunca deixar a suite quebrada entre tasks.
