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
from sqlalchemy import text

from app.core.config import settings
from app.services.ingestao_automatica.base import (
    DATASET_TODAS,
    FONTES_AUTOMATICAS,
    ORDEM_EXECUCAO_TODAS,
)
from app.services.ingestao_automatica.todas import (
    item_resumo_erro,
    item_resumo_ok,
    mensagem_erro_todas,
    precisa_expandir_captacao,
    prefixo_etapa,
    status_final_todas,
)

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
    """municipio_ids tem precedência sobre estado — seleção explícita nunca é
    reduzida silenciosamente pela UF."""
    from app.models.municipio import Municipio

    query = db.query(Municipio).filter(Municipio.ativo.is_(True))
    municipio_ids = (filtros or {}).get("municipio_ids")
    estado = (filtros or {}).get("estado")
    if municipio_ids:
        query = query.filter(Municipio.id.in_(municipio_ids))
    elif estado:
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


def _municipios_da_fonte(db, fonte_key: str, filtros: dict):
    """Municípios que a fonte recebe dentro do meta-job: a captação federal
    expande municípios avulsos para as UFs inteiras da seleção (pares do
    diagnóstico — pode ser mais de uma UF); as demais usam o filtro original."""
    from app.models.municipio import Municipio

    if not precisa_expandir_captacao(fonte_key, filtros):
        return resolver_municipios(db, filtros)
    ufs = [
        uf
        for (uf,) in db.query(Municipio.estado)
        .filter(Municipio.id.in_(filtros["municipio_ids"]))
        .distinct()
    ]
    return (
        db.query(Municipio)
        .filter(Municipio.ativo.is_(True), Municipio.estado.in_(ufs))
        .all()
    )


def _executar_sequencia_todas(db, filtros: dict, usuario_id, progresso) -> list[dict]:
    """Executa as fontes na ordem, isolando falhas: exceção em uma fonte vira
    item 'erro' no resumo agregado e a sequência continua. Audit e DatasetInfo
    são gravados por fonte, exatamente como numa execução individual — o
    'última execução' de cada card e a trilha por dataset continuam corretos."""
    from app.services.municipio_management import record_ingestao_audit

    itens = []
    total_fontes = len(ORDEM_EXECUCAO_TODAS)
    for i, key in enumerate(ORDEM_EXECUCAO_TODAS, start=1):
        fonte = FONTES_AUTOMATICAS[key]

        # default no argumento congela o par (i, label) desta iteração — sem
        # ele, todas as closures veriam a última fonte do loop
        def cb(atual, total=None, etapa=None, _i=i, _label=fonte.label):
            progresso(atual, total, prefixo_etapa(_i, total_fontes, _label, etapa))

        try:
            municipios = _municipios_da_fonte(db, key, filtros)
            cb(0, len(municipios))  # zera a barra e anuncia a fonte corrente
            resumo = fonte.executar(
                db=db,
                municipios=municipios,
                anos=filtros.get("anos"),
                usuario_id=usuario_id,
                notificar=filtros.get("notificar", True),
                progresso=cb,
            )
            record_ingestao_audit(
                db,
                municipio_id=municipios[0].id if len(municipios) == 1 else None,
                usuario_id=usuario_id,
                dataset=key,
                acao="auto_ingest",
                num_linhas=resumo.linhas,
                status="ok" if not resumo.erros else "aviso",
                detalhe="; ".join(resumo.erros[:20]) or None,
            )
            _atualizar_dataset_info(db, key, fonte.label, fonte.fonte)
            itens.append(item_resumo_ok(key, resumo))
        except Exception as exc:  # noqa: BLE001 — uma fonte não derruba a sequência
            logger.exception("Meta-job: fonte %s falhou", key)
            db.rollback()
            record_ingestao_audit(
                db,
                municipio_id=None,
                usuario_id=usuario_id,
                dataset=key,
                acao="auto_ingest",
                num_linhas=0,
                status="erro",
                detalhe=str(exc)[:1000],
            )
            itens.append(item_resumo_erro(key, exc))
    return itens


def iniciar_job(db, dataset_key: str, filtros: dict, usuario_id: int):
    from app.models.ingestao_job import IngestaoJob

    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None and dataset_key != DATASET_TODAS:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")

    if not resolver_municipios(db, filtros):
        raise HTTPException(status_code=404, detail="Nenhum município ativo para o filtro informado.")

    # serializa criação de jobs entre workers/requests (lock liberado no commit/rollback)
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('ingestao_job_iniciar'))"))
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

    job = IngestaoJob(dataset=dataset_key, status="pendente", filtros=filtros, usuario_id=usuario_id)
    db.add(job)
    db.commit()   # único commit: persiste aborto de órfãos + job novo e libera o lock
    db.refresh(job)

    if settings.INGESTAO_EXECUTOR == "worker":
        # o processo worker reivindica o 'pendente' mais antigo e executa
        return job
    threading.Thread(
        target=_executar_job, args=(job.id,), daemon=True, name=f"ingestao-job-{job.id}"
    ).start()
    return job


