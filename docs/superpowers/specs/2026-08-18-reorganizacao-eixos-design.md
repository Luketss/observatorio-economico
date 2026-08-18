# Reorganização do NID em 5 eixos — Design

**Data:** 2026-08-18
**Status:** aprovado pelo usuário (2026-08-18 — estrutura "direção certa, detalhes abertos"; sequência esqueleto-primeiro; mapeamento de órfãos; módulo 03 em fase própria; módulo 07 em standby; sidebar com eixos como seções-título)

## Objetivo

Reorganizar o produto existente sem criar módulos novos: reduzir fragmentação,
melhorar nomes e agrupamentos, fortalecer leitura executiva e aproveitar melhor
a IA já presente. A barra lateral passa a refletir 5 eixos macro (documento de
produto de 2026-08-18). Tudo que existe é mantido, melhorado, reorganizado ou
fundido — **nenhum descarte silencioso**.

## Decisões aprovadas

- **Sequência esqueleto-primeiro:** a Fase 1 entrega a sidebar nova completa
  (seções, renomeações, reagrupamentos) sem mexer no conteúdo interno das
  telas. Melhorias de conteúdo/IA viram fases posteriores, por módulo.
- **Eixos como seções-título:** headers não-clicáveis (mesmo padrão visual do
  header "Admin"/`.nid-nav-section`). Módulos sempre visíveis; só subgrupos
  colapsam. Sem 3º nível de navegação.
- **Nenhuma URL muda na Fase 1.** Só labels, agrupamento e ordem. Zero
  redirects novos, zero backend.
- **Chaves de plano (`modulo`) intocadas.** Elas acoplam sidebar ↔ catálogo
  (`PlanoConfigAdminPage.jsx`) ↔ banco (`plano_config.modulos`) ↔ enforcement
  (`backend/app/api/deps.py::scoped_modulo`). Renomear label é livre; renomear
  chave exigiria migração — fora de escopo.
- **Módulos órfãos do documento** (existem no código, ausentes dos eixos):
  CAGED, RAIS, Arrecadação e FPM → Eixo 3; Dinheiro na Mesa, Emendas,
  Captação de Recursos e Escrita de Projetos → Eixo 4 (módulo 16); Calendário
  e Impacto de Ações → Eixo 5.
- **Módulo 03 (Inteligência Econômica Integrada):** não existe como página;
  vira a Fase 2 (primeira melhoria pós-esqueleto), montada com componentes
  existentes. Não entra no esqueleto.
- **Módulo 07 (Indicadores ISO/ABNT):** não existe (zero código) e seria
  funcionalidade nova → **FUTURO/STANDBY**, fora desta versão.

## Roadmap de fases

Cada fase é um sub-projeto com spec + plano próprios:

| Fase | Entrega | Natureza |
|---|---|---|
| **1. Esqueleto** | Sidebar nova completa: 5 seções, renomeações, reagrupamentos | Front-only, sem tocar conteúdo de telas |
| **2. Inteligência Econômica Integrada** (mód. 03) | Página-síntese de PIB/VAF/Empresas/ESTBAN/COMEX/PIX com KPIs, `InsightsPanel` e Prioridades existentes | Reorganização de inteligência existente |
| **3. Inteligência Empresarial & Relacionamento** (móds. 14+17) | Fusão real: base de Empresas + lógica de Retenção & Expansão numa experiência única (perfil, relevância, contatos, demandas, riscos, responsável, próxima ação) | Fusão de telas |
| **4. Programas, Projetos & Premiações** (mód. 16) | Fusão real: Premiações + Captação + Escrita + Dinheiro na Mesa + Emendas numa página com abas | Fusão de telas |
| **5. Central de Inteligência** (mód. 01) | Reestruturar o Dashboard Geral como porta de entrada: cenário, mudanças relevantes, riscos/oportunidades da IA, atalhos de aprofundamento | Reestruturação |
| **6+. Melhorias por módulo** | Painel do Prefeito, Benchmark, interpretação PIB/VAF/COMEX, Memória Institucional, Releases | Incrementos menores; ordem definida depois |

Esta spec detalha a **Fase 1**. Fases 2+ ganham specs próprias quando chegarem.

## Fase 1 — Arquitetura

Tudo em `frontend-observatorio/`; **zero backend**.

### 1. `NAV_STRUCTURE` alvo (`src/app/layouts/DashboardLayout.jsx`)

Novo tipo `section` (header não-clicável + itens). Estrutura completa —
rotas e chaves `modulo` são as atuais, só labels/agrupamento mudam:

**Seção "Visão Executiva"** (Eixo 1)
- Central de Inteligência — `/app` (end), `geral`
- Painel do Prefeito — `/app/painel-prefeito`, `painel_prefeito`
- Benchmark — `/app/benchmark`, `benchmark`
- grupo **Contexto Socioeconômico**: IPS (`/app/ips`, `ips`) · Bolsa Família
  (`/app/bolsa-familia`, `bolsa_familia`) · Pé-de-Meia (`/app/pe-de-meia`,
  `pe_de_meia`) · INSS (`/app/inss`, `inss`)

**Seção "Indicadores Internos"** (Eixo 2)
- Indicadores & Cidade Inteligente — `/app/dados-internos/indicadores`,
  `dados_internos.indicadores`

