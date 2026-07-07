# Dinheiro na Mesa (Captação vs. Pares) + Radar de Emendas Parlamentares — Design

**Data:** 2026-07-07
**Origem:** IDEAS.md §B ("Você está perdendo dinheiro") — itens "Dinheiro na mesa" e "Radar de emendas parlamentares"
**Status:** aprovado em brainstorming

## 1. Objetivo

Duas features novas, ambas na esteira de ingestão automática criada para o FPM:

1. **Dinheiro na mesa** — quanto o município captou em convênios/transferências voluntárias federais vs. municípios pares. Narrativa: *"Municípios pares captaram em média R$ 4,2M; você captou R$ 1,1M"*.
2. **Radar de emendas parlamentares** — emendas destinadas ao município: quem enviou (parlamentar), valor e status de execução (empenhado → liquidado → pago).

O diagnóstico alimenta o funil do módulo Captação de Recursos existente (Desenv. Econômico) via CTA de criação de oportunidade.

## 2. Decisões de produto (respostas do brainstorming)

| Decisão | Escolha |
|---|---|
| Posicionamento no plano | **Híbrido**: teaser livre (cards no Painel do Prefeito + endpoints `/resumo`) + detalhe gateado por plano (páginas completas, módulos `captacao_federal` e `emendas`) |
| Definição de "pares" | **Mesma faixa FPM (18 faixas DL 1.881/81) + mesma UF**; média nacional da faixa como referência secundária |
| UI | **2 páginas separadas** no grupo Economia: `/app/dinheiro-na-mesa` e `/app/emendas` |
| Janela histórica | **2019 → atual** (mandato passado + atual) |
| Métrica principal | **Valor firmado** (convênios celebrados no ano); desembolsado como secundária |
| Integração com kanban Captação | **CTA simples**: botão cria `CaptacaoRecurso` pré-preenchido no estágio "oportunidade" |
| Estratégia de dados | **Abordagem A — bulk CSV** na esteira `FONTES_AUTOMATICAS` (sem API key, sem rate limit); pares calculados em query time |

## 3. Fontes de dados (pesquisa 2026-07-07)

### SICONV / Transferegov — convênios (feature 1)
- Repositório: `http://repositorio.dados.gov.br/seges/detru/` — CSVs nacionais, atualização diária, **sem auth**.
- Arquivos usados: `siconv_convenio.csv.zip` (~16 MB), `siconv_proposta.csv.zip` (~190 MB, só para o mapa `ID_PROPOSTA → COD_MUNIC_IBGE`), `siconv_emenda.csv.zip` (~7 MB, separa convênio via emenda), `siconv_desembolso.csv.zip`.
- Chave: `COD_MUNIC_IBGE` (7 dígitos) em `siconv_proposta`; joins por `ID_PROPOSTA`. Zero fuzzy matching.
- Cobertura desde 2008; carregamos 2019+.

### Portal da Transparência — emendas (feature 2)
- Bulk CSV: `https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares` — todas as emendas, **sem auth**. Desde mai/2026 inclui execução das emendas Pix (transferências especiais).
- Campos: código/número/ano da emenda, autor, tipo, função, localidade do gasto, valores empenhado/liquidado/pago.
- Localidade é string `"NOME - UF"` (ou "Nacional"/UF/múltiplo) → matching por nome normalizado + UF, reusando `_norm_nome` do FPM (extraído como helper compartilhado).
- A **API** `/api-de-dados/emendas` NÃO filtra por município e exige chave gov.br — não usada na v1.
- SIGA Brasil: sem API/bulk — descartado.

## 4. Camada de dados

Migration `0031` (padrão da `0030_fpm_populacao`), duas tabelas:

### `captacao_federal_anual` — unique `(municipio_id, ano)`
| Campo | Tipo | Descrição |
|---|---|---|
| `municipio_id` | FK | município |
| `ano` | int | ano de assinatura do convênio |
| `valor_firmado` | float | soma dos convênios celebrados no ano (métrica principal) |
| `valor_desembolsado` | float | soma dos desembolsos no ano (secundária) |
| `valor_via_emenda` | float | parcela do firmado originada de emenda (`siconv_emenda`) |
| `qtd_convenios` | int | contagem |

Carregada para **todos os municípios ativos** (como `populacao_municipio`) — habilita o cálculo de pares em query time.