def _ticker_heartbeat(job_id: int, parar_ticker: threading.Event) -> None:
    """Thread secundária: mantém atualizado_em vivo durante trechos longos sem
    callback de progresso (ex.: download >10min de um ZIP grande) — sem isso o
    job LIVE pareceria órfão e uma segunda requisição o abortaria, criando uma
    execução duplicada. Sessão própria (nunca compartilha db_job com a thread
    principal — sessões do SQLAlchemy não são thread-safe)."""
    from app.db.session import SessionLocal
    from app.models.ingestao_job import IngestaoJob

    while not parar_ticker.wait(60):
        db_t = SessionLocal()
        try:
            db_t.query(IngestaoJob).filter(IngestaoJob.id == job_id).update(
                {"atualizado_em": _agora()}, synchronize_session=False
            )
            db_t.commit()
        except Exception:  # noqa: BLE001 — uma falha de tick não pode matar o loop
            logger.exception("Falha ao atualizar heartbeat (ticker) do job %s", job_id)
        finally:
            db_t.close()


def _executar_job(job_id: int) -> None:
    from app.db.session import SessionLocal
    from app.models.ingestao_job import IngestaoJob
    from app.services.municipio_management import record_ingestao_audit

    db = SessionLocal()       # sessão da fonte (commits por município)
    db_job = SessionLocal()   # sessão exclusiva da linha do job (heartbeat)
    job = None
    parar_ticker = threading.Event()
    ticker = None
    try:
        job = db_job.get(IngestaoJob, job_id)
        if job is None:
            logger.error("Job %s não encontrado ao iniciar a thread", job_id)
            return
        fonte = FONTES_AUTOMATICAS.get(job.dataset)  # None quando dataset == DATASET_TODAS
        filtros = job.filtros or {}
        municipios = resolver_municipios(db, filtros)

        job.status = "executando"
        job.iniciado_em = _agora()
        job.atualizado_em = _agora()
        job.progresso_total = len(municipios)
        db_job.commit()

        ticker = threading.Thread(
            target=_ticker_heartbeat, args=(job_id, parar_ticker), daemon=True,
            name=f"ingestao-job-{job_id}-ticker",
        )
        ticker.start()

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

        if job.dataset == DATASET_TODAS:
            itens = _executar_sequencia_todas(db, filtros, job.usuario_id, progresso)
            resumo_json = {"fontes": itens}
            status_final = status_final_todas(itens)
            erro_final = mensagem_erro_todas(itens) if status_final == "erro" else None
        else:
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
            resumo_json = asdict(resumo)
            status_final = "concluido"
            erro_final = None

        db_job.refresh(job)
        if job.status == "executando":
            job.status = status_final
            job.resumo = resumo_json
            job.erro = erro_final
            job.progresso_atual = job.progresso_total or job.progresso_atual
            job.finalizado_em = _agora()
            job.atualizado_em = _agora()
            db_job.commit()
        else:
            logger.warning(
                "Job %s foi marcado %s externamente; resultado descartado do status",
                job_id, job.status,
            )
    except Exception as exc:  # noqa: BLE001 — thread não pode morrer sem registrar
        logger.exception("Job %s falhou", job_id)
        if job is not None:
            try:
                db.rollback()
                record_ingestao_audit(
                    db, municipio_id=None, usuario_id=job.usuario_id, dataset=job.dataset,
                    acao="auto_ingest", num_linhas=0, status="erro", detalhe=str(exc)[:1000],
                )
                db_job.refresh(job)
                if job.status == "executando":
                    job.status = "erro"
                    job.erro = str(exc)[:1000]
                    job.finalizado_em = _agora()
                    job.atualizado_em = _agora()
                    db_job.commit()
                else:
                    logger.warning(
                        "Job %s foi marcado %s externamente; resultado descartado do status",
                        job_id, job.status,
                    )
            except Exception:
                logger.exception("Falha ao registrar erro do job %s", job_id)
    finally:
        parar_ticker.set()
        if ticker is not None:
            ticker.join(timeout=5)
        db.close()
        db_job.close()
