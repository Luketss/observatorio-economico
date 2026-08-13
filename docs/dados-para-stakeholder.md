# Origem dos Dados — VAF, FPM, Dinheiro na Mesa e Emendas

Documento de referência para stakeholders: de onde vêm os dados exibidos no
Observatório Econômico, o que cada coluna significa, e com que frequência cada
conjunto é atualizado.

> **Como a atualização funciona na plataforma:** nenhuma fonte roda em
> agendamento automático hoje. As fontes automáticas (FPM, Dinheiro na Mesa,
> Emendas) são disparadas por um administrador na tela **Admin → Fontes de
> Dados**, que baixa os arquivos oficiais diretamente do órgão de origem e
> processa em segundo plano. O VAF é o único dos quatro com carga manual
> (planilha CSV fornecida à equipe). A "frequência" de cada seção abaixo
> descreve o ritmo de publicação do órgão — a plataforma reflete a última
> execução feita pelo administrador.

---

## 1. VAF — Valor Adicionado Fiscal (e IPM)

**O que é:** o VAF mede o valor que a atividade econômica do município
adicionou às operações de circulação de mercadorias e serviços (apuração da
Secretaria de Estado da Fazenda). Ele é o principal componente do **IPM —
Índice de Participação dos Municípios**, que define a fatia da cota-parte do
ICMS que o município recebe do estado. Na prática: VAF maior hoje significa
mais repasse de ICMS depois.

**Origem:** Secretaria de Estado da Fazenda de Minas Gerais (SEF-MG),
apuração anual publicada por município. Não existe download automatizado
estável — os dados entram na plataforma por planilha (CSV) preparada a partir
da publicação oficial.

**Frequência:** anual. A apuração de um **ano-base** vale para o repasse de um
**ano de aplicação** posterior (tipicamente dois anos à frente, conforme o
calendário da SEF). Atualização na plataforma: sob demanda, quando a SEF
publica a nova apuração e a planilha é carregada.

**Colunas (tabela `vaf_anual`, uma linha por município × ano-base):**

| Coluna | Significado |
|---|---|
| `ano_base` | Ano da apuração do VAF (ano da atividade econômica medida) |
| `ano_aplicacao` | Ano em que essa apuração passa a valer no repasse do ICMS |
| `vaf_individual` | VAF do município, em R$ |
| `pct_vaf_individual` | Variação % do VAF do município vs ano-base anterior |
| `vaf_estado` | VAF total do estado, em R$ (denominador do índice) |
| `pct_vaf_estado` | Variação % do VAF estadual vs ano-base anterior |
| `indice` | Índice VAF do município (participação no VAF estadual) |
| `pct_indice` | Variação % do índice vs ano-base anterior |
| `indice_medio` | Média móvel do índice (usada na fórmula do IPM) |
| `pct_indice_medio` | Variação % da média móvel |
| `indice_participacao_municipal` | **IPM** — índice final de participação na cota-parte do ICMS |
| `pct_ipm` | Variação % do IPM vs ano-base anterior (é a "Variação do IPM" da tela) |

**Ressalvas:** em alguns anos a publicação da SEF traz apenas os índices e
percentuais, com os valores monetários zerados/ausentes — nesses casos as
colunas de R$ ficam vazias e a análise usa os índices, que são o que de fato
define o repasse. A página de VAF também projeta o ICMS a partir do IPM — é
uma **projeção**, não valor oficial de repasse.

---

## 2. FPM — Fundo de Participação dos Municípios

**O que é:** repasse constitucional da União aos municípios, distribuído por
**coeficiente populacional por faixas** (Decreto-Lei 1.881/81 — 18 faixas).
É tipicamente a receita mais relevante de municípios pequenos e médios.

**Origem:** Secretaria do Tesouro Nacional (STN), portal **Tesouro
Transparente**, conjunto "Transferências Obrigatórias da União — por
Município" (arquivo CSV nacional único). A plataforma baixa o arquivo oficial
direto da STN. A população usada no cálculo das faixas vem das **estimativas
anuais do IBGE** (API oficial, agregado 6579).

**Frequência:** a STN publica os repasses **mensalmente** (decêndios
consolidados no mês). Atualização na plataforma: sob demanda na tela de
coletas; a carga padrão cobre os últimos 3 anos.

**Colunas (tabela `fpm_mensal`, uma linha por município × ano × mês):**

| Coluna | Significado |
|---|---|
| `ano` / `mes` | Competência do repasse |
| `valor` | Repasse **bruto** do FPM no mês, em R$ |

**Ressalvas importantes:**
- O valor é **bruto** — antes das retenções (FUNDEB, PASEP etc.). O valor que
  entra em caixa é menor; a comparação entre municípios e a leitura de
  tendência continuam válidas porque a regra de retenção é uniforme.