### `emenda_parlamentar` — unique `(municipio_id, codigo_emenda)`
| Campo | Tipo | Descrição |
|---|---|---|
| `municipio_id` | FK | município (via matching de localidade) |
| `codigo_emenda` | str | código único da emenda no Portal |
| `ano` | int | ano da emenda |
| `autor` | str | nome do parlamentar/bancada |
| `tipo_emenda` | str | individual / bancada / comissão / relator / Pix |
| `numero_emenda` | str | número |
| `funcao` | str | área (saúde, educação, …) |
| `valor_empenhado` | float | execução |
| `valor_liquidado` | float | execução |
| `valor_pago` | float | execução |

Carregada para os municípios selecionados na ingestão (filtro UF/município do admin, padrão FPM).

**Registro obrigatório:** ambos os models em `models/__init__.py` e em `DATASET_MODELS` / `DATASET_REGISTRY` / `DATASET_LABELS` de `municipio_management.py` (chaves `captacao_federal` e `emendas`) — sem isso clone/delete/counts quebram (lição do FPM).

## 5. Ingestão — duas fontes novas em `FONTES_AUTOMATICAS`

Ambas em `backend/app/services/ingestao_automatica/`, contrato `FonteAutomatica(key, label, fonte, executar)`, import no `__init__.py` do pacote. Aparecem automaticamente no `/admin/fontes` com `IngestaoAudit` (`acao="auto_ingest"`) e atualização de `DatasetInfo`.

### Fonte `captacao_federal` (`captacao_siconv.py`)
1. Baixa os 4 CSVs zipados do repositório SICONV para disco temporário.
2. Parse em streaming: `siconv_proposta` → dict `ID_PROPOSTA → municipio_id` **apenas** para municípios-alvo (mitiga os 190 MB); `siconv_convenio` → agrega firmado/qtd por (município, ano de assinatura); `siconv_emenda` → soma `valor_via_emenda` por proposta; `siconv_desembolso` → agrega desembolsado por ano.
3. Anos default: 2019 → ano corrente (parâmetro `anos` respeitado).
4. Upsert em `captacao_federal_anual`; commit em lote por UF.
   - **Operação:** o diagnóstico de pares precisa dos dados da UF inteira — executar esta fonte sempre por UF completa ou nacional (o seletor de UF do `/admin/fontes` já induz isso); o serviço reporta o nº de pares com dados para tornar lacunas visíveis.
5. Notificação (se `notificar`): na primeira carga do município, *"Diagnóstico de captação disponível: você captou R$ X abaixo/acima da média dos pares"* — tipo `warning` se abaixo, `success` se acima.

### Fonte `emendas` (`emendas_portal.py`)
1. Baixa o CSV de emendas do Portal (zip, sem auth), filtra anos 2019+.
2. Matching `"NOME - UF"` → município via helper `_norm_nome` compartilhado; linhas "Nacional"/só-UF/multi-município são descartadas (contadas no resumo de erros como aviso, não erro).
3. Upsert em `emenda_parlamentar`; commit por município.
4. Notificação (se `notificar`): novas emendas do ano corrente → *"R$ X em novas emendas destinadas a [cidade] (Dep. Fulano + N)"*, tipo `info`/`success`. Dedup por `(titulo, municipio_id)`.

## 6. Backend — services e endpoints

Padrão `fpm_service.py`: núcleo de cálculo puro (testável sem DB) + camada fina de DB com queries batched.

### `captacao_federal_service.py`
- `montar_diagnostico(db, municipio_id)`: faixa FPM do município (reusa `faixa_para_populacao` + população mais recente) → grupo de pares (mesma faixa + mesma UF) → por ano: você vs. média dos pares vs. média nacional da faixa. Headline: `dinheiro_na_mesa = média_pares − seu_firmado`, calculado sobre o **último ano civil completo** (ano corrente − 1; o ano corrente aparece na série marcado como parcial). Média dos pares exclui o próprio município. Inclui ranking no grupo, nº de pares com dados e split emenda/próprio.
- `montar_serie(db, municipio_id)`: séries anuais 2019+ (firmado, desembolsado, via emenda; você vs. média dos pares).

### `emendas_service.py`
- `montar_radar(db, municipio_id, ano=None)`: agrupado por parlamentar (total, % executado, nº emendas) + lista de emendas com funil empenhado→liquidado→pago + quebra por função.
- `gerar_notificacoes_emendas(db, municipio_ids, usuario_id)`: chamada pela fonte.

