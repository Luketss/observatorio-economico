# Gestão Empresarial — Descoberta na base RFB (módulo 14 pleno, sub-frente B) — Design

**Data:** 2026-09-03
**Status:** aprovado pelo usuário (2026-09-03 — lugar: aba dentro da Gestão Empresarial; ranking: score RFB calculado no banco; "Acompanhar" abre o formulário Nova Empresa preenchido; filtros: situação (padrão ativas), porte, divisão CNAE e busca por nome; seções 1–5 aprovadas como apresentadas)

## Contexto

A sub-frente A (spec `2026-09-02-gestao-empresarial-relevancia-risco-design.md`,
commits 499e313..5fdb2d1) entregou a relevância explicável e o risco por
sinais das empresas **já acompanhadas**. O documento do cliente para o
módulo 14 também pede que o gestor descubra, na base CNPJ/RFB do município,
quais empresas valem a pena acompanhar — hoje a única porta é o autocomplete
do formulário (`GET /empresas/buscar`, 10 resultados por nome), que exige
saber o nome de antemão.

Volume real (set/2026): Divinópolis tem 222 mil linhas em `empresas`
(90 mil ativas, 21 mil suspensas/inaptas, 942 CNAEs distintos); Formiga
29 mil; Bom Despacho 18 mil. Ordenar isso em Python a cada requisição não
serve — o ranking é feito no banco, com paginação.

Sub-frentes: A (entregue) → **B (esta spec)** → C (agenda do gestor) →
D (BrasilAPI + importação em lote).

## Objetivo

Uma aba "Descobrir na base RFB" na Gestão Empresarial que lista, por
relevância decrescente, as empresas do município **ainda não acompanhadas**,
com filtros de situação, porte, divisão CNAE e busca por nome, e um botão
"Acompanhar" que abre o formulário Nova Empresa já preenchido e vinculado.
O score usa a mesma regra da sub-frente A, espelhada em SQL, para que a
empresa descoberta e a empresa acompanhada falem a mesma língua.

## Decisões aprovadas

- **Lugar:** barra de abas na própria tela da Gestão Empresarial
  ("Acompanhadas" · "Descobrir na base RFB"). Mesma rota
  `/app/desenvolvimento-economico/retencao`, mesma permissão de criação
  (`retencao.criar`) e mesmo cadeado de plano `empresas` da seção RFB
  (rejeitados: seção abaixo dos cards; botão na página Empresas — CNPJ).
- **Ranking:** score RFB calculado **no banco** por expressão SQL que
  espelha `calcular_relevancia` sem cadastro (máximo 45), com teste de
  consistência SQL × Python (rejeitados: pontuar em Python sobre um recorte;
  só ordenações simples).
- **Acompanhar:** abre o formulário Nova Empresa preenchido — o gestor
  completa empregos, risco e expansão antes de salvar (rejeitado: criar na
  hora com padrões).
- **Filtros:** situação (padrão `02` ativas; `todas` ou um código), porte
  (todos ou um código), divisão CNAE (2 dígitos, rótulos de `CNAE_SECAO`),
  busca por nome ou raiz de CNPJ; 20 por página com "Carregar mais";
  acompanhadas ficam sempre fora (rejeitados: CNAE de 7 dígitos; só nome e
  situação).
- **Data de referência local** (`hoje_local()`, fuso fixo −3) entra nesta
  sub-frente e fecha o follow-up da revisão da A.

## 1. Endpoints

Ambos no router `desenvolvimento_economico.py`, dependência
`mid: int | None = Depends(scoped_modulo("empresas"))` (impõe o plano
`empresas` no servidor e resolve o município: o do usuário, ou o
`municipio_id` do view-as para ADMIN_GLOBAL). `mid` nulo (ADMIN_GLOBAL sem
view-as) devolve lista vazia com `total = 0`, como `/empresas/buscar`.

### 1.1 `GET /desenvolvimento-economico/retencao/descobrir`

Parâmetros:

| nome | tipo | padrão | regra |
|---|---|---|---|
| `situacao` | `str` | `"02"` | um código de `01 02 03 04 08` ou `"todas"`; outro valor → 422 |
| `porte` | `str \| None` | `None` | um código de `00 01 03 05 07`; outro valor → 422 |
| `divisao` | `str \| None` | `None` | 2 dígitos (`^\d{2}$`); filtra `cnae_fiscal LIKE 'dd%'` |
| `q` | `str \| None` | `None` | com menos de 2 caracteres depois de `strip()` o filtro é ignorado (sem erro); com ≥ 3 dígitos filtra `cnpj_basico LIKE 'ddd…%'`, senão `razao_social ILIKE %q%` ou `nome_fantasia ILIKE %q%` (mesma regra de `/empresas/buscar`) |
| `limit` | `int` | `20` | 1–100 |
| `offset` | `int` | `0` | ≥ 0 |

