# Fonte IPS com upload pela tela de coletas — Design

**Data:** 2026-08-10
**Status:** aprovado pelo usuário (2026-08-10)

## Objetivo

Levar a carga do IPS (Índice de Progresso Social) para a tela de coletas da plataforma
(`/admin/fontes`), executada como job em segundo plano pelo worker — hoje a única forma de
carga é o CLI local `python -m ingestao.carregar_ips`, que depende de CSVs em `dados/ips/`
(pasta que nem sobe no deploy, `.railwayignore`).

## Contexto e restrição upstream

- O lado de leitura do IPS está completo: modelo `IpsMunicipio` (`backend/app/models/ips.py`),
  migração `68bbe475530f`, router `/ips/*`, página `/app/ips`, dados 2024/2025.
- O download automático continua inviável — reverificado em 2026-08-10: ipsbrasil.org.br segue
  SPA sem link direto de download (mesma conclusão da spec `2026-07-27-fontes-ips-inss-design.md`).
  Decisão do usuário em 2026-08-10: **fonte semi-automática com upload pela tela**, superando o
  adiamento registrado naquela spec.
- O XLSX baixado do site (`ips_brasil_municipios_{ano}.xlsx`, ~5 MB, aba "Dados IPS",
  79 colunas × 5.570 municípios) é legível com openpyxl **desde que se chame
  `ws.reset_dimensions()`** — o metadado de dimensão do arquivo é quebrado (validado em
  2026-08-10 com o arquivo real de 2025). Os headers batem exatamente com o `COLUMN_MAP` de
  `backend/ingestao/carregar_ips.py` (76/79 mapeadas; Código IBGE/Município/UF são identificação).
  Valores numéricos no XLSX vêm como float (ponto decimal); no CSV convertido vêm como string
  com vírgula.

## Experiência do usuário

A fonte "IPS — Índice de Progresso Social" aparece na tabela de coletas automáticas de
`/admin/fontes` (a tela é registry-driven — nenhuma coluna nova). Como exige arquivo, o botão
"Atualizar agora" dela abre um modal pedindo:

- **Arquivo**: o `ips_brasil_municipios_{ano}.xlsx` exatamente como baixado do site, ou o CSV
  já convertido (`;`, utf-8-sig).
- **Ano**: pré-preenchido a partir do nome do arquivo (`ips_brasil_municipios_(\d{4})`),
  editável.

Depois do envio, é um job normal: progresso, histórico, auditoria e toast como nas outras
15 fontes. Atualização anual 100% pela tela, sem deploy.

Aviso na linha da fonte (padrão do aviso existente do `captacao_federal`): o arquivo é
nacional — filtros de estado/município da tela são ignorados por esta fonte.

## Arquitetura

### Transporte do arquivo (API → worker)

API e worker não compartilham filesystem (serviços Railway distintos); o arquivo trafega pelo
banco:

- **Migração nova**: tabela `ingestao_arquivo` — `id` (PK), `nome` (varchar), `conteudo`
  (bytea), `criado_em` (timestamptz). ~5 MB por arquivo, cadência anual.
- **Endpoint novo** `POST /ingestao-automatica/{dataset_key}/executar-arquivo` (multipart:
  `arquivo: UploadFile`, `ano: int` via Form, `notificar` opcional), `require_role("ADMIN_GLOBAL")`,
  status 202. Valida que a fonte existe e tem `requer_arquivo`; limite de tamanho (20 MB).
  Grava o blob (flush para obter id) e chama `iniciar_job` com
  `filtros = {"arquivo_id": id, "anos": [ano], "notificar": ...}` — o commit único de
  `iniciar_job` (`runner.py:256`) persiste blob + job atomicamente; um 409 de job ativo faz
  rollback e o blob nem persiste.
- O endpoint atual `POST /{dataset_key}/executar` passa a rejeitar fontes com
  `requer_arquivo` (400, mensagem orientando usar o upload).

### Contrato da fonte

- `FonteAutomatica` (`base.py:16`) ganha campo `requer_arquivo: bool = False` (último campo,
  com default — não quebra as 15 fontes existentes).
- O runner (`runner.py:384`) passa `arquivo_id=filtros.get("arquivo_id")` como kwarg extra
  **apenas** para fontes com `requer_arquivo` — a assinatura das demais não muda.
- `GET /ingestao-automatica/fontes` expõe `requer_arquivo` em cada item, para a UI decidir
  entre POST direto e modal de upload.

### Módulo novo `backend/app/services/ingestao_automatica/ips_arquivo.py`