**Seção "Dados Econômicos"** (Eixo 3)
- PIB — `/app/pib`, `pib`
- VAF — `/app/vaf`, `vaf`
- Empresas — `/app/empresas`, `empresas`
- Bancos — `/app/estban`, `estban`
- Comércio Exterior — `/app/comex`, `comex`
- PIX — `/app/pix`, `pix`
- grupo **Emprego**: CAGED (`/app/caged`, `caged`) · RAIS (`/app/rais`, `rais`)
- grupo **Fiscal**: Arrecadação (`/app/arrecadacao`, `arrecadacao`) · FPM
  (`/app/fpm`, sem chave — sempre livre)

**Seção "Desenv. Empresarial"** (Eixo 4)
- Inteligência Empresarial — `/app/desenvolvimento-economico/retencao`,
  `desenvolvimento_economico.retencao`
- Atração de Investimentos — `/app/desenvolvimento-economico/funil`,
  `desenvolvimento_economico.funil`
- grupo **Programas & Premiações**: Premiações (`…/premiacoes`) · Captação de
  Recursos (`…/captacao`) · Escrita de Projetos (`…/escrita`) · Dinheiro na
  Mesa (`/app/dinheiro-na-mesa`, `captacao_federal`) · Emendas
  (`/app/emendas`, `emendas`)

**Seção "Gestão"** (Eixo 5)
- Projetos — `/app/projetos`, `projetos`
- Plano de Governo — `/app/dados-internos/plano-gov`,
  `dados_internos.plano_gov`
- Memória Institucional — `/app/timeline`, `timeline_mandato`
- Calendário — `/app/dados-internos/calendario`, `dados_internos.calendario`
- Impacto de Ações — `/app/impacto`, `impacto`
- Releases — `/app/releases`, `releases`, `hideForAdmin: true`

Bloco **Admin** (condicionado a `temPermissaoAdmin`) inalterado. Rota
`/app/notificacoes` segue órfã da sidebar (acesso pelo sino), como hoje.
Redirects existentes (`/app/comparativo` → `/app/benchmark`;
`/app/desenvolvimento-economico` → `…/funil`) inalterados.

### 2. Render e flatten (`DashboardLayout.jsx`)

- Loop de render passa a iterar seções: header (`.nid-nav-section`, reuso do
  estilo do header "Admin") + itens da seção. Links e grupos dentro de seção
  usam a mecânica atual (linhas ~310–382): `openGroups` com auto-abertura na
  rota ativa, teaser de cadeado por plano (`isLocked`/opacity/tooltip).
- `NAV_FLAT` achata `section.items` (incluindo filhos de grupos) — o mapa
  rota→módulo do `PlanLockedView`/`currentNav` continua por prefixo mais
  longo, sem mudança de lógica.
- Nenhuma mudança em `PlanContext`, `PlanGate`, `usePermissao`, rotas do
  `AppRouter.jsx` ou CSS além de eventual ajuste fino em
  `styles/themes.css` (espaçamento entre seções).

### 3. Renomeações com título de página acompanhando

Onde o conteúdo já corresponde ao novo nome, o header da página muda junto
(label da sidebar e título nunca podem divergir):

- `DashboardGeralPage.jsx`: "Dashboard Geral" → **"Central de Inteligência
  Econômica"** (subtítulo atual mantido).
- `TimelinePage.jsx`: "Timeline do Mandato" → **"Memória Institucional"**
  (subtítulo cita marcos e eventos do mandato).
- `FunilTab.jsx`: título → **"Atração de Investimentos"**.
- `RetencaoTab.jsx`: título → **"Inteligência Empresarial &
  Relacionamento"**, com subtítulo honesto sobre o recorte atual
  ("acompanhamento de empresas instaladas — retenção e expansão") até a
  fusão da Fase 3.
- `IndicadoresInternosPage.jsx`: título → **"Indicadores & Cidade
  Inteligente"**.

Nenhuma outra tela muda de conteúdo na Fase 1.

### 4. Testes

- Vitest do `DashboardLayout`: seções renderizam na ordem definida; grupo
  abre automaticamente quando a rota ativa é filho; item bloqueado por plano
  dentro de seção/grupo mantém cadeado+tooltip; `hideForAdmin` de Releases
  segue funcionando; bloco Admin só para quem tem permissão.
- Testes de título das 5 páginas renomeadas (quando a página já tiver teste,
  atualizar; senão, asserção mínima de header).
- Suite front completa (221) continua verde.

## Fora de escopo (Fase 1)

- Qualquer mudança de URL, redirect novo ou backend.
- Fusões reais de telas (Fases 3 e 4) e página do módulo 03 (Fase 2).
- Renomear chaves de plano ou o catálogo em `/admin/planos`.
- Conteúdo interno de qualquer página além dos títulos listados.
- Módulo 07 (ISO/ABNT) — FUTURO/STANDBY desta versão.

## Riscos

- **UX de reposicionamento:** usuários perdem referências de posição no menu.
  Mitigação: nada é removido, nomes mais descritivos, mudança sai completa de
  uma vez (sem sidebar híbrida).
- **Sidebar mais alta (~27 linhas):** aceito na decisão de abordagem; grupos
  colapsáveis e scroll já existentes mitigam.
