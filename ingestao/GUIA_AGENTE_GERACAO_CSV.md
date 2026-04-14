# Guia do Agente — Geração de CSVs para Ingestão
**Observatório Econômico Municipal — UAIZI NID**

Este documento descreve tudo que um agente precisa saber para revisar, corrigir ou regenerar os CSVs consumidos pelos scripts de ingestão. Cobre: estrutura esperada de cada CSV, transformações que o script aplica, tabelas de destino no banco, e armadilhas conhecidas.

---

## 1. Visão Geral do Pipeline

```
Fontes federais (gov.br, APIs, BCB, MTE, IBGE...)
        ↓
Scripts geradores de CSV (fora deste repositório — são esses que você revisa)
        ↓
dados/<Pasta>/<dataset>_<CIDADE>.csv
        ↓
ingestao/carregar_<dataset>.py
        ↓
PostgreSQL (Railway) — tabelas por dataset
        ↓
FastAPI backend → Dashboard frontend
```

Os scripts de ingestão **não editam** os CSVs. Eles lêem, transformam em memória e gravam no banco. Se o CSV estiver errado, o banco fica errado. **A qualidade do CSV é a única fonte de verdade.**

---

## 2. Municípios Ativos

Os seguintes municípios têm dados nas pastas atuais. O nome do arquivo deve seguir exatamente os padrões documentados por dataset — maiúsculas, underscores ou CamelCase conforme especificado em cada seção.

| Município | UF |
|-----------|-----|
| Carmo da Mata | MG |
| Cláudio | MG |
| Divinópolis | MG |
| Nova Lima | MG |
| Nova Serrana | MG |
| Oliveira | MG |
| Pará de Minas | MG |
| Santo Antônio do Monte | MG |
| São Sebastião do Oeste | MG |

> O script `deduplicar_municipios.py` resolve divergências de nomenclatura (underscore vs espaço), mas o ideal é manter consistência desde a geração do CSV para evitar registros duplicados no banco.

---

## 3. Arrecadação

### Arquivo
```
dados/Arrecadacao_Cidades_MG/arrecadacao_{CIDADE_MAIUSCULA_UNDERSCORE}.csv
```
**Exemplos:** `arrecadacao_NOVA_LIMA.csv`, `arrecadacao_SANTO_ANTONIO_DO_MONTE.csv`

### Colunas obrigatórias

| Coluna | Tipo | Formato | Observações |
|--------|------|---------|-------------|
| `ano_particao` | int | `2024` | Ano do registro |
| `MES_ESTIMADO` | int | `1`–`12` | Mês numérico |
| `NOME_MES` | string | `"Janeiro"` | Nome do mês em português |
| `vr_icms` | float | `1234567.89` | Pode ser vazio → tratado como 0 |
| `vr_ipva` | float | `1234567.89` | Pode ser vazio → tratado como 0 |
| `vr_ipi` | float | `1234567.89` | Pode ser vazio → tratado como 0 |
| `DATA_BASE` | date | `YYYY-MM-DD` | Ex: `2024-01-01` |

### Tabela de destino: `arrecadacao_mensal`
| Coluna DB | Origem CSV | Observação |
|-----------|-----------|------------|
| `municipio_id` | nome do arquivo | Auto-criado se não existir |
| `ano` | `ano_particao` | |
| `mes` | `MES_ESTIMADO` | |
| `nome_mes` | `NOME_MES` | |
| `data_base` | `DATA_BASE` | |
| `valor_icms` | `vr_icms` | null → 0 |
| `valor_ipva` | `vr_ipva` | null → 0 |
| `valor_ipi` | `vr_ipi` | null → 0 |
| `valor_total` | calculado | `icms + ipva + ipi` |

### Deduplicação
Chave única: `(municipio_id, ano, mes)` — registros duplicados são ignorados (skip).

### Armadilhas
- `vr_icms` e similares: valores ausentes devem ser string vazia ou NaN, não texto como `"N/A"`.
- `DATA_BASE` deve ser exatamente `YYYY-MM-DD`. Outros formatos causam erro de parse.

