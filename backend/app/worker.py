"""Worker de ingestão: processo separado que executa os jobs da fila.

Com INGESTAO_EXECUTOR=worker a API apenas cria a linha 'pendente'; este
processo reivindica o job mais antigo com FOR UPDATE SKIP LOCKED (restart ou
réplica extra não duplica job) e roda o MESMO _executar_job do modo inline —
ticker de heartbeat, duas sessões e transições terminais guardadas, tudo
inalterado. Morte abrupta no meio de um job deixa 'executando' sem heartbeat
e o sweep lazy da API o marca 'abortado' em <=JOB_ORFAO_MINUTOS.

Uso (mesma imagem Docker do backend, start command próprio, sem alembic):
    python -m app.worker
"""
import logging
import time

logger = logging.getLogger("ingestao.worker")

POLL_SEGUNDOS = 3


def reivindicar_job(db):
    """Claim atômico: 'pendente' mais antigo -> 'executando' na mesma
    transação do SELECT ... FOR UPDATE SKIP LOCKED. Devolve o id ou None."""
    from app.models.ingestao_job import IngestaoJob
    from app.services.ingestao_automatica.runner import _agora

    job = (
        db.query(IngestaoJob)
        .filter(IngestaoJob.status == "pendente")
        .order_by(IngestaoJob.criado_em)
        .with_for_update(skip_locked=True)
        .first()
    )
    if job is None:
        db.rollback()  # encerra a transação aberta pelo SELECT
        return None
    job.status = "executando"
    job.iniciado_em = _agora()
    job.atualizado_em = _agora()
    db.commit()  # persiste o claim e libera o lock de linha
    return job.id


def main():
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    # popular o registry (cada import de fonte se auto-registra)
    import app.services.ingestao_automatica  # noqa: F401
    from app.db.session import SessionLocal
    from app.services.ingestao_automatica.runner import _executar_job

    logger.info("Worker de ingestão iniciado (poll a cada %ss)", POLL_SEGUNDOS)
    while True:
        job_id = None
        db = SessionLocal()
        try:
            job_id = reivindicar_job(db)
        except Exception:  # noqa: BLE001 — DB fora do ar não pode matar o loop
            logger.exception("Falha no poll — nova tentativa em %ss", POLL_SEGUNDOS)
        finally:
            db.close()
        if job_id is not None:
            logger.info("Job %s reivindicado — executando", job_id)
            _executar_job(job_id)
            logger.info("Job %s finalizado", job_id)
        else:
            time.sleep(POLL_SEGUNDOS)


if __name__ == "__main__":
    main()
