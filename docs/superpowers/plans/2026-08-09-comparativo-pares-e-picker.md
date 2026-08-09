# Comparativo por pares + conserto do MunicipioPicker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os comparativos de município (PIB, VAF, Dashboard Geral) — hoje ilegíveis porque desenham a base inteira — por foco + até 6 pares comparáveis com mediana e faixa, e consertar o campo de busca de município que fecha ao apertar espaço.

**Architecture:** Um serviço novo (`pares_service`) concentra a regra de "município comparável" (mesma UF + faixa populacional do FPM), com núcleo puro sem `Session` e uma camada de banco fina no fim do módulo — mesmo formato de `fpm_service` e `captacao_federal_service`. Os endpoints `/pib/comparativo` e `/vaf/comparativo` passam a usar a dependência `scoped_modulo` que os outros endpoints dessas páginas já usam (view-as + gate de plano + garantia de que não-admin não lê outro município) e devolvem um envelope com foco, pares e critério. No frontend, a montagem das séries vira um util puro em `src/utils/`, testável como os outros; o `MultiLineChart` ganha tratamento de buraco de série e legenda de tamanho fixo; o `MunicipioPicker` tem a marcação corrigida.

**Tech Stack:** FastAPI 0.111 · Pydantic 2.7.4 · SQLAlchemy (ORM query API) · pytest (suite pura, sem DB e sem TestClient) · React 19 · Vite · Vitest 2 (+ jsdom e @testing-library/react, adicionados aqui)

## Global Constraints

- **Nenhum descarte silencioso.** Toda vez que o código corta dados (pares, séries na legenda, ids fixados, anos sem cobertura), a UI ou a resposta diz o que ficou de fora e por quê. Vale para legenda, subtítulo de painel, `motivo` da resposta.
- **Testes de backend rodam de `backend/`** com `python -m pytest` (`pytest.ini`: `pythonpath = .`, `testpaths = tests`, `addopts = -q`).
- **A suite de backend é pura**: sem DB, sem `TestClient`. O padrão do repo é chamar a função do router direto com `db=object()` quando o caminho testado retorna antes de tocar a `Session` (ver `tests/test_empresas_resumo_periodo.py`), e testar o resto como função pura.
- **Testes de frontend rodam de `frontend-observatorio/`** com `npm test` (`vitest run`, `environment: "node"`, `include: ["src/**/*.test.{js,jsx}"]`). Arquivos que precisam de DOM declaram `// @vitest-environment jsdom` na primeira linha — o ambiente global continua `node`.
- **Comentários e mensagens de commit em português**, seguindo o repo. Comentário explica *por quê*, não *o quê*.
- **Faixa populacional vem de `app.services.fpm_service`** (`FAIXAS_FPM`, `faixa_para_populacao`, `CAPITAIS_IBGE`). A regra não é reimplementada em lugar nenhum.
- **Limite de pares = 6; limite de fixados = 3.** Constantes `LIMITE_PADRAO` e `MAX_FIXADOS` em `pares_service`.
- Spec de referência: `docs/superpowers/specs/2026-08-09-comparativo-pares-e-picker-design.md`.

## Divergências da spec (deliberadas)

Duas coisas mudaram entre a spec e o plano, depois de ler o código com mais cuidado:

1. **`resolver_foco` não existe.** A spec previa uma função nova para resolver o
   município em foco com a regra "não-admin ignora o parâmetro". Essa dependência **já
   existe** no repo: `app.api.deps.scoped_modulo(modulo)` (`deps.py:103-118`), que além
   do escopo ainda aplica o gate de plano, e é o que `/pib/serie`, `/pib/resumo`,
   `/vaf/serie` e `/vaf/resumo` já usam. Os endpoints de comparativo passam a usá-la —
   uma função nova seria uma terceira cópia da mesma regra.
2. **`pares_de_municipio(db, ...)` virou `resolver_grupo(refs, ...)`, puro.** A spec
   punha a `Session` dentro da função. Passando `refs` prontas, toda a decisão fica
   testável sem banco — que é o único jeito de testar nesta suite. `carregar_refs(db)`
   fica como a única função do módulo que toca o banco.

---

## Mapa de arquivos

**Backend**

| Arquivo | Responsabilidade |
|---|---|
| `backend/app/services/pares_service.py` *(criar)* | Regra de par comparável: núcleo puro + `carregar_refs` (única função que toca `Session`) |
| `backend/app/services/captacao_federal_service.py` *(modificar)* | Passa a consumir `pares_service` em vez de duplicar carga de população e teste de faixa |
| `backend/app/schemas/pares.py` *(criar)* | `MunicipioRefOut` e `ParesMeta`, base dos envelopes |
| `backend/app/schemas/pib.py` *(modificar)* | `municipio_id` no item + `PibComparativoOut` |
| `backend/app/schemas/vaf.py` *(modificar)* | `municipio_id` no item + `VafComparativoOut` |
| `backend/app/api/v1/routers/pib.py` *(modificar)* | `/comparativo` reescrito |
| `backend/app/api/v1/routers/vaf.py` *(modificar)* | `/comparativo` reescrito |
| `backend/app/api/v1/routers/municipios.py` *(modificar)* | `/selecionaveis` novo |

**Frontend**

| Arquivo | Responsabilidade |
|---|---|
| `frontend-observatorio/src/utils/seriesComparativo.js` *(criar)* | Pivot de itens → séries do gráfico + texto do subtítulo. Puro. |
| `frontend-observatorio/src/components/nid/MunicipioPicker.jsx` *(modificar)* | Marcação corrigida (input fora do button) |
| `frontend-observatorio/src/components/nid/charts.jsx` *(modificar)* | Buracos de série, `pinnedSeries`, legenda de foco, `legendMax` |
| `frontend-observatorio/src/components/nid/ComparadorMunicipios.jsx` *(criar)* | "Comparar com…": botão → picker → chips. Usado por PIB e VAF. |
| `frontend-observatorio/src/pages/pib/PibPage.jsx` *(modificar)* | Consome o envelope |
| `frontend-observatorio/src/pages/vaf/VafPage.jsx` *(modificar)* | Consome o envelope |
| `frontend-observatorio/src/pages/DashboardGeralPage.jsx` *(modificar)* | Consome o envelope + conserta `vaSetorData` |

---

### Task 1: `pares_service` — núcleo puro

**Files:**
- Create: `backend/app/services/pares_service.py`
- Test: `backend/tests/test_pares_service.py`

**Interfaces:**
- Consumes: `app.services.fpm_service.CAPITAIS_IBGE`, `app.services.fpm_service.faixa_para_populacao`
- Produces: `MunicipioRef(id, nome, estado, populacao=None, codigo_ibge=None, is_demo=False)`, `ResultadoPares(pares, criterio=None, motivo=None)`, `LIMITE_PADRAO = 6`, `eh_capital(ref) -> bool`, `mesma_faixa(a, b) -> bool`, `rotulo_faixa(ref) -> str`, `selecionar_pares(foco, candidatos, limite=LIMITE_PADRAO) -> ResultadoPares`

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/test_pares_service.py`:

```python
"""Escolha de municípios comparáveis — mesma UF + faixa populacional do FPM.
Núcleo puro: nenhuma query, os candidatos chegam prontos."""
from app.services.pares_service import (
    LIMITE_PADRAO,
    MunicipioRef,
    eh_capital,
    mesma_faixa,
    rotulo_faixa,
    selecionar_pares,
)

# Faixa 3 do FPM (16.981–23.772 hab) — os quatro primeiros caem nela.
FOCO = MunicipioRef(id=1, nome="Foco", estado="MG", populacao=20_000, codigo_ibge="3100000")
PERTO = MunicipioRef(id=2, nome="Perto", estado="MG", populacao=20_500, codigo_ibge="3100001")
LONGE = MunicipioRef(id=3, nome="Longe", estado="MG", populacao=23_000, codigo_ibge="3100002")
OUTRA_UF = MunicipioRef(id=4, nome="OutraUf", estado="SP", populacao=20_100, codigo_ibge="3500001")
# Faixa 4 (23.773–30.564) — adjacente à do foco.
VIZINHA = MunicipioRef(id=5, nome="Vizinha", estado="MG", populacao=25_000, codigo_ibge="3100003")
# Faixa 0 — nem mesma faixa nem adjacente.
DISTANTE = MunicipioRef(id=6, nome="Distante", estado="MG", populacao=5_000, codigo_ibge="3100004")
BH = MunicipioRef(id=7, nome="Belo Horizonte", estado="MG", populacao=2_300_000, codigo_ibge="3106200")
SP = MunicipioRef(id=8, nome="São Paulo", estado="SP", populacao=11_400_000, codigo_ibge="3550308")


def test_capital_e_faixa():
    assert eh_capital(BH) is True
    assert eh_capital(FOCO) is False
    assert mesma_faixa(FOCO, PERTO) is True
    assert mesma_faixa(FOCO, VIZINHA) is False
    assert mesma_faixa(FOCO, MunicipioRef(id=9, nome="X", estado="MG", populacao=None)) is False
    assert rotulo_faixa(FOCO) == "faixa FPM 16.981–23.772 hab"
    assert rotulo_faixa(BH) == "faixa FPM acima de 156.216 hab"


def test_mesma_uf_e_faixa_tem_prioridade_e_ordena_por_proximidade():
    # limite=2 para o teste ver só o primeiro estrato: com limite=6 a cascata
    # completaria o grupo com OUTRA_UF, que é justamente o comportamento
    # verificado no teste seguinte.
    r = selecionar_pares(FOCO, [LONGE, OUTRA_UF, PERTO], limite=2)
    assert [p.id for p in r.pares] == [2, 3]          # Perto antes de Longe
    assert r.criterio == "mesma UF · faixa FPM 16.981–23.772 hab"
    assert r.motivo is None


def test_completa_o_grupo_com_outra_uf_quando_sobra_vaga():
    r = selecionar_pares(FOCO, [LONGE, OUTRA_UF, PERTO])   # limite padrão = 6
    assert [p.id for p in r.pares] == [2, 3, 4]
    assert r.criterio == (
        "mesma UF · faixa FPM 16.981–23.772 hab + faixa FPM 16.981–23.772 hab · nacional"
    )


def test_cascata_para_nacional_e_depois_faixa_adjacente():
    r = selecionar_pares(FOCO, [OUTRA_UF, VIZINHA, DISTANTE], limite=3)
    assert [p.id for p in r.pares] == [4, 5]          # nacional mesma faixa, depois UF/faixa vizinha
    assert r.criterio == (
        "faixa FPM 16.981–23.772 hab · nacional + mesma UF · faixa FPM próxima"
    )


def test_exclui_proprio_demo_e_sem_populacao():
    demo = MunicipioRef(id=10, nome="Demo", estado="MG", populacao=20_200, is_demo=True)
    sem_pop = MunicipioRef(id=11, nome="SemPop", estado="MG", populacao=None)
    r = selecionar_pares(FOCO, [FOCO, demo, sem_pop, PERTO])
    assert [p.id for p in r.pares] == [2]


def test_capital_recebe_capitais_como_pares():
    r = selecionar_pares(BH, [SP, PERTO, LONGE])
    assert [p.id for p in r.pares] == [8]
    assert r.criterio == "capitais · proximidade populacional"


def test_capital_nao_entra_como_par_de_municipio_comum():
    r = selecionar_pares(FOCO, [BH, PERTO])
    assert [p.id for p in r.pares] == [2]


def test_foco_sem_populacao_e_sem_candidatos():
    sem_pop = MunicipioRef(id=12, nome="SemPop", estado="MG", populacao=None)
    assert selecionar_pares(sem_pop, [PERTO]).motivo == "sem_populacao"
    assert selecionar_pares(FOCO, []).motivo == "sem_pares"
    assert selecionar_pares(FOCO, []).pares == []


