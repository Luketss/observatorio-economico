# Execução "todas as fontes" em um clique (meta-job) — Design

**Data:** 2026-07-20
**Branch alvo:** `feat/captacao-emendas` (ou nova branch a partir dela)
**Status:** aprovado pelo usuário (2026-07-20)

## Contexto

A esteira de ingestão automática tem 10 fontes em `FONTES_AUTOMATICAS`, executadas em background
por `POST /ingestao-automatica/{key}/executar` (job + runner com heartbeat, trava global de 1 job,
polling na UI `/admin/fontes`). A seleção por município(s), UF ou Brasil inteiro **já existe** —
mas só fonte a fonte: popular um município do zero (Demo Express) exige 10 disparos manuais,
esperando cada job terminar por causa da trava global.

## Objetivos

1. Botão **"Rodar todas as fontes"** em `/admin/fontes`: um disparo encadeia as 10 fontes em
   sequência para os filtros da tela (municípios/UF/anos/notificar), no servidor.
2. Manter os botões individuais por fonte exatamente como estão.
3. Uso manual, para os dois cenários: onboarding de cidade nova e re-coleta periódica de clientes.

## Não-objetivos (decididos)

- Agendamento/cron e cancelamento de job — continuam pendências separadas (IDEAS.md).
- Fila de jobs no runner (ver Alternativas) — a trava "1 job por vez" permanece.
- Seleção de subconjunto de fontes na execução "todas" (checkboxes) — é todas, ou uma (botão
  individual).
- Fontes novas (caged/rais/cnpj, estaduais, etc.) — rodadas futuras.

## Arquitetura escolhida

**Meta-job**: um único `IngestaoJob` com `dataset="todas"` cuja thread itera as fontes em
sequência. Sem migration (`dataset` é `String(50)`); trava global, heartbeat, ticker, sweep de
órfãos e retomada pós-refresh funcionam sem mudança — é um job comum, só que mais longo.

Alternativas rejeitadas:
- *Fila de jobs* (10 jobs `pendente`, runner puxa o próximo): histórico mais granular e base para
  cron, mas muda a semântica do runner (hoje job ativo ⇒ 409 na criação; exigiria ordenação,
  disparo em cadeia e sweep para enfileirados) — muita superfície de bug para o mesmo resultado
  visível. Evolução natural quando o agendamento chegar.
- *Encadeamento no frontend* (a tela dispara a próxima fonte ao terminar a anterior): fechar a
  aba mata a sequência no meio. Descartado.

## Componentes

### 1. Ordem de execução (`ingestao_automatica/base.py`)

Lista explícita `ORDEM_EXECUCAO_TODAS`:

```
populacao, fpm, pib, pix, comex, estban, bolsa_familia, pe_de_meia,
captacao_federal, emendas
```

- `populacao` primeiro (o coeficiente estimado do FPM depende de população).
- `captacao_federal` e `emendas` por último (as mais lentas — o grosso dos dados aparece cedo).
- A key sintética `"todas"` é **reservada**: não pode existir no registry (teste garante).

### 2. Runner (`runner.py`)

- `iniciar_job` aceita `dataset_key="todas"` (hoje 404 se a key não está no registry — passa a
  tratar `"todas"` como válida). Resolução de municípios, 404 se vazio, advisory lock e 409 de
  job ativo: inalterados.
- `_executar_job`, quando `job.dataset == "todas"`, executa o loop:
  1. Para cada fonte na ordem (posição `i` de `n`):
     - Resolve os municípios da fonte (regra da captação abaixo; demais fontes usam o filtro
       original do job).
     - Chama `fonte.executar(...)` com um callback de progresso que **prefixa a etapa** com
       `"{i}/{n} · {label} — {etapa interna}"` e atualiza `progresso_atual/total` com os números
       da fonte corrente (a barra reinicia a cada fonte; o prefixo dá o contexto geral).
     - Grava `IngestaoAudit` (`acao="auto_ingest"`, `dataset` real da fonte) e
       `_atualizar_dataset_info` por fonte — o "última execução" de cada card e a trilha de
       auditoria por dataset continuam corretos.
  2. Exceção em uma fonte **não interrompe a sequência**: registra audit `status="erro"` daquela
     fonte, anota no resumo e segue para a próxima.
  3. `job.resumo` agregado:
     `{"fontes": [{key, status: "ok"|"aviso"|"erro", linhas, municipios_ok, municipios_erro,
     erros[:5]}, ...]}`.
  4. Status final: `concluido` se **ao menos uma** fonte terminou sem exceção; `erro` só se
     todas falharem (mensagem: primeira exceção + contagem).
