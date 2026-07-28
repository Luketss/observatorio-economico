# Fontes automáticas IPS e INSS — Design

**Data:** 2026-07-27
**Status:** aprovado pelo usuário (subprojeto 1 de 3; ficam na fila: Arrecadação/VAF estaduais e CAGED/RAIS/CNPJ — este último aguarda decisão de worker separado)

## Objetivo

Adicionar as fontes automáticas `ips` e `inss` ao pipeline de ingestão em background (`FONTES_AUTOMATICAS`), cobrindo dois dos sete datasets da plataforma que hoje só têm carga manual. Zero migration, zero UI nova, zero endpoint novo — as tabelas `ips_municipio` e `inss_anual` já existem e o `/admin/fontes` é registry-driven.

## Fonte `ips` (anual)

- **Upstream:** IPS Brasil (ipsbrasil.org.br) — dados municipais nacionais, edições 2024, 2025 e 2026. A URL exata de download (seção explore/dados) é **fixada na task de descoberta** do plano; se não houver link direto estável, usar o endpoint de export do site. Formato esperado: CSV nacional com "Código IBGE" (fallback XLSX é risco assumido — tratar na descoberta).
- **Parse:** reaproveitar `COLUMN_MAP` e helpers de `ingestao/carregar_ips.py` via import (mesmo root de pacotes do backend). Match de município por código IBGE.
- **Gravação:** upsert real por (município, ano) — atualiza registro existente (difere do script manual, que faz `on_conflict_do_nothing`), para que re-execução corrija dados.
- **Filtros:** `anos` = edições a carregar; default: todas as edições conhecidas. `municipio_ids`/`estado` filtram os alvos como nas demais fontes.

## Fonte `inss` (anual)

- **Upstream:** Portal de dados abertos do INSS (dadosabertos.inss.gov.br, CKAN — mesmo padrão de descoberta de resource da fonte `fpm`/STN). Dataset de benefícios por município com quantidade e valor; dataset/resource exatos fixados na task de descoberta. Se a granularidade for mensal, agregar para ano.
- **Agregação:** por (município, ano, categoria oficial da fonte) → `quantidade_beneficios` (soma), `valor_anual` (soma).
- **Gravação:** **replace por (município, ano)** — decisão do usuário: apagar as linhas do município nos anos cobertos pela execução e regravar com a taxonomia oficial. Categorias da carga manual legada só sobrevivem em anos que a fonte não cobre. (Padrão replace-por-competência já usado em comex e nas etapas do pe_de_meia.)
- **Match de município:** código IBGE quando o arquivo tiver; senão (nome normalizado via `norm_nome_municipio`, UF).

## Integração (ambas)

- `registrar(FonteAutomatica(key=..., label=..., fonte=..., executar=...))` no módulo da fonte, seguindo as 10 existentes.
- Adicionar `ips` e `inss` em `ORDEM_EXECUCAO_TODAS` (base.py) — o teste de paridade com o registry falha se esquecer.
- Runner cuida de job/progresso/audit/DatasetInfo como nas demais; nenhum código novo aí.
- Verificar (e corrigir se preciso) que `ips_municipio` e `inss_anual` estão em `DATASET_MODELS`/REGISTRY/LABELS do municipio_management.

## Testes e verificação

- Lógica pura em `backend/tests/test_ingestao_automatica.py` (convenção: nunca abre DB/rede): parse do CSV de cada fonte, agregação anual do INSS, montagem do replace-set, mapeamento de colunas do IPS.
- Suíte backend completa (`pytest tests` de `backend/`, exit code 0; rodar `backend/tests` e `tests/` separados).
- E2E: rodar cada fonte para 1 município pequeno via `/admin/fontes` contra a Railway; conferir páginas /app/ips e /app/inss com os dados carregados.

## Fora de escopo

- Arrecadação/VAF (subprojeto 2) e CAGED/RAIS/CNPJ (subprojeto 3, aguarda worker separado).
- Mudanças de UI, endpoints, migrations ou agendamento/cron.