def test_limite_respeitado():
    muitos = [
        MunicipioRef(id=100 + i, nome=f"M{i}", estado="MG", populacao=20_000 + i, codigo_ibge=f"31000{i:02d}")
        for i in range(20)
    ]
    assert len(selecionar_pares(FOCO, muitos).pares) == LIMITE_PADRAO
    assert len(selecionar_pares(FOCO, muitos, limite=2).pares) == 2
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run (de `backend/`): `python -m pytest tests/test_pares_service.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.services.pares_service'`

- [ ] **Step 3: Escrever a implementação mínima**

Criar `backend/app/services/pares_service.py`:

```python
"""Municípios comparáveis — mesma UF + faixa populacional do FPM.

Regra única compartilhada pelos comparativos (PIB, VAF) e pelo diagnóstico de
captação federal. Núcleo puro no topo (sem `Session`, testável direto); a
camada de banco fica no fim do módulo, fina — mesmo formato de `fpm_service` e
`captacao_federal_service`.

Capital não é par de município comum: segue o regime FPM-Capitais e está em
outra escala. Mas capital EM FOCO recebe as outras capitais como pares — a
alternativa seria deixar o gráfico vazio justamente nas maiores cidades.
"""
from dataclasses import dataclass, field

from app.services.fpm_service import CAPITAIS_IBGE, faixa_para_populacao

LIMITE_PADRAO = 6


@dataclass(frozen=True)
class MunicipioRef:
    id: int
    nome: str
    estado: str
    populacao: int | None = None
    codigo_ibge: str | None = None
    is_demo: bool = False


@dataclass(frozen=True)
class ResultadoPares:
    pares: list[MunicipioRef] = field(default_factory=list)
    criterio: str | None = None
    motivo: str | None = None            # sem_populacao | sem_pares


def eh_capital(ref: MunicipioRef) -> bool:
    return (ref.codigo_ibge or "") in CAPITAIS_IBGE


def _indice_faixa(ref: MunicipioRef) -> int | None:
    return None if ref.populacao is None else faixa_para_populacao(ref.populacao).indice


def mesma_faixa(a: MunicipioRef, b: MunicipioRef) -> bool:
    ia, ib = _indice_faixa(a), _indice_faixa(b)
    return ia is not None and ia == ib


def _faixa_adjacente(a: MunicipioRef, b: MunicipioRef) -> bool:
    ia, ib = _indice_faixa(a), _indice_faixa(b)
    return ia is not None and ib is not None and abs(ia - ib) == 1


def _milhar(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def rotulo_faixa(ref: MunicipioRef) -> str:
    faixa = faixa_para_populacao(ref.populacao)
    if faixa.pop_max is None:
        return f"faixa FPM acima de {_milhar(faixa.pop_min - 1)} hab"
    return f"faixa FPM {_milhar(faixa.pop_min)}–{_milhar(faixa.pop_max)} hab"


def _ordenar(foco: MunicipioRef, grupo: list[MunicipioRef]) -> list[MunicipioRef]:
    # Proximidade populacional; nome e id desempatam para a escolha não depender
    # da ordem em que o banco devolveu as linhas.
    return sorted(grupo, key=lambda c: (abs(c.populacao - foco.populacao), c.nome, c.id))


def selecionar_pares(
    foco: MunicipioRef,
    candidatos: list[MunicipioRef],
    limite: int = LIMITE_PADRAO,
) -> ResultadoPares:
    """Até `limite` pares de `foco`, em cascata de estratos. `candidatos` já deve
    chegar filtrado por elegibilidade de dado — quem sabe o que é PIB ou VAF é o
    endpoint, não este módulo."""
    if foco.populacao is None:
        return ResultadoPares(motivo="sem_populacao")

    elegiveis = [
        c for c in candidatos
        if c.id != foco.id and not c.is_demo and c.populacao is not None
    ]

    if eh_capital(foco):
        pares = _ordenar(foco, [c for c in elegiveis if eh_capital(c)])[:limite]
        if not pares:
            return ResultadoPares(motivo="sem_pares")
        return ResultadoPares(pares, "capitais · proximidade populacional")

    comuns = [c for c in elegiveis if not eh_capital(c)]
    faixa = rotulo_faixa(foco)
    estratos = [
        (f"mesma UF · {faixa}",
         [c for c in comuns if c.estado == foco.estado and mesma_faixa(foco, c)]),
        (f"{faixa} · nacional",
         [c for c in comuns if c.estado != foco.estado and mesma_faixa(foco, c)]),
        ("mesma UF · faixa FPM próxima",
         [c for c in comuns if c.estado == foco.estado and _faixa_adjacente(foco, c)]),
    ]

    pares: list[MunicipioRef] = []
    rotulos: list[str] = []
    vistos: set[int] = set()
    for rotulo, grupo in estratos:
        if len(pares) >= limite:
            break
        novos = [c for c in _ordenar(foco, grupo) if c.id not in vistos]
        if not novos:
            continue
        fatia = novos[: limite - len(pares)]
        pares.extend(fatia)
        vistos.update(c.id for c in fatia)
        rotulos.append(rotulo)

    if not pares:
        return ResultadoPares(motivo="sem_pares")
    return ResultadoPares(pares, " + ".join(rotulos))
```

- [ ] **Step 4: Rodar os testes**

Run (de `backend/`): `python -m pytest tests/test_pares_service.py -v`
Expected: PASS — 9 testes

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pares_service.py backend/tests/test_pares_service.py
git commit -m "feat(pares): regra de municipio comparavel (mesma UF + faixa FPM)"
```

---

### Task 2: `pares_service` — camada de banco, helpers de endpoint e refatoração da captação

**Files:**
- Modify: `backend/app/services/pares_service.py` (acrescentar ao fim)
- Modify: `backend/app/services/captacao_federal_service.py:87-135` (`_base_grupos`, `_pares_de`) e `:151-155` (`calcular_diagnostico`)
- Test: `backend/tests/test_pares_service.py` (acrescentar)

**Interfaces:**
- Consumes: `MunicipioRef`, `ResultadoPares`, `selecionar_pares`, `eh_capital`, `mesma_faixa`, `LIMITE_PADRAO` (Task 1)
- Produces: `MAX_FIXADOS = 3`, `GrupoComparativo(foco=None, pares=[], fixados=[], criterio=None, motivo=None)`, `carregar_refs(db) -> dict[int, MunicipioRef]`, `parse_fixados(bruto: str | None) -> list[int]`, `elegiveis_por_cobertura(linhas: list[tuple[int, int]], anos_foco: set[int]) -> set[int]`, `resolver_grupo(refs, mid, elegiveis, fixados_ids, limite=LIMITE_PADRAO) -> GrupoComparativo`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `backend/tests/test_pares_service.py`:

```python
# ── helpers de endpoint (puros) ──────────────────────────────────────────────
from app.services.pares_service import (  # noqa: E402
    MAX_FIXADOS,
    elegiveis_por_cobertura,
    parse_fixados,
    resolver_grupo,
)

REFS = {r.id: r for r in [FOCO, PERTO, LONGE, OUTRA_UF, VIZINHA, BH]}


def test_parse_fixados_apara_e_higieniza():
    assert parse_fixados("12, 7,99") == [12, 7, 99]
    assert parse_fixados("1,2,3,4,5") == [1, 2, 3]          # MAX_FIXADOS
    assert parse_fixados("1,1,2") == [1, 2]                 # sem repetição
    assert parse_fixados("1,abc,,3") == [1, 3]              # ignora lixo
    assert parse_fixados(None) == [] and parse_fixados("") == []
    assert MAX_FIXADOS == 3


def test_elegiveis_por_cobertura_exige_todos_os_anos_do_foco():
    linhas = [(1, 2020), (1, 2021), (2, 2020), (2, 2021), (3, 2021)]
    assert elegiveis_por_cobertura(linhas, {2020, 2021}) == {1, 2}
    assert elegiveis_por_cobertura(linhas, {2021}) == {1, 2, 3}
    assert elegiveis_por_cobertura(linhas, set()) == set()


def test_resolver_grupo_monta_foco_pares_e_fixados():
    g = resolver_grupo(REFS, mid=1, elegiveis={2, 3, 4}, fixados_ids=[5, 1, 2], limite=2)
    assert g.foco.id == 1
    assert [p.id for p in g.pares] == [2, 3]
    # 1 é o próprio foco e 2 já é par — só 5 sobrevive como fixado.
    assert [f.id for f in g.fixados] == [5]
    assert g.motivo is None


def test_resolver_grupo_sem_municipio_conhecido():
    g = resolver_grupo(REFS, mid=999, elegiveis={2}, fixados_ids=[])
    assert g.motivo == "sem_municipio"
    assert g.foco is None and g.pares == []


def test_resolver_grupo_propaga_motivo_de_sem_pares():
    g = resolver_grupo(REFS, mid=1, elegiveis=set(), fixados_ids=[5])
    assert g.foco.id == 1
    assert g.pares == []
    assert g.motivo == "sem_pares"
    assert [f.id for f in g.fixados] == [5]    # fixado sobrevive mesmo sem pares


# ── captação continua com a mesma semântica após a refatoração ───────────────
def test_pares_de_captacao_mantem_grupos_ilimitados():
    from app.services.captacao_federal_service import _pares_de

    refs = {r.id: r for r in [FOCO, PERTO, LONGE, OUTRA_UF, VIZINHA, BH,
                              MunicipioRef(id=20, nome="D", estado="MG",
                                           populacao=20_300, is_demo=True)]}
    meta, pares, nacional = _pares_de(1, refs)
    assert meta["uf"] == "MG"
    assert meta["faixa"].indice == 3
    assert pares == {2, 3}              # mesma UF + mesma faixa, sem limite
    assert nacional == {2, 3, 4}        # mesma faixa, qualquer UF
    # capital, demo, faixa diferente e o próprio ficam fora dos dois grupos
    assert 7 not in nacional and 20 not in nacional and 5 not in nacional
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run (de `backend/`): `python -m pytest tests/test_pares_service.py -v`
Expected: FAIL com `ImportError: cannot import name 'MAX_FIXADOS' from 'app.services.pares_service'`

- [ ] **Step 3: Acrescentar a camada de banco e os helpers**

Acrescentar ao fim de `backend/app/services/pares_service.py`:

```python
# ── camada DB (fina) e helpers de endpoint ───────────────────────────────────
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from sqlalchemy.orm import Session

MAX_FIXADOS = 3


@dataclass(frozen=True)
class GrupoComparativo:
    foco: MunicipioRef | None = None
    pares: list[MunicipioRef] = field(default_factory=list)
    fixados: list[MunicipioRef] = field(default_factory=list)
    criterio: str | None = None
    motivo: str | None = None    # sem_municipio | sem_populacao | sem_pares


def carregar_refs(db: "Session") -> dict[int, MunicipioRef]:
    """Município ativo → ref com a população mais recente. Uma query.

    `outerjoin` de propósito: município sem população cadastrada continua
    aparecendo (com `populacao=None`) para poder ser FOCO e receber o motivo
    "sem_populacao" — some-lo aqui viraria um "sem_municipio" enganoso.
    """
    from app.models.municipio import Municipio
    from app.models.populacao import PopulacaoMunicipio

    linhas = (
        db.query(
            Municipio.id, Municipio.nome, Municipio.estado,
            Municipio.codigo_ibge, Municipio.is_demo,
            PopulacaoMunicipio.ano, PopulacaoMunicipio.populacao,
        )
        .outerjoin(PopulacaoMunicipio, PopulacaoMunicipio.municipio_id == Municipio.id)
        .filter(Municipio.ativo.is_(True))
        .all()
    )
    refs: dict[int, MunicipioRef] = {}
    ano_de: dict[int, int | None] = {}
    for mid, nome, uf, ibge, demo, ano, pop in linhas:
        anterior = ano_de.get(mid)
        if mid in refs and (ano is None or (anterior is not None and ano <= anterior)):
            continue
        refs[mid] = MunicipioRef(id=mid, nome=nome, estado=uf, populacao=pop,
                                 codigo_ibge=ibge, is_demo=bool(demo))
        ano_de[mid] = ano
    return refs


def parse_fixados(bruto: str | None) -> list[int]:
    """"12, 7,99,4" → [12, 7, 99]. Máx. MAX_FIXADOS, sem repetição, ignora lixo.
    O excedente não é erro: a resposta devolve os aceitos e a página redesenha
    os chips a partir dela, então o usuário vê o que entrou."""
    if not bruto:
        return []
    ids: list[int] = []
    for pedaco in bruto.split(","):
        pedaco = pedaco.strip()
        if pedaco.isdigit() and int(pedaco) not in ids:
            ids.append(int(pedaco))
    return ids[:MAX_FIXADOS]


def elegiveis_por_cobertura(linhas: list[tuple[int, int]], anos_foco: set[int]) -> set[int]:
    """Ids com dado em TODOS os anos do foco. `linhas` = pares (municipio_id, ano).

    Sem isso, um par de série curta entraria no gráfico e o ano faltante viraria
    zero, desenhando um tombo que não existe."""
    if not anos_foco:
        return set()
    por_mid: dict[int, set[int]] = {}
    for mid, ano in linhas:
        por_mid.setdefault(mid, set()).add(ano)
    return {mid for mid, anos in por_mid.items() if anos_foco <= anos}


def resolver_grupo(
    refs: dict[int, MunicipioRef],
    mid: int,
    elegiveis: set[int],
    fixados_ids: list[int],
    limite: int = LIMITE_PADRAO,
) -> GrupoComparativo:
    """Puro de propósito: o router faz a query (`carregar_refs`) e passa `refs`."""
    foco = refs.get(mid)
    if foco is None:
        return GrupoComparativo(motivo="sem_municipio")
    candidatos = [r for r in refs.values() if r.id in elegiveis]
    res = selecionar_pares(foco, candidatos, limite=limite)
    ids_pares = {p.id for p in res.pares}
    fixados = [refs[i] for i in fixados_ids
               if i in refs and i != mid and i not in ids_pares]
    return GrupoComparativo(foco=foco, pares=res.pares, fixados=fixados,
                            criterio=res.criterio, motivo=res.motivo)
```

- [ ] **Step 4: Refatorar `captacao_federal_service` para consumir o serviço**

Em `backend/app/services/captacao_federal_service.py`, substituir o bloco de `_base_grupos` e `_pares_de` (linhas 87-135) por:

```python
def _base_grupos(db: "Session"):
    """2 queries batched: refs de município (com população mais recente) e todas
    as linhas de captação da janela."""
    from app.models.captacao_federal import CaptacaoFederalAnual
    from app.services.pares_service import carregar_refs

    refs = carregar_refs(db)

    capt_rows = (
        db.query(CaptacaoFederalAnual)
        .filter(CaptacaoFederalAnual.ano >= ANO_INICIO)
        .all()
    )
    capt: dict[int, dict[int, dict]] = {}
    for r in capt_rows:
        capt.setdefault(r.municipio_id, {})[r.ano] = {
            "firmado": float(r.valor_firmado), "via_emenda": float(r.valor_via_emenda),
            "desembolsado": float(r.valor_desembolsado), "qtd": r.qtd_convenios,
        }
    return refs, capt


def _pares_de(municipio_id: int, refs: dict):
    """(meta faixa/uf, pares mesma faixa+UF, nacional mesma faixa) — exclui o
    próprio município, capitais e municípios demo dos grupos. Grupos ILIMITADOS:
    aqui eles são amostra estatística (média/posição), não linhas de gráfico."""
    from app.services.pares_service import eh_capital, mesma_faixa

    foco = refs[municipio_id]
    faixa = faixa_para_populacao(foco.populacao)
    pares, nacional = set(), set()
    for mid, ref in refs.items():
        if mid == municipio_id or ref.is_demo or eh_capital(ref):
            continue
        if not mesma_faixa(foco, ref):
            continue
        nacional.add(mid)
        if ref.estado == foco.estado:
            pares.add(mid)
    return {"faixa": faixa, "uf": foco.estado}, pares, nacional
```

E em `calcular_diagnostico` (linhas 151-155), trocar o guard de população — `carregar_refs` agora inclui município sem população, então a checagem passa a ser pelo campo:

```python
    refs, capt = _base_grupos(db)
    if municipio_id not in refs or refs[municipio_id].populacao is None:
        return {**_CAMPOS_VAZIOS, "motivo": "sem_populacao"}

    meta, pares, nacional = _pares_de(municipio_id, refs)
```

- [ ] **Step 5: Rodar os testes de pares e os de captação**

Run (de `backend/`): `python -m pytest tests/test_pares_service.py tests/test_captacao_service.py -v`
Expected: PASS — os 9 de Task 1, os 6 novos, e `test_captacao_service.py` inteiro verde **sem nenhuma alteração no arquivo**. Se algum de captação quebrar, a refatoração mudou semântica: corrigir a refatoração, não o teste.

- [ ] **Step 6: Rodar a suite inteira do backend**

Run (de `backend/`): `python -m pytest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/pares_service.py backend/app/services/captacao_federal_service.py backend/tests/test_pares_service.py
git commit -m "refactor(pares): camada db + helpers de endpoint; captacao passa a usar o servico"
```

---

### Task 3: Schemas de envelope

**Files:**
- Create: `backend/app/schemas/pares.py`
- Modify: `backend/app/schemas/pib.py:12-19`
- Modify: `backend/app/schemas/vaf.py:19-20`
- Test: `backend/tests/test_schemas_comparativo.py`

**Interfaces:**
- Produces: `MunicipioRefOut(municipio_id, nome, estado)`, `ParesMeta(foco, pares, fixados, criterio_pares, motivo)`, `PibComparativoItem` com `municipio_id`, `PibComparativoOut`, `VafComparativoItem` com `municipio_id`, `VafComparativoOut`

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/test_schemas_comparativo.py`:

```python
"""Envelope dos comparativos por pares — defaults e composição."""
from app.schemas.pares import MunicipioRefOut, ParesMeta
from app.schemas.pib import PibComparativoOut
from app.schemas.vaf import VafComparativoOut


def test_pares_meta_tem_defaults_vazios():
    m = ParesMeta()
    assert m.foco is None and m.pares == [] and m.fixados == []
    assert m.criterio_pares is None and m.motivo is None


def test_defaults_nao_sao_compartilhados_entre_instancias():
    a, b = ParesMeta(), ParesMeta()
    a.pares.append(MunicipioRefOut(municipio_id=1, nome="X", estado="MG"))
    assert b.pares == []


def test_envelope_pib_vazio_e_preenchido():
    vazio = PibComparativoOut(motivo="sem_municipio")
    assert vazio.itens == [] and vazio.foco is None

    cheio = PibComparativoOut(
        foco=MunicipioRefOut(municipio_id=1, nome="Foco", estado="MG"),
        pares=[MunicipioRefOut(municipio_id=2, nome="Par", estado="MG")],
        criterio_pares="mesma UF · faixa FPM 16.981–23.772 hab",
        itens=[{"ano": 2021, "municipio_id": 1, "cidade": "Foco", "pib_total": 10.0}],
    )
    assert cheio.itens[0].municipio_id == 1
    assert cheio.pares[0].nome == "Par"


def test_envelope_vaf_item_carrega_municipio_id():
    out = VafComparativoOut(
        foco=MunicipioRefOut(municipio_id=1, nome="Foco", estado="MG"),
        itens=[{"ano_base": 2021, "municipio_id": 1, "cidade": "Foco",
                "indice_participacao_municipal": 0.5}],
    )
    assert out.itens[0].municipio_id == 1
    assert out.itens[0].indice_participacao_municipal == 0.5
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run (de `backend/`): `python -m pytest tests/test_schemas_comparativo.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.schemas.pares'`

- [ ] **Step 3: Criar `app/schemas/pares.py`**

```python
"""Envelope compartilhado dos comparativos por pares (PIB, VAF).

`motivo` é o que impede descarte silencioso: quando a lista de pares vem vazia,
a página sabe dizer por quê em vez de simplesmente não desenhar nada."""
from pydantic import BaseModel


class MunicipioRefOut(BaseModel):
    municipio_id: int
    nome: str
    estado: str


class ParesMeta(BaseModel):
    foco: MunicipioRefOut | None = None
    pares: list[MunicipioRefOut] = []
    fixados: list[MunicipioRefOut] = []
    criterio_pares: str | None = None
    motivo: str | None = None      # sem_municipio | sem_populacao | sem_pares
```

- [ ] **Step 4: Acrescentar `municipio_id` e o envelope em `pib.py`**

Em `backend/app/schemas/pib.py`, acrescentar `municipio_id` a `PibComparativoItem` e o envelope no fim do arquivo:

```python
from app.schemas.pares import ParesMeta


class PibComparativoItem(BaseModel):
    ano: int
    municipio_id: int
    cidade: str
    pib_total: float
    va_agropecuaria: float | None = None
    va_governo: float | None = None
    va_industria: float | None = None
    va_servicos: float | None = None


class PibComparativoOut(ParesMeta):
    itens: list[PibComparativoItem] = []
```

- [ ] **Step 5: Mesmo para `vaf.py`**

Em `backend/app/schemas/vaf.py`:

```python
from app.schemas.pares import ParesMeta


class VafComparativoItem(VafItem):
    municipio_id: int
    cidade: str


class VafComparativoOut(ParesMeta):
    itens: list[VafComparativoItem] = []
```

- [ ] **Step 6: Rodar os testes**

Run (de `backend/`): `python -m pytest tests/test_schemas_comparativo.py -v`
Expected: PASS — 4 testes

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/pares.py backend/app/schemas/pib.py backend/app/schemas/vaf.py backend/tests/test_schemas_comparativo.py
git commit -m "feat(schemas): envelope de comparativo por pares (foco, pares, criterio, motivo)"
```

---

### Task 4: `/pib/comparativo` reescrito

**Files:**
- Modify: `backend/app/api/v1/routers/pib.py:83-134`
- Test: `backend/tests/test_comparativo_pib_endpoint.py`

**Interfaces:**
- Consumes: `scoped_modulo` (`app.api.deps`), `carregar_refs`, `parse_fixados`, `elegiveis_por_cobertura`, `resolver_grupo` (Task 2), `PibComparativoOut`, `PibComparativoItem`, `MunicipioRefOut` (Task 3)
- Produces: `comparativo_pib(mid, fixados, db) -> PibComparativoOut`; rota `GET /api/v1/pib/comparativo` com query params `municipio_id` e `fixados`

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/test_comparativo_pib_endpoint.py`:

```python
"""/pib/comparativo — envelope de pares. Padrão do repo: sem TestClient e sem DB;
o caminho mid=None retorna antes de tocar a Session, e o contrato da rota é
conferido pelo OpenAPI (que o FastAPI monta sem conexão)."""
from app.api.v1.routers.pib import comparativo_pib


def test_sem_municipio_selecionado_devolve_envelope_vazio():
    out = comparativo_pib(mid=None, fixados=None, db=object())
    assert out.motivo == "sem_municipio"
    assert out.foco is None
    assert out.itens == [] and out.pares == [] and out.fixados == []


def _openapi():
    from app.main import app
    return app.openapi()


def test_rota_expoe_o_envelope_e_os_parametros():
    schema = _openapi()
    op = schema["paths"]["/api/v1/pib/comparativo"]["get"]
    ref = op["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert ref.endswith("PibComparativoOut")

    props = schema["components"]["schemas"]["PibComparativoOut"]["properties"]
    assert {"foco", "pares", "fixados", "criterio_pares", "motivo", "itens"} <= set(props)

    params = {p["name"] for p in op.get("parameters", [])}
    assert {"municipio_id", "fixados"} <= params


def test_item_carrega_municipio_id():
    props = _openapi()["components"]["schemas"]["PibComparativoItem"]["properties"]
    assert "municipio_id" in props
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run (de `backend/`): `python -m pytest tests/test_comparativo_pib_endpoint.py -v`
Expected: FAIL — `comparativo_pib() got an unexpected keyword argument 'mid'` (a assinatura atual é `db`/`current_user`)

- [ ] **Step 3: Reescrever o endpoint**

Em `backend/app/api/v1/routers/pib.py`, trocar os imports do topo e substituir o bloco `# Comparativo entre Municípios (ADMIN_GLOBAL)` (linhas 83-134) por:

```python
# topo do arquivo
from app.api.deps import get_db, scoped_modulo
from app.schemas.pares import MunicipioRefOut
from app.schemas.pib import (
    PibComparativoItem,
    PibComparativoOut,
    PibItem,
    PibResumo,
)
from app.services.pares_service import (
    carregar_refs,
    elegiveis_por_cobertura,
    parse_fixados,
    resolver_grupo,
)
from fastapi import APIRouter, Depends, Query
```

```python
# ==============================
# Comparativo — foco + pares comparáveis
# ==============================
def _ref_out(r) -> MunicipioRefOut:
    return MunicipioRefOut(municipio_id=r.id, nome=r.nome, estado=r.estado)


@router.get("/comparativo", response_model=PibComparativoOut)
def comparativo_pib(
    mid: int | None = Depends(scoped_modulo("pib")),
    fixados: str | None = Query(default=None, description="ids separados por vírgula, máx. 3"),
    db: Session = Depends(get_db),
):
    """Série do município em foco + até 6 pares comparáveis (mesma UF + faixa
    populacional do FPM), mais os municípios que o usuário fixou. Antes daqui
    esta rota devolvia a base inteira para ADMIN_GLOBAL, o que tornava o gráfico
    e a legenda ilegíveis assim que a ingestão passou a cobrir todo o país."""
    if mid is None:
        # ADMIN_GLOBAL sem município selecionado — front exibe "selecione um município".
        return PibComparativoOut(motivo="sem_municipio")

    anos_foco = {
        a for (a,) in db.query(PibAnual.ano).filter(PibAnual.municipio_id == mid).all()
    }
    if not anos_foco:
        return PibComparativoOut(motivo="sem_municipio")

    cobertura = (
        db.query(PibAnual.municipio_id, PibAnual.ano)
        .join(Municipio, PibAnual.municipio_id == Municipio.id)
        .filter(PibAnual.ano.in_(anos_foco), Municipio.is_demo.is_(False))
        .all()
    )
    elegiveis = elegiveis_por_cobertura([(m, a) for m, a in cobertura], anos_foco)

    grupo = resolver_grupo(carregar_refs(db), mid, elegiveis, parse_fixados(fixados))
    if grupo.foco is None:
        return PibComparativoOut(motivo=grupo.motivo or "sem_municipio")

    ids = [grupo.foco.id] + [p.id for p in grupo.pares] + [f.id for f in grupo.fixados]
    registros = (
        db.query(PibAnual, Municipio.nome)
        .join(Municipio, PibAnual.municipio_id == Municipio.id)
        .filter(PibAnual.municipio_id.in_(ids))
        .order_by(PibAnual.ano)
        .all()
    )
    return PibComparativoOut(
        foco=_ref_out(grupo.foco),
        pares=[_ref_out(p) for p in grupo.pares],
        fixados=[_ref_out(f) for f in grupo.fixados],
        criterio_pares=grupo.criterio,
        motivo=grupo.motivo,
        itens=[
            PibComparativoItem(
                ano=r.ano,
                municipio_id=r.municipio_id,
                cidade=nome,
                pib_total=r.pib_total,
                va_agropecuaria=r.va_agropecuaria,
                va_governo=r.va_governo,
                va_industria=r.va_industria,
                va_servicos=r.va_servicos,
            )
            for r, nome in registros
        ],
    )
```

`get_current_user` continua no import: `/pib/ranking` (linha 142) ainda o usa.

- [ ] **Step 4: Rodar os testes**

Run (de `backend/`): `python -m pytest tests/test_comparativo_pib_endpoint.py -v`
Expected: PASS — 3 testes

- [ ] **Step 5: Rodar a suite inteira**

Run (de `backend/`): `python -m pytest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/pib.py backend/tests/test_comparativo_pib_endpoint.py
git commit -m "feat(pib): /comparativo devolve foco + pares em vez da base inteira"
```

---

### Task 5: `/vaf/comparativo` reescrito

**Files:**
- Modify: `backend/app/api/v1/routers/vaf.py:143-180`
- Test: `backend/tests/test_comparativo_vaf_endpoint.py`

**Interfaces:**
- Consumes: mesmos de Task 4, com `VafComparativoOut` / `VafComparativoItem` e `VafAnual.ano_base` no lugar de `PibAnual.ano`
- Produces: `comparativo_vaf(mid, fixados, db) -> VafComparativoOut`

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/test_comparativo_vaf_endpoint.py`:

```python
"""/vaf/comparativo — envelope de pares (mesmo contrato do PIB, sobre ano_base)."""
from app.api.v1.routers.vaf import comparativo_vaf


def test_sem_municipio_selecionado_devolve_envelope_vazio():
    out = comparativo_vaf(mid=None, fixados=None, db=object())
    assert out.motivo == "sem_municipio"
    assert out.foco is None and out.itens == []


