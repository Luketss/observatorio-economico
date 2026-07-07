# Alerta de Faixa do FPM — Design

**Data:** 2026-07-06
**Status:** Aprovado
**Origem:** IDEAS.md → "Máquina de Vendas" → B1 "Alerta de faixa do FPM" (melhor custo-benefício)

## Objetivo

O FPM (Fundo de Participação dos Municípios) é distribuído por faixas populacionais com coeficientes fixos. Cruzar a população estimada do IBGE com as faixas de coeficiente para dizer ao prefeito, em uma frase com cifrão:

> "Faltam **812 habitantes** para o próximo coeficiente do FPM — vale **~R$ 2,3M/ano** a mais."

E o inverso: risco de cair de faixa na próxima estimativa do IBGE. Nenhum dashboard concorrente mostra isso; todo prefeito de cidade pequena entende em 5 segundos.

## Decisões de escopo (respostas do brainstorm)

| Decisão | Escolha |
|---|---|
| Propósito v1 | Produto completo: card no Painel do Prefeito + notificação no sino + página FPM dedicada |
| Fonte da população | Ingestão via API de agregados do IBGE (estimativas anuais oficiais) |
| Valor em R$ | Ingestão dos repasses mensais de FPM da STN (Tesouro Transparente) |
| Superfície | Página FPM completa no grupo Economia + card no painel |
| Gating de plano | Tudo livre (sem PlanGate) — é o principal argumento de venda |
| Abordagem | Módulo dedicado; faixas hardcoded; coeficiente **estimado** pela população, com guarda de divergência |

## Domínio: como o FPM funciona (o mínimo necessário)

- O FPM-Interior é distribuído por **18 faixas populacionais** com coeficientes de 0,6 a 4,0 (Decreto-Lei 1.881/81). As faixas são fixas em lei desde 1981.
- O coeficiente **oficial** de cada município é fixado anualmente pelo TCU (Decisão Normativa) com base na estimativa populacional do IBGE (1º de julho).
- **Trava legal:** leis complementares (LC 165/2019 e sucessoras) seguraram o coeficiente de municípios que perderam população — nesses casos o coeficiente oficial difere do que a população implica. O design trata isso com uma guarda de divergência (abaixo), nunca apresentando número possivelmente errado sem ressalva.
- **Capitais** seguem regime próprio (FPM-Capitais: fator populacional + renda per capita) — fora do escopo; a UI mostra "não se aplica".
- Municípios com coeficiente 3,8/4,0 também participam da Reserva do FPM — fora do escopo da v1 (não afeta a mensagem do alerta).

### Tabela de faixas (FPM-Interior, DL 1.881/81)

| População | Coeficiente |
|---|---|
| até 10.188 | 0,6 |
| 10.189 – 13.584 | 0,8 |
| 13.585 – 16.980 | 1,0 |
| 16.981 – 23.772 | 1,2 |
| 23.773 – 30.564 | 1,4 |
| 30.565 – 37.356 | 1,6 |
| 37.357 – 44.148 | 1,8 |
| 44.149 – 50.940 | 2,0 |
| 50.941 – 61.128 | 2,2 |
| 61.129 – 71.316 | 2,4 |
| 71.317 – 81.504 | 2,6 |
| 81.505 – 91.692 | 2,8 |
| 91.693 – 101.880 | 3,0 |
| 101.881 – 115.464 | 3,2 |
| 115.465 – 129.048 | 3,4 |
| 129.049 – 142.632 | 3,6 |
| 142.633 – 156.216 | 3,8 |
| acima de 156.216 | 4,0 |

> Na implementação, validar esta tabela contra a fonte oficial (Decisão Normativa do TCU vigente / cartilha da STN) antes de fixar a constante.

## Seção 1 — Dados & Ingestão

**Constante `FAIXAS_FPM`** em `backend/app/services/fpm_service.py`: lista de `(pop_min, pop_max, coeficiente)` com as 18 faixas. Sem tabela no banco, sem tela de admin.

**Tabelas novas** (padrão dos 11 datasets existentes — FK para `municipios`, unique constraint):

- `populacao_municipio`: `id, municipio_id (FK), ano, populacao (int), fonte (str)` — unique `(municipio_id, ano)`. `fonte` distingue "Estimativa IBGE" de "Censo" (ex.: 2022).
- `fpm_mensal`: `id, municipio_id (FK), ano, mes, valor (float)` — unique `(municipio_id, ano, mes)`.

Migrations na chain atual (após `0027_vaf_anual`).

**Loaders CLI** em `backend/ingestao/` (padrão `--estado` dos loaders existentes):

- `carregar_populacao.py` — API de agregados do IBGE (agregado 6579 — Estimativas de População) por `municipio.codigo_ibge`; upsert por (município, ano); município sem `codigo_ibge` → warning e skip. Ao final, dispara a geração de notificações (Seção 2).
- `carregar_fpm.py` — repasses mensais de FPM por município via API do Tesouro Transparente (Tesouro Nacional); fallback para CSV público da STN se a API se provar instável (decidir na implementação); filtra pelos códigos IBGE dos municípios cadastrados; upsert.

**DatasetInfo**: entradas "populacao" e "fpm" (fonte + data de atualização), editáveis em `/admin/fontes`, exibidas via `InfoTooltip` na página FPM.

## Seção 2 — Backend: cálculo, endpoints e notificações

### `fpm_service.py`

`calcular_alerta(municipio_id, db)` retorna:

- **População mais recente**: valor, ano, fonte.
- **Faixa/coeficiente estimado** pela população (via `FAIXAS_FPM`).
- **Distâncias em habitantes**: para a próxima faixa (subir) e para o piso da faixa atual (cair).
- **Valores em R$** (quando há dados de FPM): `fpm_12m` = soma dos 12 meses mais recentes com dados em `fpm_mensal`; se houver menos de 12 meses, anualizar (média mensal × 12) e marcar `fpm_12m_parcial: true` no payload. `valor_por_ponto = fpm_12m / coeficiente_estimado`; `delta_subida = (coef_próximo − coef_atual) × valor_por_ponto`; `delta_queda = (coef_anterior − coef_atual) × valor_por_ponto` (negativo — a UI apresenta como valor em risco).
- **`status`**: `oportunidade` (próxima faixa a ≤ 5% da população atual), `risco` (piso a ≤ 5%), `estavel`, `teto` (coeficiente 4,0).
- **Guarda de divergência (trava legal)**: `valor_por_ponto` deve ser ~igual entre municípios do mesmo estado. Com ≥ 5 municípios do estado com dados de FPM, se o valor do município desviar > 10% da mediana estadual → `divergencia: true` (coeficiente oficial provavelmente difere do estimado). Com < 5 municípios, `divergencia: null` (não avaliada).
- Payload inclui a tabela completa das 18 faixas (para a régua visual da página).

### Router `backend/app/api/v1/routers/fpm.py`

Resolve o município pelo usuário logado / viewAs, mesmo padrão dos routers de dataset existentes.

- `GET /fpm/alerta` — payload completo do alerta (consumido pelo card do painel e pelo hero da página).
- `GET /fpm/serie` — série mensal + agregado anual de repasses para gráficos e tabela.

### Notificações no sino

Ao final do `carregar_populacao.py`, para cada município atualizado, recalcular o alerta e criar `Notificacao` (`municipio_ids=[id]`) quando:

1. a faixa estimada **mudou** em relação ao ano anterior, ou
2. o município **entrou** em zona de `oportunidade` ou `risco`.

`tipo`: `success` (oportunidade/subiu) ou `warning` (risco/caiu). Como `Notificacao.criado_por` é FK obrigatória, o loader usa o primeiro usuário ADMIN_GLOBAL; flag `--sem-notificacao` desativa. Não há job agendado: a ingestão anual da estimativa do IBGE é o gatilho natural.

## Seção 3 — Frontend

### Card `AlertaFpmCard` (Painel do Prefeito)

Consumido via `safeGet("/fpm/alerta")` no `Promise.all` existente de `PainelPrefeitoPage.jsx`. Clique → `/app/fpm`.

- **Oportunidade (verde):** "Faltam **812 habitantes** para o próximo coeficiente do FPM — vale **~R$ 2,3M/ano** a mais".
- **Risco (âmbar):** "Sua cidade está a **340 habitantes** de cair de faixa — **~R$ 1,8M/ano** em risco".
- **Estável (neutro):** faixa atual + distâncias, sem tom de alerta.
- **Teto:** "coeficiente máximo (4,0)"; monitora apenas queda.
- **`divergencia: true`:** mantém distâncias em habitantes + ressalva "valores estimados — coeficiente oficial pode diferir (trava legal)".
- **Sem FPM carregado:** distâncias em habitantes, sem R$.
- Card sempre exibe o ano/fonte da estimativa usada ("estimativa IBGE 2025").

### Página `FpmPage.jsx` (`/app/fpm`, item "FPM" no grupo Economia)

Padrão das páginas de dataset (título + `InfoTooltip`, skeleton loading):

1. **Hero do alerta** — versão expandida do card.
2. **Régua de faixas** — visual horizontal: piso ← posição da população atual → teto, faixas vizinhas com coeficientes.
3. **KPIs** — FPM 12 meses, coeficiente estimado, valor por ponto, população mais recente (ano/fonte).
4. **Gráficos Recharts** — barras mensais de repasse + comparativo anual; tabela anual.
5. **Linha do tempo da população** — estimativas ano a ano com os limites de faixa marcados (trajetória rumo à próxima faixa).

Sem PlanGate em nenhuma superfície.

## Seção 4 — Erros, edge cases e testes

### Edge cases (tratados no serviço, refletidos na UI)

| Caso | Comportamento |
|---|---|
| Município sem `codigo_ibge` | `/fpm/alerta` retorna payload vazio com `motivo`; card não renderiza; página mostra empty state orientando o admin |
| Sem população carregada | Empty state ("execute carregar_populacao") |
| Sem FPM carregado | Alerta só com habitantes, sem R$ |
| Capital | Constante com os 27 códigos IBGE das capitais → "não se aplica — regime FPM-Capitais" |
| Teto (4,0) | Sem próxima faixa; monitora apenas risco de queda |
| Ano-base | Card exibe o ano da estimativa; mudança de coeficiente vale para a fixação seguinte do TCU |
| Falha da API IBGE/STN no loader | Erro por município logado sem abortar o lote; resumo final com contagens |

### Testes (pytest, `backend/tests`)

- **`fpm_service`**: fronteiras exatas de faixa (10.188 → 0,6 vs 10.189 → 0,8), teto, distâncias, `valor_por_ponto` e deltas, thresholds de status (5%), guarda de divergência (mediana estadual, mínimo 5 municípios), janela móvel de 12 meses com meses faltando.
- **Router**: `/fpm/alerta` e `/fpm/serie` com fixtures — município com/sem dados, capital, sem `codigo_ibge`.
- **Loaders**: parsing/upsert com dados mockados (sem rede nos testes).

## Fora de escopo (v1)

- Coeficiente oficial do TCU ingerido da Decisão Normativa (candidato a v2 — resolve os casos de trava com precisão).
- Reserva do FPM (coeficientes 3,8/4,0) e FPM-Capitais.
- Projeção populacional futura ("no ritmo atual, muda de faixa em N anos") — extensão natural da linha do tempo.
- Integração com Benchmark/Comparativo.
