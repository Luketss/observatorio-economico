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
    executar: Callable  # (db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao


FONTES_AUTOMATICAS: dict[str, FonteAutomatica] = {}


def registrar(fonte: FonteAutomatica) -> FonteAutomatica:
    FONTES_AUTOMATICAS[fonte.key] = fonte
    return fonte


# Key sintética do meta-job que encadeia todas as fontes em um único job.
# Reservada: nunca pode ser registrada como fonte real (teste garante).
DATASET_TODAS = "todas"

# Ordem do meta-job: populacao primeiro (o coeficiente estimado do FPM depende
# de população); captacao_federal e emendas por último (as mais lentas — o
# grosso dos dados aparece cedo). Teste garante paridade com FONTES_AUTOMATICAS.
ORDEM_EXECUCAO_TODAS = [
    "populacao",
    "fpm",
    "pib",
    "pix",
    "comex",
    "estban",
    "bolsa_familia",
    "pe_de_meia",
    "inss",
    "arrecadacao",
    "captacao_federal",
    "emendas",
]
