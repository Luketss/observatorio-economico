# Comparativo por pares + conserto do MunicipioPicker — Design

**Data:** 2026-08-09
**Escopo:** backend (1 serviço novo, 3 routers, 2 schemas) + frontend (1 util puro novo,
1 componente de gráfico, 1 combobox, 3 páginas) + infraestrutura de teste de componente
**Contexto:** com a ingestão rodando para todos os municípios, `/pib/comparativo` e
`/vaf/comparativo` passaram a devolver a base inteira para `ADMIN_GLOBAL`
(`pib.py:115-134`, `vaf.py:169-180`). As páginas repassam isso direto ao gráfico
(`PibPage.jsx:251`, `VafPage.jsx:282`), que cai no modo "legacy" — N linhas com 5 cores
em rodízio e uma legenda com N itens. Em paralelo, o campo de busca do
`MunicipioPicker` fecha ao apertar espaço, porque o `<input>` está dentro de um
`<button>`.

## Decisões (validadas com o usuário)

1. **Foco + pares comparáveis**, não Top-N nem só escolha manual: o gráfico destaca o
   município em foco e plota até 6 pares (mesma UF + faixa populacional FPM), com linha
   de mediana e faixa min/máx.
2. **O corte é no backend.** Os endpoints passam a aceitar `municipio_id` (que o
   interceptor de view-as em `api.js:25-28` já envia) e devolvem foco + pares. Resolve
   legibilidade *e* payload.
3. **Escolha manual convive com os pares automáticos**: um `MunicipioPicker` fixa até 3
   municípios, que ganham linha colorida própria e entram na legenda.
4. **Todo usuário autenticado vê o painel de pares**, não só `ADMIN_GLOBAL` — é
   justamente o valor do gráfico para o prefeito. Nomes e PIB de município já são
   públicos e `/pib/ranking` já os expõe a qualquer autenticado sem checagem de papel.
5. **Teste de componente de verdade** para o bug do espaço: entram `jsdom`,
   `@testing-library/react` e `@testing-library/user-event`.

## 1. `app/services/pares_service.py` (novo)

Regra única de "município comparável", hoje presa dentro de
`captacao_federal_service._pares_de`. Núcleo puro (sem `Session`), como
`fpm_service` e `captacao_federal_service` já fazem.

```python
@dataclass(frozen=True)
class MunicipioRef:
    id: int
    nome: str
    estado: str
    populacao: int | None
    codigo_ibge: str | None
    is_demo: bool = False

@dataclass(frozen=True)
class ResultadoPares:
    pares: list[MunicipioRef]
    criterio: str | None   # rótulo pronto para a UI
    motivo: str | None     # "sem_populacao" | "sem_pares" | None

def selecionar_pares(foco: MunicipioRef, candidatos: list[MunicipioRef],
                     limite: int = 6) -> ResultadoPares
def eh_capital(ref: MunicipioRef) -> bool
def mesma_faixa(a: MunicipioRef, b: MunicipioRef) -> bool
```

`candidatos` já chega filtrado por **elegibilidade de dado** — quem decide isso é o
endpoint, porque a cobertura é específica de cada dataset (ver §2). O serviço não sabe
o que é PIB nem VAF.

**Seleção em cascata**, parando ao atingir `limite`. Cada estrato é ordenado por
`|Δpopulação|` e, em empate, por `nome` — determinístico, sem depender da ordem do
banco:

| # | Estrato | Rótulo (`criterio`) |
|---|---|---|
| 1 | mesma UF + mesma faixa FPM | `mesma UF · faixa FPM 10.001–20.000 hab` |
| 2 | mesma faixa FPM, nacional | `faixa FPM 10.001–20.000 hab · nacional` |
| 3 | mesma UF, faixas FPM adjacentes (`indice ± 1`) | `mesma UF · faixa FPM próxima` |

Quando mais de um estrato é usado, o rótulo lista os usados separados por ` + `.
Reaproveita `fpm_service.faixa_para_populacao` e `fpm_service.CAPITAIS_IBGE` — a regra
de faixa não é reimplementada.

**Exclusões** (sempre): o próprio município, `is_demo=True`, `ativo=False`,
`populacao is None`.

**Capitais.** Capital não entra como par de município comum (regime FPM diferente —
mesma razão pela qual `captacao_federal_service` as exclui). Mas se o **foco** é
capital, `_pares_de` hoje devolve "não aplicável", o que deixaria o gráfico vazio;
aqui os pares passam a ser **as outras capitais**, ordenadas por `|Δpopulação|`, com
`criterio = "capitais · proximidade populacional"`.

