from app.api.deps import get_db, require_role
from app.models.ingestao_audit import IngestaoAudit
from app.models.ingestao_job import IngestaoJob
from app.services.ingestao_automatica import FONTES_AUTOMATICAS
from app.services.ingestao_automatica.runner import (
    STATUS_ATIVOS,
    _agora,
    iniciar_job,
    job_orfao,
    job_para_dict,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/ingestao-automatica", tags=["Ingestão Automática"])


class ExecutarIn(BaseModel):
    estado: str | None = None
    municipio_ids: list[int] | None = None
    anos: list[int] | None = None
    notificar: bool = True


def _abortar_orfao(db: Session, job: IngestaoJob) -> None:
    """Sweep lento (na leitura): um job ativo sem heartbeat recente vira
    'abortado' aqui mesmo, sem esperar a próxima tentativa de criação — assim
    um job morto por deploy/restart se autocura no próximo polling."""
    job.status = "abortado"
    job.erro = "Sem heartbeat — processo reiniciado durante a execução."
    job.finalizado_em = _agora()
    db.commit()


def _job_ativo(db: Session) -> IngestaoJob | None:
    """Job pendente/executando com heartbeat vivo (órfãos são varridos aqui)."""
    for job in db.query(IngestaoJob).filter(IngestaoJob.status.in_(STATUS_ATIVOS)).all():
        if job_orfao(job):
            _abortar_orfao(db, job)
            continue
        return job
    return None


@router.get("/fontes")
def listar_fontes(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    ativo = _job_ativo(db)
    fontes = []
    for key, fonte in FONTES_AUTOMATICAS.items():
        ultimo_audit = (
            db.query(IngestaoAudit)
            .filter(IngestaoAudit.acao == "auto_ingest", IngestaoAudit.dataset == key)
            .order_by(IngestaoAudit.criado_em.desc())
            .first()
        )
        ultimo_job = (
            db.query(IngestaoJob)
            .filter(IngestaoJob.dataset == key)
            .order_by(IngestaoJob.criado_em.desc())
            .first()
        )
        fontes.append({
            "key": key,
            "label": fonte.label,
            "fonte": fonte.fonte,
            "ultima_execucao": None if ultimo_audit is None else {
                "criado_em": ultimo_audit.criado_em,
                "status": ultimo_audit.status,
                "num_linhas": ultimo_audit.num_linhas,
                "detalhe": ultimo_audit.detalhe,
            },
            "ultimo_job": None if ultimo_job is None else job_para_dict(ultimo_job),
        })
    return {"fontes": fontes, "job_ativo": None if ativo is None else job_para_dict(ativo)}


@router.post("/{dataset_key}/executar", status_code=202)
def executar_fonte(
    dataset_key: str,
    body: ExecutarIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    filtros = {
        "estado": body.estado.upper() if body.estado else None,
        "municipio_ids": body.municipio_ids,
        "anos": body.anos,
        "notificar": body.notificar,
    }
    job = iniciar_job(db, dataset_key, filtros, current_user.id)
    return {"job_id": job.id}


@router.get("/jobs/{job_id}")
def obter_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    job = db.get(IngestaoJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    if job.status in STATUS_ATIVOS and job_orfao(job):
        _abortar_orfao(db, job)
    return job_para_dict(job)


@router.get("/jobs")
def listar_jobs(
    dataset: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    query = db.query(IngestaoJob)
    if dataset:
        query = query.filter(IngestaoJob.dataset == dataset)
    jobs = query.order_by(IngestaoJob.criado_em.desc()).limit(limit).all()
    return [job_para_dict(j) for j in jobs]
