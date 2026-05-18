"""
Município management — clone all data between municípios, and cascade-delete a
município across the 48 dependent tables.

No FK constraints have `ondelete="CASCADE"` in this schema, so both operations
explicitly walk a registry of model classes.
"""
import logging
from typing import Dict

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models.arrecadacao import ArrecadacaoMensal
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.caged import (
    CagedIndicadoresContrato,
    CagedMovimentacao,
    CagedPorCnae,
    CagedPorEscolaridade,
    CagedPorFaixaEtaria,
    CagedPorRaca,
    CagedPorSexo,
    CagedPorTamanhoEstabelecimento,
    CagedPorTipoDeficiencia,
    CagedPorTipoEmpregador,
    CagedPorTipoEstabelecimento,
    CagedPorTipoMovimentacao,
    CagedSalario,
)
from app.models.comex import ComexMensal, ComexPorPais, ComexPorProduto
from app.models.dados_internos import EventoMunicipio, IndicadorInterno, PlanoGovAcao
from app.models.dashboard_card_custom import DashboardCardCustom
from app.models.desenvolvimento_economico import (
    CaptacaoRecurso,
    EmpresaRetencao,
    EscritaProjeto,
    InvestimentoFunil,
    Premiacao,
    VisitaRetencao,
)
from app.models.empresa import Empresa
from app.models.estban import EstbanMensal, EstbanPorInstituicao
from app.models.insight_ia import InsightIA
from app.models.inss import InssAnual
from app.models.ips import IpsMunicipio
from app.models.marco import Marco
from app.models.municipio import Municipio
from app.models.pe_de_meia import PeDeMeiaEtapa, PeDeMeiaResumo
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.projeto import Projeto
from app.models.rais import (
    RaisMetricasAnuais,
    RaisPorCbo,
    RaisPorCnae,
    RaisPorEscolaridade,
    RaisPorFaixaEtaria,
    RaisPorFaixaRemuneracao,
    RaisPorFaixaTempoEmprego,
    RaisPorMotivoDesligamento,
    RaisPorNaturezaJuridica,
    RaisPorRaca,
    RaisPorSexo,
    RaisPorTamanhoEstabelecimento,
    RaisPorTipoAdmissao,
    RaisVinculo,
    RaisTurnoverMensal,
)
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)


# Time-series / domain data — full copy is the value of the demo município.
DATASET_MODELS = [
    ArrecadacaoMensal, PibAnual, BolsaFamiliaResumo, PeDeMeiaResumo, PeDeMeiaEtapa,
    InssAnual, EstbanMensal, EstbanPorInstituicao,
    ComexMensal, ComexPorProduto, ComexPorPais,
    Empresa, PixMensal, IpsMunicipio,
    # CAGED variants
    CagedMovimentacao, CagedPorSexo, CagedPorRaca, CagedSalario, CagedPorCnae,
    CagedPorEscolaridade, CagedPorFaixaEtaria, CagedPorTipoMovimentacao,
    CagedPorTipoDeficiencia, CagedPorTamanhoEstabelecimento, CagedPorTipoEmpregador,
    CagedPorTipoEstabelecimento, CagedIndicadoresContrato,
    # RAIS variants
    RaisVinculo, RaisPorSexo, RaisPorRaca, RaisPorCnae, RaisPorFaixaEtaria,
    RaisPorEscolaridade, RaisPorFaixaRemuneracao, RaisPorFaixaTempoEmprego,
    RaisMetricasAnuais, RaisPorMotivoDesligamento, RaisPorTipoAdmissao,
    RaisPorCbo, RaisPorTamanhoEstabelecimento, RaisPorNaturezaJuridica,
    RaisTurnoverMensal,
]

# Operational data — copying these makes the demo feel populated.
# Order matters for DELETE (children before parents inside this list).
OPERATIONAL_MODELS = [
    IndicadorInterno, PlanoGovAcao, EventoMunicipio, DashboardCardCustom,
    InsightIA, Marco, Projeto,
    # Desenv. Econômico — visita_retencao.empresa_id FK → empresa_retencao.id (children first)
    VisitaRetencao, EmpresaRetencao, InvestimentoFunil,
    CaptacaoRecurso, EscritaProjeto, Premiacao,
]