**Sem população cadastrada** no foco → `ResultadoPares([], None, "sem_populacao")`.
Nenhum par encontrado após os 3 estratos → `motivo="sem_pares"`. Em ambos os casos a
página mostra a série do foco sozinha com o motivo no subtítulo — **nada é descartado
em silêncio**.

**Camada DB** (fina, verificada pelos testes de endpoint):

```python
def carregar_refs(db) -> dict[int, MunicipioRef]   # última população por município ativo
def pares_de_municipio(db, municipio_id, limite=6,
                       elegiveis: set[int] | None = None) -> ResultadoPares
def resolver_foco(db, current_user, municipio_id: int | None) -> int | None
```

`resolver_foco` é a fronteira de segurança: para usuário **não-admin ignora o parâmetro
`municipio_id` e devolve sempre `current_user.municipio_id`**; para `ADMIN_GLOBAL`
devolve o parâmetro (o view-as), ou `None` se ausente.

**Refatoração guardada de `captacao_federal_service`:** `_base_grupos` passa a montar
`dict[int, MunicipioRef]` via `carregar_refs`, e `_pares_de` a usar `mesma_faixa` /
`eh_capital`. A semântica de captação **não muda** (grupos ilimitados, capital como
"não aplicável"): `tests/test_captacao_service.py` é o guarda dessa refatoração e
precisa passar sem alteração.

## 2. Endpoints `/pib/comparativo` e `/vaf/comparativo`

Ambos passam a aceitar `municipio_id: int | None` e `fixados: str | None` (ids
separados por vírgula, **máximo 3**) e a devolver envelope em vez de lista crua. Ids
excedentes ou inexistentes são descartados, e a lista `fixados` da resposta contém
exatamente os aceitos — a página desenha os chips a partir dela, então um id recusado
aparece como chip que some, não como pedido silenciosamente ignorado.

```python
# schemas/pares.py (novo, compartilhado)
class MunicipioRefOut(BaseModel):
    municipio_id: int
    nome: str
    estado: str

class ParesMeta(BaseModel):
    foco: MunicipioRefOut | None = None
    pares: list[MunicipioRefOut] = []
    fixados: list[MunicipioRefOut] = []
    criterio_pares: str | None = None
    motivo: str | None = None        # sem_municipio | sem_populacao | sem_pares
```

- `PibComparativoOut(ParesMeta)` com `itens: list[PibComparativoItem]`
- `VafComparativoOut(ParesMeta)` com `itens: list[VafComparativoItem]`
- `PibComparativoItem` e `VafComparativoItem` ganham `municipio_id: int` (a página
  precisa distinguir foco/par/fixado sem casar por nome).

Fluxo: `resolver_foco` → `None` devolve `motivo="sem_municipio"` e `itens=[]` (o painel
some, coerente com o gate `SelecioneMunicipio` que as páginas já têm) → senão
`pares_de_municipio` → uma query por `municipio_id IN (foco + pares + fixados)`.

**Elegibilidade por cobertura.** Antes de chamar `pares_de_municipio`, o endpoint
levanta os anos que o foco tem no dataset e monta o conjunto `elegiveis` — municípios
que cobrem esses mesmos anos — passando-o ao serviço. Sem isso, um par com série curta
entraria no gráfico e o ano faltante viraria zero (`charts.jsx:760` faz `d[s] || 0`),
desenhando um despencar que não existe. Se a cobertura derrubar candidatos a ponto de
sobrarem menos de 6 pares, a resposta reflete o número real e o subtítulo diz quantos
são — o gráfico nunca inventa cobertura que o dado não tem.

**Mudança de contrato.** Os 3 consumidores (`PibPage`, `VafPage`,
`DashboardGeralPage`) são atualizados no mesmo commit. Não há cliente externo.

## 3. `GET /municipios/selecionaveis` (novo)

O `MunicipioPicker` de "comparar com…" precisa da lista de municípios, e
`/municipios` devolve **só o próprio** para não-admin (`municipios.py:96-99`), além de
campos administrativos (plano, brasão) que não interessam aqui.

Endpoint enxuto, disponível a qualquer autenticado: `[{id, nome, estado}]`, filtrando
`ativo=True` e `is_demo=False`, ordenado por `estado, nome`. `/municipios` fica
intocado. A lista é carregada **sob demanda** — só quando o usuário abre o picker de
comparação — para não somar ~250 KB a todo carregamento da página.

