# Spec: Interatividade dos Gráficos — Comparação de Períodos, Impacto de Ações e Drill-down

**Data:** 2026-06-25
**Status:** Aprovado (aguardando revisão final antes do plano de implementação)

## Context

A plataforma (dashboard econômico municipal, React 19 + Vite no front, FastAPI no
back) mostra hoje séries e breakdowns estáticos. Para deixar o produto mais
atrativo e útil ao gestor, queremos três capacidades de interatividade que
transformam números em narrativa e exploração:

1. **Comparar períodos** — ver "este ano vs ano passado" em toda a página.
2. **Impacto de Ações** — escolher uma política/obra (marco da Timeline do
   Mandato) e ver o "antes/depois" de um indicador. Emocionalmente poderoso:
   conecta ação de gestão a resultado medido.
3. **Drill-down focado** — clicar numa categoria (ex.: setor CNAE) e ver o
   detalhe daquele item.

Tudo é entregue em **um único spec**, implementado em **fases** (período
primeiro). Princípio-chave: as séries já vêm completas dos endpoints existentes,
então **as Fases 1a/1b/2 não exigem mudança de backend** (exceto rota/nav/módulo
de plano da nova página).

### Contexto técnico relevante (já existe)
- `components/nid/charts.jsx`: `AreaLineChart`, `MultiLineChart` (suporta múltiplas
  séries + legenda), `StackedBarChart`, `DonutChart`, `HBarChart`. `MultiLineChart`
  já recebe `series` + `colors` e renderiza legenda.
- Páginas de dataset buscam `/<dataset>/serie` (mensal/anual) + breakdowns
  (`/por_cnae`, `/por_sexo`, etc.). Endpoints já escopados por município
  (`scoped_modulo`).
- Timeline do Mandato: modelo `Marco` (`data`, `titulo`, `tipo`
  inicio_mandato|obras|politica|evento, `municipio_id`); endpoint `GET /marcos`.
- Gating de plano: `PlanGate` (blur+upsell), nav com cadeado/teaser
  (`PlanLockedView`), `scoped_modulo` no backend e `MODULOS` em `PlanoConfigAdminPage`.

## Não-objetivos (YAGNI)
- Não há cross-filter "página inteira" (rejeitado por exigir dados por-dimensão
  inexistentes). Drill-down é **detalhe focado**, não refiltra outros gráficos.
- Modo comparação **não** se aplica a datasets anuais (PIB, VAF, INSS, RAIS) — já
  são ano-a-ano; o toggle não aparece neles.
- Nenhum novo cálculo no backend; tudo deriva de endpoints existentes.

---

## Fase 1a — Modo "Comparar com ano anterior" (página inteira)

**Escopo:** páginas de dataset **mensal** — Arrecadação, CAGED, PIX, ESTBAN,
Comex, Bolsa Família, Pé-de-Meia.

**UX:** um toggle no cabeçalho da página ("Comparar com ano anterior"). Quando
ligado:
- **Gráficos de série** sobrepõem a linha do ano anterior alinhada por mês
  (Jan–Dez): renderiza `MultiLineChart` com 2 séries — ano atual (sólido) e ano
  anterior (pontilhado/esmaecido) — com legenda. Quando desligado, mantém o
  gráfico atual (`AreaLineChart`).
- **KPIs** mostram a variação vs mesmo período do ano anterior (▲/▼ %).

**Como:**
- Helper puro `splitByYear(serie, { valueKey, monthKey })` → `{ atual: [...12],
  anterior: [...12] }` alinhado por mês, em `utils` do front.
- Estado de página `comparar` (boolean) + um pequeno componente de toggle
  reutilizável (`CompareToggle`).
- Cada página mensal lê `comparar` e, no painel da série principal, alterna entre
  `AreaLineChart` (off) e `MultiLineChart` com as duas séries (on); os KPIs
  recebem o delta YoY.
- **Sem backend** (a série já traz o histórico).

---

## Fase 1b — Página "Impacto de Ações" (`/app/impacto`)

**Infra:** nova rota `impacto` em `AppRouter`, item de nav **top-level "Impacto de
Ações"** logo após **Timeline** (com ícone próprio, `modulo: "impacto"`), e módulo
de plano `impacto` (entra em `MODULOS` do `PlanoConfigAdminPage`; respeita o
gating de nav/cadeado/teaser já existentes). Sem `scoped_modulo` no backend nesta
fase, pois a página reutiliza endpoints já escopados (`/marcos`, `/<dataset>/serie`);
o gating é via nav, como nas demais telas operacionais.