---

## 4. Bolsa Família

### Arquivo
```
dados/Bolsa_Familia_Cidades_Completo/Bolsa_Familia_{CIDADE_MAIUSCULA_UNDERSCORE}.csv
```
**Exemplos:** `Bolsa_Familia_NOVA_LIMA.csv`, `Bolsa_Familia_CLAUDIO.csv`

### Colunas obrigatórias

| Coluna | Tipo | Formato | Observações |
|--------|------|---------|-------------|
| `MÊS COMPETÊNCIA` | string | `YYYYMM` | Ex: `202401` |
| `VALOR PARCELA` | float | decimal com ponto | Valor da parcela de cada beneficiário |
| `Valor Bolsa` | float | decimal com ponto | Valor específico do Bolsa Família |
| `Primeira Infância` | float | decimal com ponto | Pode ser 0 ou vazio |

> O CSV contém **uma linha por beneficiário por mês**. O script agrega por `(ano, mes)`.

### Tabela de destino: `bolsa_familia_resumo`
| Coluna DB | Derivação |
|-----------|----------|
| `total_beneficiarios` | count de linhas por (ano, mes) |
| `valor_total` | sum(`VALOR PARCELA`) |
| `valor_bolsa` | sum(`Valor Bolsa`) |
| `valor_primeira_infancia` | sum(`Primeira Infância`) |
| `beneficiarios_primeira_infancia` | count onde `Primeira Infância > 0` |

### Deduplicação
Chave única: `(municipio_id, ano, mes)`.

### Armadilhas
- Arquivos podem ter centenas de milhares de linhas (até ~100k/mês por município). Script processa tudo em memória — não truncar colunas.
- `MÊS COMPETÊNCIA` deve ser exatamente 6 dígitos `YYYYMM`. Formatos com `/` ou `-` causam erro.
- Coluna `Primeira Infância` com acento: atenção ao encoding. O script usa `encoding="utf-8"` (ou latin-1 — confirmar no script).

---

## 5. CAGED

### Arquivo
```
dados/Pacote_Trabalho_Multicidades/CAGED/caged_movimentacao_2025_{Cidade_CamelCase}.csv
```
**Exemplos:** `caged_movimentacao_2025_Nova_Lima.csv`, `caged_movimentacao_2025_Divinopolis.csv`

> O prefixo `2025` refere-se ao arquivo atual. Ao gerar para outros anos, o padrão do nome deve ser mantido — o script busca pelo padrão de cidade, não pelo ano no nome.

### Colunas utilizadas pelo script

O CSV tem 25 colunas mas o script usa apenas:

| Coluna | Tipo | Valores esperados |
|--------|------|-------------------|
| `ano` | int | `2024`, `2025`... |
| `mes` | int | `1`–`12` |
| `saldo_movimentacao` | int | positivo = admissão, negativo = desligamento |
| `sexo` | string | `"1"` (Masculino), `"2"` (Feminino), `"3"`/`"9"` (Não informado) |
| `raca_cor` | string | `"1"` Branca, `"2"` Preta, `"3"` Parda, `"4"` Amarela, `"5"` Indígena, `"6"`/`"9"` Não informada |
| `cnae_2_secao` | string | Letra A–U (seção CNAE 2.0) |
| `salario_mensal` | float | Valor em reais; pode ser vazio/nulo |

As demais colunas (`sigla_uf`, `id_municipio`, `cbo_2002`, etc.) são ignoradas pelo script de ingestão.

### Tabelas de destino

| Tabela | Chave de dedup |
|--------|---------------|
| `caged_movimentacao` | `(municipio_id, ano, mes)` |
| `caged_por_sexo` | `(municipio_id, ano, mes, sexo)` |
| `caged_por_raca` | `(municipio_id, ano, mes, raca_cor)` |
| `caged_salario` | `(municipio_id, ano, mes)` |
| `caged_por_cnae` | `(municipio_id, ano, mes, secao)` |