## 4. `src/utils/seriesComparativo.js` (novo)

Lógica pura de montagem das séries, no diretório onde o repo já concentra o que é
testável (`utils/*.test.js`):

```js
montarComparativo({ itens, foco, pares, fixados, anoKey, valorKey })
// → { data, focusSeries, peerSeries, pinnedSeries }
```

`anoKey` e `valorKey` nomeiam os campos do item porque os dois datasets divergem: PIB
usa `ano` / `pib_total`, VAF usa `ano_base` / `indice_ipm`. O util não conhece nenhum
dos dois.

- Pivota `itens` para `[{ label: String(ano), [nome]: valor }]`, ordenado por ano.
- O domínio de anos é o do **foco**. Ano em que o foco não tem dado não entra no
  gráfico, mesmo que um par tenha.
- `focusSeries` = nome do foco; `peerSeries` = nomes dos pares; `pinnedSeries` = nomes
  dos fixados. A ordem das séries é `[foco, ...pares, ...fixados]`, estável.
- Nomes duplicados entre UFs (Bom Jesus/PI e Bom Jesus/RS) são desambiguados como
  `Nome (UF)` — o pivot é por nome e colidiria em silêncio.
- Município sem dado num ano do domínio fica **ausente** da linha (`undefined`), nunca
  `0`. Pares já vêm com cobertura garantida pelo endpoint (§2); fixados, não — o
  usuário fixa quem quiser. É o gráfico que precisa saber desenhar o buraco (§5).
- `foco` nulo → `{ data: [], focusSeries: null, peerSeries: [], pinnedSeries: [] }`.

## 5. `MultiLineChart` (`components/nid/charts.jsx`)

O componente já tem `focusSeries` / `showMedian` / `showBand` (ticket 06) — é a
legenda e o tooltip que não escalam.

- **Legenda em modo foco** (`charts.jsx:1119-1121`) colapsa para itens fixos —
  `■ <foco> · ‑‑ mediana (N pares) · ░ faixa dos pares` — mais um item por município
  fixado. Hoje emite um item por série.
- **`legendMax` (default 8)**, guarda geral para os chamadores que **não** usam modo
  foco (o modo foco já tem legenda de tamanho fixo): acima disso a `InlineLegend`
  mostra os primeiros N e um chip visível `+N séries`. Truncar sim, truncar calado não.
- **Tooltip em modo foco** (`charts.jsx:1094-1099`) lista todos os pares; passa a
  limitar a 8 linhas, ordenadas por proximidade ao valor do foco, com `… e mais N`.
- **Buracos de série.** Hoje `charts.jsx:760` e `:1113` fazem `d[s] || 0`: um ano sem
  dado vira zero e a linha despenca até o eixo. Passa a `d[s] ?? null` — `0` real
  continua `0`, ausente vira `null`. Ponto `null` não gera vértice: a linha é
  desenhada em trechos contíguos (um `<path>` por trecho), o ponto de hover é omitido
  e a linha do tooltip mostra `—`. Vale para todos os `MultiLineChart` do app, e é o
  que permite fixar um município de série curta sem mentir sobre ele.

`showMedian`/`showBand` seguem calculando sobre as séries de par desenhadas (agora
ignorando `null`) — o rótulo diz `mediana (6 pares)`, então o número não é inflado.

## 6. Páginas