ALL_MODELS = DATASET_MODELS + OPERATIONAL_MODELS


# ──────────────────────────────────────────────────────────────────
# Dataset registry — used by the per-dataset delete endpoint.
# Keys match those used by `DATASET_LABELS` in insights_service.py;
# values list every table whose rows belong to that dataset.
# "geral" is intentionally absent — it's a composite view, not a dataset.
# ──────────────────────────────────────────────────────────────────
DATASET_REGISTRY: Dict[str, list] = {
    "arrecadacao":   [ArrecadacaoMensal],
    "pib":           [PibAnual],
    "bolsa_familia": [BolsaFamiliaResumo],
    "pe_de_meia":    [PeDeMeiaResumo, PeDeMeiaEtapa],
    "inss":          [InssAnual],
    "estban":        [EstbanMensal, EstbanPorInstituicao],
    "comex":         [ComexMensal, ComexPorProduto, ComexPorPais],
    "empresas":      [Empresa],
    "pix":           [PixMensal],
    "ips":           [IpsMunicipio],
    "caged": [
        CagedMovimentacao, CagedPorSexo, CagedPorRaca, CagedSalario, CagedPorCnae,
        CagedPorEscolaridade, CagedPorFaixaEtaria, CagedPorTipoMovimentacao,
        CagedPorTipoDeficiencia, CagedPorTamanhoEstabelecimento, CagedPorTipoEmpregador,
        CagedPorTipoEstabelecimento, CagedIndicadoresContrato,
    ],
    "rais": [
        RaisVinculo, RaisPorSexo, RaisPorRaca, RaisPorCnae, RaisPorFaixaEtaria,
        RaisPorEscolaridade, RaisPorFaixaRemuneracao, RaisPorFaixaTempoEmprego,
        RaisMetricasAnuais, RaisPorMotivoDesligamento, RaisPorTipoAdmissao,
        RaisPorCbo, RaisPorTamanhoEstabelecimento, RaisPorNaturezaJuridica,
        RaisTurnoverMensal,
    ],
}

DATASET_LABELS: Dict[str, str] = {
    "arrecadacao":   "Arrecadação Municipal (ICMS, IPVA, IPI)",
    "pib":           "PIB Municipal",
    "caged":         "CAGED — Movimentação de Empregos Formais",
    "rais":          "RAIS — Vínculos Empregatícios",
    "bolsa_familia": "Bolsa Família — Beneficiários e Valores",
    "pe_de_meia":    "Pé-de-Meia — Estudantes Beneficiados",
    "inss":          "INSS — Benefícios Previdenciários",
    "estban":        "Estban — Estatísticas Bancárias",
    "comex":         "Comércio Exterior (Exportações e Importações)",
    "empresas":      "Empresas Ativas no Município",
    "pix":           "PIX — Transações Instantâneas (Banco Central)",
    "ips":           "IPS — Índice de Progresso Social",
}


def _copy_row(row, target_municipio_id: int):
    """Build a new ORM instance from `row`, swapping municipio_id → target_municipio_id
    and dropping the primary key so SQLAlchemy assigns a fresh one."""
    cls = type(row)
    mapper = inspect(cls)
    pk_names = {col.name for col in mapper.primary_key}
    kwargs = {}
    for col in mapper.columns:
        name = col.name
        if name in pk_names:
            continue
        if name == "municipio_id":
            kwargs[name] = target_municipio_id
            continue
        kwargs[name] = getattr(row, name)
    return cls(**kwargs)


