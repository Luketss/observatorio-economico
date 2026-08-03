"""Testes do modo worker: enfileirar (Task 1) e claim (Task 2).

Padrão do repo: sessão/queries via MagicMock — sem Postgres real
(SKIP LOCKED de verdade é coberto no E2E da verificação final)."""
from unittest.mock import MagicMock, patch

from app.services.ingestao_automatica.runner import iniciar_job


def _db_sem_job_ativo():
    """MagicMock de sessão: a query de Municipio resolve 1 município e a de
    IngestaoJob devolve zero ativos — iniciar_job passa pelas duas guardas
    (um chain único devolveria um 'job ativo' fantasma e estouraria 409)."""
    db = MagicMock()
    municipio_q = MagicMock()
    municipio_q.filter.return_value = municipio_q
    municipio_q.all.return_value = [MagicMock()]
    job_q = MagicMock()
    job_q.filter.return_value = job_q
    job_q.all.return_value = []
    db.query.side_effect = lambda model: municipio_q if model.__name__ == "Municipio" else job_q
    return db


def test_iniciar_job_worker_nao_dispara_thread():
    db = _db_sem_job_ativo()
    with patch("app.services.ingestao_automatica.runner.settings") as st, \
         patch("app.services.ingestao_automatica.runner.threading.Thread") as thread:
        st.INGESTAO_EXECUTOR = "worker"
        job = iniciar_job(db, "populacao", {"municipio_ids": [1]}, usuario_id=1)
    thread.assert_not_called()
    db.commit.assert_called()
    assert job is not None


def test_iniciar_job_inline_dispara_thread():
    db = _db_sem_job_ativo()
    with patch("app.services.ingestao_automatica.runner.settings") as st, \
         patch("app.services.ingestao_automatica.runner.threading.Thread") as thread:
        st.INGESTAO_EXECUTOR = "inline"
        iniciar_job(db, "populacao", {"municipio_ids": [1]}, usuario_id=1)
    thread.assert_called_once()
    thread.return_value.start.assert_called_once()


def test_default_do_settings_e_inline():
    from app.core.config import settings
    assert settings.INGESTAO_EXECUTOR == "inline"


from app.worker import reivindicar_job


def test_reivindicar_job_marca_executando_e_commita():
    db = MagicMock()
    job = MagicMock()
    job.id = 42
    db.query.return_value.filter.return_value.order_by.return_value \
        .with_for_update.return_value.first.return_value = job
    assert reivindicar_job(db) == 42
    assert job.status == "executando"
    assert job.iniciado_em is not None
    assert job.atualizado_em is not None
    db.commit.assert_called_once()
    db.rollback.assert_not_called()


def test_reivindicar_job_fila_vazia_faz_rollback_e_devolve_none():
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value \
        .with_for_update.return_value.first.return_value = None
    assert reivindicar_job(db) is None
    db.rollback.assert_called_once()
    db.commit.assert_not_called()


def test_reivindicar_job_usa_skip_locked():
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value \
        .with_for_update.return_value.first.return_value = None
    reivindicar_job(db)
    db.query.return_value.filter.return_value.order_by.return_value \
        .with_for_update.assert_called_once_with(skip_locked=True)
