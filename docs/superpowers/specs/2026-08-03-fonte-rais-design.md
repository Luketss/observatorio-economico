# Fonte automática RAIS (Ciclo B da frente RAIS/CNPJ) — Design

**Data:** 2026-08-03
**Escopo:** backend apenas (1 fonte nova no registry + testes; zero frontend, zero migração)
**Contexto:** 2º de 3 ciclos da frente de fontes pesadas (A worker ✅ → **B RAIS** → C CNPJ).
O worker separado está implementado e configurado no Railway (ativa no próximo push).
Hoje a RAIS só entra por CSV manual (`backend/ingestao/carregar_rais.py`, 15 tabelas
`rais_*` pré-agregadas por município/ano). Template de fonte FTP/PDET: `caged_pdet.py`.

**Fatos verificados no FTP em 2026-08-03** (`ftp.mtps.gov.br/pdet/microdados/RAIS/`):

- Diretórios por ano: `…2021, 2022, 2023, 2023 Parcial, 2024, 2024 Parcial, 2025, Layouts`.
- Arquivos de vínculos por REGIÃO (ano 2025): `RAIS_VINC_PUB_CENTRO_OESTE.7z` (354MB),
  `RAIS_VINC_PUB_MG_ES_RJ.7z` (767MB), `RAIS_VINC_PUB_NI.7z` (**209KB** — região "não
  identificada", mesmo layout), `RAIS_VINC_PUB_NORDESTE.7z` (640MB),
  `RAIS_VINC_PUB_NORTE.7z` (212MB), `RAIS_VINC_PUB_SP.7z` (1.1GB),
  `RAIS_VINC_PUB_SUL.7z` (705MB). `RAIS_ESTAB_PUB.7z` (estabelecimentos) NÃO é usado —
  as 15 tabelas derivam só de vínculos.
- Layout oficial em `Layouts/vínculos/RAIS_vinculos_layout2020.xls` (categorias/labels
  de cada variável; regra oficial: `-1`, `{ñ class}` = **ignorado**). PORÉM, o header
  REAL validado no NI de 2025 (`RAIS_VINC_PUB_NI.COMT` dentro do 7z) difere do layout:
  **CSV com VÍRGULA e aspas** (não `;`), decimal com PONTO (`1637.69`), campos com
  espaços à esquerda (`" 41204"`), 62 colunas com sufixo `- Código` (ex.:
  `Município - Código`, `Sexo - Código`, `CNAE 2.0 Subclasse - Codigo` — este sem
  acento) e coluna extra `Categoria Trabalhador - Código` ausente do layout 2020.
  Valores 999999/9999/999/99 = não identificado. O parse segue o header real.

## Decisões (validadas com o usuário)

1. **Fora do meta-job "todas"** — fonte anual e pesada (767MB+/região), roda sob demanda.
2. **REPLACE por (município, ano)** — idempotente, padrão CAGED; substitui dados do
   mesmo ano inclusive os manuais (o loader manual continua como fallback).
3. **Regra "nenhum descarte silencioso"** (transversal do usuário): códigos fora do mapa
   viram buckets rotulados; `-1`/`{ñ class}` viram "Ignorado" (semântica do layout oficial).
4. **Validação do layout real via `RAIS_VINC_PUB_NI.7z` (209KB)** num passo cedo do
   plano — header/encoding reais sem baixar GB.
5. Labels reutilizam as strings já existentes no banco quando o conceito coincide
   (mesma regra do CAGED); codificação da RAIS legada ≠ Novo CAGED — **não reusar** os
   mapas de `carregar_caged.py`/`caged_pdet.py`.

## 1. Fonte `rais_pdet.py` (`app/services/ingestao_automatica/`)

- Registrada no registry como `key="rais"` (label "RAIS (PDET)"); import no
  `__init__.py`; **NÃO** entra em `ORDEM_EXECUCAO_TODAS`.
- Assinatura padrão `executar(db, municipios, anos=None, usuario_id=None,
  notificar=True, progresso=None) -> ResumoIngestao`.
- `anos=None` → default: o ano FINAL mais recente disponível no FTP (listagem de
  diretórios; dir "X Parcial" só é usado se não existir "X" final — nesse caso o resumo
  ganha aviso "ano X: dados parciais").

## 2. Download e parse (por ano × região)

- Mapa UF→região dos arquivos: MG/ES/RJ→`MG_ES_RJ`; SP→`SP`; PR/SC/RS→`SUL`;
  DF/GO/MT/MS→`CENTRO_OESTE`; MA/PI/CE/RN/PB/PE/AL/SE/BA→`NORDESTE`;
  RO/AC/AM/RR/PA/AP/TO→`NORTE`. Só baixa as regiões que cobrem os municípios-alvo.
- FTP tolerante no padrão do CAGED (`baixar_tolerante`: 1 reconexão; conexão morta →
  None, nunca conexão zumbi). `TemporaryDirectory` por (ano, região): baixa o `.7z`,
  extrai com `py7zr`, parseia e limpa — nunca mantém mais de uma região em disco
  (~4-6GB descomprimido no pior caso, dentro do disco efêmero do worker).
- Parse: `csv.reader` linha a linha, `;`, encoding validado no arquivo NI (esperado
  latin-1). Agrega EM MEMÓRIA apenas os municípios-alvo (dict por município/dimensão —
  memória limitada pelo nº de municípios selecionados, não pelo arquivo).
- Match de município: a coluna de município da RAIS usa código IBGE de 6 dígitos —
  casar com `Municipio.codigo_ibge[:6]` (validado no passo do NI).
- Progresso/etapas: "download {região} {ano}" → "extraindo" → "processando {região}" →
  "gravando {município} (i/N)"; callback + ticker do runner cobrem trechos longos.

## 3. Mapeamento → 15 tabelas `rais_*`

- As agregações replicam o que `carregar_rais.py` produz hoje (mesmas 15 tabelas,
  mesmas chaves únicas por município/ano/dimensão): RaisVinculo, PorSexo, PorRaca,
  PorCnae, PorFaixaEtaria, PorEscolaridade, PorFaixaRemuneracao, PorFaixaTempoEmprego,
  MetricasAnuais, PorMotivoDesligamento, PorTipoAdmissao, PorCbo,
  PorTamanhoEstabelecimento, PorNaturezaJuridica, TurnoverMensal.
- O plano DEVE conter a tabela de mapeamento coluna-do-layout-oficial → dimensão
  interna, ancorada na planilha "RAISD - layout" (2020+) e validada contra o header
  real do NI; nomes reais das colunas do CSV são os do layout (ex.: "CAUSA DESLI",
  "Escolaridade após 2005") — a transcrição exata fica no plano.
- Buckets rotulados para categorias fora do mapa (ex.: código novo de motivo de
  desligamento vira label próprio, nunca descartado); truncamento de rótulos respeita
  o tamanho das colunas (padrão do CAGED).

## 4. Gravação

- REPLACE por (município, ano): `delete()` das 15 tabelas para (municipio_id, ano) +
  inserts + `commit()` **por município** (memória e progresso controlados, padrão
  CAGED).
- `record_ingestao_audit` + `DatasetInfo` ficam com o runner (como toda fonte).
- Notificações: nenhuma específica da fonte neste ciclo (RAIS é anual; sem regra de
  variação definida) — `notificar` aceito e ignorado, documentado no módulo.

## Casos de borda

- Município-alvo sem NENHUMA linha no arquivo do ano: o REPLACE é PULADO para esse
  município (não deleta dados existentes para gravar nada) e o fato entra em `erros[]`
  como aviso ("sem vínculos no arquivo — dados anteriores mantidos") — proteção contra
  wipe silencioso por arquivo incompleto.
- Ano inexistente no FTP: item de erro audível no resumo (`erros[]`), demais anos
  seguem.
- Falha de FTP no meio de uma região: erro audível; regiões já gravadas permanecem
  (commit por município), re-rodar completa (REPLACE idempotente).
- Linha truncada/malformada: pulada e CONTADA em `erros` (sem abortar o arquivo).
- Execução inline (dev sem worker): funciona igual — só mais lenta na thread da API.

## Testes e gates

- **TDD do núcleo puro** (padrão CAGED): parser/agregador com CSV sintético no layout
  real — cobertura por dimensão (15 tabelas), buckets de código desconhecido,
  `-1`/`{ñ class}`→Ignorado, match por 6 dígitos, linha malformada contada.
- Gate: `venv/Scripts/python -m pytest backend/tests -q` exit 0 (227 atuais + novos).
- **E2E real na verificação final**: worker local + 1 município MG + 1 ano — download
  real de `MG_ES_RJ` (~767MB, minutos), transições do job, contagens nas 15 tabelas
  coerentes com a página RAIS; validação prévia de header/encoding via NI (segundos).

## Fora de escopo

- Empresas/CNPJ (Ciclo C); `RAIS_ESTAB_PUB` (estabelecimentos); notificações de
  variação anual; entrar no meta-job "todas"; anos < 2020 (layout antigo — carga
  manual continua disponível); frontend (a página RAIS já consome as 15 tabelas).