### Mapeamentos de código → label (hardcoded no script)

**sexo:**
```
"1" → "Masculino"
"2" → "Feminino"
"3" / "9" / outros → "Não informado"
```

**raca_cor:**
```
"1" → "Branca"
"2" → "Preta"
"3" → "Parda"
"4" → "Amarela"
"5" → "Indígena"
"6" / "9" / outros → "Não informada"
```

**cnae_2_secao** (seção → descrição):
```
A → Agropecuária
B → Indústrias Extrativas
C → Indústria de Transformação
D → Eletricidade e Gás
E → Água e Saneamento
F → Construção
G → Comércio e Reparação
H → Transporte e Armazenagem
I → Alojamento e Alimentação
J → Informação e Comunicação
K → Financeiro e Seguros
L → Atividades Imobiliárias
M → Atividades Profissionais
N → Atividades Administrativas
O → Administração Pública
P → Educação
Q → Saúde e Serviços Sociais
R → Artes e Recreação
S → Outras Atividades de Serviços
T → Serviços Domésticos
U → Organismos Internacionais
```

### Armadilhas
- `saldo_movimentacao` pode ser negativo — o script determina admissão (`> 0`) ou desligamento (`< 0`) pelo sinal.
- `salario_mensal` vazio ou `{ñ class}` deve ser tratado como null/NaN (o script converte para 0).
- `cnae_2_secao` deve ser letra única maiúscula. Valores numéricos ou de subclasse não são mapeados.

---

## 6. RAIS

### Arquivo
```
dados/Pacote_Trabalho_Multicidades/RAIS/rais_vinculos_2021_2024_{Cidade_CamelCase}.csv
```
**Exemplos:** `rais_vinculos_2021_2024_Nova_Lima.csv`

### Colunas utilizadas pelo script

O CSV tem 80+ colunas. As utilizadas:

| Coluna | Tipo | Observações |
|--------|------|-------------|
| `ano` | int | Ano do vínculo |
| `valor_remuneracao_media` | float | Remuneração média mensal em R$ |
| `sexo` | string | `"1"` Masculino, `"2"` Feminino, `"9"` Não identificado |
| `raca_cor` | string | `"1"` Indígena, `"2"` Branca, `"4"` Preta, `"6"` Amarela, `"8"` Parda, `"9"` Não identificada |
| `cnae_2_subclasse` | string | Código CNAE 5 dígitos (ex: `47211`) — script extrai seção dos 2 primeiros dígitos via tabela |
| `faixa_etaria` | string | `"1"`–`"7"` e `"9"` (ver mapeamento abaixo) |
| `grau_instrucao_apos_2005` | string | `"1"`–`"11"` (ver mapeamento abaixo) |
| `faixa_remuneracao_media_sm` | string | `"1"`–`"12"` e `"99"` (ver mapeamento abaixo) |
| `faixa_tempo_emprego` | string | `"1"`–`"9"` (ver mapeamento abaixo) |
| `indicador_portador_deficiencia` | string | `"1"` = PCD |
| `id_municipio_trabalho` | string | IBGE do município de trabalho |
| `quantidade_dias_afastamento` | float | Dias de afastamento no ano |

### Tabelas de destino

| Tabela | Chave de dedup |
|--------|---------------|
| `rais_vinculos` | `(municipio_id, ano)` |
| `rais_por_sexo` | `(municipio_id, ano, sexo)` |
| `rais_por_raca` | `(municipio_id, ano, raca_cor)` |
| `rais_por_cnae` | `(municipio_id, ano, secao)` |
| `rais_por_faixa_etaria` | `(municipio_id, ano, faixa_etaria)` |
| `rais_por_escolaridade` | `(municipio_id, ano, grau_instrucao)` |
| `rais_por_faixa_remuneracao` | `(municipio_id, ano, faixa_remuneracao_sm)` |
| `rais_por_faixa_tempo_emprego` | `(municipio_id, ano, faixa_tempo_emprego)` |
| `rais_metricas_anuais` | `(municipio_id, ano)` |

