# Fonte automática INSS (EMPS) — Design

**Data:** 2026-07-27 (revisado após descoberta de upstreams no mesmo dia)
**Status:** aprovado pelo usuário (subprojeto 1 de 3; ficam na fila: Arrecadação/VAF estaduais e CAGED/RAIS/CNPJ — este último aguarda decisão de worker separado)

## Objetivo

Adicionar a fonte automática `inss` ao pipeline de ingestão em background (`FONTES_AUTOMATICAS`). Zero migration, zero UI nova, zero endpoint novo — a tabela `inss_anual` já existe, está registrada no municipio_management (linhas 129/162) e o `/admin/fontes` é registry-driven.

## IPS: ADIADO (decisão do usuário, 2026-07-27)

A descoberta invalidou a premissa de URL estável: ipsbrasil.org.br é uma SPA; o endpoint interno `POST /api/location` rejeita payloads desconhecidos (400) mesmo com csrf-token válido; não há link direto para o XLSX nacional (`ips_brasil_municipios_{ano}.xlsx` só sai clicando na UI); candidatos óbvios de URL retornam 404. Opções descartadas: engenharia reversa da SPA (frágil, quebra sem aviso) e fonte semi-automática com upload (escopo grande para ganho pequeno — IPS é anual). **IPS permanece com carga manual anual** (`ingestao/carregar_ips.py`) e volta à fila se o IPS Brasil publicar link direto estável.

## Fonte `inss` (anual)

- **Upstream (descoberto e validado):** EMPS — Estatísticas Municipais da Previdência Social (MPS/Dataprev-SÍNTESE), XLSX nacional anual em URL estável:
  `https://www.gov.br/previdencia/pt-br/assuntos/previdencia-social/arquivos/ben_municipios_especie_{ano}.xlsx` (~3 MB; anos 2019–2024 no padrão; 2017/2018 têm paths antigos fora do padrão e ficam fora da série). Publicação: primeiro bimestre do ano seguinte ao de referência.
- **Layout (validado em 2026-07-27 no arquivo de 2024):** abas `Qtd_dez{ano}` (estoque de benefícios em dezembro) e `Valor_Total_{ano}` (valor emitido no ano), mesmas colunas A–M: Nome, Código IBGE (7 dígitos), UF, e grupos de benefício com header em 3 linhas mescladas (L5–L7), dados a partir da L8. Resolução de aba por prefixo (`Qtd`/`Valor_Total`) pois o sufixo varia (`dez2024` vs `dez24`).
- **Categorias gravadas (folhas mutuamente exclusivas — somam o Total, validado):** Aposentadorias por idade, Aposentadorias por invalidez, Aposentadorias por tempo de contribuição, Pensões por morte, Auxílios, Outros benefícios previdenciários, Benefícios assistenciais (colunas E,F,G,H,I,J,L). Subtotais (D, K) e Total (M) NÃO são gravados — evita dupla contagem em somas da página.
- **Semântica:** `quantidade_beneficios` = estoque em dezembro (aba Qtd); `valor_anual` = valor emitido no ano (aba Valor_Total) — mesma semântica da carga manual legada (EMPS era a origem dela).
- **Anos default:** os dois últimos anos-calendário encerrados (hoje: 2025 e 2024); ano ainda não publicado vira aviso legível ("ainda não publicado pela Previdência"), reaproveitando `eh_nao_publicado` (403/404). Filtro `anos` do job restringe.
- **Gravação:** **replace por (município, ano)** — decisão do usuário: apagar as linhas do município nos anos cobertos pela execução e regravar com a taxonomia oficial. Categorias da carga manual legada só sobrevivem em anos que a fonte não cobre. (Padrão replace-por-competência já usado em comex e nas etapas do pe_de_meia.)
- **Match de município:** código IBGE (municípios sem `codigo_ibge` cadastrado viram aviso, como na fonte populacao).
- **Dependência nova:** `openpyxl` (leitura de XLSX; puro-python, já validado no venv com o arquivo real).

## Integração

- `registrar(FonteAutomatica(key="inss", ...))` no módulo novo `inss_emps.py` + import em `ingestao_automatica/__init__.py` (é o import que auto-registra).
- Adicionar `"inss"` em `ORDEM_EXECUCAO_TODAS` (base.py) ANTES de `captacao_federal`/`emendas` — o teste de paridade exige essas duas no fim e o conjunto igual ao registry.
- Runner cuida de job/progresso/audit/DatasetInfo como nas demais; nenhum código novo aí. `inss_anual` já está em DATASET_MODELS/LABELS (verificado).

## Testes e verificação

- Lógica pura em `backend/tests/test_ingestao_automatica.py` (convenção: nunca abre DB/rede): parse de aba do EMPS (filtro de linhas por código IBGE 7 dígitos), montagem do replace-set casando Qtd × Valor, resolução de aba por prefixo.
- Suíte backend completa (`pytest tests` de `backend/`, exit code 0).
- E2E: executar a fonte real para 1 município (service-level, contra a Railway) e conferir /app/inss com os dados carregados; conferência visual do usuário.

## Fora de escopo

- IPS (adiado — ver seção acima), Arrecadação/VAF (subprojeto 2) e CAGED/RAIS/CNPJ (subprojeto 3, aguarda worker separado).
- Mudanças de UI, endpoints, migrations ou agendamento/cron.
