# Fonte automática Arrecadação (repasses MG) — Design

**Data:** 2026-07-27
**Status:** aprovado pelo usuário (subprojeto 2 de 3; fila restante: CAGED/RAIS/CNPJ — aguarda decisão de worker separado)

## Objetivo

Fonte automática `arrecadacao` no pipeline de ingestão (`FONTES_AUTOMATICAS`): repasses mensais de ICMS/IPVA/IPI do Estado de MG aos municípios, na tabela `arrecadacao_mensal` existente. Zero migration, zero UI nova, zero endpoint novo.

## VAF: ADIADO (decisão do usuário, 2026-07-27)

O VAF/IPM não está no CKAN de MG (busca retorna zero); é publicado como planilha anexa a resoluções anuais da SEF-MG com URL instável. Mesmo critério do IPS: segue com carga manual anual (`ingestao/carregar_vaf.py`) e volta à fila se surgir URL estável. Scraping da página de resoluções foi descartado (quebra silenciosa provável).

## Upstream (descoberto e validado em 2026-07-27)

CKAN `dados.mg.gov.br`, dataset **`transferencia-de-impostos-a-municipios`** ("Despesas com repasse a municípios") — star schema Frictionless que alimenta a consulta oficial da Transparência-MG. Resolver os resources via `GET /api/3/action/package_show?id=transferencia-de-impostos-a-municipios` (mesmo padrão CKAN da fonte FPM/STN), escolhendo por nome de arquivo:

- **`ft_repasse_mun.csv.gz`** (fato, ~3,6 MB, 220 mil linhas, 2007→mês corrente): `id_tempo;id_municipio;ano_particao;vr_icms;vr_ipi;vr_ipva`
- **`dm_tempo_mensal.csv.gz`** (~16 KB): `id_tempo;anomes_iso;mes;ano;anomes_formatado`
- **`dm_municipio.csv.gz`** (~10 KB, 916 linhas): `id_municipio;cd_municipio_ibge;nome` — contém linhas de "TERRITORIO ..." com códigos curtos (não-municípios)

CSVs UTF-8 com BOM, separador `;`, comprimidos com gzip. A carga manual legada veio exatamente desta consulta (mesmos nomes `vr_icms/vr_ipva/vr_ipi`) — semântica idêntica.

## Transformação

- Descomprimir em memória (`gzip`), parse `csv` com `utf-8-sig`.
- Join: fato × `dm_tempo_mensal` (→ ano, mês) × `dm_municipio` (→ código IBGE).
- Descartar linhas cujo `cd_municipio_ibge` não tenha 7 dígitos (territórios/agregados).
- Municípios-alvo casados por código IBGE (municípios de MG: 31xxxxx).
- Derivados: `valor_total` = icms+ipva+ipi; `nome_mes` = nome pt-BR do mês; `data_base` = date(ano, mês, 1). (`nome_mes` e `data_base` são NOT NULL no modelo.)

## Gravação

- **Upsert real por (município, ano, mês)**: atualiza registro existente (o Estado corrige o fato retroativamente), insere novo. Difere do script manual (`on_conflict_do_nothing`).
- Default: série completa disponível (o download é o mesmo); filtro `anos` do job restringe.
- Mês corrente pode vir parcial — comportamento aceito; a próxima execução corrige via upsert.

## Cobertura MG-only

Municípios-alvo de UF ≠ MG geram **um aviso único** ("fonte cobre apenas municípios de MG — N município(s) de outra(s) UF ignorado(s)") e contam em `municipios_erro`; sem N mensagens repetidas. Outra UF no futuro = módulo próprio da SEF correspondente.

## Integração

- `registrar(FonteAutomatica(key="arrecadacao", ...))` no módulo novo `arrecadacao_mg.py` + import em `ingestao_automatica/__init__.py`.
- `"arrecadacao"` em `ORDEM_EXECUCAO_TODAS` antes de `captacao_federal`/`emendas` (teste de paridade exige as duas no fim).
- `arrecadacao_mensal` já está em DATASET_MODELS/LABELS do municipio_management (dataset antigo).
- Erros de rede reais mantêm mensagem técnica; 403/404 do CKAN não têm semântica especial aqui (dataset contínuo, não por período) — falha vira erro técnico normal.

## Testes e verificação

- Helpers puros com TDD em `backend/tests/test_ingestao_automatica.py` (sem DB/rede): parse das dimensões, join fato×dims, filtro de territórios, derivação nome_mes/data_base/valor_total, filtro de anos.
- Suíte backend completa (exit 0).
- E2E service-level: Cabo Verde/MG contra a Railway; conferência visual do usuário em /app/arrecadacao.

## Fora de escopo

- VAF (adiado), outras UFs, CAGED/RAIS/CNPJ (subprojeto 3), UI/endpoints/migrations/cron.
