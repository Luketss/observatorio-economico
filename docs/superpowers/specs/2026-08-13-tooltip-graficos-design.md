# Tooltip explicativo por gráfico + tela admin de indicadores — Design

**Data:** 2026-08-13
**Status:** aprovado pelo usuário (2026-08-13; aprovação delegada: "pode aprovar o plano e continuar")

## Objetivo

Permitir que o ADMIN_GLOBAL explique, gráfico a gráfico, o que cada dado apresenta —
para usuários menos informados — via tooltip curto (hover) e descrição longa (modal),
valendo para todos os municípios. Inclui uma tela admin central para preencher tudo em
lote, sem navegar página a página. Junto (frente bounded aprovada em separado): promover
o Calendário a link de primeiro nível no side menu, ao lado do Timeline.

## O que já existe (zero migração)

- **Modelo `indicador_info`** (`backend/app/models/indicador_info.py`): `dataset` +
  `indicador_key` (unique juntos), `tooltip` (String 250, hover), `descricao` (Text,
  modal), `fonte`, `atualizado_em`. **Sem `municipio_id` — global por construção**,
  exatamente o requisito.
- **Router `/indicadores`** (`backend/app/api/v1/routers/indicadores.py`): `GET`
  unitário (qualquer autenticado, nunca 404 — devolve vazio) e `PUT
  /{dataset}/{indicador_key}` (ADMIN_GLOBAL, upsert). **Não existe `GET /all`.**
- **`ChartInfoIcon`** (`frontend-observatorio/src/components/ChartInfoIcon.jsx`):
  componente completo e órfão (zero usos) — ícone ℹ️ com hover tooltip, modal de
  descrição, gate ADMIN_GLOBAL para edição inline, `useEscapeKey`. É o coração da
  feature; usar como está.
- **`NidPanel`** (`frontend-observatorio/src/components/nid/Panel.jsx:51`): wrapper
  comum de todos os painéis de gráfico (~83 usos em 19 páginas), header com
  `<h3 className="nid-panel-title">{title}</h3>`.
- **~40 KPIs** já usam `indicador_info` via lógica inline no `KpiCard` — intocados
  nesta frente (unificar com ChartInfoIcon é follow-up anotado, não escopo).

## Componentes da solução

### 1. Catálogo de indicadores (`frontend-observatorio/src/utils/indicadorCatalog.js`, novo)

Fonte única de verdade das chaves, para a tela admin listar tudo — inclusive o que ainda
está vazio no banco. Estrutura:

```js
export const INDICADOR_CATALOG = {
  pib: [
    { key: "ultimo_ano", label: "PIB — Último ano", tipo: "kpi" },
    { key: "chart_evolucao_pib", label: "Evolução do PIB", tipo: "chart" },
    ...
  ],
  caged: [...],
  ...
};
```

- Chaves de KPI: as ~40 já existentes no JSX, transcritas com o label do card.
- Chaves de gráfico: novas, convenção **`chart_<slug>`** (slug derivado do título do
  painel, ex.: "Saldo CAGED" → `chart_saldo_caged`), com `label` = título humano do
  painel. Cobrem **todos os `NidPanel`** das páginas de dados (gráficos e tabelas —
  a regra é "todo painel titulado pode ter explicação").
- Datasets seguem as keys do `DATASET_REGISTRY` (pib, arrecadacao, vaf, caged, rais,
  comex, pix, estban, bolsa_familia, pe_de_meia, inss, ips, empresas, fpm,
  captacao_federal, emendas, populacao) + `geral` para o Dashboard Geral.
- Teste vitest puro: chaves únicas por dataset, formato de slug, labels não vazios.

### 2. `NidPanel` ganha `dataset` + `indicadorKey`

Props novas opcionais. Quando ambas presentes, o header renderiza
`<ChartInfoIcon dataset={dataset} indicadorKey={indicadorKey} />` ao lado do título
(título vira flex com gap). Sem as props, nada muda — os ~83 usos existentes continuam
válidos até serem plugados.

Plugagem: cada página de dados passa `dataset` + `indicadorKey` (do catálogo) nos seus
`NidPanel`. `ComparativoPanel` (embrulha 1 NidPanel, usado por mais de uma página)
recebe as props e repassa.

### 3. `GET /indicadores/all` (novo, ADMIN_GLOBAL)

Devolve todas as linhas de `indicador_info` (lista de `IndicadorInfoOut`). É o lado
"banco" do merge da tela admin. Contrato coberto por teste OpenAPI (convenção do repo:
sem TestClient/DB).

### 4. Tela admin `/admin/indicadores` (nova)

- Rota nova sob `AdminRoute` (ADMIN_GLOBAL estrito), entrada no menu admin.
- Merge **catálogo × `GET /all`**: tabela agrupada por dataset mostrando key, label,
  tipo (KPI/gráfico), status (preenchido/vazio) e os campos tooltip/descrição/fonte.
- Busca por texto (label/key/conteúdo) e filtro "só vazios".
- Edição inline por linha, salvando via `PUT /indicadores/{dataset}/{key}` existente.
- Lógica de merge e filtro extraída pura (`src/utils/indicadorAdmin.js` ou similar)
  com teste vitest.
- Aviso na tela: chaves fora do catálogo que existem no banco (órfãs de refactors)
  aparecem numa seção própria — nada é escondido silenciosamente.

### 5. Calendário no side menu (frente bounded, mesma leva)

Mover a entrada `{ to: "/app/dados-internos/calendario", ... }` do grupo "Dados
Internos" (`DashboardLayout.jsx:108`) para link de primeiro nível imediatamente após
Timeline (`:101`), mantendo rota e `modulo: "dados_internos.calendario"` intactos.
O grupo Dados Internos segue com Indicadores e Plano de Governo.

## Fora de escopo

- Refatorar `KpiCard` para reusar `ChartInfoIcon` (duplicação conhecida; follow-up).
- Preencher o conteúdo dos ~80 tooltips (tarefa editorial do admin, não de código).
- Mudanças no `InfoTooltip` de página (`dataset_info`) — sistema paralelo, intocado.
- Migração/schema: nada muda no banco.

## Testes e verificação

- Vitest: catálogo (unicidade/formato), merge da tela admin (puro), suíte completa.
- Backend: contrato OpenAPI do `GET /indicadores/all` + guard de role (padrão
  `db=object()` se aplicável), suíte completa.
- Verificação manual: como ADMIN_GLOBAL, preencher um gráfico pelo lápis inline e outro
  pela tela central; como usuário comum, ver o ℹ️ apenas onde há conteúdo; menu com
  Calendário ao lado de Timeline.
