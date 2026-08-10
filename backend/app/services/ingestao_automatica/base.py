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
    # fonte que exige arquivo enviado pela tela (upload → ingestao_arquivo);
    # o runner passa arquivo_id= e o /executar normal responde 400
    requer_arquivo: bool = False


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
    "caged",
    "captacao_federal",
    "emendas",
]

# Fontes registradas que NÃO entram no meta-job "todas" (pesadas/anuais —
# rodam sob demanda). O teste de paridade referencia este set; o Ciclo C
# adicionou cnpj.
FONTES_FORA_DO_TODAS = frozenset({"rais", "cnpj"})