**UX:** o usuário escolhe:
1. **um marco** (dropdown dos marcos do município — `GET /marcos`, com data e
   tipo);
2. **um indicador** de uma lista curada (headline metric de cada dataset mensal):
   - Arrecadação → `valor_total` (`/arrecadacao/serie`)
   - CAGED → `saldo` (`/caged/serie`)
   - PIX → volume PF+PJ (`/pix/serie`)
   - ESTBAN → operações de crédito (`/estban/serie`)
   - Comex → saldo comercial (`/comex/serie`)
   - Bolsa Família → beneficiários (`/bolsa_familia/serie`)
   - Pé-de-Meia → estudantes (`/pe_de_meia/serie`)

Mostra:
- gráfico da série do indicador com **linha vertical na data do marco**
  (`annotations` do `AreaLineChart` já suportam marcador de ponto);
- cards **"Antes vs Depois"**: média (ou total, conforme o indicador) na janela
  antes × depois do marco, com **% de variação**.

**Janela antes/depois:** padrão = todos os pontos antes do marco vs todos depois
(média). Decisão de implementação: começar com média de **até 12 meses** de cada
lado (configurável depois). Indicar no card a janela usada e o nº de meses.

**Como:** reaproveita `/marcos` + os `/<dataset>/serie`; cálculo antes/depois é
função pura no front (`beforeAfter(serie, markerDate, { valueKey })`). **Sem
backend novo** além de rota/nav/módulo.

---

## Fase 2 — Drill-down focado

**Escopo:** gráficos categóricos (CNAE, porte, raça, etc.) em CAGED/RAIS/Empresas.

**UX:** clicar numa fatia/barra abre um **modal de detalhe** do item:
- evolução no tempo quando houver série por categoria (ex.: setor CNAE via
  `/rais/por_cnae`, `/caged/por_cnae`, que têm `ano`);
- ou os números do item quando não houver série (ex.: porte em Empresas).
Não refiltra os outros gráficos da página.

**Como:**
- `HBarChart`/`DonutChart` (e segmentos do `PercentBarChart`) ganham callback
  opcional `onSelect(item)`.
- Componente `DetalheModal` que, dado (dataset, dimensão, valor), busca/filtra os
  dados já carregados (ou um endpoint de breakdown existente) e mostra a série/os
  números do item.
- Usa endpoints existentes; nenhum novo no MVP.

---

## Dados e fluxo
- **1a/1b**: front busca as mesmas séries de hoje; toda a derivação (split por ano,
  antes/depois) é client-side em funções puras. Nenhum endpoint novo.
- **1b**: também busca `GET /marcos` (já escopado por município).
- **2**: usa os breakdowns já existentes (`/por_cnae` etc.).

## Tratamento de erros / bordas
- Modo comparação com **só um ano** de dados → não há "ano anterior"; o toggle
  fica desabilitado (ou some) com dica "sem ano anterior para comparar".
- Impacto: marco sem dados suficientes de um lado → card mostra "dados
  insuficientes antes/depois".
- Drill-down: item sem série temporal → modal mostra só os números.

## Testes
- Funções puras cobertas por teste: `splitByYear`, `beforeAfter` (e o cálculo de
  % de variação). Vitest no front se disponível; caso contrário, isolar a lógica
  em `utils` e testar.
- Build do front (`vite build`) deve passar a cada fase.

## Plano de acesso
- A página **Impacto de Ações** entra no esquema de planos (módulo `impacto`):
  aparece no menu com cadeado/teaser quando o plano não inclui, igual às demais.
- O modo comparação e o drill-down são interações dentro de páginas já gateadas —
  sem módulo próprio.

## Verificação (end-to-end, por fase)
1. **1a**: abrir Arrecadação (município com ≥2 anos mensais), ligar "Comparar com
   ano anterior" → ver 2 linhas (atual×anterior) e KPIs com ▲/▼ vs ano anterior;
   desligar volta ao normal. Conferir que páginas anuais não mostram o toggle.
2. **1b**: `/app/impacto` → escolher um marco + indicador → ver linha do marco no
   gráfico e cards antes/depois com %. Conferir gate de plano (cadeado quando
   `impacto` não está no plano).
3. **2**: clicar num setor CNAE no CAGED/RAIS → modal com a evolução daquele setor;
   clicar num porte em Empresas (sem série) → modal com os números.
