# Análise Econômica (Fase 2 da reorganização em 5 eixos) — Design

**Data:** 2026-08-19
**Status:** aprovado pelo usuário (2026-08-19 — curadoria do que existe; posição após PIX; acesso livre com degradação por base; insights com seletor de base)

## Objetivo

Entregar o módulo 03 do roadmap (spec `2026-08-18-reorganizacao-eixos-design.md`,
renomeado pelo cliente para **"Análise Econômica"**): uma página que consolida a
leitura das 6 bases econômicas — PIB, VAF, Empresas, Bancos/ESTBAN, COMEX e
PIX — **reaproveitando componentes e endpoints existentes**. Curadoria, não
análise nova: zero backend.

## Decisões aprovadas

- **Curadoria do que existe:** KPIs dos 6 endpoints `/resumo` já existentes +
  insights de IA por base já disponíveis + atalhos de aprofundamento. O
  insight consolidado cross-base exigiria backend novo (o dataset `geral` do
  `insights_service` cobre outro recorte) → fica como melhoria futura.
- **Posição na sidebar:** seção Dados Econômicos, após PIX e antes dos grupos
  Emprego/Fiscal (cliente: "abaixo de dado econômico").
- **Acesso livre + degradação por base:** o item não tem chave de plano (como
  FPM). Dentro da página, cada base respeita o plano: bloqueada → `PlanGate`
  (blur+cadeado) e KPI "—" via `safeGet`. Zero migração, zero ação
  pós-deploy. (Alternativas rejeitadas: chave nova `analise_economica`
  exigiria habilitação manual por plano; reusar `insights_ia` teria semântica
  errada.)
- **Insights com seletor:** um único `InsightsPanel` sob chips das 6 bases
  (troca o `dataset`; 1 request por troca). Rejeitado: 6 painéis empilhados.

## Arquitetura

Tudo em `frontend-observatorio/`; **zero backend** (os 6 `/resumo` já existem
e já são gateados por `scoped_modulo` das chaves das próprias bases).

### 1. Rota e navegação

- `AppRouter.jsx`: rota nova `/app/analise-economica` →
  `src/pages/analise-economica/AnaliseEconomicaPage.jsx`, declarada junto às
  econômicas (após `/app/pix`, ~linha 134). Import estático, como as demais.
- `navStructure.jsx`, seção "Dados Econômicos": item
  `{ type: "link", to: "/app/analise-economica", label: "Análise Econômica",
  icon: PresentationChartBarIcon }` — **sem `modulo`** — entre o item PIX e o
  grupo Emprego.
- `navStructure.test.js`: NAV_FLAT passa a **32 itens** (30 com chave; FPM e
  Análise Econômica sem); demais invariantes intactos (ROTA_MODULO não muda).

### 2. Normalizadores compartilhados (`src/utils/metricasEconomicas.js`)

O `PainelPrefeitoPage` já normaliza os 6 payloads de resumo no registry
`METRICS` (linhas ~61–114). Extrair os 6 normalizadores econômicos
(`pib`, `vaf`, `empresas`, `estban`, `comex`, `pix`) para
`src/utils/metricasEconomicas.js`:

- Cada entrada: `{ chave, rota, endpoint, label, planKey, format(resumo) }`
  onde `format` devolve `{ value, unit, delta, foot }` no formato do
  `KpiCard` (`delta = { value, direction }`) — a divergência de formato entre
  `KpiCard` e `NidKpiHero` fica encapsulada aqui.
- `PainelPrefeitoPage` importa essas 6 entradas (as demais 7+ métricas dele
  permanecem locais); comportamento byte-idêntico, coberto pela suite
  existente do Painel.
- Módulo puro (sem fetch) → testável em ambiente node com payloads reais dos
  schemas (`PibResumo`, `VafResumo`, `EmpresaResumo`, `EstbanResumo`,
  `ComexResumo`, `PixResumo`), incluindo campos `null`/payload zerado.

### 3. A página (`AnaliseEconomicaPage.jsx`)

Ordem de renderização (padrão C1 da casa: header → KPIs → insights):

1. `NidPageHeader` — título "Análise Econômica", sub "Leitura consolidada das
   bases econômicas do município".
2. Guard `needsMunicipio` para ADMIN_GLOBAL sem view-as (mesmo padrão do
   `PainelPrefeitoPage` → `SelecioneMunicipio`): os `/resumo` voltam zerados
   e o `InsightsPanel` se oculta nesse estado.
3. **Grid de 6 `KpiCard`** (um por base, `md:grid-cols-3`): fetch único no
   mount com `Promise.all` + `safeGet` (`.catch(() => null)` — 403 de plano e
   erro viram `null` → card "—"). Cada card embrulhado em `<Link>` para a
   rota da base (atalho de aprofundamento; padrão do Painel) e em
   `<PlanGate planKey={chave-da-base}>` (base fora do plano fica com
   blur+cadeado; `canAccess` já aceita chave de módulo). Sem
   `dataset`/`indicadorKey` nos cards nesta versão (evita 6+ requests de
   tooltip; opt-in editorial futuro).
4. **Insights IA por base:** fileira de chips `.nid-pill` (PIB · VAF ·
   Empresas · Bancos · COMEX · PIX; default PIB) sobre um único
   `<InsightsPanel dataset={selecionado} key={selecionado} />` — componente
   reusado sem modificação.

Estados: loading → `KpiSkeleton`; base sem dado/bloqueada → "—" (nunca some —
o gestor deve saber que a base existe); erro de insights → estados do próprio
`InsightsPanel`.

### 4. Testes

- `metricasEconomicas.test.js` (node): 6 normalizadores com payloads
  completos, parciais e zerados.
- `AnaliseEconomicaPage.test.jsx` (jsdom + MemoryRouter, mock de
  `services/api`): 6 cards renderizam com valores; base cujo fetch rejeita
  (403) mostra "—" sem quebrar as demais; chips trocam o dataset do
  `InsightsPanel`; guard `needsMunicipio` para ADMIN_GLOBAL sem view-as.
- `navStructure.test.js` atualizado (32 itens; label novo presente).
- Suites existentes (Painel do Prefeito incluso, pós-refactor de import)
  continuam verdes — baseline atual 252.

## Fora de escopo

- Qualquer backend: endpoint novo, prompt/dataset consolidado de insights
  (anotado como melhoria futura do módulo), chave de plano nova.
- Gráficos comparativos cross-base.
- Tooltips ⓘ (`dataset`/`indicadorKey`) nos cards da página nova.
- Mudanças de conteúdo nas 6 páginas de origem.

## Riscos

- **Semântica dos resumos varia por base** (COMEX/PIX somam a série inteira;
  ESTBAN é snapshot do último mês): mitigado com `foot`/`period` explícitos
  em cada card, herdados da semântica já usada no Painel do Prefeito.
- **Refactor do METRICS do Painel:** risco de regressão contido pela suite
  existente do Painel e pela exigência de comportamento byte-idêntico.
