# Cards de dados por período (default 12 meses) — Design

**Data:** 2026-08-05
**Escopo:** frontend (12 páginas + 1 helper puro) + 1 parâmetro novo de backend (zero
migração)
**Contexto:** levantamento de 2026-08-05: nas 9 páginas com FilterBar os gráficos
refiltram client-side mas os KPIs vêm de `/resumo` all-time (Bolsa Família e Comex têm
subtítulo "no período" com valor que ignora o período); nenhuma página tem default 12m
(o preset existe na FilterBar, default é "Tudo"); CAGED/RAIS usam pills de ano com
`resumo` all-time misturado; Empresas não tem dimensão temporal (cadastro CNPJ) — o
único campo temporal é `data_inicio`.

## Decisões (validadas com o usuário)

1. **Escopo completo**: as 9 páginas de FilterBar (PIB, Arrecadação, ESTBAN, Comex,
   PIX, VAF, INSS, Bolsa Família, Pé-de-Meia) + CAGED/RAIS + Empresas. FPM, Dinheiro
   na Mesa, Emendas e IPS ficam fora (já period-aware ou são score/diagnóstico).
2. **Fluxo recalcula; snapshot fica**: cards de soma/fluxo recalculam pelo período
   filtrado; cards de estado (cadastro atual, último mês, último ano da série)
   permanecem com subtítulo explícito.
3. **Default = 12 meses ANCORADOS NO ÚLTIMO DADO da série**, não no calendário —
   datasets com defasagem (PIB/VAF ~2 anos) abririam vazios com janela de calendário.
   Mesma filosofia do `fpm_12m` do backend.

## 1. Helper puro compartilhado — `utils/periodoCards.js`

- `janela12m(serie, campoPeriodo)` → `{ yearFrom, monthFrom, yearTo, monthTo }` (ou só
  anos): janela de 12 meses terminando no último ponto da série. Série ANUAL usa
  `{ yearFrom: anoUltimo, yearTo: anoUltimo }` — o "12m" de uma série anual é o último
  ano com dado. Série vazia → filtro vazio ("Tudo").
- Shape de retorno compatível com o estado da FilterBar (strings, como hoje).
- Aplicação: a página inicializa a FilterBar vazia, e no primeiro fetch da série seta
  o filtro via `janela12m` UMA vez (guard para não sobrescrever interação do usuário
  que chegue antes); o preset "12m" aparece ativo quando a janela casa
  (`detectPreset` pode precisar reconhecer a janela ancorada — detalhe no plano).
- Derivações de card ficam nos `useMemo` das páginas sobre a MESMA série filtrada dos
  gráficos (não entram no helper — cada página tem shape próprio); o helper só provê
  a janela e utilitários de soma/último-ponto genéricos se úteis.

## 2. As 9 páginas de FilterBar

Por página, cada card do topo é classificado e tratado:

- **Fluxo (recalcula pelo filtro, derivado da série filtrada client-side, sub =
  `describeFilter(filters)`):** Arrecadação "Total Arrecadado" e "Média Mensal"; PIX
  volume/quantidade; Comex exportações/importações/corrente (o sub já usa
  `describeFilter` — passa a ser verdadeiro); Bolsa Família repasses/famílias (médias
  sobre o período filtrado); Pé-de-Meia repasses; INSS benefícios/valores; ESTBAN não
  tem fluxo (só snapshot); PIB/VAF não têm fluxo mensal (anuais — ver abaixo).
- **Snapshot (fica, com sub explícito):** ESTBAN (saldos do último mês — sub "último
  mês da série"); PIB "Último Ano"/"Crescimento" (sub "último ano da série"); VAF
  idem; médias estruturais que não são somas de período.
- **Default 12m ancorado** em todas as 9 (anuais: último ano com dado, via `janela12m`).
- Pé-de-Meia ganha o chip de filtro no `NidPageHeader` (única página de FilterBar sem).
- A classificação card a card (com labels/subs finais) é transcrita NO PLANO página a
  página — nenhum card muda de valor sem o sub dizer o que ele significa.

## 3. CAGED e RAIS (pills de ano)

- Mantêm pills e default no último ano (já period-aware).
- CAGED: cards derivados de `anoAtivo` continuam; rodapés/valores "no histórico"
  permanecem SÓ onde o rótulo diz "histórico" (nenhuma mudança silenciosa).
- RAIS: "Remuneração Média" passa a ser a do ANO ATIVO (derivada client-side da série
  por ano, mesmo dado da página) em vez do `avg` all-time do `/rais/resumo`; sub
  "no ano selecionado".

## 4. Empresas (cadastro, sem série temporal)

- Ganha FilterBar de período (year+month) + chip no header.
- **Card novo de fluxo: "Abertas no período"** — contagem por `data_inicio` dentro do
  filtro; default 12 meses ancorados em HOJE (cadastro é corrente — aqui calendário é
  correto). Reage ao filtro.
- Backend: `/empresas/resumo` ganha parâmetros opcionais `abertas_de`/`abertas_ate`
  (ISO date) e devolve campo novo `abertas_periodo` (COUNT com `data_inicio BETWEEN`);
  sem migração; demais campos inalterados. Frontend re-busca o resumo quando o filtro
  muda (padrão Emendas — aqui o dado não está no client).
- Cards existentes (Total, Ativas, MEI, Simples) ficam snapshot com sub "cadastro
  atual".
- Gráficos da página (todos cadastrais) não mudam neste ciclo.

## Casos de borda

- Série vazia/1 ponto: janela vira "Tudo"/o próprio ponto; cards mostram o que houver.
- Usuário limpa o filtro (preset "Tudo"): cards de fluxo somam tudo — comportamento
  atual, agora com sub coerente.
- Filtro sem interseção com a série: cards de fluxo mostram 0/"—" (mesmo que os
  gráficos vazios); snapshots não mudam.
- Empresas com `data_inicio` NULL: fora da contagem de abertas (contagem audível não
  se aplica — cadastro legado; documentado no router).

## Testes e gates

- **vitest** (`utils/periodoCards.test.js`, ~8): janela ancorada com lag (última
  competência 2024-07 → 2023-08..2024-07), série anual (último ano), série vazia,
  1 ponto, shape compatível com FilterBar.
- **pytest**: `abertas_de/ate` no router de empresas (com datas, sem datas =
  comportamento atual, NULL fora).
- Gates: vitest + build + `pytest backend/tests` exit 0. Sem testes de componente.
- **Checklist visual (usuário):** cada uma das 12 páginas abre com preset 12m ativo e
  cards coerentes com os gráficos; mudar o filtro recalcula cards de fluxo; subs
  distinguem fluxo ("Jan/2025 – Dez/2025") de snapshot ("cadastro atual", "último
  mês da série"); limpar filtro = somas totais; Empresas mostra "Abertas no período".

## Fora de escopo

- FPM, Dinheiro na Mesa, Emendas, IPS; NidKpiHero do CAGED/RAIS além do listado;
  gráficos de Empresas por período (exigiria série histórica do cadastro); painel
  comparativo/ranking do PIB (não reage à FilterBar hoje — segue igual); persistir o
  filtro escolhido entre visitas.
