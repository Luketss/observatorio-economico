# Período por Gráfico — Design

**Data:** 2026-08-13
**Status:** aprovado pelo usuário (2026-08-13, via seleção de abordagem: "Seletor compacto por gráfico nas 10 páginas")

## Objetivo

Permitir que o usuário escolha o período de cada gráfico individualmente. Hoje o
filtro de período é por página (FilterBar em 10 páginas); o pedido é um seletor
enxuto por painel que **sobrepõe** o filtro da página apenas naquele gráfico,
mantendo o FilterBar como default.

## Decisões de escopo (aprovadas)

- **Mecânica:** seletor compacto de presets no header do painel — estados
  `Página` (default: segue o FilterBar) e `12m / 5a / 10a / Tudo` (override
  local do gráfico). Sem De/Até por gráfico (o "Personalizar" continua sendo do
  FilterBar da página).
- **Cobertura:** as 10 páginas com FilterBar (PIB, Arrecadação, VAF, ESTBAN,
  Comex, PIX, INSS, Bolsa Família, Pé-de-Meia, Empresas). CAGED e RAIS (pills
  de ano) e Dashboard Geral ficam fora desta frente.
- **Só gráficos de série temporal client-side.** Painéis de composição de um
  ano (donut/top-N), painéis com seletor próprio (ex.: ano do Comex) e
  comparativos backend-driven não recebem o seletor — a lista exata por página
  sai do mapeamento no plano. Nenhum painel ganha seletor que não faça efeito.
- **Sem persistência:** o override é estado local da página (reset ao navegar),
  consistente com o FilterBar atual, que também não persiste.

## Arquitetura

### 1. Util puro `src/utils/periodoGrafico.js` (novo)

- `aplicarPresetSerie(rawSerie, preset, extrair)` — aplica um preset (`12m`,
  `5a`, `10a`, `tudo`) sobre a série **crua** (não a filtrada da página — um
  override de 5 anos precisa ampliar além do filtro de 12 meses da página).
  Reusa a semântica existente: presets de ano/mês do FilterBar
  (`presetRange`/lógica equivalente exportada) e a janela ancorada no último
  dado (`janela12m`/`dentroDoFiltro` de `utils/periodoCards.js`) — mesma régua
  do resto do app, sem segunda implementação de calendário.
- `resolverSeriePainel({ rawSerie, seriePagina, preset, extrair })` — `preset`
  vazio → devolve `seriePagina` (o gráfico segue a página); senão →
  `aplicarPresetSerie(rawSerie, preset, extrair)`.
- Testes vitest puros: cada preset sobre séries mensais e anuais, âncora no
  último dado, `tudo` = série completa, preset vazio = série da página.

### 2. Componente `src/components/nid/PeriodoMenu.jsx` (novo)

Seletor compacto para o slot `right` do `NidPanel` (o slot já existe e está
livre — o ícone ℹ️ da frente A vive junto ao título): pills pequenas
`12m · 5a · 10a · Tudo`; sem override ativo, nenhuma pill acesa (o gráfico
segue a página); clicar numa pill ativa o override; clicar na pill ativa
desliga (volta a seguir a página). Um chip "segue a página" implícito — sem
texto extra ocupando o header. Acessível: `aria-pressed` por pill,
`aria-label` descritivo. Teste jsdom leve (renderiza, alterna, callback).

### 3. Padrão por página

- Estado local `periodosGrafico` (`{ [chartKey]: preset }`), onde `chartKey` é
  o **`indicadorKey` `chart_*` já plugado na frente A** — identificador estável
  por painel, sem inventar segunda chave.
- Cada painel candidato: `right={<PeriodoMenu value={...} onChange={...} />}`
  e a série do gráfico passa a vir de `resolverSeriePainel(...)` em vez de
  consumir a série filtrada compartilhada diretamente.
- `NidPanel` NÃO muda (usa o slot `right` existente).
- Nota visual: quando um gráfico está em override, o rótulo de contexto do
  painel deve refletir isso (a pill acesa é o indicador; nenhum texto novo).

## Fora de escopo

- Persistir preferências; seletor em CAGED/RAIS/Dashboard Geral; De/Até por
  gráfico; qualquer mudança de backend (tudo é client-side sobre séries já
  baixadas).

## Testes e verificação

- Vitest: util puro (presets/âncora/fallbacks) + componente PeriodoMenu.
- Suíte completa frontend; backend intocado.
- Manual: numa página com filtro de 12m, forçar 10a num único gráfico e
  verificar que os demais não mudam; limpar o override e ver o gráfico voltar
  ao filtro da página; painéis não-temporais sem seletor.
