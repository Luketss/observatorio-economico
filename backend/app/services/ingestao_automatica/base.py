from dataclasses import dataclass, field
from typing import Callable


@dataclass
class ResumoIngestao:
    dataset: str
    municipios_ok: int = 0
    municipios_erro: int = 0
    linhas: int = 0
    notificacoes: int = 0
    erros: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class FonteAutomatica:
    key: str          # dataset key (ex.: "populacao")
    label: str        # nome exibido no admin
    fonte: str        # texto default para DatasetInfo.fonte
    executar: Callable  # (db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao


FONTES_AUTOMATICAS: dict[str, FonteAutomatica] = {}


def registrar(fonte: FonteAutomatica) -> FonteAutomatica:
    FONTES_AUTOMATICAS[fonte.key] = fonte
    return fonte
