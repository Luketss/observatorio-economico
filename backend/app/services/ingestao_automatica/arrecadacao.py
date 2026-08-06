"""Fonte 'arrecadacao' — roteador por UF (um card só, mesma key de sempre).

Agrupa os municípios-alvo por UF e despacha: MG → executar_mg (CKAN
dados.mg.gov.br), PR → executar_pr (SEFA/JSP), RS → executar_rs (Sefaz/.xls).
UF sem conector → 1 aviso agregado por UF (municípios contados em
municipios_erro). Os ResumoIngestao parciais são mesclados (somas; erros
concatenados com prefixo da UF). Falha de um conector NÃO derruba os outros
(isolamento por UF com rollback e erro audível). O progresso é repartido
proporcionalmente ao nº de municípios de cada UF."""
import logging

from app.services.ingestao_automatica.arrecadacao_mg import executar_mg
from app.services.ingestao_automatica.arrecadacao_pr import executar_pr
from app.services.ingestao_automatica.arrecadacao_rs import executar_rs
from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

CONECTORES = {"MG": executar_mg, "PR": executar_pr, "RS": executar_rs}


def agrupar_por_uf(municipios) -> dict[str, list]:
    grupos: dict[str, list] = {}
    for m in municipios:
        grupos.setdefault(((m.estado or "").upper() or "?"), []).append(m)
    return grupos


def mesclar_resumo(destino: ResumoIngestao, parcial: ResumoIngestao, uf: str) -> None:
    destino.municipios_ok += parcial.municipios_ok
    destino.municipios_erro += parcial.municipios_erro
    destino.linhas += parcial.linhas
    destino.notificacoes += parcial.notificacoes
    destino.erros.extend(f"{uf}: {e}" for e in parcial.erros)


def _progresso_da_uf(progresso, base: int, peso: int, total: int, uf: str):
    """Reescala o progresso de um conector para a fatia da sua UF."""
    if progresso is None:
        return None

    def cb(atual, total_uf, etapa):
        fracao = min(atual / total_uf, 1.0) if total_uf else 0.0
        progresso(base + round(fracao * peso), total, f"{uf}: {etapa}")
    return cb


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    resumo = ResumoIngestao(dataset="arrecadacao")
    grupos = agrupar_por_uf(municipios)
    total = len(municipios)
    base = 0
    for uf in sorted(grupos):
        grupo = grupos[uf]
        conector = CONECTORES.get(uf)
        if conector is None:
            resumo.erros.append(
                f"arrecadação: sem conector para UF {uf} — {len(grupo)} município(s) ignorado(s)")
            resumo.municipios_erro += len(grupo)
        else:
            try:
                parcial = conector(db, grupo, anos=anos, usuario_id=usuario_id,
                                   notificar=notificar,
                                   progresso=_progresso_da_uf(progresso, base, len(grupo), total, uf))
            except Exception as exc:  # isolamento por UF — nunca derruba as outras
                logger.exception("conector de arrecadação %s falhou", uf)
                db.rollback()  # não vazar transação abortada para a próxima UF
                resumo.erros.append(f"{uf}: conector falhou ({type(exc).__name__}: {exc})")
                resumo.municipios_erro += len(grupo)
            else:
                mesclar_resumo(resumo, parcial, uf)
        base += len(grupo)
    if progresso and total:
        progresso(total, total, "arrecadação concluída")
    return resumo


registrar(FonteAutomatica(
    key="arrecadacao",
    label="Arrecadação (repasses MG/PR/RS)",
    fonte="SEF-MG (dados.mg.gov.br), SEFA-PR (Portal da Transparência) e Sefaz-RS — "
          "repasses mensais de ICMS, IPVA e IPI/Fundo de Exportação aos municípios "
          "(RS não publica IPI-Exportação: valor_ipi=0)",
    executar=executar,
))