### Mapeamentos de código → label

**faixa_etaria:**
```
"1" → "10 a 14 anos"
"2" → "15 a 17 anos"
"3" → "18 a 24 anos"
"4" → "25 a 29 anos"
"5" → "30 a 39 anos"
"6" → "40 a 49 anos"
"7" → "50 anos ou mais"
"9" → "Não identificado"
```

**grau_instrucao_apos_2005:**
```
"1"  → "Analfabeto"
"2"  → "Até 5ª incompleto"
"3"  → "5ª completo fundamental"
"4"  → "6ª a 9ª fundamental"
"5"  → "Fund. completo"
"6"  → "Médio incompleto"
"7"  → "Médio completo"
"8"  → "Superior incompleto"
"9"  → "Superior completo"
"10" → "Mestrado"
"11" → "Doutorado"
```

**faixa_remuneracao_media_sm:**
```
"1"  → "Até 0,5 SM"
"2"  → "0,5 a 1 SM"
"3"  → "1 a 1,5 SM"
"4"  → "1,5 a 2 SM"
"5"  → "2 a 3 SM"
"6"  → "3 a 4 SM"
"7"  → "4 a 5 SM"
"8"  → "5 a 7 SM"
"9"  → "7 a 10 SM"
"10" → "10 a 15 SM"
"11" → "15 a 20 SM"
"12" → "Mais de 20 SM"
"99" → "Não identificado"
```

**faixa_tempo_emprego:**
```
"1" → "Até 2,9 meses"
"2" → "3 a 5,9 meses"
"3" → "6 a 11,9 meses"
"4" → "12 a 23,9 meses"
"5" → "24 a 35,9 meses"
"6" → "36 a 59,9 meses"
"7" → "60 a 119,9 meses"
"8" → "120 meses ou mais"
"9" → "Não identificado"
```

**cnae_2_subclasse → seção** (derivado pelos 2 primeiros dígitos do código):
O script usa uma tabela `CNAE_DIVISAO_SECAO` que mapeia divisões (01–99) para as seções A–U. Exemplo: divisões `01–03` → `A`, `05–09` → `B`, `10–33` → `C`, etc.

### Armadilhas
- Arquivo muito grande (pode ter 100k+ linhas por município). Certifique-se de que todos os anos de 2021 a 2024 estão presentes.
- `cnae_2_subclasse` deve ser string de 5 dígitos com zeros à esquerda (ex: `01111`, não `1111`).
- `valor_remuneracao_media` pode ter valores como `{ñ class}` — tratar como null/0.

---

## 7. PIB

### Arquivo
```
dados/PIB_Cidades_Completo/pib_{Cidade_CamelCase}.csv
```
**Exemplos:** `pib_Nova_Lima.csv`, `pib_Santo_Antonio_do_Monte.csv`

### Colunas obrigatórias

| Coluna | Tipo | Formato | Observações |
|--------|------|---------|-------------|
| `Ano` | int | `2020` | Ano de referência |
| `Cidade` | string | Nome do município | Normalizado internamente |
| `Codigo_IBGE` | string | `"3136702"` | Ignorado pelo script (não gravado no banco) |
| `Tipo_Dado` | string | `"REAL"` ou `"PROJETADO"` | Gravado como `tipo_dado` |
| `PIB_Total` | float | em R$ mil | |
| `VA_Agropecuaria` | float | em R$ mil | Pode ser vazio → null |
| `VA_Governo` | float | em R$ mil | Pode ser vazio → null |
| `VA_Industria` | float | em R$ mil | Pode ser vazio → null |
| `VA_Servicos` | float | em R$ mil | Pode ser vazio → null |

### Tabela de destino: `pib_anual`
Chave de dedup: `(municipio_id, ano)`.

### Armadilhas
- Dados de anos `PROJETADO` podem existir ao lado de `REAL` para o mesmo ano — ambos são inseridos.
- `PIB_Total` nunca deve ser null.

---

## 8. Comércio Exterior (Comex)