### Endpoints (2 routers novos, registrados em `main.py`)
| Endpoint | Gate | Payload |
|---|---|---|
| `GET /captacao-federal/resumo` | `municipio_scope` (livre) | headline p/ card do Painel |
| `GET /captacao-federal/diagnostico` | `scoped_modulo("captacao_federal")` | diagnóstico completo |
| `GET /captacao-federal/serie` | `scoped_modulo("captacao_federal")` | séries anuais |
| `GET /emendas/resumo` | `municipio_scope` (livre) | total ano corrente, top autor |
| `GET /emendas/radar?ano=` | `scoped_modulo("emendas")` | radar completo |

O híbrido é imposto **no backend**: sem o módulo no plano, os endpoints completos retornam 403.

### CTA → kanban de Captação
Sem backend novo. Frontend chama o `POST /desenvolvimento-economico/captacao` existente com `{tipo: "emenda"|"convenio", titulo, valor_estimado, entidade_origem, estagio: "oportunidade", descricao}` e navega ao kanban. Guardas existentes valem (VISUALIZADOR e ADMIN_GLOBAL não escrevem); botão visível só para quem pode escrever **e** tem `desenvolvimento_economico.captacao` no plano.

## 7. Frontend

Componentes `nid` (KpiCard, NidPanel, AreaLineChart), molde `FpmPage.jsx`.

### `/app/dinheiro-na-mesa` — `DinheiroNaMesaPage.jsx`
- Hero: *"Municípios pares captaram em média R$ 4,2M; você captou R$ 1,1M"* com delta colorido por status (acima/abaixo dos pares).
- KpiCards: firmado no ano, via emenda, desembolsado, posição no grupo (ex.: "7º de 23 pares").
- Gráfico anual você vs. média dos pares + quebra emenda/próprio + tabela anual.
- CTA "Registrar oportunidade no funil de captação".

### `/app/emendas` — `EmendasPage.jsx`
- KpiCards: total destinado no ano, % pago, nº de parlamentares, maior padrinho.
- Ranking por parlamentar (total + barra de execução) — quem manda e quem não manda recurso.
- Tabela de emendas com funil de execução e filtro por ano; quebra por função.
- CTA de oportunidade idem.

### Integrações de shell
- **Painel do Prefeito:** 2 cards autossuficientes no padrão `AlertaFpmCard` (fetch próprio de `/resumo`, `null` sem dados, link à página); 1 linha de JSX cada em `PainelPrefeitoPage.jsx`.
- **Sidebar** (`DashboardLayout.jsx`): grupo Economia, `modulo: "captacao_federal"` e `modulo: "emendas"`.
- **Rotas** em `AppRouter.jsx`; chaves novas em `MODULOS` de `PlanoConfigAdminPage.jsx` (cadeado + `PlanLockedView` automáticos).
- **InfoTooltip** com dataset explicando fonte e limitações.

## 8. Testes (regra do projeto: pure-logic, sem DB/rede)

- Parsers: linha SICONV (valores BR, datas/ano de assinatura), linha do CSV de emendas, extração `"NOME - UF"` (acentos, hífens, "Nacional", só-UF, homônimos entre UFs).
- Matemática: agregação por ano, média de pares, ranking, dinheiro na mesa, % execução (clamp 0–100, divisor zero).
- `_norm_nome` extraído como helper compartilhado sem quebrar os testes existentes do FPM.

## 9. Riscos e limitações aceitas (v1)

1. **`siconv_proposta.csv.zip` ~190 MB** — maior download da esteira (FPM: 30 MB). Mitigação: disco temp + streaming + dict filtrado por municípios-alvo. Plano B se estourar no Railway: execução por UF.
2. **Emendas não-municipalizáveis** ("Nacional"/UF/multi-município) ficam fora — o total do radar é piso, não teto. Documentado no InfoTooltip.
3. **Duplo aparecimento** emenda↔convênio entre os dois datasets — nunca somar entre páginas; rótulos explícitos ("captação via convênios" vs. "emendas destinadas") e split `valor_via_emenda` visível.
4. **Layout dos CSVs pode mudar** — parser valida cabeçalhos e falha com erro audível no `IngestaoAudit` (mesmo risco aceito no FPM/STN).
5. Capitais e municípios sem população carregada: diagnóstico retorna `disponivel: false` (páginas mostram empty state, cards do Painel somem) — mesmo comportamento do FPM.

## 10. Fora de escopo (v2)

- Drill-down de convênio individual via API do Portal da Transparência (abordagem C; exige chave gov.br).
- Sincronização automática emendas/convênios → kanban (v1 é CTA manual).
- Cron de atualização automática — permanece botão manual no `/admin/fontes`, como FPM.
- Fundo a Fundo e demais modalidades de transferência (API PostgREST com IBGE disponível se necessário no futuro).