Resposta `DescobertaPage`:

```json
{
  "total": 1234,
  "itens": [
    {
      "cnpj_basico": "12345678",
      "razao_social": "ACME LTDA",
      "nome_fantasia": "ACME",
      "situacao": "02",
      "porte": "03",
      "cnae_fiscal": "4711302",
      "divisao": "47",
      "divisao_descricao": "Comércio varejista",
      "capital_social": 150000.0,
      "data_inicio": "2010-01-05",
      "score": 33
    }
  ]
}
```

- Universo: `empresas` do município **sem** linha em `empresa_retencao` com o
  mesmo `(municipio_id, cnpj_basico)` (`NOT EXISTS`).
- Ordem: `score DESC, razao_social ASC, cnpj_basico ASC` (desempate
  determinístico para a paginação).
- `total` é a contagem do mesmo universo filtrado (sem `limit`/`offset`).
- `divisao_descricao` vem de `CNAE_SECAO` (movido de `routers/empresas.py`
  para `app/core/cnae.py` e importado nos dois lugares); divisão desconhecida
  → `"Divisão dd"`, como hoje em `/empresas/por_cnae_secao`. `cnae_fiscal`
  nulo → `divisao = null`, `divisao_descricao = null`.

### 1.2 `GET /desenvolvimento-economico/retencao/descobrir/divisoes`

Sem parâmetros além do escopo. Devolve as divisões CNAE presentes entre as
empresas **ativas (`02`) e não acompanhadas** do município, com contagem,
ordenadas por descrição:

```json
[{ "divisao": "47", "descricao": "Comércio varejista", "total": 8123 }]
```

Popula o filtro da tela uma vez por montagem. `cnae_fiscal` nulo fica fora.

## 2. Score RFB no banco

Em `app/services/gestao_empresarial.py`:

- `expressao_score_rfb(hoje: date)` devolve um `ColumnElement` SQLAlchemy
  (rotulado `score`) que espelha `calcular_relevancia(cadastro_vazio,
  perfil, hoje)`, onde o cadastro vazio tem `num_empregos = None` e
  `potencial_expansao = "baixo"` (0 pontos de cadastro). Regras, com as
  mesmas constantes do módulo:
  - **porte** — `CASE porte WHEN '01' THEN 6 WHEN '03' THEN 12 WHEN '05' THEN 20 ELSE 0`;
  - **tempo** — datas de corte calculadas em Python a partir de `hoje`
    (`hoje − 10 anos`, `− 5`, `− 2`, dia clampado em 28 quando `hoje` é
    29/02): `data_inicio <= corte10 → 15`, `<= corte5 → 11`, `<= corte2 → 7`,
    `data_inicio IS NOT NULL → 3`, `IS NULL → 0`. Comparação de datas por
    parâmetro (portável entre Postgres e o SQLite dos testes);
  - **capital** — `> 10 mi → 10`, `> 1 mi → 8`, `> 100 mil → 6`,
    `> 10 mil → 3`, senão (inclusive `NULL`) `0`;
  - **situação** — soma `bruto = porte + tempo + capital`;
    `situacao IN ('08','01') → 0`; `IN ('03','04') → bruto / 2` (divisão
    inteira: `cast(bruto AS INTEGER) / 2` em Postgres e SQLite trunca para
    baixo em inteiros não negativos); senão `bruto`.
  - Máximo: 20 + 15 + 10 = 45.
- `_datas_de_corte(hoje) -> tuple[date, date, date]` — helper puro,
  reutilizado pelo teste de consistência.
- `descobrir(db, municipio_id, *, situacao="02", porte=None, divisao=None,
  q=None, limit=20, offset=0, hoje=None) -> tuple[int, list[Row]]` monta a
  consulta (universo + filtros + `NOT EXISTS` + score), devolve `(total,
  linhas)`; cada linha expõe as colunas de `Empresa` e `score`.
- `divisoes_disponiveis(db, municipio_id) -> list[tuple[str, int]]` —
  `substr(cnae_fiscal, 1, 2)` agrupado, ativas e não acompanhadas.
- **Consistência SQL × Python** (teste): para cada combinação de porte
  (`None, "00", "01", "03", "05"`), situação (`"02", "03", "04", "08", "01",
  None`), capital (`None, 10_000, 10_000.01, 100_000.01, 1_000_000.01,
  10_000_000.01`) e `data_inicio` (`None`, `hoje`, `corte2 + 1 dia`,
  `corte2`, `corte5`, `corte10`, `date(1990,1,1)`), insere a linha no SQLite,
  lê `score` pela expressão e compara com `calcular_relevancia(...).score`.
  Qualquer divergência falha com a combinação impressa.

