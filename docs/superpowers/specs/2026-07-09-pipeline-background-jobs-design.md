# Pipeline de ingestão em background + migração das fontes fáceis — Design

**Data:** 2026-07-09
**Branch alvo:** nova branch a partir de `feat/captacao-emendas` (ou `main` após merge do PR aberto)
**Status:** aprovado pelo usuário (design em 2 partes, 2026-07-09)

## Contexto

A esteira de ingestão automática (`backend/app/services/ingestao_automatica/`, registry
`FONTES_AUTOMATICAS`) tem 4 fontes (populacao, fpm, captacao_federal, emendas) executadas por
`POST /ingestao-automatica/{key}/executar` — **síncrono e bloqueante**: emendas de MG levou 287s
ocupando 1 dos 4 workers gunicorn no Railway, com a UI de `/admin/fontes` travada e um único toast
ao final. Os outros 13 datasets dependem de CSVs pré-gerados fora do repo, carregados por
`backend/ingestao/carregar_*.py` (CLI ou upload `POST /municipios/{id}/datasets/{key}/reingest`).

## Objetivos

1. Execução da coleta **em background** com progresso, histórico e seleção de **um, vários ou
   todos os municípios** (e UF), sem travar UI nem worker HTTP.
2. Migrar para a esteira automática as **6 fontes "fáceis"** (fontes nacionais com chave de
   município utilizável): **pib, pix, estban, comex, bolsa_familia, pe_de_meia**.

## Não-objetivos (decididos)

- Cancelamento de job em andamento (fica para depois; cancelamento cooperativo é evolução natural).
- Agendamento automático/cron (a infra de jobs nasce pronta para ganhar scheduler depois).
- Worker separado / Celery / Redis (ver Alternativas).
- Grupos médio (ips, inss), pesado (caged, rais, cnpj — downloads de GBs) e estadual
  (arrecadacao, vaf — portais SEF-MG). Entram em rodadas futuras sobre a mesma infra.
- Remover os loaders legados ou o endpoint de reingest por CSV — continuam como fallback.
- Dados novos (ex.: saúde) — rodada futura, já sobre esta infra.

## Arquitetura escolhida

**Job persistido no Postgres + thread daemon no processo da API + polling HTTP.**
Estado do job vive no banco, então qualquer worker gunicorn responde o polling, independente de
qual worker roda a thread. Sem infra nova no Railway.

Alternativas consideradas e rejeitadas nesta rodada:
- *Worker separado consumindo fila no Postgres* (`FOR UPDATE SKIP LOCKED`): certo para quando os
  datasets pesados (GBs) chegarem; hoje seria serviço novo (custo/ops) sem necessidade. A tabela
  de jobs desenhada aqui é a mesma — migrar depois é mover a chamada do executor de lugar.
- *Celery/RQ + Redis*: overkill para 1 admin disparando 1 job por vez.

## Componentes

### 1. Tabela `ingestao_job` (migration 0032)

| Coluna | Tipo | Nota |
|---|---|---|
| id | Integer PK | |
| dataset | String(50), index | key do registry |
| status | String(20), index | `pendente` → `executando` → `concluido` \| `erro` \| `abortado` |
| filtros | JSON | `{estado, municipio_ids, anos, notificar}` como o admin pediu |
| progresso_atual | Integer, default 0 | municípios processados |
| progresso_total | Integer, nullable | total de municípios do job |
| etapa | String(100), nullable | ex.: "baixando arquivo (32 MB)", "processando municípios" |
| resumo | JSON, nullable | `ResumoIngestao` serializado ao final |
| erro | Text, nullable | mensagem quando status=erro |
| usuario_id | FK usuarios, nullable | quem disparou |
| criado_em / iniciado_em / atualizado_em / finalizado_em | DateTime(timezone=True) | `atualizado_em` é o **heartbeat** |

Não tem `municipio_id` e não é dado de município → **não** entra em `DATASET_MODELS` /
`DATASET_REGISTRY` de `municipio_management.py` (a regra de registro vale para datasets por
município).

### 2. Runner (`app/services/ingestao_automatica/runner.py`)