### Arquivo
```
dados/Comex_Cidades_Completo/comex_{Cidade_CamelCase_Com_Underscores}.csv
```
**Exemplos:** `comex_Nova_Lima.csv`, `comex_Santo_Antonio_Do_Monte.csv`

### Colunas obrigatórias

| Coluna | Tipo | Formato | Observações |
|--------|------|---------|-------------|
| `Nome_Cidade_API` | string | Nome do município (pode ter `" - MG"` no final) | Script remove o sufixo ` - XX` via regex |
| `Data_Ref` | string | `DD/MM/YYYY` | Ex: `01/01/2024` |
| `Tipo_Operacao` | string | `"export"` ou `"import"` | **Minúsculas** — importante |
| `Codigo_SH4` | string | `"0901"` | Código HS4 do produto |
| `Pais_Parceiro` | string | Nome do país em português | |
| `Valor_USD` | float | Valor em dólares | |
| `Peso_KG` | float | Peso em kg | |

### Tabelas de destino

| Tabela | Granularidade | Chave de dedup |
|--------|--------------|---------------|
| `comex_mensal` | Por mês e tipo_operacao | `(municipio_id, ano, mes, tipo_operacao)` |
| `comex_por_produto` | Por ano, produto e tipo | `(municipio_id, ano, tipo_operacao, produto)` |
| `comex_por_pais` | Por ano, país e tipo | `(municipio_id, ano, tipo_operacao, pais)` |

### Armadilhas
- `Tipo_Operacao` **deve ser lowercase** (`"export"`, `"import"`). O frontend e o backend fazem comparação case-insensitive, mas o script grava exatamente como recebe.
- `Data_Ref` deve ser `DD/MM/YYYY` — o script faz split por `/` e pega posições 1 e 2.
- Município sem movimentação comercial pode simplesmente não ter arquivo — sem problema.

---

## 9. Estban (Bancos)

### Arquivo
```
dados/Estban_Cidades_Completo/estban_{CIDADE_MAIUSCULA_UNDERSCORE}.csv
```
**Exemplos:** `estban_NOVA_LIMA.csv`, `estban_CLAUDIO.csv`

### Colunas obrigatórias

| Coluna | Tipo | Observações |
|--------|------|-------------|
| `MUNICIPIO` | string | Nome do município |
| `NOME_INSTITUICAO` | string | Nome do banco/instituição |
| `QTD_AGENCIAS` | int | |
| `VALOR_OPERACOES_CREDITO` **ou** `TOTAL_OPERACOES_CREDITO` | float | Script aceita ambos os nomes |
| `VALOR_DEPOSITOS_VISTA` | float | |
| `VALOR_POUPANCA` | float | |
| `VALOR_DEPOSITOS_PRAZO` | float | |
| `EMPRESTIMOS_E_TITULOS_DESCONTADOS` | float | Pode ser vazio → null |
| `FINANCIAMENTOS_GERAIS` | float | Pode ser vazio → null |
| `FINANCIAMENTO_AGROPECUARIO` | float | Pode ser vazio → null |
| `FINANCIAMENTOS_IMOBILIARIOS` | float | Pode ser vazio → null |
| `ARRENDAMENTO_MERCANTIL` | float | Pode ser vazio → null |
| `EMPRESTIMOS_SETOR_PUBLICO` | float | Pode ser vazio → null |
| `OUTROS_CREDITOS` | float | Pode ser vazio → null |
| `DATA_REFERENCIA` | string | `YYYY-MM-DD` |

### Tabelas de destino

| Tabela | Chave de dedup |
|--------|---------------|
| `estban_mensal` | `(municipio_id, data_referencia)` |
| `estban_por_instituicao` | `(municipio_id, data_referencia, nome_instituicao)` |

### Armadilhas
- O script aceita tanto `VALOR_OPERACOES_CREDITO` quanto `TOTAL_OPERACOES_CREDITO` — não mudar os dois de uma vez.
- `DATA_REFERENCIA` representa o mês de referência do Estban (geralmente último dia do mês).