- Lógica de decisão extraída em funções puras (testáveis sem DB): montagem do resumo agregado,
  regra do status final e decisão de expansão da captação.

### 3. Regra da captação federal (pares por UF)

O diagnóstico de pares da captação compara a UF inteira. Na execução "todas" com
`municipio_ids`, a fonte `captacao_federal` roda com a lista expandida para **todos os
municípios ativos das UFs dos municípios selecionados** (pode ser mais de uma UF). Só ela; as
demais fontes usam a seleção original. Com filtro por UF ou sem filtro (Brasil), nada muda.
O botão individual da captação permanece como está (com o aviso já existente na UI).

### 4. API (`routers/ingestao_automatica.py`)

- Reusa `POST /{dataset_key}/executar` com `dataset_key="todas"` — a rota já casa; a validação
  passa a aceitar a key reservada. Sem endpoint novo, sem mudança de contrato.
- `GET /jobs`, `GET /jobs/{id}`, `GET /fontes`: inalterados (o meta-job aparece como job comum).

### 5. Frontend (`DatasetFontesAdminPage.jsx`)

- Botão **"Rodar todas as fontes"** no cabeçalho do painel de fontes automáticas, usando os
  mesmos filtros da tela. `confirm()` nativo quando não há filtro (Brasil inteiro — potencialmente
  horas).
- Nota informativa junto ao botão: *"A captação federal roda para a UF inteira dos municípios
  selecionados (comparação de pares)."*
- Card de progresso do meta-job acima da lista de fontes (etapa `N/10 · Fonte — detalhe` +
  barra). Polling/retomada: sem mudança.
- Rótulo `dataset="todas"` → **"Todas as fontes"** no card, no histórico e nos toasts.
- Toast final do meta-job usa o resumo agregado: `"Todas as fontes: 8 ok, 2 com erro"`
  (warning se houve falha; error se status `erro`). O toast atual lê
  `resumo.municipios_ok/linhas` — ganha um ramo para o formato `resumo.fontes`.
- Coluna "Linhas" do histórico para o meta-job: soma das linhas das fontes; "Detalhe" mostra
  `"8 ok, 2 com erro"` + primeiras keys com erro.

### 6. Erros e casos-limite

- Deploy/restart no meio da sequência → mesmo comportamento de hoje (job `abortado` via
  heartbeat); reexecutar é seguro (upsert idempotente em todas as fontes). Fontes já concluídas
  na rodada abortada ficam gravadas — re-rodar só as refresca.
- Job ativo (qualquer) bloqueia "todas" e vice-versa — 409 atual, sem mudança.
- Filtro sem municípios ativos → 404 atual.
- Falha parcial dentro de uma fonte (municípios com erro) segue o padrão da fonte
  (`resumo.erros`), refletida como `status="aviso"` no item da fonte no resumo agregado.

### 7. Testes (padrão do projeto: pure-logic, sem DB/rede)

- `ORDEM_EXECUCAO_TODAS`: `populacao` é a primeira; conjunto == keys de `FONTES_AUTOMATICAS`
  (nada faltando/sobrando — quebra se alguém registrar fonte nova e esquecer a ordem);
  `"todas"` não está no registry.
- Resumo agregado: montagem a partir de uma lista de `ResumoIngestao`/exceções; soma de linhas;
  mapeamento ok/aviso/erro por fonte.
- Regra do status final: todas falham → `erro`; parcial → `concluido`.
- Decisão de expansão da captação: função pura `(fonte_key, filtros) → precisa_expandir?` —
  expande só para `captacao_federal` com `municipio_ids`; UF/Brasil intocados.
- Frontend: `npm run build` como gate (padrão atual).
- E2E manual contra o banco de dev (Railway): "todas" para 1 município pequeno; conferir
  histórico, audits por dataset e toast agregado.

## Documentação a atualizar junto

- `IDEAS.md` — Demo Express: marcar "execução one-click de todas as fontes" como entregue.
- `README.md`/`PROJECT_GUIDE.md` — nota do botão "Rodar todas as fontes" na seção de ingestão
  (se a seção existir).