- `iniciar_job(db, dataset_key, filtros, usuario_id) -> IngestaoJob`:
  1. Valida fonte no registry e resolve filtros em municípios ativos
     (`municipio_ids` lista ⊕ `estado` ⊕ nada = todos). Vazio → 404.
  2. **Trava global — 1 job por vez**: se existe job `pendente`/`executando` (com heartbeat
     vivo), recusa com 409. Antes de recusar, marca como `abortado` jobs `executando` sem
     heartbeat há > 10 min (órfãos de deploy/restart) — a trava se autolibera.
  3. Cria a linha `pendente` e dispara `threading.Thread(daemon=True)` com o `job_id`.
- Thread `_executar_job(job_id)`:
  - Abre `SessionLocal()` próprio (nunca a sessão do request), marca `executando` + `iniciado_em`.
  - Chama `fonte.executar(db, municipios, anos, usuario_id, notificar, progresso=cb)`.
  - `cb(atual, total, etapa)` atualiza `progresso_*`/`etapa`/`atualizado_em` (heartbeat) com
    commit próprio.
  - Sucesso → `concluido` + `resumo` JSON; exceção → `erro` + mensagem truncada.
  - Mantém o comportamento atual ao final: `record_ingestao_audit(acao="auto_ingest")` e
    atualização de `DatasetInfo` (`fonte` default + `data_atualizacao`) — hoje no router,
    move para o runner.
- Assinatura das fontes ganha `progresso: Callable | None = None` (retrocompatível). As 4 fontes
  existentes passam a chamá-lo no loop de municípios e nas etapas de download.

### 3. API (router `ingestao_automatica.py`, ADMIN_GLOBAL)

- `POST /{key}/executar` → cria o job e retorna **202 `{job_id}`** imediatamente (breaking
  change aceito; a única consumidora é a nossa UI). `ExecutarIn` ganha
  `municipio_ids: list[int] | None` (mantém `estado`, `anos`, `notificar`; `municipio_id`
  singular é substituído por `municipio_ids`).
- `GET /jobs/{id}` → linha completa do job (endpoint de polling).
- `GET /jobs?dataset=&limit=20` → histórico (jobs = histórico operacional; `IngestaoAudit`
  permanece como trilha de auditoria).
- `GET /fontes` → passa a incluir `job_ativo` (global) e último job por fonte, para a página
  retomar o polling após refresh.

### 4. As 6 fontes novas (`app/services/ingestao_automatica/`)

Padrão consolidado: módulo com **parser puro** (testável sem rede/DB) + `executar()` com upsert
e commit por município + `registrar(FonteAutomatica(...))`. Reutilizam
`util.baixar_zip`/`linhas_zip`/`parse_valor_br`/`indices_colunas`.

| Fonte (módulo) | Origem | Estratégia | Match de município |
|---|---|---|---|
| `pib_ibge` | API de agregados do IBGE — PIB dos Municípios (tabela 5938) | 1 chamada por lote de municípios; variáveis: PIB a preços correntes + VAB agropecuária/indústria/serviços/adm pública → `pib_anual`. Grava só `tipo_dado="REAL"`; linhas `PROJETADO` legadas ficam intocadas | código IBGE nativo |
| `pix_bcb` | API Olinda/Bacen — `TransacoesPixPorMunicipio` | 1 request JSON por mês (payload nacional ~5,6k municípios), filtra os alvos; campos mapeiam 1:1 em `pix_mensal` | código IBGE nativo |
| `estban_bcb` | Bacen ESTBAN — ZIP mensal "por agência" | Agrega por município → `estban_mensal` e por instituição → `estban_por_instituicao`; mapa de verbetes portado de `carregar_estban.py` | código de município do CSV (validar formato/dígito na implementação; fallback nome+UF) |
| `comex_mdic` | Comex Stat/MDIC — CSVs anuais `EXP_YYYY_MUN` / `IMP_YYYY_MUN` | 2 downloads por ano (~30 MB cada) + tabelas auxiliares SH4→produto e país→nome → `comex_mensal`, `comex_por_produto`, `comex_por_pais` | código de município do arquivo MUN (verificar semântica vs `carregar_comex.py`) |
| `bolsa_familia_portal` | Portal da Transparência — ZIPs mensais (Auxílio Brasil até 2023-02, Novo Bolsa Família depois) | Download mensal para disco temporário + parse em streaming agregando **só os municípios-alvo** (nunca materializa o CSV nacional); regra de "primeira infância" portada de `coleta.py` → `bolsa_familia_resumo`. Default: últimas 12 competências | nome+UF normalizado (CSV traz código SIAFI, não IBGE — mesmo padrão do `fpm_stn`) |
| `pe_de_meia_portal` | Portal da Transparência — ZIPs mensais desde 2024-01 | Igual ao Bolsa Família → `pe_de_meia_resumo` + `pe_de_meia_etapa` (colunas de etapa/incentivo conforme `GUIA_AGENTE_GERACAO_CSV.md` §Pé-de-Meia) | nome+UF normalizado |