---

## 10. INSS

### Arquivo
```
dados/INSS_Cidades_Completo/inss_{CIDADE_MAIUSCULA_UNDERSCORE}.csv
```
**Exemplos:** `inss_NOVA_LIMA.csv`, `inss_PARA_DE_MINAS.csv`

### Colunas obrigatórias

| Coluna | Tipo | Formato | Observações |
|--------|------|---------|-------------|
| `Cidade` | string | Nome do município | Normalizado internamente |
| `Ano` | int ou float | `2023` ou `2023.0` | Script converte com `int(float(...))` |
| `Categoria` | string | Ex: `"Aposentadoria por Idade"` | Texto livre |
| `Quantidade_Beneficios` | int ou float | Pode vir como `1234.0` | Convertido com `int(float(...))` |
| `Valor_Anual_Injetado` | float | em R$ | |

### Tabela de destino: `inss_anual`
Chave de dedup: `(municipio_id, ano, categoria)`.

### Armadilhas
- `Ano` pode vir como float (`2023.0`) em alguns exportadores — o script trata isso.
- `Categoria` é texto livre — manter consistência entre anos para que as comparações façam sentido.

---

## 11. Pé-de-Meia

### Arquivo
```
dados/Pe_De_Meia_Cidades_Completo/Pe_Meia_{CIDADE_MAIUSCULA_UNDERSCORE}.csv
```
**Exemplos:** `Pe_Meia_NOVA_LIMA.csv`, `Pe_Meia_DIVINOPOLIS.csv`

### Colunas obrigatórias

| Coluna | Tipo | Formato | Observações |
|--------|------|---------|-------------|
| `MÊS REFERÊNCIA` | string | `YYYYMM` | Ex: `202401` |
| `ETAPA ENSINO` | string | Ex: `"Ensino Médio"` | Texto do MEC |
| `TIPO INCENTIVO` | string | Ex: `"Frequência"` | Texto do MEC |
| `VALOR PARCELA` | float | em R$ | Por beneficiário |

> **Uma linha por beneficiário por mês.** O script conta linhas para `total_estudantes` e soma `VALOR PARCELA`.

### Tabelas de destino

| Tabela | Granularidade | Chave de dedup |
|--------|--------------|---------------|
| `pe_de_meia_resumo` | Mensal total | `(municipio_id, ano, mes)` |
| `pe_de_meia_etapa` | Mensal por etapa + tipo | `(municipio_id, ano, mes, etapa_ensino, tipo_incentivo)` |

### Armadilhas
- Colunas com acentos (`MÊS REFERÊNCIA`) — atenção ao encoding do CSV (deve ser UTF-8).
- Colunas extras como `MÊS FOLHA`, `NIS BENEFICIÁRIO`, `CPF` etc. são ignoradas pelo script.

---

## 12. PIX

### Arquivo
```
dados/pix_nova_lima.csv
```
> **Atenção:** Atualmente o script tem o caminho hardcoded para Nova Lima. Para adicionar outros municípios, o script `carregar_pix.py` precisa ser adaptado.

### Colunas obrigatórias

| Coluna | Tipo | Formato | Observações |
|--------|------|---------|-------------|
| `AnoMes` | string | `YYYYMM` | Ex: `202401` — deve ter exatamente 6 chars |
| `Nome_Cidade` | string | lowercase | Script faz lookup por nome em minúsculas |
| `VL_PagadorPF` | float | decimal com **vírgula** | Script convierte `,` → `.` |
| `QT_PagadorPF` | int | | |
| `QT_PES_PagadorPF` | int | Pessoas físicas pagadoras únicas | |
| `VL_PagadorPJ` | float | decimal com vírgula | |
| `QT_PagadorPJ` | int | | |
| `QT_PES_PagadorPJ` | int | | |
| `VL_RecebedorPF` | float | decimal com vírgula | |
| `QT_RecebedorPF` | int | | |
| `VL_RecebedorPJ` | float | decimal com vírgula | |
| `QT_RecebedorPJ` | int | | |
| `QT_PES_RecebedorPJ` | int | | |

