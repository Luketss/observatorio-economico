# Gestão Empresarial — Relevância e risco calculados (módulo 14 pleno, sub-frente A) — Design

**Data:** 2026-09-02
**Status:** aprovado pelo usuário (2026-09-02 — decomposição do módulo 14 pleno em A → B → C → D; score 0–100 por regras explicáveis; sinais calculados lado a lado com a avaliação manual; derivado na leitura no backend; regras das seções 1–2 e API/tela das seções 3–5 aprovadas como apresentadas)

## Contexto

A Fase 3 da reorganização (spec `2026-08-19-gestao-empresarial-design.md`)
entregou a fusão Empresas (RFB) + Retenção & Expansão: perfil com vínculo à
base CNPJ, contatos, visitas, demandas, responsável e próxima ação. Do que o
documento do cliente descreve para o módulo 14 ("perfil, relevância,
contatos, demandas, riscos, responsável e próxima ação"), ficaram de fora a
**relevância** (explicitamente fora de escopo na Fase 3) e o **risco**
calculado — hoje `status_risco` e `potencial_expansao` são campos manuais
(baixo/médio/alto).

"Módulo 14 pleno" foi decomposto em quatro sub-frentes, cada uma com spec,
plano e merge próprios, nesta ordem:

- **A — Relevância + risco calculados** (esta spec).
- **B — Descoberta a partir da base RFB**: ranking das empresas do município
  ainda não acompanhadas, filtros por CNAE/porte/situação, "acompanhar" cria
  o cadastro já vinculado. Reutiliza `calcular_relevancia` desta spec.
- **C — Agenda do gestor**: próximas ações vencidas/da semana, demandas por
  status, contatos recentes, histórico de status das demandas. Reutiliza os
  sinais de risco (com data de referência) desta spec.
- **D — Auto-preenchimento e importação por CNPJ** (BrasilAPI + lote).

## Objetivo

Dar à Gestão Empresarial uma **relevância explicável** (score 0–100 com os
fatores sempre visíveis) e um **risco calculado por sinais** (com nível
agregado), derivados na leitura a partir do cadastro, do perfil RFB
vinculado e do histórico de contatos/visitas/demandas — sem migração, sem
substituir a avaliação manual do gestor — e usar os dois na tela: chips nos
cards, KPIs, busca/ordenação/filtro e breakdown no drawer.

## Decisões aprovadas

- **Score 0–100 por regras ponderadas explicáveis** (rejeitados: faixas
  simples por porte+empregos; percentil dentro da base RFB do município).
- **Sinais calculados + nível, lado a lado com o manual**: `status_risco`
  continua como "avaliação do gestor"; o backend deriva `sinais_risco` e
  `risco_calculado` (rejeitados: só sinais sem nível; substituir o manual).
- **Derivado na leitura, no backend**, em serviço puro reutilizável pelas
  sub-frentes B e C (rejeitados: colunas persistidas + job diário; cálculo no
  front).
- **Potencial de expansão entra no score** (fator manual de 15 pontos).
- **Capital social pesa pouco e em escala log**: na base RFB o CNPJ básico
  colapsa filiais na matriz, então capital/porte de uma filial local são os
  da matriz (Banco do Brasil aparece em Bom Despacho com R$ 120 bi).
- **5 KPIs** na tela (Total · Em risco · Alta relevância · Alto potencial ·
  Empregos).
- Sem configuração por município: pesos e limiares são constantes do
  serviço.

## 1. Relevância (score 0–100)

Calculada por `calcular_relevancia(cadastro, perfil_rfb, hoje)`. Cada fator
devolve `{chave, rotulo, pontos, maximo, origem}` com `origem` em
`cadastro | rfb`; o resultado é `{score, faixa, parcial, fatores}`.

| Fator (chave) | Origem | Pontos |
|---|---|---|
| `empregos` — Empregos informados | cadastro `num_empregos` | 1–9: 10 · 10–49: 20 · 50–99: 30 · 100–499: 36 · 500+: 40 · vazio/0: 0 (rótulo "não informado") |
| `porte` — Porte RFB | rfb `porte` | `01` ME: 6 · `03` EPP: 12 · `05` Demais: 20 · `00`/vazio: 0 (rótulo "não informado") |
| `tempo` — Tempo de atividade | rfb `data_inicio` | < 2 anos: 3 · 2 a < 5: 7 · 5 a < 10: 11 · 10+: 15 · sem data: 0 |
| `capital` — Capital social | rfb `capital_social` | ≤ 10 mil: 0 · ≤ 100 mil: 3 · ≤ 1 mi: 6 · ≤ 10 mi: 8 · > 10 mi: 10 · nulo: 0 |
| `expansao` — Potencial de expansão | cadastro `potencial_expansao` | baixo: 0 · médio: 8 · alto: 15 |

Máximo = 40 + 20 + 15 + 10 + 15 = 100.

**Modificador de situação cadastral** (rfb `situacao`), aplicado sobre a
soma: `02` ativa mantém; `03` suspensa e `04` inapta dividem por 2
(arredondamento para baixo); `08` baixada e `01` nula zeram o score. O
modificador aparece na lista como fator `situacao` (`maximo: 0`, origem
`rfb`) com `pontos` negativo igual ao desconto aplicado e rótulo explicativo ("baixada na RFB: score
zerado"; "inapta na RFB: score reduzido pela metade"). Situação vazia ou
desconhecida não modifica.

**Sem vínculo RFB** (`cnpj_basico` nulo ou sem linha em `empresas` para
`(municipio_id, cnpj_basico)`): só os fatores de origem `cadastro` contam
(máximo 55), os fatores `rfb` entram com 0 pontos e rótulo "sem vínculo
RFB", e `parcial = true`. Com vínculo, `parcial = false`.

**Faixas:** `alta` ≥ 60 · `media` 30–59 · `baixa` < 30.

## 2. Risco calculado (sinais + nível)

Calculado por `calcular_risco(cadastro, perfil_rfb, ultimo_contato,
demanda_aberta_desde, hoje)`, onde `ultimo_contato` é a maior data entre
contatos (`contato_empresa.data`) e visitas (`visita_retencao.data_visita`)
da empresa (ou `None`) e `demanda_aberta_desde` é a menor `data_registro`
entre demandas com `status != "resolvida"` (ou `None`). Resultado:
`{nivel, sinais}`; cada sinal é `{chave, rotulo, desde}` com `desde` a data
de referência (para a agenda da sub-frente C).

| Sinal (chave) | Regra | `desde` |
|---|---|---|
| `proxima_acao_vencida` | `proxima_acao` preenchida e `proxima_acao_data < hoje` | `proxima_acao_data` |
| `sem_contato_90d` | `ultimo_contato` nulo ou `< hoje − 90 dias`; **não dispara** se nunca houve contato e `criado_em` (data) `≥ hoje − 90 dias` | `ultimo_contato`, ou `criado_em` quando nunca houve contato |
| `demanda_aberta_30d` | `demanda_aberta_desde ≤ hoje − 30 dias` | `demanda_aberta_desde` |
| `rfb_irregular` | rfb `situacao` em `03`, `04` | `None` |
| `rfb_baixada` | rfb `situacao` em `08`, `01` | `None` |

`rfb_irregular` e `rfb_baixada` são mutuamente exclusivos. Sem vínculo RFB
nenhum sinal RFB é avaliado.

**Nível:** `alto` se houver `rfb_baixada` ou 2+ sinais; `atencao` com
exatamente 1 sinal; `nenhum` com 0. Constantes `DIAS_SEM_CONTATO = 90` e
`DIAS_DEMANDA_ABERTA = 30` no serviço.

## 3. Backend

### 3.1 Serviço puro `app/services/gestao_empresarial.py`

- Constantes de pesos, faixas e limiares no topo do módulo (documentadas com
  a tabela desta spec).
- `calcular_relevancia(...)` e `calcular_risco(...)` puras (recebem `hoje`
  como parâmetro; nunca leem o relógio), devolvendo dataclasses
  `Relevancia`, `Fator`, `Risco`, `Sinal`.
- `enriquecer(db, cadastros, hoje=None) -> dict[int, tuple[Relevancia, Risco]]`
  com **3 consultas em lote**, independentes do número de cadastros:
  1. perfis RFB: `Empresa` filtrado por `municipio_id IN (mids)` e
     `cnpj_basico IN (raizes)`, casados em Python por
     `(municipio_id, cnpj_basico)` (evita `IN` de tupla — compatível com o
     SQLite dos testes);
  2. último contato: `max(ContatoEmpresa.data)` e
     `max(VisitaRetencao.data_visita)` agrupados por `empresa_id`
     (duas agregações, combinadas em Python);
  3. demanda aberta mais antiga: `min(DemandaEmpresa.data_registro)` com
     `status != "resolvida"` agrupado por `empresa_id`.
  Lista vazia devolve `{}` sem consultar.
- Helper `ordenar_por_relevancia(cadastros, enriquecido)`: score
  decrescente, desempate por `nome` (case-insensitive).

### 3.2 Schemas (`app/schemas/desenvolvimento_economico.py`)

- `FatorOut {chave, rotulo, pontos, maximo, origem}`,
  `RelevanciaOut {score, faixa, parcial, fatores}`,
  `SinalOut {chave, rotulo, desde: date | None}`, `RiscoOut {nivel, sinais}`.
- `EmpresaRetencaoLeanOut` e `EmpresaRetencaoOut` ganham
  `relevancia: RelevanciaOut` e `risco: RiscoOut` (obrigatórios: toda
  resposta vem enriquecida).

### 3.3 Router `desenvolvimento_economico.py`

- `GET /retencao`: após o filtro de tenant/view-as, chama `enriquecer` e
  devolve a lista **ordenada por relevância decrescente com desempate por
  nome** (antes: por nome). Serialização explícita: o handler monta os
  `LeanOut` a partir do ORM + enriquecimento (o `response_model` continua
  validando).
- `GET /retencao/{id}`: `enriquecer(db, [empresa])` reaproveita o
  `perfil_rfb` já carregado para o detalhe (uma única leitura do perfil).
- `POST /retencao` e `PUT /retencao/{id}`: devolvem o `LeanOut` enriquecido
  (o card atualiza sem refetch).
- Permissões, plano (`desenvolvimento_economico.retencao`), view-as e
  tenant **intocados**. Sem migração.

## 4. Frontend

### 4.1 `GestaoEmpresarialTab.jsx`

- **Card:** chip "Relevância {score} · {Alta|Média|Baixa}" com tom por faixa
  (alta `--accent-5`, média `--accent-4`, baixa `--text-dim`, sempre em
  tokens); quando `parcial`, sufixo "· parcial" e `title` "sem vínculo com a
  base RFB". Um chip curto por sinal de risco: "Ação vencida",
  "Sem contato 90d+", "Demanda aberta 30d+", "RFB irregular",
  "RFB baixada" (tom `--accent-2` para `rfb_baixada` e nível alto,
  `--accent-4` para os demais). Chips manuais de risco e expansão
  permanecem.
- **KPIs (5):** Total · Em risco (`status_risco === "alto"` OU
  `risco.nivel === "alto"`) · Alta relevância (`faixa === "alta"`) · Alto
  potencial · Empregos. Grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`.
- **Toolbar:** busca por texto (nome ou setor, case/acento-insensível via
  `normalize("NFD")`), ordenação (`Relevância` default · `Nome` · `Risco` =
  nível alto → atenção → nenhum, depois score) e filtro (`Todas` · `Em risco`
  · `Alta relevância` · `Sem vínculo RFB`). Tudo no cliente sobre a lista já
  carregada; a ordem inicial vinda do backend já é a de relevância. Estado
  vazio do filtro: "Nenhuma empresa corresponde ao filtro."
- Botão "Nova Empresa" e permissões inalterados.

### 4.2 `EmpresaDrawer.jsx` (aba Perfil)

- Bloco **Relevância** no topo da aba: score em destaque, faixa, barra
  proporcional (tokens) e lista de fatores "Empregos informados 20/40".
  Fatores com `origem: "rfb"` ficam dentro do mesmo `PlanGate
  planKey="empresas"` da seção Base RFB (o score e os fatores de cadastro
  aparecem para todos). Fator com 0 pontos por dado ausente vira dica:
  "não informado — informe os empregos para refinar" e, sem vínculo,
  "parcial — vincule à base RFB no formulário".
- Bloco **Sinais de risco**: lista com rótulo e data de referência formatada
  (`desde`), ou "Nenhum sinal de risco calculado". A avaliação manual
  continua no formulário de edição e no chip.

### 4.3 Sem mudanças

Rotas, chaves de plano, sidebar, `EmpresasPage`, permissões, `PlanGate`.

## 5. Testes

**Backend (pytest):**
- `tests/test_gestao_empresarial_score.py` (funções puras): cada faixa de
  cada fator incluindo fronteiras (9/10, 49/50, 99/100, 499/500; 2, 5 e 10
  anos; 10 mil, 100 mil, 1 mi, 10 mi); modificador de situação (ativa,
  inapta divide por 2, baixada zera com fator explicativo); sem vínculo →
  `parcial` e máximo 55; faixas 29/30/59/60; sinais um a um com fronteiras
  de 90 e 30 dias; cadastro com < 90 dias e sem contato não dispara; nível
  por contagem e por `rfb_baixada`; `desde` correto em cada sinal.
- `test_gestao_empresarial_endpoints.py` (fixture SQLite existente):
  listagem enriquecida e ordenada por relevância com desempate por nome;
  detalhe com `relevancia`/`risco` e `perfil_rfb`; POST/PUT devolvem
  enriquecido; `enriquecer` com dois municípios e mesmo `cnpj_basico` casa o
  perfil certo; lista vazia não consulta.

**Frontend (vitest):**
- `GestaoEmpresarialTab.test.jsx`: chips de relevância (inclusive
  "parcial") e de sinais; os 5 KPIs com a regra do "Em risco"; busca,
  ordenação e filtro; estado vazio do filtro.
- `EmpresaDrawer.test.jsx`: breakdown de fatores, fatores RFB sob PlanGate,
  dicas de dado ausente, lista de sinais e estado "nenhum sinal".
- Suites completas: baseline back **488**, front **411**.

## Fora de escopo

Persistência do score/risco; limiares ou pesos por município; notificações,
agenda e histórico de status (sub-frente C); descoberta na base RFB
(sub-frente B); BrasilAPI e importação (sub-frente D); mudanças em
`EmpresasPage`; alterar a semântica de `status_risco`/`potencial_expansao`.

## Riscos e efeitos esperados

- **Demo acende "sem contato 90d+" em massa:** os municípios de demonstração
  têm cadastros antigos e nenhum contato registrado; quase todos ganham esse
  sinal (nível `atencao`). É informação verdadeira e o KPI "Em risco" só
  conta nível `alto`. Anotar no checklist visual.
- **Viés matriz/filial** no capital e porte: mitigado pelos pesos baixos e
  pela escala log; documentado no rótulo do fator ("capital da matriz" quando
  o CNPJ básico for de fora do município não é detectável — a base não guarda
  o flag matriz/filial; aceito).
- **Exposição de fatores RFB para município sem o plano `empresas`:** o
  backend calcula com o que existe (como o detalhe já devolve `perfil_rfb`);
  o front esconde os fatores RFB sob o PlanGate. Mesmo regime de gating da
  Fase 3.
- **Custo da listagem:** 3 consultas agregadas por request, independentes do
  tamanho da lista; o ADMIN_GLOBAL sem view-as (todos os municípios) segue
  bloqueado pelo `needsMunicipio` na tela.
