"""Runner dos jobs de ingestão em background.

Um job por vez (trava global): o container do Railway compartilha memória com
a API — duas fontes pesadas em paralelo arriscam OOM. A trava se autolibera:
job 'executando' sem heartbeat há JOB_ORFAO_MINUTOS é órfão de deploy/restart
e vira 'abortado' na próxima tentativa de criação.

A thread usa DUAS sessões: uma para a fonte (que faz commit por município) e
outra exclusiva para a linha do job — o heartbeat nunca commita trabalho
parcial da fonte."""
import logging
import threading
from datetime import datetime, timedelta, timezone
from dataclasses import asdict

from fastapi import HTTPException

from app.services.ingestao_automatica.base import FONTES_AUTOMATICAS

logger = logging.getLogger(__name__)

JOB_ORFAO_MINUTOS = 10
STATUS_ATIVOS = ("pendente", "executando")
_PASSO_HEARTBEAT = 25  # grava progresso a cada N municípios (ou mudança de etapa)


def _agora():
    return datetime.now(timezone.utc)


def job_orfao(job, agora=None) -> bool:
    """Job ativo cuja thread morreu (deploy/restart): 'executando' sem
    heartbeat recente, ou 'pendente' que nunca chegou a iniciar."""
    if job.status not in STATUS_ATIVOS:
        return False
    agora = agora or _agora()
    referencia = job.atualizado_em or job.iniciado_em or job.criado_em
    return (agora - referencia) > timedelta(minutes=JOB_ORFAO_MINUTOS)


def job_para_dict(job) -> dict:
    def _iso(dt):
        return dt.isoformat() if dt else None

    return {
        "id": job.id,
        "dataset": job.dataset,
        "status": job.status,
        "filtros": job.filtros,
        "progresso_atual": job.progresso_atual,
        "progresso_total": job.progresso_total,
        "etapa": job.etapa,
        "resumo": job.resumo,
        "erro": job.erro,
        "usuario_id": job.usuario_id,
        "criado_em": _iso(job.criado_em),
        "iniciado_em": _iso(job.iniciado_em),
        "atualizado_em": _iso(job.atualizado_em),
        "finalizado_em": _iso(job.finalizado_em),
    }


def resolver_municipios(db, filtros: dict):
    from app.models.municipio import Municipio

    query = db.query(Municipio).filter(Municipio.ativo.is_(True))
    municipio_ids = (filtros or {}).get("municipio_ids")
    estado = (filtros or {}).get("estado")
    if municipio_ids:
        query = query.filter(Municipio.id.in_(municipio_ids))
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    return query.all()


def _atualizar_dataset_info(db, key: str, fonte_label: str, fonte_texto: str) -> None:
    """Movido do router: DatasetInfo ganha fonte default e data de atualização."""
    from app.models.dataset_info import DatasetInfo

    info = db.query(DatasetInfo).filter(DatasetInfo.dataset == key).first()
    if info is None:
        info = DatasetInfo(dataset=key, titulo=fonte_label, conteudo="")
        db.add(info)
    if not info.fonte:
        info.fonte = fonte_texto
    info.data_atualizacao = datetime.now().strftime("%d/%m/%Y")
    db.commit()


def iniciar_job(db, dataset_key: str, filtros: dict, usuario_id: int):
    from app.models.ingestao_job import IngestaoJob

    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")

    if not resolver_municipios(db, filtros):
        raise HTTPException(status_code=404, detail="Nenhum município ativo para o filtro informado.")

    ativos = db.query(IngestaoJob).filter(IngestaoJob.status.in_(STATUS_ATIVOS)).all()
    for ativo in ativos:
        if job_orfao(ativo):
            ativo.status = "abortado"
            ativo.erro = "Sem heartbeat — processo reiniciado durante a execução."
            ativo.finalizado_em = _agora()
        else:
            raise HTTPException(
                status_code=409,
                detail=f"Já existe uma execução em andamento ({ativo.dataset}, job {ativo.id}). Aguarde terminar.",
            )
    db.commit()

    job = IngestaoJob(dataset=dataset_key, status="pendente", filtros=filtros, usuario_id=usuario_id)
    db.add(job)
    db.commit()
    db.refresh(job)

    threading.Thread(
        target=_executar_job, args=(job.id,), daemon=True, name=f"ingestao-job-{job.id}"
    ).start()
    return job


def _executar_job(job_id: int) -> None:
    from app.db.session import SessionLocal
    from app.models.ingestao_job import IngestaoJob
    from app.services.municipio_management import record_ingestao_audit

    db = SessionLocal()       # sessão da fonte (commits por município)
    db_job = SessionLocal()   # sessão exclusiva da linha do job (heartbeat)
    try:
        job = db_job.get(IngestaoJob, job_id)
        fonte = FONTES_AUTOMATICAS[job.dataset]
        filtros = job.filtros or {}
        municipios = resolver_municipios(db, filtros)

        job.status = "executando"
        job.iniciado_em = _agora()
        job.atualizado_em = _agora()
        job.progresso_total = len(municipios)
        db_job.commit()

        ultimo_escrito = {"atual": -_PASSO_HEARTBEAT, "etapa": None}

        def progresso(atual, total=None, etapa=None):
            mudou_etapa = etapa is not None and etapa != ultimo_escrito["etapa"]
            terminou = total is not None and atual >= total
            if not mudou_etapa and not terminou and atual - ultimo_escrito["atual"] < _PASSO_HEARTBEAT:
                return
            job.progresso_atual = atual
            if total is not None:
                job.progresso_total = total
            if etapa is not None:
                job.etapa = etapa[:100]
            job.atualizado_em = _agora()
            db_job.commit()
            ultimo_escrito["atual"] = atual
            ultimo_escrito["etapa"] = etapa

        resumo = fonte.executar(
            db=db, municipios=municipios, anos=filtros.get("anos"),
            usuario_id=job.usuario_id, notificar=filtros.get("notificar", True),
            progresso=progresso,
        )

        record_ingestao_audit(
            db,
            municipio_id=municipios[0].id if len(municipios) == 1 else None,
            usuario_id=job.usuario_id,
            dataset=job.dataset,
            acao="auto_ingest",
            num_linhas=resumo.linhas,
            status="ok" if not resumo.erros else "aviso",
            detalhe="; ".join(resumo.erros[:20]) or None,
        )
        _atualizar_dataset_info(db, job.dataset, fonte.label, fonte.fonte)

        job.status = "concluido"
        job.resumo = asdict(resumo)
        job.progresso_atual = job.progresso_total or job.progresso_atual
        job.finalizado_em = _agora()
        job.atualizado_em = _agora()
        db_job.commit()
    except Exception as exc:  # noqa: BLE001 — thread não pode morrer sem registrar
        logger.exception("Job %s falhou", job_id)
        try:
            db.rollback()
            record_ingestao_audit(
                db, municipio_id=None, usuario_id=job.usuario_id, dataset=job.dataset,
                acao="auto_ingest", num_linhas=0, status="erro", detalhe=str(exc)[:1000],
            )
            job.status = "erro"
            job.erro = str(exc)[:1000]
            job.finalizado_em = _agora()
            job.atualizado_em = _agora()
            db_job.commit()
        except Exception:
            logger.exception("Falha ao registrar erro do job %s", job_id)
    finally:
        db.close()
        db_job.close()