## 3. Data de referência local

- `app/core/datas.py` com `FUSO_BRASIL = timezone(timedelta(hours=-3))` e
  `hoje_local() -> date` (`datetime.now(FUSO_BRASIL).date()`). Comentário
  registra a decisão: fuso fixo porque o Brasil não tem horário de verão
  desde 2019 e o servidor roda em UTC; sem dependência de `tzdata`.
- `enriquecer(db, cadastros, hoje=None)` passa a usar `hoje_local()` como
  padrão (antes `date.today()`); `descobrir(...)` idem. O router
  `desenvolvimento_economico.py` passa `hoje=hoje_local()` explicitamente
  nas quatro chamadas de `enriquecer` e na descoberta (uma leitura do
  relógio por requisição).
- Teste: `hoje_local()` às 23:30 UTC de 2026-09-02 devolve 2026-09-02
  (com `datetime` congelado por `monkeypatch`); `enriquecer` sem `hoje`
  chama `hoje_local` (monkeypatch + `assert_called_once`).

## 4. Frontend

### 4.1 `GestaoEmpresarialTab.jsx`

- `NidTabBar` logo abaixo do header, `tabs={["Acompanhadas", "Descobrir na
  base RFB"]}`, `ariaLabel="Seções da Gestão Empresarial"`, estado
  `aba` (0 padrão). Aba 0 = tudo que existe hoje (KPIs, toolbar, cards,
  drawer). Aba 1 = `<PlanGate planKey="empresas">` envolvendo o
  `DescobrirRfb` quando `canAccess("empresas")` e, sem o plano, um
  placeholder estático de altura fixa — o cadeado aparece sobre ele e o
  componente não chega a chamar a API (que responderia 403).
- O guard `needsMunicipio` (ADMIN_GLOBAL sem view-as) continua acima das
  abas, como hoje.
- `openCreate(prefill)` aceita um objeto parcial mesclado sobre
  `defaultForm`. "Acompanhar" chama
  `openCreate({ nome: e.razao_social, cnpj_basico: e.cnpj_basico, setor:
  e.divisao_descricao || "" })` — o formulário mostra o chip "Vinculada ·
  {cnpj_basico}" já existente, e o gestor preenche empregos, risco,
  expansão e responsável. `cnpj` fica vazio (a base só tem a raiz).
- Após salvar com sucesso (`handleSubmit`), além de `load()`, incrementa
  `refreshDescoberta` (contador passado ao `DescobrirRfb`) para a linha
  sumir do ranking.
- `canCriar` é repassado ao `DescobrirRfb`; sem ele, sem botão "Acompanhar"
  (view-as e perfis sem `retencao.criar` só consultam).

### 4.2 `DescobrirRfb.jsx` (novo, mesmo diretório)

Props: `onAcompanhar(item)`, `canCriar`, `refreshKey`.

- **Filtros** (toolbar, `NidSelect` + input): situação (`Ativas` padrão ·
  `Suspensas` · `Inaptas` · `Baixadas` · `Nulas` · `Todas`), porte (`Todos` ·
  `Micro` · `Pequena` · `Média` · `Grande` · `Não informado`; rótulos de
  `PORTE_RFB` do drawer, replicados aqui como nas demais constantes de
  exibição), divisão CNAE (`Todas` + itens de `/descobrir/divisoes` com
  "descrição · total"), busca por nome/CNPJ com debounce de 300 ms
  (`aria-label="Buscar na base RFB"`; envia só com ≥ 2 caracteres).
- **Carga:** `GET /retencao/descobrir` com os filtros e `offset = 0` a cada
  mudança de filtro ou de `refreshKey`; "Carregar mais" repete com
  `offset = itens.length` e anexa. Respostas superadas (filtro mudou antes
  de chegar) são ignoradas por flag de cleanup, como na `IpsPage`.
- **Cabeçalho:** "{total} empresas na base RFB ainda não acompanhadas"
  (formatado pt-BR) e a legenda "Score RFB de 0 a 45: porte, tempo de
  atividade, capital e situação — os pontos de empregos e potencial entram
  quando a empresa é acompanhada."
