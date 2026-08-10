from datetime import datetime, timedelta, timezone

from app.api.deps import get_db, require_role
from app.models.ingestao_arquivo import IngestaoArquivo
from app.models.ingestao_audit import IngestaoAudit
from app.models.ingestao_job import IngestaoJob
from app.services.ingestao_automatica import FONTES_AUTOMATICAS
from app.services.ingestao_automatica.runner import (
    STATUS_ATIVOS,
    _transicao_abortado_condicional,
    iniciar_job,
    job_orfao,
    job_para_dict,
)
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/ingestao-automatica", tags=["Ingestão Automática"])

_LIMITE_UPLOAD_BYTES = 20 * 1024 * 1024  # XLSX do IPS tem ~5 MB; margem p/ anos futuros
_SWEEP_ORFAOS_HORAS = 24


class ExecutarIn(BaseModel):
    estado: str | None = None
    municipio_ids: list[int] | None = None
    anos: list[int] | None = None
    notificar: bool = True


def _abortar_orfao(db: Session, job: IngestaoJob) -> bool:
    """Sweep lento (na leitura): um job ativo sem heartbeat recente vira
    'abortado' aqui mesmo, sem esperar a próxima tentativa de criação — assim
    um job morto por deploy/restart se autocura no próximo polling. UPDATE
    condicional: se o job avançou entre a leitura e esta escrita (outro
    executor reivindicou/atualizou o heartbeat nesse intervalo), não aborta —
    `job` é atualizado (refresh) para refletir o estado atual e o chamador o
    trata como ativo. Devolve True se abortou, False caso contrário."""
    abortou = _transicao_abortado_condicional(db, job)
    db.commit()
    db.refresh(job)
    return abortou


def _job_ativo(db: Session) -> IngestaoJob | None:
    """Job pendente/executando com heartbeat vivo (órfãos são varridos aqui)."""
    for job in db.query(IngestaoJob).filter(IngestaoJob.status.in_(STATUS_ATIVOS)).all():
        if job_orfao(job):
            if _abortar_orfao(db, job):
                continue
            # o job avançou entre a leitura e a tentativa de aborto — segue
            # ativo (refresh já deixou `job` refletindo o estado atual)
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
            "requer_arquivo": fonte.requer_arquivo,
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
    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is not None and fonte.requer_arquivo:
        raise HTTPException(
            status_code=400,
            detail=f"A fonte '{dataset_key}' exige arquivo — use o envio de arquivo da tela de coletas.",
        )
    filtros = {
        "estado": body.estado.upper() if body.estado else None,
        "municipio_ids": body.municipio_ids,
        "anos": body.anos,
        "notificar": body.notificar,
    }
    job = iniciar_job(db, dataset_key, filtros, current_user.id)
    return {"job_id": job.id}


@router.post("/{dataset_key}/executar-arquivo", status_code=202)
def executar_fonte_com_arquivo(
    dataset_key: str,
    arquivo: UploadFile = File(...),
    ano: int = Form(...),
    notificar: bool = Form(True),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    """Variante multipart do /executar para fontes com requer_arquivo (IPS):
    o blob vai para ingestao_arquivo e o job nasce no MESMO commit (dentro de
    iniciar_job) — um 409 de job ativo descarta blob e job juntos."""
    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")
    if not fonte.requer_arquivo:
        raise HTTPException(
            status_code=400,
            detail=f"A fonte '{dataset_key}' não recebe arquivo — use o botão de execução normal.",
        )
    if not 2000 <= ano <= 2100:
        raise HTTPException(status_code=400, detail="Ano inválido.")
    conteudo = arquivo.file.read(_LIMITE_UPLOAD_BYTES + 1)
    if len(conteudo) > _LIMITE_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Arquivo maior que 20 MB.")
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    # blobs órfãos (job que falhou/abortou nunca deleta o arquivo) saem aqui
    corte = datetime.now(timezone.utc) - timedelta(hours=_SWEEP_ORFAOS_HORAS)
    db.query(IngestaoArquivo).filter(IngestaoArquivo.criado_em < corte).delete(
        synchronize_session=False
    )

    arq = IngestaoArquivo(nome=(arquivo.filename or "arquivo")[:255], conteudo=conteudo)
    db.add(arq)
    db.flush()  # id do blob; o commit único acontece dentro de iniciar_job
    filtros = {"arquivo_id": arq.id, "anos": [ano], "notificar": notificar}
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