### Tabela de destino: `pix_mensal`
Chave de dedup: `(municipio_id, ano, mes)`.

### Armadilhas
- Separador decimal é **vírgula** (`,`), não ponto. O script tem parser customizado — não converta para ponto antes de gerar o CSV.
- `AnoMes` deve ter exatamente 6 caracteres. Valores com 4 dígitos ou com separador causam erro.
- `Nome_Cidade` deve estar em minúsculas no CSV para o lookup funcionar (ex: `"nova lima"`, não `"Nova Lima"`).

---

## 13. CNPJ / Empresas

O CNPJ tem **dois estágios**:

### Estágio 1 — Arquivos brutos (entrada do `preparar_cnpj.py`)

#### `dados/estabelecimentos_7_CIDADES.csv`
| Coluna | Tipo | Observações |
|--------|------|-------------|
| `cnpj_basico` | string (8 dígitos) | Chave primária |
| `cnpj_ordem` | string | |
| `cnpj_dv` | string | |
| `nome_fantasia` | string | Pode ser vazio |
| `situacao` | string (2 chars) | Ex: `"02"` = Ativa |
| `data_situacao` | string | `YYYYMMDD` |
| `data_inicio` | string | `YYYYMMDD` |
| `cnae_fiscal` | string (7 chars) | Ex: `"4711302"` |
| `bairro` | string | |
| `municipio` | string | Código IBGE do município |
| `Nome_Cidade` | string | Nome por extenso |

#### `dados/empresas_capital_7_CIDADES.csv`
| Coluna | Tipo | Observações |
|--------|------|-------------|
| `cnpj_basico` | string | Chave de join |
| `razao_social` | string | |
| `capital_social` | string | Formato `"1.234,56"` (ponto milhar, vírgula decimal) |
| `porte` | string (2 chars) | `"01"` ME, `"03"` EPP, `"05"` Demais |

#### `dados/simples_mei_7_CIDADES.csv`
| Coluna | Tipo | Observações |
|--------|------|-------------|
| `cnpj_basico` | string | Chave de join |
| `opcao_simples` | string | `"S"`, `"SIM"`, `"1"`, `"TRUE"` → `True`; qualquer outro → `False` |
| `opcao_mei` | string | Mesmo padrão |

### Estágio 2 — Arquivo por cidade (saída do `preparar_cnpj.py`, entrada do `carregar_cnpj.py`)

```
dados/Pacote_CNPJ_Completo_Corrigido/CNPJ_Completo_{Cidade_CamelCase}.csv
```

| Coluna | Tipo | Observações |
|--------|------|-------------|
| `cnpj_basico` | string | |
| `cnpj_ordem` | string | |
| `cnpj_dv` | string | |
| `nome_fantasia` | string | |
| `situacao` | string | |
| `data_situacao` | string | |
| `data_inicio` | string | `YYYYMMDD` |
| `cnae_fiscal` | string | |
| `bairro` | string | |
| `municipio` | string | |
| `Nome_Cidade` | string | Usado para lookup de `municipio_id` |
| `razao_social` | string | |
| `capital_social` | string | `"1.234,56"` — script normaliza internamente |
| `porte` | string | |
| `opcao_simples` | string | S/N/SIM/1/TRUE |
| `opcao_mei` | string | S/N/SIM/1/TRUE |

### Tabela de destino: `empresas`
Dedup: `cnpj_basico` por município — duplicatas ignoradas.
Processamento em batches de 500 linhas.

### Armadilhas
- `capital_social` usa ponto como separador de milhar e vírgula como decimal: `"1.234.567,89"`. O script remove os pontos e substitui a vírgula por ponto.
- `data_inicio` no formato `YYYYMMDD` — valores `"00000000"` ou vazios → `None`.
- `opcao_simples` / `opcao_mei` aceitam vários formatos verdadeiros (`S`, `SIM`, `1`, `TRUE`).

---

## 14. Regras Gerais de Qualidade dos CSVs

