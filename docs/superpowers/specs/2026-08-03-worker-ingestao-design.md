# Worker de ingestão separado (Ciclo A da frente RAIS/CNPJ) — Design

**Data:** 2026-08-03
**Escopo:** backend + infra de deploy (zero frontend, zero migração de schema)
**Contexto:** 1º de 3 ciclos da frente de fontes pesadas (A worker → B fonte RAIS →
C fonte Empresas/CNPJ). Hoje a ingestão automática roda em `threading.Thread` dentro do
processo gunicorn da API (4 workers compartilhando RAM — motivo da trava global de 1 job
e do aviso de escala em `caged_pdet.py:21-22`). O design de julho
(2026-07-09-pipeline-background-jobs) já previu esta migração: "a tabela de jobs é a
mesma — migrar depois é mover a chamada do executor de lugar".

## Decisões (validadas com o usuário)

1. **Worker separado no Railway** (novo serviço sempre ativo) em vez de RAIS in-process.
2. **Decomposição A → B → C**: este ciclo entrega só a infra do worker, testável com as
   fontes existentes; RAIS e CNPJ vêm em ciclos próprios já rodando no worker.
3. **Default preserva o comportamento atual**: sem configurar nada, a API segue
   executando inline (thread). O modo worker é opt-in por env var — rollback é trocar
   a env de volta.
4. **Deploy do serviço novo é do usuário** — a spec/README documentam os passos.

## 1. `backend/app/worker.py` — o processo worker

Executável como `python -m app.worker`, mesma imagem Docker do backend (serviço Railway
novo com start command próprio; **sem** gunicorn e **sem** `alembic upgrade` — migração
continua exclusiva da API).

Loop principal:

- **Claim atômico**: numa transação, `SELECT` do job `pendente` mais antigo
  (`ORDER BY criado_em`) com `FOR UPDATE SKIP LOCKED`; se houver, transiciona
  `pendente → executando` (+ `iniciado_em`) e commita. Réplicas extras ou restart não
  duplicam job — quem não conseguiu o lock pula.
- **Execução**: chama a mesma função de execução do runner atual (refatorada para ser
  chamável dos dois modos — ver §2): fonte via registry `FONTES_AUTOMATICAS`
  (incluindo o meta-job `todas`), callback de progresso, ticker de heartbeat 60s em
  thread própria, duas sessões (`db`/`db_job`), transições terminais guardadas — tudo
  o que existe hoje, sem mudança de semântica.
- **Ocioso**: dorme ~3s entre polls.
- **Erro/queda**: exceção na fonte segue o caminho atual (job `erro` com mensagem);
  morte abrupta do processo (redeploy/SIGKILL) deixa o job `executando` sem heartbeat
  → o sweep lazy da API o marca `abortado` em ≤10 min (`JOB_ORFAO_MINUTOS`), idêntico
  ao que um redeploy da API já causava com a thread.
- Logs em stdout (visíveis no Railway).

## 2. Runner/API — enfileirar vs executar

- Env nova **`INGESTAO_EXECUTOR`** em `app/core/config.py`: `"inline"` (default) |
  `"worker"`.
- `iniciar_job(...)` (runner) mantém tudo que faz hoje (advisory lock na criação,
  sweep de órfão, 409 de job ativo, criação da linha `pendente`); a única mudança é o
  final: `inline` → dispara a thread como hoje; `worker` → retorna sem disparar (o job
  fica `pendente` até o worker reivindicar).
- A função de execução é refatorada para aceitar job **já em `executando`** (no modo
  worker o claim fez a transição; no modo inline ela continua fazendo a transição
  `pendente → executando` ela mesma). Nenhuma outra mudança de semântica.
- Router e frontend: **zero mudança** — o polling já exibe `pendente` (o job aparece
  "na fila" por alguns segundos no modo worker).

## 3. Semântica preservada (invariantes)

- 1 job global por vez: advisory lock na criação + 409 de job ativo continuam; o worker
  processa sequencialmente (1 claim por vez).
- Heartbeat: callback a cada 25 municípios/etapa + ticker 60s — inalterados, rodam no
  processo que executa.
- Sweep lazy de órfãos na API (`_job_ativo`/`obter_job`) — inalterado; cobre tanto a
  queda do worker no meio de um job quanto um `pendente` que nunca foi reivindicado:
  `STATUS_ATIVOS = (pendente, executando)` e `job_orfao` trata os dois igual — sem
  atividade (heartbeat/criação) há mais de 10 minutos, o job vira `abortado` na
  próxima consulta às telas de coleta. Não existe abortar manual hoje (segue no
  backlog junto com o cancelamento de job) — o README instrui conferir o serviço
  worker se um job ficar `pendente`.
- Fontes/registry/meta-job `todas`: sem mudança — o worker importa o mesmo pacote.

## 4. Dev e deploy

- **docker-compose**: serviço novo `observatorio_worker` (mesma build do backend,
  `command: python -m app.worker`, mesmo `.env`) + `INGESTAO_EXECUTOR=worker` no
  serviço da API do compose — o modo worker é o testado localmente por padrão no
  compose; uvicorn local sem worker continua funcionando com o default `inline`.
- **Railway (passos do usuário, documentados no README):** criar serviço novo no mesmo
  repo (root `backend/`, mesmo Dockerfile) com start command
  `python -m app.worker`; apontar `DATABASE_URL` (e demais envs do backend) para os
  mesmos valores da API; setar `INGESTAO_EXECUTOR=worker` **na API**; deploy. Rollback:
  remover a env da API (volta a inline) e pausar o serviço worker.

## Casos de borda

- Worker sobe com `INGESTAO_EXECUTOR` da API ainda `inline`: inofensivo — a API executa
  na thread e o worker nunca vê job `pendente` (a thread transiciona imediatamente).
- Dois claims simultâneos (restart sobreposto): `SKIP LOCKED` + transição de status na
  mesma transação garantem 1 vencedor.
- Job criado durante redeploy do worker: fica `pendente` e é pego quando o worker volta.
- Worker sem acesso ao DB na subida: loga e re-tenta no próximo poll (não morre em loop
  de crash imediato).

## Testes e gates

- **pytest (puros)**: helpers extraíveis do worker — decisão de claim (query montada /
  filtro de status), transição aceita-já-executando, backoff do loop. Sem teste de
  `SKIP LOCKED` real (exige PG concorrente; coberto no E2E).
- **E2E na verificação final (dev local, banco de dev)**: API uvicorn com
  `INGESTAO_EXECUTOR=worker` + `python -m app.worker` em processo separado; disparar
  fonte leve (ex.: `populacao` de 1 município) pela API; observar `pendente →
  executando → concluido` via polling; matar o worker no meio de um job e confirmar o
  caminho de órfão validando `job_orfao()` diretamente sobre o job travado (sem esperar
  os 10 min reais).
- Gates: suite backend inteira exit 0; `npm run build` não é afetado (zero frontend).

## Fora de escopo

- Fontes RAIS (Ciclo B) e Empresas/CNPJ (Ciclo C).
- Migrar a execução para fila real (SQS/Redis), múltiplos workers paralelos, cancelar
  job em andamento (segue no backlog), cron/agendamento.
- Mudanças de UI (a tela de coletas já mostra `pendente`).