def test_rota_expoe_o_envelope_e_os_parametros():
    from app.main import app

    schema = app.openapi()
    op = schema["paths"]["/api/v1/vaf/comparativo"]["get"]
    ref = op["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert ref.endswith("VafComparativoOut")

    props = schema["components"]["schemas"]["VafComparativoOut"]["properties"]
    assert {"foco", "pares", "fixados", "criterio_pares", "motivo", "itens"} <= set(props)

    params = {p["name"] for p in op.get("parameters", [])}
    assert {"municipio_id", "fixados"} <= params

    item = schema["components"]["schemas"]["VafComparativoItem"]["properties"]
    assert "municipio_id" in item and "indice_participacao_municipal" in item
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run (de `backend/`): `python -m pytest tests/test_comparativo_vaf_endpoint.py -v`
Expected: FAIL — `comparativo_vaf() got an unexpected keyword argument 'mid'`

- [ ] **Step 3: Reescrever o endpoint**

Em `backend/app/api/v1/routers/vaf.py`, ajustar imports e substituir o bloco de `/comparativo` (linhas 143-180) por:

```python
# topo do arquivo
from app.api.deps import get_db, scoped_modulo
from app.schemas.pares import MunicipioRefOut
from app.schemas.vaf import (
    IcmsProjetadoItem,
    VafComparativoItem,
    VafComparativoOut,
    VafItem,
    VafResumo,
)
from app.services.pares_service import (
    carregar_refs,
    elegiveis_por_cobertura,
    parse_fixados,
    resolver_grupo,
)
from fastapi import APIRouter, Depends, Query
```

`get_current_user` continua no import: `/vaf/ranking` (linha 188) ainda o usa.

```python
# ==============================
# Comparativo — foco + pares comparáveis
# ==============================
def _ref_out(r) -> MunicipioRefOut:
    return MunicipioRefOut(municipio_id=r.id, nome=r.nome, estado=r.estado)


@router.get("/comparativo", response_model=VafComparativoOut)
def comparativo_vaf(
    mid: int | None = Depends(scoped_modulo("vaf")),
    fixados: str | None = Query(default=None, description="ids separados por vírgula, máx. 3"),
    db: Session = Depends(get_db),
):
    """IPM do município em foco + até 6 pares comparáveis (mesma UF + faixa
    populacional do FPM), mais os fixados pelo usuário. Ver comentário gêmeo em
    `routers/pib.py`: antes daqui a rota devolvia a base inteira."""
    if mid is None:
        return VafComparativoOut(motivo="sem_municipio")

    anos_foco = {
        a for (a,) in db.query(VafAnual.ano_base).filter(VafAnual.municipio_id == mid).all()
    }
    if not anos_foco:
        return VafComparativoOut(motivo="sem_municipio")

    cobertura = (
        db.query(VafAnual.municipio_id, VafAnual.ano_base)
        .join(Municipio, VafAnual.municipio_id == Municipio.id)
        .filter(VafAnual.ano_base.in_(anos_foco), Municipio.is_demo.is_(False))
        .all()
    )
    elegiveis = elegiveis_por_cobertura([(m, a) for m, a in cobertura], anos_foco)

    grupo = resolver_grupo(carregar_refs(db), mid, elegiveis, parse_fixados(fixados))
    if grupo.foco is None:
        return VafComparativoOut(motivo=grupo.motivo or "sem_municipio")

    ids = [grupo.foco.id] + [p.id for p in grupo.pares] + [f.id for f in grupo.fixados]
    registros = (
        db.query(VafAnual, Municipio.nome)
        .join(Municipio, VafAnual.municipio_id == Municipio.id)
        .filter(VafAnual.municipio_id.in_(ids))
        .order_by(VafAnual.ano_base)
        .all()
    )
    return VafComparativoOut(
        foco=_ref_out(grupo.foco),
        pares=[_ref_out(p) for p in grupo.pares],
        fixados=[_ref_out(f) for f in grupo.fixados],
        criterio_pares=grupo.criterio,
        motivo=grupo.motivo,
        itens=[
            VafComparativoItem(municipio_id=r.municipio_id, cidade=nome, **_to_item(r).model_dump())
            for r, nome in registros
        ],
    )
```

- [ ] **Step 4: Rodar os testes**

Run (de `backend/`): `python -m pytest tests/test_comparativo_vaf_endpoint.py -v`
Expected: PASS — 2 testes

- [ ] **Step 5: Rodar a suite inteira**

Run (de `backend/`): `python -m pytest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/vaf.py backend/tests/test_comparativo_vaf_endpoint.py
git commit -m "feat(vaf): /comparativo devolve foco + pares em vez da base inteira"
```

---

### Task 6: `GET /municipios/selecionaveis`

**Files:**
- Modify: `backend/app/api/v1/routers/municipios.py` (acrescentar rota após `listar_municipios`, linha 101)
- Test: `backend/tests/test_municipios_selecionaveis.py`

**Interfaces:**
- Produces: `MunicipioSelecionavel(id, nome, estado)` em `app/schemas/municipio.py`; rota `GET /api/v1/municipios/selecionaveis` → `list[MunicipioSelecionavel]`

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/tests/test_municipios_selecionaveis.py`:

```python
"""Lista enxuta para o seletor 'comparar com…'. /municipios devolve só o próprio
município para não-admin e carrega campos administrativos; esta rota é a que
qualquer autenticado usa para escolher com quem se comparar."""


def test_rota_existe_e_devolve_lista_enxuta():
    from app.main import app

    schema = app.openapi()
    op = schema["paths"]["/api/v1/municipios/selecionaveis"]["get"]
    item = op["responses"]["200"]["content"]["application/json"]["schema"]["items"]["$ref"]
    assert item.endswith("MunicipioSelecionavel")

    props = schema["components"]["schemas"]["MunicipioSelecionavel"]["properties"]
    assert set(props) == {"id", "nome", "estado"}


def test_nao_colide_com_a_rota_de_id():
    from app.main import app

    caminhos = set(app.openapi()["paths"])
    assert "/api/v1/municipios/selecionaveis" in caminhos
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run (de `backend/`): `python -m pytest tests/test_municipios_selecionaveis.py -v`
Expected: FAIL com `KeyError: '/api/v1/municipios/selecionaveis'`

- [ ] **Step 3: Implementar**

Em `backend/app/schemas/municipio.py`, acrescentar:

```python
class MunicipioSelecionavel(BaseModel):
    """Projeção mínima para seletores de comparação — sem campos administrativos."""
    id: int
    nome: str
    estado: str

    model_config = {"from_attributes": True}
```

Em `backend/app/api/v1/routers/municipios.py`, acrescentar após `listar_municipios` (importando `MunicipioSelecionavel` no topo). **Declarar antes de qualquer rota `/{municipio_id}`** para o FastAPI não tratar "selecionaveis" como id:

```python
@router.get("/selecionaveis", response_model=List[MunicipioSelecionavel])
def listar_municipios_selecionaveis(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Municípios que podem ser fixados num comparativo. Aberta a qualquer
    autenticado de propósito: nome e UF são públicos (IBGE) e `/pib/ranking` já
    expõe todos sem checagem de papel. `/municipios` não serve aqui — devolve só
    o próprio município para não-admin."""
    return (
        db.query(Municipio)
        .filter(Municipio.ativo.is_(True), Municipio.is_demo.is_(False))
        .order_by(Municipio.estado, Municipio.nome)
        .all()
    )
```

- [ ] **Step 4: Rodar os testes**

Run (de `backend/`): `python -m pytest tests/test_municipios_selecionaveis.py -v`
Expected: PASS — 2 testes

- [ ] **Step 5: Rodar a suite inteira**

Run (de `backend/`): `python -m pytest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/routers/municipios.py backend/app/schemas/municipio.py backend/tests/test_municipios_selecionaveis.py
git commit -m "feat(municipios): rota /selecionaveis para o seletor de comparacao"
```

---

### Task 7: Util puro `seriesComparativo.js`

**Files:**
- Create: `frontend-observatorio/src/utils/seriesComparativo.js`
- Test: `frontend-observatorio/src/utils/seriesComparativo.test.js`

**Interfaces:**
- Produces: `montarComparativo({ itens, foco, pares, fixados, anoKey, valorKey }) -> { data, focusSeries, peerSeries, pinnedSeries }`, `descreverPares({ foco, pares, criterio_pares, motivo }) -> string`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend-observatorio/src/utils/seriesComparativo.test.js`:

```js
import { describe, it, expect } from "vitest";
import { montarComparativo, descreverPares } from "./seriesComparativo";

const FOCO = { municipio_id: 1, nome: "Foco", estado: "MG" };
const PAR = { municipio_id: 2, nome: "Par", estado: "MG" };
const FIXADO = { municipio_id: 3, nome: "Fixado", estado: "SP" };

const itens = [
  { ano: 2020, municipio_id: 1, pib_total: 10 },
  { ano: 2021, municipio_id: 1, pib_total: 12 },
  { ano: 2020, municipio_id: 2, pib_total: 20 },
  { ano: 2021, municipio_id: 2, pib_total: 22 },
  { ano: 2021, municipio_id: 3, pib_total: 30 },
];

const base = { itens, foco: FOCO, pares: [PAR], fixados: [FIXADO], anoKey: "ano", valorKey: "pib_total" };

describe("montarComparativo", () => {
  it("pivota por ano e mantem a ordem foco, pares, fixados", () => {
    const r = montarComparativo(base);
    expect(r.focusSeries).toBe("Foco");
    expect(r.peerSeries).toEqual(["Par"]);
    expect(r.pinnedSeries).toEqual(["Fixado"]);
    expect(r.data).toEqual([
      { label: "2020", Foco: 10, Par: 20 },
      { label: "2021", Foco: 12, Par: 22, Fixado: 30 },
    ]);
  });

  it("ausencia vira chave ausente, nunca zero", () => {
    const r = montarComparativo(base);
    expect("Fixado" in r.data[0]).toBe(false);
  });

  it("preserva valor zero real", () => {
    const r = montarComparativo({
      ...base,
      itens: [{ ano: 2020, municipio_id: 1, pib_total: 0 }],
      pares: [], fixados: [],
    });
    expect(r.data[0].Foco).toBe(0);
  });

  it("dominio de anos vem do foco", () => {
    const r = montarComparativo({
      ...base,
      itens: [...itens, { ano: 2019, municipio_id: 2, pib_total: 99 }],
    });
    expect(r.data.map((d) => d.label)).toEqual(["2020", "2021"]);
  });

  it("desambigua homonimos de UFs diferentes", () => {
    const r = montarComparativo({
      ...base,
      foco: { municipio_id: 1, nome: "Bom Jesus", estado: "PI" },
      pares: [{ municipio_id: 2, nome: "Bom Jesus", estado: "RS" }],
      fixados: [],
    });
    expect(r.focusSeries).toBe("Bom Jesus (PI)");
    expect(r.peerSeries).toEqual(["Bom Jesus (RS)"]);
    expect(r.data[0]).toEqual({ label: "2020", "Bom Jesus (PI)": 10, "Bom Jesus (RS)": 20 });
  });

  it("aceita as chaves do VAF", () => {
    const r = montarComparativo({
      itens: [{ ano_base: 2021, municipio_id: 1, indice_participacao_municipal: 0.5 }],
      foco: FOCO, pares: [], fixados: [],
      anoKey: "ano_base", valorKey: "indice_participacao_municipal",
    });
    expect(r.data).toEqual([{ label: "2021", Foco: 0.5 }]);
  });

  it("foco nulo devolve vazio", () => {
    const r = montarComparativo({ ...base, foco: null });
    expect(r).toEqual({ data: [], focusSeries: null, peerSeries: [], pinnedSeries: [] });
  });
});

describe("descreverPares", () => {
  it("descreve o grupo quando ha pares", () => {
    expect(descreverPares({ foco: FOCO, pares: [PAR, PAR], criterio_pares: "mesma UF · faixa FPM X" }))
      .toBe("Foco vs. 2 pares · mesma UF · faixa FPM X");
  });

  it("um par no singular", () => {
    expect(descreverPares({ foco: FOCO, pares: [PAR], criterio_pares: "mesma UF" }))
      .toBe("Foco vs. 1 par · mesma UF");
  });

  it("explica cada motivo em vez de calar", () => {
    expect(descreverPares({ foco: FOCO, pares: [], motivo: "sem_pares" }))
      .toBe("Foco · nenhum município par encontrado");
    expect(descreverPares({ foco: FOCO, pares: [], motivo: "sem_populacao" }))
      .toBe("Foco · sem população cadastrada, não há como escolher pares");
    expect(descreverPares({ foco: null, pares: [], motivo: "sem_municipio" }))
      .toBe("selecione um município");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run (de `frontend-observatorio/`): `npx vitest run src/utils/seriesComparativo.test.js`
Expected: FAIL — `Failed to resolve import "./seriesComparativo"`

- [ ] **Step 3: Implementar**

Criar `frontend-observatorio/src/utils/seriesComparativo.js`:

```js
/**
 * Monta as séries do comparativo por pares a partir do envelope do backend
 * (`{ foco, pares, fixados, criterio_pares, motivo, itens }`).
 *
 * Duas regras carregam peso aqui:
 *  - o domínio de anos é o do FOCO — ano que o foco não tem não vira coluna,
 *    senão a linha em destaque abriria buracos por causa de um par;
 *  - município sem dado num ano fica AUSENTE da linha, nunca 0. O gráfico
 *    desenha buraco; zero desenharia um tombo que não aconteceu.
 */

const MOTIVOS = {
  sem_municipio: "selecione um município",
  sem_populacao: "sem população cadastrada, não há como escolher pares",
  sem_pares: "nenhum município par encontrado",
};

// Homônimos entre UFs (Bom Jesus/PI e Bom Jesus/RS) colidiriam no pivot por nome.
function rotular(refs) {
  const contagem = new Map();
  refs.forEach((r) => contagem.set(r.nome, (contagem.get(r.nome) || 0) + 1));
  return new Map(
    refs.map((r) => [r.municipio_id, contagem.get(r.nome) > 1 ? `${r.nome} (${r.estado})` : r.nome])
  );
}

export function montarComparativo({ itens, foco, pares, fixados, anoKey, valorKey }) {
  const vazio = { data: [], focusSeries: null, peerSeries: [], pinnedSeries: [] };
  if (!foco) return vazio;

  const refs = [foco, ...(pares || []), ...(fixados || [])];
  const nomeDe = rotular(refs);
  const linhas = itens || [];

  const anosFoco = [
    ...new Set(linhas.filter((i) => i.municipio_id === foco.municipio_id).map((i) => i[anoKey])),
  ].sort((a, b) => a - b);

  const porAno = new Map(anosFoco.map((ano) => [ano, { label: String(ano) }]));
  linhas.forEach((i) => {
    const linha = porAno.get(i[anoKey]);
    const nome = nomeDe.get(i.municipio_id);
    if (!linha || !nome) return;
    const v = i[valorKey];
    if (v == null) return;
    linha[nome] = v;
  });

  return {
    data: [...porAno.values()],
    focusSeries: nomeDe.get(foco.municipio_id),
    peerSeries: (pares || []).map((p) => nomeDe.get(p.municipio_id)),
    pinnedSeries: (fixados || []).map((f) => nomeDe.get(f.municipio_id)),
  };
}

/** Subtítulo do painel: diz quem é o foco, quantos pares e por qual critério —
 *  ou, quando não há pares, o motivo. Painel nenhum fica mudo. */
export function descreverPares({ foco, pares, criterio_pares, motivo }) {
  if (!foco) return MOTIVOS[motivo] || MOTIVOS.sem_municipio;
  const n = (pares || []).length;
  if (!n) return `${foco.nome} · ${MOTIVOS[motivo] || MOTIVOS.sem_pares}`;
  const plural = n === 1 ? "par" : "pares";
  return criterio_pares
    ? `${foco.nome} vs. ${n} ${plural} · ${criterio_pares}`
    : `${foco.nome} vs. ${n} ${plural}`;
}
```

- [ ] **Step 4: Rodar os testes**

Run (de `frontend-observatorio/`): `npx vitest run src/utils/seriesComparativo.test.js`
Expected: PASS — 10 testes

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/utils/seriesComparativo.js frontend-observatorio/src/utils/seriesComparativo.test.js
git commit -m "feat(comparativo): util puro que monta series de foco + pares"
```

---

### Task 8: `MunicipioPicker` — infra de teste de componente e conserto do espaço

**Files:**
- Modify: `frontend-observatorio/package.json` (devDependencies)
- Modify: `frontend-observatorio/src/components/nid/MunicipioPicker.jsx:99-141`
- Test: `frontend-observatorio/src/components/nid/MunicipioPicker.test.jsx`

**Interfaces:**
- Produces: nenhuma mudança de API — as props (`municipios`, `value`, `onChange`, `placeholder`, `ariaLabel`) e o comportamento de teclado seguem iguais. Muda só a marcação.

- [ ] **Step 1: Instalar as dependências de teste de DOM**

Run (de `frontend-observatorio/`):

```bash
npm install -D jsdom @testing-library/react @testing-library/user-event
```

`vitest.config.js` **não muda**: o ambiente global segue `node` e só os arquivos de componente pedem jsdom por docblock, para os testes puros não ficarem mais lentos.

- [ ] **Step 2: Escrever o teste que falha**

Criar `frontend-observatorio/src/components/nid/MunicipioPicker.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MunicipioPicker from "./MunicipioPicker";

const MUNICIPIOS = [
  { id: 1, nome: "Bom Jesus", estado: "PI", codigo_ibge: "2201901" },
  { id: 2, nome: "Bom Despacho", estado: "MG", codigo_ibge: "3107703" },
  { id: 3, nome: "Uberlândia", estado: "MG", codigo_ibge: "3170206" },
];

afterEach(cleanup);

function montar(props = {}) {
  const onChange = vi.fn();
  render(<MunicipioPicker municipios={MUNICIPIOS} value="" onChange={onChange} {...props} />);
  return { onChange, user: userEvent.setup() };
}

const abrir = async (user) => {
  await user.click(screen.getByRole("button", { name: /selecionar município/i }));
  return screen.getByRole("textbox");
};

describe("MunicipioPicker", () => {
  it("barra de espaco escreve na busca e NAO fecha a lista", async () => {
    const { user } = montar();
    const input = await abrir(user);

    await user.type(input, "bom ");

    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(input.value).toBe("bom ");
    expect(screen.getAllByRole("option").length).toBe(2);
  });

  it("nenhum controle interativo fica aninhado em button, aberto ou fechado", async () => {
    const { user } = montar({ value: "3" });
    const semAninhamento = () =>
      [...document.querySelectorAll("button")].forEach((b) => {
        expect(b.querySelector("input, button, select, a, textarea")).toBeNull();
      });

    semAninhamento();            // fechado: o "limpar" não pode estar dentro do gatilho
    await abrir(user);
    semAninhamento();            // aberto: o campo de busca não pode estar dentro de button
  });

  it("setas movem o destaque e Enter escolhe", async () => {
    const { user, onChange } = montar();
    const input = await abrir(user);

    await user.type(input, "bom");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2");   // Bom Despacho
  });

  it("Escape fecha a lista", async () => {
    const { user } = montar();
    const input = await abrir(user);
    await user.type(input, "{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("limpar dispara onChange vazio sem reabrir a lista", async () => {
    const { user, onChange } = montar({ value: "3" });
    await user.click(screen.getByRole("button", { name: /limpar seleção/i }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar para confirmar que falha pelo motivo certo**

Run (de `frontend-observatorio/`): `npx vitest run src/components/nid/MunicipioPicker.test.jsx`
Expected: FAIL nos dois primeiros testes — `getByRole("listbox")` não encontra nada depois do espaço (o `<button>` pai foi ativado e fechou a lista), e a varredura acha o `<input>` dentro do `<button>`. Esta é a reprodução do bug relatado.

- [ ] **Step 4: Corrigir a marcação**

Substituir o `return` de `frontend-observatorio/src/components/nid/MunicipioPicker.jsx` (linhas 99-141, do `<div className="nid-municipio-picker">` até o `</button>` do gatilho) por:

```jsx
  return (
    <div
      className="nid-municipio-picker"
      ref={wrapRef}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls="municipio-picker-list"
      aria-activedescendant={open && filtered[activeIdx] ? `municipio-opt-${activeIdx}` : undefined}
    >
      {/* Fechado vira <button>, aberto vira <div> com o input. Os dois nunca
          coexistem: input dentro de button faz a barra de espaço ativar o botão
          (e fechar a lista), além de ser marcação inválida. */}
      {open ? (
        <div className="nid-municipio-picker__trigger is-open">
          <MagnifyingGlassIcon className="nid-municipio-picker__icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar município…"
            className="nid-municipio-picker__input"
            aria-autocomplete="list"
            aria-controls="municipio-picker-list"
          />
          <ChevronDownIcon className="nid-municipio-picker__chevron" />
        </div>
      ) : (
        <div className="nid-municipio-picker__trigger">
          <button
            type="button"
            className="nid-municipio-picker__campo"
            onClick={openAndFocus}
            aria-label={ariaLabel}
          >
            <MagnifyingGlassIcon className="nid-municipio-picker__icon" />
            <span className={`nid-municipio-picker__display ${!selected ? "is-placeholder" : ""}`}>
              {selected ? `${selected.nome} — ${selected.estado}` : placeholder}
            </span>
          </button>
          {selected && (
            <button
              type="button"
              aria-label="Limpar seleção"
              className="nid-municipio-picker__clear"
              onClick={() => onChange("")}
            >
              <XMarkIcon style={{ width: 14, height: 14 }} />
            </button>
          )}
          <ChevronDownIcon className="nid-municipio-picker__chevron" />
        </div>
      )}
```

Ajustar `handleKeyDown` para não deixar tecla nenhuma escapar para fora do combobox:

```jsx
  const handleKeyDown = (e) => {
    // Cinto e suspensório: mesmo sem <button> ancestral, nenhuma tecla da busca
    // deve disparar atalho de container acima.
    e.stopPropagation();
    if (e.key === "ArrowDown") {
```

E dar id a cada opção, para o `aria-activedescendant` apontar para algo — na `<li>` (linha 158) acrescentar `id={`municipio-opt-${i}`}`.

- [ ] **Step 5: Ajustar o CSS do gatilho**

`.nid-municipio-picker__trigger` (`themes.css:2372-2386`) já é `display:flex` com borda, fundo e altura — continua valendo tal e qual para o `<div>`. Só falta a classe do botão interno, que precisa desaparecer visualmente e esticar. Acrescentar em `frontend-observatorio/src/styles/themes.css` logo depois do bloco `__trigger.is-open` (linha 2391):

```css
/* O gatilho virou <div> (input dentro de button faz a barra de espaço fechar a
   lista); este é o botão interno que abre o seletor — some visualmente e ocupa
   o espaço que o antigo <button> ocupava. */
.nid-municipio-picker__campo {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  height: 100%;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: inherit;
}
```

- [ ] **Step 6: Rodar os testes**

Run (de `frontend-observatorio/`): `npx vitest run src/components/nid/MunicipioPicker.test.jsx`
Expected: PASS — 5 testes

- [ ] **Step 7: Conferir na tela**

Run (de `frontend-observatorio/`): `npm run dev` e abrir a página de IPS. Verificar: o campo Município abre, aceita "bom jesus" **com espaço** sem fechar, filtra, seleciona com Enter e com clique, e o "×" limpa. Conferir também uma tela de admin (Insights) para garantir que o CSS não quebrou.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/package.json frontend-observatorio/package-lock.json frontend-observatorio/src/components/nid/MunicipioPicker.jsx frontend-observatorio/src/components/nid/MunicipioPicker.test.jsx frontend-observatorio/src/styles/themes.css
git commit -m "fix(picker): busca de municipio nao fecha mais ao apertar espaco"
```

---

### Task 9: `MultiLineChart` — buracos de série, séries fixadas e legenda de tamanho fixo

**Files:**
- Modify: `frontend-observatorio/src/components/nid/charts.jsx` — `InlineLegend` (464-481) e `MultiLineChart` (646-1124)

**Interfaces:**
- Consumes: nada de tasks anteriores
- Produces: props novas de `MultiLineChart` — `pinnedSeries: string[] = []`, `legendMax: number = 8`, `peerCount?: number`. `InlineLegend` passa a aceitar `items[].kind` (`"solid" | "dash" | "band"`) e `max`.

- [ ] **Step 1: Tratar buraco de série em vez de virar zero**

Em `MultiLineChart`, trocar as leituras que assumem número:

`allVals` (linha 746) — valor ausente não pode puxar o domínio Y para zero:

```jsx
  const allVals = [
    ...data.flatMap((d) => series.map((s) => d[s]).filter((v) => v != null && !isNaN(v))),
    ...forecastValsBySeries.flat(),
    ...(resolvedBenchmark?.value != null ? [resolvedBenchmark.value] : []),
  ];
```

`ptsBySeries` (linha 759) — ponto ausente vira `null`:

```jsx
  const ptsBySeries = series.map((s) =>
    data.map((d, i) => {
      const v = d[s];
      return v == null || isNaN(v) ? null : { x: sx(i), y: sy(v), v };
    })
  );
```

Acrescentar um helper ao lado de `smoothPath` (após a linha 70):

```jsx
// Quebra a série em trechos contíguos: `null` é ano sem dado, não zero. Sem
// isso a linha desceria até o eixo e desenharia um tombo que não aconteceu.
const trechos = (pts) => {
  const out = [];
  let atual = [];
  for (const p of pts) {
    if (p) atual.push(p);
    else if (atual.length) { out.push(atual); atual = []; }
  }
  if (atual.length) out.push(atual);
  return out;
};
```

- [ ] **Step 2: Desenhar por trecho, com ponto isolado visível**

Trocar os três lugares que chamam `smoothPath(pts)` em `MultiLineChart` por um render por trecho. Peer lines (887-906):

```jsx
            {ptsBySeries.map((pts, si) => {
              if (si === focusIdx || pinned.has(series[si])) return null; // depois
              const isHov = hoverSeries === si;
              return (
                <g key={si}
                  onMouseEnter={() => setHoverSeries(si)}
                  onMouseLeave={() => setHoverSeries(null)}>
                  {trechos(pts).map((seg, k) => (
                    seg.length === 1
                      ? <circle key={k} cx={seg[0].x} cy={seg[0].y} r="2"
                          fill={isHov ? "var(--accent-1)" : colorFor(si)} opacity={isHov ? 1 : 0.55} />
                      : <path key={k}
                          d={smoothPath(seg)}
                          stroke={isHov ? "var(--accent-1)" : colorFor(si)}
                          strokeWidth={strokeFor(si, isHov)}
                          fill="none" strokeLinecap="round"
                          opacity={isHov ? 1 : 0.55}
                          style={{ transition: "stroke 0.15s, opacity 0.15s" }} />
                  ))}
                  {trechos(pts).map((seg, k) => (
                    seg.length > 1 &&
                    <path key={`hit-${k}`} d={smoothPath(seg)} stroke="transparent" strokeWidth="12" fill="none" />
                  ))}
                </g>
              );
            })}
```

Linhas fixadas, entre os pares e o foco — cor própria, espessura de linha real:

```jsx
            {ptsBySeries.map((pts, si) => {
              if (!pinned.has(series[si]) || si === focusIdx) return null;
              return (
                <g key={`pin-${si}`}>
                  {trechos(pts).map((seg, k) => (
                    seg.length === 1
                      ? <circle key={k} cx={seg[0].x} cy={seg[0].y} r="3" fill={colorFor(si)} />
                      : <path key={k} d={smoothPath(seg)} stroke={colorFor(si)}
                          strokeWidth={2} fill="none" strokeLinecap="round" />
                  ))}
                </g>
              );
            })}
```

Linha em foco (927-936) e o render legacy (953-957) recebem o mesmo tratamento de trecho.

- [ ] **Step 3: Dar cor própria às séries fixadas**

Acrescentar as props e ajustar `colorFor` / `strokeFor` / `focusedLast`:

```jsx
export function MultiLineChart({
  ...
  pinnedSeries = [],   // séries que o usuário fixou: cor própria, não são "contexto"
  legendMax = 8,       // teto da legenda fora do modo foco
  peerCount,           // nº de pares por trás da mediana/faixa (default: séries de par)
  ...
}) {
```

```jsx
  const pinned = new Set(pinnedSeries || []);

  const colorFor = (si) => {
    if (!focusMode) return (colors || [])[si] || "var(--accent-1)";
    if (si === focusIdx) return resolvedFocusColor;
    if (pinned.has(series[si])) return (colors || [])[si] || "var(--accent-1)";
    return "rgba(120,145,255,.28)";
  };

  const strokeFor = (si, isHovered) => {
    if (!focusMode) return 2;
    if (si === focusIdx) return 2.5;
    if (pinned.has(series[si])) return 2;
    return isHovered ? 1.8 : 1.2;
  };
```

`focusedLast` (768) precisa do último ponto **não nulo**:

```jsx
  const focusedLast = focusedPts ? [...focusedPts].reverse().find(Boolean) || null : null;
```

Mediana e faixa devem ignorar os fixados — eles são escolha do usuário, não amostra:

```jsx
  const seriesDePar = series.filter((s) => s !== focusSeries && !pinned.has(s));
```

e usar `seriesDePar` no lugar de `series.filter((s) => s !== focusSeries)` em `medianAt` (772-773) e no `peerSeries` do bloco de faixa (793).

- [ ] **Step 4: Blindar os pontos de hover e as anotações contra `null`**

Hover dots (999-1015): pular série sem ponto no índice —

```jsx
            {!isHoverForecast && ptsBySeries.map((pts, si) => {
              const p = pts[hover];
              if (!p) return null;
              ...
```

Anotações de faixa (871-872) e de ponto (1034) usam `ptsBySeries[0][i]`, que agora pode ser `null`. Trocar por posições calculadas direto na escala:

```jsx
            <rect key={`band-${i}`} x={sx(i0)} y={padT} width={sx(i1) - sx(i0)} height={innerH} ... />
```

```jsx
          const p = ptsBySeries[0][idx] || { x: sx(idx), y: padT + innerH / 2 };
```

Tooltip (1077, 1080 e 1113): valor ausente aparece como `—`, não como zero —

```jsx
              const focusValue = focusIdx >= 0 ? (data[hover][focusSeries] ?? null) : null;
```

```jsx
                .map((s) => ({ name: s, value: data[hover][s] }))
```

e a linha do foco (1091) passa a `{focusValue == null ? "—" : tipFmt(focusValue)}`.

```jsx
                      <span>{p.value == null ? "—" : tipFmt(p.value)}</span>
```

e no ramo legacy:

```jsx
                <span>{data[hover][s] == null ? "—" : tipFmt(data[hover][s])}</span>
```

- [ ] **Step 5: Legenda de tamanho fixo**

Substituir `InlineLegend` (464-481) por uma versão com `kind` e `max`:

```jsx
function InlineLegend({ items, max }) {
  if (!items || items.length === 0) return null;
  const mostrados = max ? items.slice(0, max) : items;
  const ocultos = items.length - mostrados.length;
  const swatch = (it) => {
    if (it.kind === "dash")
      return { width: 14, height: 0, borderTop: `2px dashed ${it.color}`, borderRadius: 0 };
    if (it.kind === "band")
      return { width: 14, height: 10, background: it.color, borderRadius: 2, opacity: 0.5 };
    return { width: 10, height: 10, background: it.color, borderRadius: 3 };
  };
  return (
    <ul
      style={{
        listStyle: "none", margin: "12px 0 0", padding: 0, width: "100%",
        display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "center",
      }}
    >
      {mostrados.map((it, i) => (
        <li key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)" }}>
          <span style={{ ...swatch(it), flexShrink: 0 }} />
          <span style={{ whiteSpace: "nowrap" }}>{it.name}</span>
        </li>
      ))}
      {/* Truncar sim, truncar calado não. */}
      {ocultos > 0 && (
        <li style={{ fontSize: 12, color: "var(--text-mute)", whiteSpace: "nowrap" }}>
          +{ocultos} séries
        </li>
      )}
    </ul>
  );
}
```

E trocar o render da legenda de `MultiLineChart` (1119-1121) por:

```jsx
      {legend && (focusMode ? (
        <InlineLegend items={[
          { name: focusSeries, color: resolvedFocusColor },
          ...(showMedian ? [{
            name: `mediana (${peerCount ?? seriesDePar.length} pares)`,
            color: "var(--text-dim)", kind: "dash",
          }] : []),
          ...(showBand ? [{ name: "faixa dos pares", color: "rgba(120,145,255,.6)", kind: "band" }] : []),
          ...(pinnedSeries || []).map((s) => ({ name: s, color: colorFor(series.indexOf(s)) })),
        ]} />
      ) : (
        <InlineLegend
          items={series.map((s, si) => ({ name: s, color: (colors || [])[si] || "var(--accent-1)" }))}
          max={legendMax}
        />
      ))}
```

- [ ] **Step 6: Limitar as linhas do tooltip em modo foco**

O bloco de peers do tooltip (1094-1099) hoje ordena por valor decrescente e lista todos. Passa a ordenar por **proximidade ao valor do foco** — com 9 linhas possíveis, as úteis são as que cercam o município em destaque, não as maiores. Trocar o `.sort()` da linha 1081 por:

```jsx
                .sort((a, b) =>
                  Math.abs((a.value ?? 0) - (focusValue ?? 0)) -
                  Math.abs((b.value ?? 0) - (focusValue ?? 0))
                );
```

e cortar em 8 com aviso:

```jsx
                  {peers.slice(0, 8).map((p) => (
                    <div className="tip-row" key={p.name} style={{ opacity: 0.7 }}>
                      <span className="name">{p.name}</span>
                      <span>{p.value == null ? "—" : tipFmt(p.value)}</span>
                    </div>
                  ))}
                  {peers.length > 8 && (
                    <div className="tip-row" style={{ opacity: 0.5, fontSize: 11 }}>
                      <span className="name">… e mais {peers.length - 8}</span>
                      <span />
                    </div>
                  )}
```

- [ ] **Step 7: Rodar a suite de frontend e o lint**

Run (de `frontend-observatorio/`): `npm test` e `npm run lint`
Expected: PASS nos dois. `src/utils/chartHover.test.js` e `chartScale.test.js` continuam verdes.

- [ ] **Step 8: Conferir na tela que nenhum gráfico existente regrediu**

Run: `npm run dev` e abrir PIX, ESTBAN e CAGED — os três usam `MultiLineChart` com séries de período e valores que passam por zero. Confirmar que a linha de saldo do CAGED continua cruzando o zero normalmente (zero real ≠ ausente).

- [ ] **Step 9: Commit**

```bash
git add frontend-observatorio/src/components/nid/charts.jsx
git commit -m "feat(charts): buraco de serie, series fixadas e legenda de tamanho fixo no MultiLineChart"
```

---

### Task 10: Componente `ComparadorMunicipios`

**Files:**
- Create: `frontend-observatorio/src/components/nid/ComparadorMunicipios.jsx`
- Test: `frontend-observatorio/src/components/nid/ComparadorMunicipios.test.jsx`

**Interfaces:**
- Consumes: `MunicipioPicker` (Task 8), `GET /municipios/selecionaveis` (Task 6)
- Produces: `<ComparadorMunicipios fixados={[{municipio_id, nome, estado}]} onChange={(ids: number[]) => void} max={3} />`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend-observatorio/src/components/nid/ComparadorMunicipios.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComparadorMunicipios from "./ComparadorMunicipios";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [
    { id: 1, nome: "Contagem", estado: "MG" },
    { id: 2, nome: "Betim", estado: "MG" },
  ] })) },
}));

import api from "../../services/api";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ComparadorMunicipios", () => {
  it("so busca a lista quando o usuario abre o seletor", async () => {
    const user = userEvent.setup();
    render(<ComparadorMunicipios fixados={[]} onChange={() => {}} />);

    expect(api.get).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /comparar com/i }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/municipios/selecionaveis"));
  });

  it("escolher um municipio devolve os ids acumulados", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ComparadorMunicipios fixados={[{ municipio_id: 9, nome: "Betim", estado: "MG" }]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /comparar com/i }));
    await user.click(await screen.findByRole("button", { name: /selecionar município/i }));
    await user.click(await screen.findByText("Contagem"));

    expect(onChange).toHaveBeenCalledWith([9, 1]);
  });

  it("remover um chip devolve a lista sem ele", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ComparadorMunicipios
        fixados={[{ municipio_id: 9, nome: "Betim", estado: "MG" },
                  { municipio_id: 8, nome: "Contagem", estado: "MG" }]}
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole("button", { name: /remover Betim/i }));
    expect(onChange).toHaveBeenCalledWith([8]);
  });

  it("no teto, esconde o seletor e diz por que", () => {
    render(
      <ComparadorMunicipios
        max={2}
        fixados={[{ municipio_id: 9, nome: "Betim", estado: "MG" },
                  { municipio_id: 8, nome: "Contagem", estado: "MG" }]}
        onChange={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /comparar com/i })).toBeNull();
    expect(screen.getByText(/máximo de 2/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run (de `frontend-observatorio/`): `npx vitest run src/components/nid/ComparadorMunicipios.test.jsx`
Expected: FAIL — `Failed to resolve import "./ComparadorMunicipios"`

- [ ] **Step 3: Implementar**

Criar `frontend-observatorio/src/components/nid/ComparadorMunicipios.jsx`:

```jsx
import { useState } from "react";
import api from "../../services/api";
import MunicipioPicker from "./MunicipioPicker";

/**
 * "Comparar com…": fixa municípios extras num comparativo, além dos pares
 * automáticos. A lista de municípios só é buscada quando o usuário abre o
 * seletor — são ~5.500 linhas que não devem pesar no carregamento da página.
 */
export default function ComparadorMunicipios({ fixados = [], onChange, max = 3 }) {
  const [aberto, setAberto] = useState(false);
  const [opcoes, setOpcoes] = useState([]);
  const noTeto = fixados.length >= max;

  const abrir = () => {
    setAberto(true);
    if (!opcoes.length) {
      api.get("/municipios/selecionaveis")
        .then((r) => setOpcoes(r.data || []))
        .catch(() => setOpcoes([]));
    }
  };

  const escolher = (id) => {
    if (!id) return;
    const n = Number(id);
    if (fixados.some((f) => f.municipio_id === n)) return;
    onChange([...fixados.map((f) => f.municipio_id), n]);
    setAberto(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
      {fixados.map((f) => (
        <span
          key={f.municipio_id}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border"
          style={{ background: "var(--panel-2)", borderColor: "var(--accent-1)", color: "var(--accent-1)" }}
        >
          {f.nome} — {f.estado}
          <button
            type="button"
            aria-label={`remover ${f.nome}`}
            onClick={() => onChange(fixados.filter((x) => x.municipio_id !== f.municipio_id)
                                          .map((x) => x.municipio_id))}
            className="ml-1 hover:opacity-70 cursor-pointer"
          >
            ✕
          </button>
        </span>
      ))}

      {noTeto ? (
        <span className="text-xs" style={{ color: "var(--text-mute)" }}>
          máximo de {max} municípios fixados
        </span>
      ) : aberto ? (
        <div style={{ minWidth: 240 }}>
          <MunicipioPicker
            municipios={opcoes}
            value=""
            onChange={escolher}
            placeholder="Escolha um município…"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className="px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          + comparar com…
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar os testes**

Run (de `frontend-observatorio/`): `npx vitest run src/components/nid/ComparadorMunicipios.test.jsx`
Expected: PASS — 4 testes

- [ ] **Step 5: Commit**

```bash
git add frontend-observatorio/src/components/nid/ComparadorMunicipios.jsx frontend-observatorio/src/components/nid/ComparadorMunicipios.test.jsx
git commit -m "feat(comparativo): componente comparar-com com carga sob demanda da lista"
```

---

### Task 11: `PibPage` consome o envelope

**Files:**
- Modify: `frontend-observatorio/src/pages/pib/PibPage.jsx` — estado e fetch (40-67), `comparativoChart`/`cidades`/`compData` (86-131), `vaData` (72-84), painel do comparativo (246-262)

**Interfaces:**
- Consumes: `montarComparativo`, `descreverPares` (Task 7), `ComparadorMunicipios` (Task 10), props novas de `MultiLineChart` (Task 9), envelope de `/pib/comparativo` (Task 4)

- [ ] **Step 1: Trocar o estado e o fetch**

Substituir o estado `comparativo` e o `useEffect` de carga:

```jsx
  const VAZIO = { foco: null, pares: [], fixados: [], criterio_pares: null, motivo: null, itens: [] };
  const [comp, setComp] = useState(VAZIO);
  const [fixadosIds, setFixadosIds] = useState([]);
```

```jsx
  useEffect(() => {
    Promise.all([
      api.get("/pib/serie"),
      api.get("/pib/resumo"),
      api.get("/pib/comparativo", {
        params: fixadosIds.length ? { fixados: fixadosIds.join(",") } : undefined,
      }),
    ])
      .then(([serieRes, resumoRes, compRes]) => {
        const raw = serieRes.data || [];
        setRawSerie(raw);
        setResumo(resumoRes.data);
        setComp(compRes.data || VAZIO);
        if (!filtroTocado.current) {
          setFilters(janela12m(raw, (d) => ({ ano: d.ano })));
        }
      })
      .catch((err) => console.error("Erro ao carregar PIB:", err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixadosIds]);
```

- [ ] **Step 2: Corrigir `vaData` e trocar o pivot manual pelo util**

`vaData` (72-84) hoje pega "a primeira cidade única do comparativo" para montar o Valor Adicionado por Setor. Com o envelope o foco é explícito:

```jsx
  // VA por setor é do município em FOCO — antes o código pegava "a primeira
  // cidade do comparativo", que virou uma cidade qualquer quando a rota passou
  // a devolver a base inteira.
  const vaData = useMemo(() => {
    if (!comp.foco) return [];
    return (comp.itens || [])
      .filter((d) => d.municipio_id === comp.foco.municipio_id)
      .filter((d) => {
        const { yearFrom, yearTo } = filters;
        if (yearFrom && d.ano < +yearFrom) return false;
        if (yearTo && d.ano > +yearTo) return false;
        return true;
      })
      .sort((a, b) => a.ano - b.ano);
  }, [comp, filters]);
```

Remover `comparativoChart`, `cidades` e `compData` (86-131) e pôr no lugar:

```jsx
  const cmp = useMemo(
    () => montarComparativo({
      itens: comp.itens, foco: comp.foco, pares: comp.pares, fixados: comp.fixados,
      anoKey: "ano", valorKey: "pib_total",
    }),
    [comp]
  );
  const seriesComp = useMemo(
    () => (cmp.focusSeries ? [cmp.focusSeries, ...cmp.peerSeries, ...cmp.pinnedSeries] : []),
    [cmp]
  );
```

Acrescentar aos imports:

```jsx
import { montarComparativo, descreverPares } from "../../utils/seriesComparativo";
import ComparadorMunicipios from "../../components/nid/ComparadorMunicipios";
```

- [ ] **Step 3: Trocar o painel do comparativo**

Substituir o bloco 246-262:

```jsx
      {/* PIB Comparativo — foco + pares comparáveis */}
      {cmp.focusSeries && (
        <NidPanel title="PIB Comparativo — Municípios" sub={descreverPares(comp)}>
          <ComparadorMunicipios fixados={comp.fixados} onChange={setFixadosIds} />
          <MultiLineChart
            data={cmp.data}
            series={seriesComp}
            colors={seriesComp.map((_, i) => `var(--accent-${(i % 5) + 1})`)}
            height={280}
            yFmt={fmtMoneyShort}
            tipFmt={fmtMoneyFull}
            focusSeries={cmp.focusSeries}
            pinnedSeries={cmp.pinnedSeries}
            peerCount={cmp.peerSeries.length}
            showMedian
            showBand
            legend
          />
        </NidPanel>
      )}
```

`ownCity` (linha 34) fica órfão — remover a constante e o `useAuth` se nenhum outro trecho do arquivo usar `user`.

- [ ] **Step 4: Rodar lint e testes**

Run (de `frontend-observatorio/`): `npm run lint` e `npm test`
Expected: PASS

- [ ] **Step 5: Conferir na tela**

Run: `npm run dev`, entrar como ADMIN_GLOBAL, escolher um município no view-as e abrir PIB. Confirmar: o gráfico mostra a cidade em destaque + até 6 linhas cinzas + mediana tracejada + faixa; a legenda tem 3 itens fixos; o subtítulo diz o critério; "comparar com…" adiciona uma linha colorida e um item na legenda. Entrar depois com um usuário de município e confirmar que o painel também aparece.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/pib/PibPage.jsx
git commit -m "feat(pib): pagina usa foco + pares e corrige o VA por setor"
```

---

### Task 12: `VafPage` consome o envelope

**Files:**
- Modify: `frontend-observatorio/src/pages/vaf/VafPage.jsx` — estado e fetch (~50-72), `comparativoChart`/`cidades`/`compData` (96-113), painel do comparativo (277-293)

**Interfaces:**
- Consumes: os mesmos de Task 11, com `anoKey: "ano_base"` e `valorKey: "indice_participacao_municipal"`

- [ ] **Step 1: Trocar o estado e o fetch**

Mesmo padrão de Task 11, sobre `/vaf/comparativo`:

```jsx
  const VAZIO = { foco: null, pares: [], fixados: [], criterio_pares: null, motivo: null, itens: [] };
  const [comp, setComp] = useState(VAZIO);
  const [fixadosIds, setFixadosIds] = useState([]);
```

No `Promise.all`, trocar a chamada de comparativo por:

```jsx
      api.get("/vaf/comparativo", {
        params: fixadosIds.length ? { fixados: fixadosIds.join(",") } : undefined,
      }),
```

e o handler por `setComp(compRes.data || VAZIO);`. Acrescentar `fixadosIds` ao array de dependências do `useEffect`, com o `// eslint-disable-next-line react-hooks/exhaustive-deps` acima.

- [ ] **Step 2: Trocar o pivot manual pelo util**

Remover `comparativoChart`, `cidades` e o `compData` correspondente (96-113) e pôr:

```jsx
  const cmp = useMemo(
    () => montarComparativo({
      itens: comp.itens, foco: comp.foco, pares: comp.pares, fixados: comp.fixados,
      anoKey: "ano_base", valorKey: "indice_participacao_municipal",
    }),
    [comp]
  );
  const seriesComp = useMemo(
    () => (cmp.focusSeries ? [cmp.focusSeries, ...cmp.peerSeries, ...cmp.pinnedSeries] : []),
    [cmp]
  );
```

Imports:

```jsx
import { montarComparativo, descreverPares } from "../../utils/seriesComparativo";
import ComparadorMunicipios from "../../components/nid/ComparadorMunicipios";
```

- [ ] **Step 3: Trocar o painel do comparativo**

Substituir o bloco 277-293:

```jsx
      {/* IPM Comparativo — foco + pares comparáveis */}
      {cmp.focusSeries && (
        <NidPanel title="IPM Comparativo — Municípios" sub={descreverPares(comp)}>
          <ComparadorMunicipios fixados={comp.fixados} onChange={setFixadosIds} />
          <MultiLineChart
            data={cmp.data}
            series={seriesComp}
            colors={seriesComp.map((_, i) => `var(--accent-${(i % 5) + 1})`)}
            height={280}
            yFmt={fmtIndice}
            tipFmt={fmtIndice}
            focusSeries={cmp.focusSeries}
            pinnedSeries={cmp.pinnedSeries}
            peerCount={cmp.peerSeries.length}
            showMedian
            showBand
            legend
          />
        </NidPanel>
      )}
```

`ownCity` fica órfão — remover junto com `useAuth` se não houver outro uso de `user` no arquivo.

- [ ] **Step 4: Rodar lint e testes**

Run (de `frontend-observatorio/`): `npm run lint` e `npm test`
Expected: PASS

- [ ] **Step 5: Conferir na tela**

Run: `npm run dev` e abrir VAF com um município de MG selecionado (o VAF é dataset de Minas). Mesmas conferências de Task 11, sobre o IPM.

- [ ] **Step 6: Commit**

```bash
git add frontend-observatorio/src/pages/vaf/VafPage.jsx
git commit -m "feat(vaf): pagina de IPM usa foco + pares"
```

---

### Task 13: `DashboardGeralPage` consome o envelope e corrige o VA por setor

**Files:**
- Modify: `frontend-observatorio/src/pages/DashboardGeralPage.jsx` — estado `pibComparativo` (77, 110), `vaSetorData` (129-141), `comparativoCidades` (143-154), painel (379-396)

**Interfaces:**
- Consumes: `montarComparativo`, `descreverPares` (Task 7), props novas de `MultiLineChart` (Task 9), envelope de `/pib/comparativo` (Task 4)

- [ ] **Step 1: Trocar o estado**

```jsx
  const [pibComp, setPibComp] = useState({ foco: null, pares: [], fixados: [], criterio_pares: null, motivo: null, itens: [] });
```

e no handler do `Promise.all` (linha 110): `setPibComp(pibCompRes || { foco: null, pares: [], fixados: [], criterio_pares: null, motivo: null, itens: [] });`

- [ ] **Step 2: Corrigir `vaSetorData`**

O bloco 129-141 soma o Valor Adicionado de **todos** os municípios do payload e apresenta como "Decomposição setorial" do município. Com o envelope, o foco é explícito:

```jsx
  const vaSetorData = useMemo(() => {
    // Decomposição do município em FOCO. Antes somava todos os municípios do
    // payload, o que virou "o Brasil inteiro" quando a rota passou a devolver
    // a base completa para ADMIN_GLOBAL.
    if (!pibComp.foco) return [];
    const grouped = new Map();
    (pibComp.itens || [])
      .filter((r) => r.municipio_id === pibComp.foco.municipio_id)
      .forEach((r) => {
        if (!grouped.has(r.ano)) grouped.set(r.ano, { label: String(r.ano), Agropecuária: 0, Indústria: 0, Serviços: 0, Governo: 0 });
        const row = grouped.get(r.ano);
        row.Agropecuária += Number(r.va_agropecuaria) || 0;
        row.Indústria   += Number(r.va_industria)   || 0;
        row.Serviços    += Number(r.va_servicos)    || 0;
        row.Governo     += Number(r.va_governo)     || 0;
      });
    return Array.from(grouped.values()).sort((a, b) => Number(a.label) - Number(b.label));
  }, [pibComp]);
```

- [ ] **Step 3: Trocar `comparativoCidades` pelo util**

Substituir 143-154 por:

```jsx
  const cmp = useMemo(
    () => montarComparativo({
      itens: pibComp.itens, foco: pibComp.foco, pares: pibComp.pares, fixados: pibComp.fixados,
      anoKey: "ano", valorKey: "pib_total",
    }),
    [pibComp]
  );
  const seriesComp = useMemo(
    () => (cmp.focusSeries ? [cmp.focusSeries, ...cmp.peerSeries, ...cmp.pinnedSeries] : []),
    [cmp]
  );
```

Import: `import { montarComparativo, descreverPares } from "../utils/seriesComparativo";`

- [ ] **Step 4: Trocar o painel**

Substituir 379-396:

```jsx
          <NidPanel title="PIB Comparativo" sub={descreverPares(pibComp)}>
            <MultiLineChart
              data={cmp.data}
              series={seriesComp}
              colors={[A3, A1, A4, A2]}
              glow
              height={260}
              syncGroup="annual"
              focusSeries={cmp.focusSeries}
              peerCount={cmp.peerSeries.length}
              showMedian
              showBand
              legend
            />
          </NidPanel>
```

O `<NidLegend>` avulso (393-395) sai: a legenda passa a vir do próprio gráfico, de tamanho fixo. Este painel não recebe `ComparadorMunicipios` — o dashboard geral é visão de abertura, e fixar município é ação das páginas de detalhe.

- [ ] **Step 5: Rodar lint e testes**

Run (de `frontend-observatorio/`): `npm run lint` e `npm test`
Expected: PASS

- [ ] **Step 6: Conferir na tela**

Run: `npm run dev` e abrir o Dashboard Geral como ADMIN_GLOBAL **sem** view-as: os painéis de PIB Comparativo e VA por Setor devem ficar vazios com a mensagem "selecione um município", em vez de somar o país inteiro. Depois, com view-as escolhido, os dois devem mostrar o município.

- [ ] **Step 7: Rodar a verificação final completa**

Run (de `backend/`): `python -m pytest`
Run (de `frontend-observatorio/`): `npm test` e `npm run lint`
Expected: PASS nos três.

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/DashboardGeralPage.jsx
git commit -m "feat(dashboard): PIB comparativo por pares e VA por setor do municipio em foco"
```
