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