Semântica de `anos` nas fontes mensais: expande para todas as competências (meses) daqueles anos.
Sem `anos`: default definido por fonte e documentado no módulo (12 competências para as sociais;
últimos 3 anos para pix/estban; últimos anos disponíveis para pib/comex — espelhando o padrão das
fontes atuais, que variam: fpm usa 3 anos, emendas usa 2019→corrente). Progresso reportado por
competência baixada **e** por município processado.

Pontos a confirmar durante a implementação (não bloqueiam o design):
IDs exatos das variáveis da tabela 5938; formato do código de município no ESTBAN;
volume/colunas do ZIP do Novo Bolsa Família (o parse é streaming justamente para não depender
disso); colunas de etapa/incentivo do Pé-de-Meia.

### 5. Frontend (`/admin/fontes` — `DatasetFontesAdminPage.jsx`)

- **Disparo**: Executar → `POST` retorna `job_id` → polling `GET /jobs/{id}` a cada ~3s.
  UI não trava; a linha da fonte mostra progresso ("Executando — 42/853 municípios ·
  baixando 2026-05"). Com job ativo, todos os botões Executar ficam desabilitados (espelha a
  trava global do backend).
- **Filtros**: UF + notificar (mantidos) + **seletor múltiplo de municípios** (reuso do
  `MunicipioPicker` em modo multi) + campo opcional de anos. Aviso de "Brasil inteiro" mantido.
- **Retomada**: ao montar, `GET /fontes` informa job ativo → retoma polling (sobrevive a
  refresh/navegação).
- **Histórico**: seção com os últimos jobs (fonte, filtros, duração, status, linhas,
  municípios ok/erro, preview dos primeiros erros).
- Nota de UX: para `captacao_federal`, o diagnóstico de pares pressupõe a UF inteira carregada —
  a UI mostra um aviso quando a seleção for por municípios avulsos nessa fonte.

### 6. Erros e casos-limite

- Falha de download/fonte externa → job `erro` com mensagem (visível no histórico).
- Erros por município acumulam em `resumo.erros` sem derrubar o job (padrão atual).
- Deploy/restart no meio → thread morre; job vira `abortado` via heartbeat na próxima
  leitura/criação; reexecutar é seguro (upsert idempotente).
- `GET /jobs/{id}` inexistente → 404; `POST` com job ativo → 409 com mensagem clara.

### 7. Testes (padrão do projeto: pure-logic, sem DB/rede)

- Parser puro de cada fonte nova com fixtures reais recortadas
  (padrão de `backend/tests/test_ingestao_automatica.py`).
- Runner: transições de estado (pendente→executando→concluido/erro/abortado), trava global e
  detecção de órfão por heartbeat — lógica de decisão extraída em funções puras; interação com
  DB via `MagicMock` (padrão de `tests/ingestao/`).
- Frontend: `npm run build` como gate (padrão atual).
- E2E manual contra o banco de dev (Railway) com 1 município e 1 UF pequena antes de rodadas
  nacionais, como feito no rollout de captação/emendas.

## Documentação a atualizar junto

- `README.md` — tabela de fontes (6 datasets deixam de ser "CSV manual").
- `GUIA_AGENTE_GERACAO_CSV.md` — nota de que os 6 têm fonte automática (CSV manual vira fallback).