**`PibPage` e `VafPage`** — consomem o envelope, passam `focusSeries={foco.nome}`
(hoje usam `user?.municipio?.nome`, que é nulo para admin com view-as e por isso
desliga o modo foco). O subtítulo do painel passa a nomear o critério:
*"Uberlândia vs. 6 pares · mesma UF · faixa FPM 10.001–20.000 hab"*. Com
`motivo` preenchido, o subtítulo explica ("sem município selecionado", "sem população
cadastrada", "nenhum par encontrado"). A condição de exibição vira `foco != null`, no
lugar de `cidades.length > 1`.

**"Comparar com…"** acima do gráfico: `MunicipioPicker` + chips removíveis, até 3, no
padrão que o IPS já usa (`IpsPage.jsx:455-471`). Selecionar refaz o fetch com
`fixados=`.

**`DashboardGeralPage`** — `comparativoCidades` (`:143-154`) troca o `.slice(0, 4)`
arbitrário pelo envelope. E **`vaSetorData` (`:129-141`) é corrigido no mesmo passo**:
hoje soma o Valor Adicionado de *todos* os municípios do payload e apresenta o
resultado como "Decomposição setorial" do município — mesmo bug de origem. Passa a
filtrar por `foco.municipio_id`.

Fora de escopo: os demais `MultiLineChart` (PIX, ESTBAN, Comex, Bolsa Família,
Pé-de-Meia, Arrecadação, CAGED) usam 2–3 séries fixas de período, não de município. O
comparativo do IPS já é limitado por escolha do usuário; só herda o `legendMax`.

## 7. `MunicipioPicker` — a barra de espaço

**Causa:** o `<input>` de busca está dentro de um `<button>`
(`MunicipioPicker.jsx:101-141`). Espaço com um `<button>` no caminho do evento dispara
o click nativo do botão, que cai em `onClick={() => (open ? setOpen(false) : ...)}` e
fecha a lista. Aninhar controle interativo em `<button>` é HTML inválido — o mesmo vale
para o "limpar", que é um `role="button"` dentro do `<button>` (`:129-138`).

**Conserto estrutural**, não paliativo:

- Wrapper vira `<div role="combobox" aria-expanded aria-controls aria-activedescendant>`.
- Fechado: `<button>` com o rótulo. Aberto: `<div>` contendo o `<input>`. Os dois
  estados nunca coexistem, então nunca há input dentro de botão.
- O "limpar" sai de dentro do botão e vira `<button type="button">` irmão.
- `e.stopPropagation()` no `onKeyDown` do input, como cinto e suspensório.
- Comportamento preservado: ↓/↑ move, Enter escolhe, Esc fecha, clique fora fecha,
  `query` limpa ao fechar, highlight rola para a vista.

Conserta de uma vez as 8 telas que usam o componente: IPS, usuários, roles, insights,
datasets, municípios, releases e custom cards.

## 8. Testes

**Backend (pytest, já existe).** `tests/test_pares_service.py`, sobre o núcleo puro:
mesma UF + faixa preferida; cascata para nacional e para faixa adjacente quando faltam
pares; ordenação por `|Δpopulação|` e desempate estável; exclusão de próprio/demo/
inativo; capital recebe capitais como pares; `sem_populacao`; `sem_pares`; `limite`
respeitado. Testes de endpoint em `/pib/comparativo` e `/vaf/comparativo`: envelope
completo, `municipio_id` ausente → `motivo="sem_municipio"`, **não-admin não consegue
espiar outro município passando `municipio_id`**, `fixados` acima de 3 é aparado, e par
sem cobertura dos anos do foco não é escolhido.
`tests/test_captacao_service.py` precisa continuar verde sem alteração — é o guarda da
refatoração.

**Frontend puro (vitest, já existe).** `src/utils/seriesComparativo.test.js`: pivot e
ordenação por ano; domínio de anos vem do foco; ordem `[foco, pares, fixados]`;
desambiguação de nomes homônimos; foco nulo; município sem dado num ano fica ausente
enquanto valor `0` real é preservado; `anoKey`/`valorKey` de VAF e de PIB.

**Frontend de componente (infra nova).** Entram `jsdom`,
`@testing-library/react` e `@testing-library/user-event` como devDependencies. O
`vitest.config.js` mantém `environment: "node"` — os testes de componente declaram
`// @vitest-environment jsdom` no topo do arquivo, então nenhum teste puro fica mais
lento. Sem `jest-dom`; as asserções usam `expect` sobre propriedades do DOM.

`src/components/nid/MunicipioPicker.test.jsx` — **o teste de regressão do bug**:

1. abrir o picker, digitar `"bom "` (com espaço) → a lista continua aberta e o valor do
   input contém o espaço;
2. Esc fecha; Enter escolhe o item destacado; ↓/↑ movem o destaque;
3. o "limpar" dispara `onChange("")` sem reabrir a lista.

O item (1) falha na implementação atual — é a prova de que o conserto é o conserto.

## 9. Fora de escopo

- Mediana/faixa calculadas sobre o grupo completo de pares (podem ser dezenas) em vez
  dos 6 desenhados. Seria mais robusto estatisticamente e custaria uma query agregada,
  mas o rótulo `mediana (6 pares)` já é honesto sobre o que está sendo mostrado.
- Persistir os municípios fixados entre sessões.
- Estender pares a outros datasets (Arrecadação, CAGED, ESTBAN): a mesma
  `pares_service` serve, mas cada um tem seu painel e sua página.