| Regra | Detalhe |
|-------|---------|
| **Encoding** | UTF-8 para arquivos com acentos. Se isso não for possível, Latin-1 — mas manter consistência. |
| **Separador** | Vírgula (`,`) como padrão. Estban e Arrecadação usam vírgula. PIX usa vírgula mas com decimal em vírgula — veja seção PIX. |
| **Cabeçalho** | Primeira linha deve ser o header. Sem linhas em branco antes do header. |
| **Valores nulos** | Célula vazia ou NaN é preferível a strings como `"N/A"`, `"-"`, `"null"` que causam erros de parse float. |
| **Datas** | `YYYY-MM-DD` para DATE; `YYYYMM` para mês competência; `YYYYMMDD` para datas compactas. Sem exceção. |
| **Nome de arquivo** | Seguir exatamente o padrão documentado por dataset (MAIUSCULA_UNDERSCORE vs CamelCase vs minúscula). |
| **Município** | Usar o mesmo nome nas fontes e nos arquivos que o banco já conhece. Inconsistências criam duplicatas no banco (`deduplicar_municipios.py` resolve, mas gera retrabalho). |
| **Linhas duplicadas** | Os scripts verificam deduplicação no banco, mas CSVs com linhas duplicadas para a mesma chave desperdiçam tempo de processamento. |

---

## 15. Nomes de Arquivo por Padrão de Caso

| Dataset | Padrão do nome | Exemplo |
|---------|---------------|---------|
| Arrecadação | `MAIUSCULA_UNDERSCORE` | `arrecadacao_NOVA_LIMA.csv` |
| Bolsa Família | `MAIUSCULA_UNDERSCORE` | `Bolsa_Familia_NOVA_LIMA.csv` |
| CAGED | `CamelCase` | `caged_movimentacao_2025_Nova_Lima.csv` |
| RAIS | `CamelCase` | `rais_vinculos_2021_2024_Nova_Lima.csv` |
| PIB | `CamelCase` | `pib_Nova_Lima.csv` |
| Comex | `CamelCase` | `comex_Nova_Lima.csv` |
| Estban | `MAIUSCULA_UNDERSCORE` | `estban_NOVA_LIMA.csv` |
| INSS | `MAIUSCULA_UNDERSCORE` | `inss_NOVA_LIMA.csv` |
| Pé-de-Meia | `MAIUSCULA_UNDERSCORE` | `Pe_Meia_NOVA_LIMA.csv` |
| PIX | hardcoded | `pix_nova_lima.csv` |
| CNPJ (per-city) | `CamelCase` | `CNPJ_Completo_Nova_Lima.csv` |

---

## 16. Checklist de Revisão para o Agente

Ao revisar um script gerador de CSV, verifique:

- [ ] O arquivo é gerado no caminho exato esperado pelo script de ingestão?
- [ ] Os nomes das colunas batem exatamente (maiúsculas, acentos, espaços)?
- [ ] O formato de data está correto para este dataset específico?
- [ ] Valores monetários usam ponto decimal (exceto PIX que usa vírgula)?
- [ ] Valores ausentes são células vazias, não strings como "N/D" ou "-"?
- [ ] O encoding está correto para colunas com acento?
- [ ] O nome do arquivo segue o padrão de caso (MAIUSCULA vs CamelCase) do dataset?
- [ ] O nome do município no arquivo/coluna corresponde ao nome já registrado no banco?
- [ ] Para CAGED/RAIS: os códigos categóricos (sexo, raça, CNAE) estão nos formatos string numérico esperados?
- [ ] Para PIB: `Tipo_Dado` é exatamente `"REAL"` ou `"PROJETADO"`?
- [ ] Para Comex: `Tipo_Operacao` é exatamente `"export"` ou `"import"` em minúsculas?
- [ ] Para PIX: `AnoMes` tem exatamente 6 dígitos? `Nome_Cidade` está em minúsculas?
- [ ] Para CNPJ: `capital_social` usa ponto como milhar e vírgula como decimal?