- **Tabela** (`role="table"`, `overflow-x-auto`): Empresa (razão social em
  destaque + nome fantasia), Divisão CNAE, Porte, Desde (ano de
  `data_inicio` ou "—"), Capital (`fmtBRL`), Situação (rótulo de
  `SITUACAO_RFB`; `03/04` em `var(--accent-4)`, `08/01` em `var(--accent-2)`),
  Score (número em destaque, `title` "porte + tempo + capital, ajustado pela
  situação") e a coluna de ação com o botão "Acompanhar" (`aria-label`
  "Acompanhar {razão social}") quando `canCriar`.
- **Estados:** carregando (esqueleto/`role="status"` "Carregando…"); vazio
  "Nenhuma empresa da base RFB corresponde aos filtros." (ou, sem filtro e
  `total = 0`, "Todas as empresas da base RFB deste município já estão
  acompanhadas — ou a base ainda não foi coletada."); erro em
  `<p role="alert">` "Não foi possível carregar a base RFB."; "Carregar
  mais" só aparece quando `itens.length < total`.

### 4.3 Sem mudanças

`EmpresasPage`, `BuscaEmpresaRfb` (o autocomplete do formulário continua
para quem sabe o nome), `EmpresaDrawer`, rotas, sidebar, chaves de plano,
permissões, migrações.

## 5. Testes

**Backend (pytest, fixture SQLite no estilo de
`test_gestao_empresarial_endpoints.py`):**
- `tests/test_gestao_empresarial_descoberta.py`: consistência SQL × Python
  (seção 2); `descobrir` exclui acompanhadas do mesmo município e mantém a
  mesma raiz acompanhada em outro município; filtros de situação (`02`
  padrão, `todas`, código), porte, divisão e `q` (nome, raiz de CNPJ);
  ordem `score DESC, razao_social`; `limit`/`offset` com `total` estável;
  `divisoes_disponiveis` só ativas não acompanhadas; `_datas_de_corte` em
  29/02.
- `test_gestao_empresarial_endpoints.py`: handler `descobrir_retencao` com
  `mid` explícito devolve `DescobertaPage` com `divisao_descricao`
  preenchida; `mid=None` → `total 0`; `situacao="99"` → 422 (validação do
  schema/`Query` com `pattern`); `descobrir_divisoes` idem.
- `tests/test_datas.py`: `hoje_local` (seção 3) e o padrão de `enriquecer`.
- Suite completa: baseline **584**.

**Frontend (vitest):**
- `DescobrirRfb.test.jsx`: linhas renderizadas (razão social, divisão,
  porte, capital, score); parâmetros enviados por cada filtro e pela busca
  (com debounce falso via `vi.useFakeTimers`); "Carregar mais" envia
  `offset` e anexa; "Acompanhar" chama `onAcompanhar` com o item; botão
  ausente sem `canCriar`; `refreshKey` recarrega com `offset 0`; estados
  vazio, erro (`role="alert"`) e carregando.
- `GestaoEmpresarialTab.test.jsx`: barra de abas troca de conteúdo;
  "Acompanhar" abre o formulário com nome, setor e chip "Vinculada"; salvar
  chama `load()` e recarrega a descoberta; PlanGate na aba Descobrir sem
  plano `empresas`.
- Suite completa: baseline **435**.

## Fora de escopo

Importação em lote e BrasilAPI (D); agenda, vencimentos e histórico de
status (C); ranking das já acompanhadas por outro critério (já existe na aba
Acompanhadas); mudanças em `EmpresasPage`; persistir o score; desempate
sem acento em `ordenar_por_relevancia` (segue deferido — a descoberta
ordena no banco, não reutiliza o helper Python).

## Riscos e efeitos esperados

- **Contagem em 90 mil linhas:** `COUNT` com `NOT EXISTS` + filtro de
  situação por requisição, sobre índice em `municipio_id`; aceitável
  (dezenas de ms). Se pesar, o `total` pode passar a ser calculado só quando
  `offset = 0` — anotado, não feito.
- **Score 0–45 ao lado de 0–100:** a legenda da aba explica; a mesma empresa,
  depois de acompanhada com empregos e potencial informados, sobe de faixa.
- **Municípios sem coleta CNPJ** (Conceição do Pará, Igaratinga, Carmo do
  Cajuru têm 0 linhas em `empresas`): a aba mostra o estado vazio explícito;
  a coleta continua limitada a 20 municípios por execução (frente 01/09).
- **`CNAE_SECAO` movido para `app/core/cnae.py`:** `routers/empresas.py`
  passa a importar de lá; sem mudança de comportamento.
- **View-as:** ADMIN_GLOBAL impersonando vê o ranking do município escolhido
  (interceptor injeta `municipio_id`; `scoped_modulo` aceita) e não vê
  "Acompanhar" (`canCriar` falso para global).
