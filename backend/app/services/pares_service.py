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