def clone_municipio_data(
    db: Session, source_id: int, target_id: int
) -> Dict[str, int]:
    """Copy every row from every municipio_id-bearing table from source to target.

    Commits per model so a single hiccup doesn't blow away the whole clone.
    Returns a summary `{ModelClassName: rows_copied}` for logging and the API
    response body.
    """
    if source_id == target_id:
        raise HTTPException(status_code=400, detail="Origem e destino são iguais.")
    if not db.get(Municipio, source_id):
        raise HTTPException(status_code=404, detail="Município de origem não encontrado.")
    if not db.get(Municipio, target_id):
        raise HTTPException(status_code=404, detail="Município de destino não encontrado.")

    summary: Dict[str, int] = {}
    for model in ALL_MODELS:
        rows = db.query(model).filter(model.municipio_id == source_id).all()
        if not rows:
            continue
        new_rows = [_copy_row(r, target_id) for r in rows]
        db.add_all(new_rows)
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Clone failed at model %s", model.__name__)
            raise HTTPException(
                status_code=500,
                detail=f"Falha ao clonar tabela {model.__name__}. Operação parcial — verifique o município destino.",
            )
        summary[model.__name__] = len(new_rows)
        logger.info("Cloned %s rows from %s (source=%s → target=%s)", len(new_rows), model.__name__, source_id, target_id)

    return summary


def delete_municipio_cascade(db: Session, municipio_id: int) -> Dict[str, int]:
    """Delete all rows tied to a município across every dependent table,
    then delete the município row itself. Returns a summary count per table."""
    if municipio_id == 1:
        raise HTTPException(status_code=400, detail="Município padrão protegido — não pode ser excluído.")

    municipio = db.get(Municipio, municipio_id)
    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    summary: Dict[str, int] = {}

    # Detach any users still tied to this município so we don't trip the FK.
    detached = (
        db.query(Usuario)
        .filter(Usuario.municipio_id == municipio_id)
        .update({Usuario.municipio_id: None}, synchronize_session=False)
    )
    if detached:
        summary["Usuario (detached)"] = detached

    # Wipe all dependent rows.
    for model in ALL_MODELS:
        deleted = (
            db.query(model)
            .filter(model.municipio_id == municipio_id)
            .delete(synchronize_session=False)
        )
        if deleted:
            summary[model.__name__] = deleted

    db.delete(municipio)
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Cascade delete failed for municipio_id=%s", municipio_id)
        raise HTTPException(
            status_code=500,
            detail="Falha ao excluir município. Verifique se ainda há registros dependentes.",
        )

    logger.info("Deleted município %s with summary: %s", municipio_id, summary)
    return summary


def delete_dataset_for_municipio(
    db: Session, municipio_id: int, dataset_key: str
) -> Dict[str, int]:
    """Wipe every row of `dataset_key` for `municipio_id`. Operational tables
    (Marco, Projeto, IndicadorInterno, custom cards, etc.) are untouched, and
    the município row itself stays. Returns a {ModelClassName: rows_deleted}
    summary."""
    if dataset_key not in DATASET_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset desconhecido: '{dataset_key}'.",
        )
    if not db.get(Municipio, municipio_id):
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    summary: Dict[str, int] = {}
    for model in DATASET_REGISTRY[dataset_key]:
        deleted = (
            db.query(model)
            .filter(model.municipio_id == municipio_id)
            .delete(synchronize_session=False)
        )
        if deleted:
            summary[model.__name__] = deleted

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Dataset delete failed for municipio_id=%s, dataset=%s",
            municipio_id, dataset_key,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao limpar dataset '{dataset_key}'.",
        )

    logger.info(
        "Cleared dataset %s for município %s — %s",
        dataset_key, municipio_id, summary,
    )
    return summary


def count_dataset_rows_for_municipio(
    db: Session, municipio_id: int
) -> Dict[str, int]:
    """Return a {dataset_key: total_row_count} dict for every dataset in the
    registry. Used by the Datasets admin page to render row counts before the
    admin clicks 'Limpar'."""
    if not db.get(Municipio, municipio_id):
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    counts: Dict[str, int] = {}
    for dataset_key, models in DATASET_REGISTRY.items():
        total = 0
        for model in models:
            total += (
                db.query(model)
                .filter(model.municipio_id == municipio_id)
                .count()
            )
        counts[dataset_key] = total
    return counts