- `registrar(FonteAutomatica(key="ips", label="IPS — Índice de Progresso Social",
  fonte="IPS Brasil (ipsbrasil.org.br) — arquivo anual", executar=executar,
  requer_arquivo=True))` + import em `ingestao_automatica/__init__.py` (é o import que
  auto-registra, inclusive no worker).
- `"ips"` entra em `FONTES_FORA_DO_TODAS` (`base.py:57`) — sem arquivo não roda, não pode
  entrar no meta-job "todas". O teste de paridade (`backend/tests/test_ingestao_todas.py`)
  cobre isso automaticamente.
- **Parse**: XLSX via openpyxl (`load_workbook(BytesIO, read_only=True)` +
  `ws.reset_dimensions()`) ou CSV (decode utf-8-sig, `csv.DictReader` com `;`). Detecção por
  assinatura/extensão. Cada linha vira dict header→valor; normalização de valor aceita float
  (XLSX) e string com vírgula (CSV). **Reusa `COLUMN_MAP` e os parsers de
  `ingestao.carregar_ips`** — zero duplicação do mapeamento de 79 colunas (extrair helper
  compartilhado de montagem de kwargs se necessário).
- **Gravação: upsert** por `(municipio_id, ano)` via `on_conflict_do_update` — re-enviar o
  arquivo corrige dados. (O CLI continua insert-only, intocado.)
- Municípios ausentes no banco são criados (`obter_ou_criar_municipio`), como o CLI já fazia —
  o arquivo é nacional e a página IPS é nacional por design.
- Parâmetros `municipios`/`anos` do contrato: `municipios` é ignorado (arquivo nacional);
  `anos[0]` é o ano da carga. `notificar` é ignorado (fonte não gera notificações).
- **Progresso**: `progresso(i, total=<linhas do arquivo>, etapa=...)` a cada N linhas.
- **Ciclo de vida do blob**: a fonte deleta o próprio blob ao concluir com sucesso; blobs
  órfãos (job com erro/abortado) são varridos no próximo upload (`DELETE` de linhas com mais
  de 24h no endpoint de upload).

### Frontend (`DatasetFontesAdminPage.jsx`)

- `handleExecutar`: se `fonte.requer_arquivo`, abre modal (NidModal, padrão da página) com
  input de arquivo (`.xlsx,.csv`) e campo ano (prefill via regex no nome); submit faz POST
  multipart no endpoint novo e entra no `startPolling` normal.
- Nota na célula da fonte (como a do `captacao_federal` em `:353-357`): "Requer o arquivo
  anual do site — filtros de estado/município não se aplicam."
- Verificar `labelDataset` (`src/utils/jobStatus.js`) para o histórico exibir o label do IPS.

## Tratamento de erros

- Arquivo sem os headers esperados → job termina em `erro` com mensagem legível
  (ex.: "arquivo não parece ser o IPS nacional — headers 'Código IBGE', 'UF' ausentes").
- `arquivo_id` inexistente no banco (varrido/corrompido) → erro legível pedindo reenvio.
- Worker desatualizado → mensagem existente do runner ("fonte 'ips' não registrada neste
  executor") já cobre.
- Upload maior que o limite → 400 no endpoint, sem criar job.

## Testes

Convenção do projeto — lógica pura, sem DB/rede (`backend/tests/test_ingestao_automatica.py`):

- Parse de XLSX em memória (workbook pequeno gerado no teste com dimensão quebrada) e de CSV
  (bytes com BOM) → dicts corretos.
- Montagem de kwargs via `COLUMN_MAP` para linha XLSX (float) e CSV (string com vírgula).
- Inferência de ano pelo nome do arquivo (com e sem match).
- Rejeição de headers inválidos com mensagem legível.
- Endpoint: `/executar` retorna 400 para fonte com `requer_arquivo`; `/executar-arquivo`
  retorna 404/400 para fonte inexistente ou sem a flag.
- Paridade do "todas": já coberta pelo teste existente ao adicionar `"ips"` em
  `FONTES_FORA_DO_TODAS`.

Verificação E2E (manual): subir stack local (`docker-compose`, API com
`INGESTAO_EXECUTOR: worker`), enviar o XLSX real de 2025 pela tela, acompanhar o job e
conferir `/app/ips`.

## Deploy

Redeploy **da API e do serviço worker** (`railway up` manual — já é a pendência nº1 da fila);
o registry é resolvido em processo, e há migração nova (`alembic upgrade head` roda no CMD da
imagem da API).

## Fora de escopo

- Cron/agendamento de fontes, cancelamento de job, VAF (pendências já rastreadas).
- Outros formatos de arquivo ou upload para outras fontes (a infra `requer_arquivo` fica
  genérica, mas só o IPS a usa).
- Mudanças no CLI `carregar_ips` e na página `/app/ips`.