- O casamento município↔linha do arquivo da STN é feito por **nome + UF** (o
  arquivo usa código TCU, não IBGE).
- O **coeficiente exibido é estimado** a partir da população IBGE. O
  coeficiente oficial é fixado pelo TCU e pode divergir (existem travas
  legais de transição); quando há risco de divergência, a tela sinaliza. O
  alerta de faixa ("faltam X habitantes para subir de faixa", "valor por
  ponto de coeficiente") é uma estimativa gerencial, não ato oficial.

---

## 3. Dinheiro na Mesa — Captação Federal (Transferegov/SICONV)

**O que é:** quanto a prefeitura captou em transferências voluntárias da
União (convênios e instrumentos congêneres), comparado com municípios
"pares" (mesma UF e mesma faixa de FPM). A diferença para a média dos pares é
o "dinheiro na mesa": recurso que municípios comparáveis estão trazendo e o
seu não.

**Origem:** dados abertos do **Transferegov (antigo SICONV)**, repositório
oficial do Governo Federal (`repositorio.dados.gov.br/seges/detru`), 4
arquivos nacionais (propostas, convênios, emendas, desembolsos — ~230 MB no
total). Filtro aplicado: apenas convênios em que o recebedor é
**"Administração Pública Municipal"** (a prefeitura em si — ONGs, estado e
consórcios ficam de fora).

**Frequência:** o repositório oficial é atualizado **diariamente**.
Atualização na plataforma: sob demanda; a carga padrão cobre de 2019 ao ano
corrente e roda por UF inteira (necessário para o comparativo de pares).

**Colunas (tabela `captacao_federal_anual`, uma linha por município × ano):**

| Coluna | Significado |
|---|---|
| `ano` | Ano de referência |
| `valor_firmado` | Soma do repasse federal dos convênios **assinados** no ano (parcela da União, sem contrapartida local) |
| `valor_via_emenda` | Parte do firmado que teve origem em emenda parlamentar |
| `valor_desembolsado` | Dinheiro que efetivamente **entrou** no ano (inclusive de convênios de anos anteriores) |
| `qtd_convenios` | Quantidade de convênios assinados no ano |

**Ressalvas:** firmado ≠ recebido — um convênio assinado libera recursos ao
longo de anos (por isso as duas colunas). Município sem linha em um ano =
captação zero naquele ano (isso é informação, não ausência de dado). O ano
corrente é sempre **parcial**.

---

## 4. Emendas Parlamentares

**O que é:** emendas de deputados e senadores com recursos destinados ao
município — quem destinou, para qual área, e quanto de fato foi pago.

**Origem:** **Portal da Transparência** do Governo Federal
(download-de-dados/emendas-parlamentares, arquivo nacional único). Inclui as
**emendas Pix** (transferências especiais) desde a publicação de mai/2026. O
casamento com o município é por **código IBGE** (sem aproximação por nome).

**Frequência:** o Portal atualiza continuamente conforme a execução
orçamentária avança. Atualização na plataforma: sob demanda; carga padrão de
2019 ao ano corrente. Novas emendas do ano corrente geram notificação no app.

**Colunas (tabela `emenda_parlamentar`, uma linha por município × emenda):**

| Coluna | Significado |
|---|---|
| `ano` | Ano da emenda |
| `codigo_emenda` / `numero_emenda` | Identificação oficial da emenda |
| `autor` | Parlamentar autor |
| `tipo_emenda` | Tipo (individual, bancada, transferência especial/Pix etc.) |
| `funcao` | Área orçamentária **dominante** da emenda (a de maior empenho, quando a emenda toca mais de uma) |
| `valor_empenhado` | Valor reservado no orçamento para o município |
| `valor_liquidado` | Valor com entrega/etapa atestada |
| `valor_pago` | Valor pago dentro do exercício |
| `valor_resto_pago` | Restos a pagar de exercícios anteriores pagos |

**Como ler os estágios:** empenhado → liquidado → pago é o funil da execução.
O **pago total** exibido nas telas é `valor_pago + valor_resto_pago` (o
dinheiro que de fato chegou, somando o pago no ano e os restos quitados).

**Ressalvas:** o Portal registra parte das emendas com localidade "Nacional"
ou apenas a UF — essas não podem ser atribuídas a um município e ficam de
fora. Portanto o total municipal é um **piso**: o município pode ter recebido
mais via emendas estaduais/nacionais não municipalizadas.

---

*Documento gerado a partir do código da plataforma (modelos, rotinas de
ingestão e telas) em 13/08/2026. Dúvidas sobre um número específico: cada
página do app tem o ícone ℹ️ com a explicação do indicador e a fonte.*
