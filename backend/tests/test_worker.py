"""Testes do modo worker: enfileirar (Task 1) e claim (Task 2).

Padrão do repo: sessão/queries via MagicMock — sem Postgres real
(SKIP LOCKED de verdade é coberto no E2E da verificação final)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.ingestao_automatica.runner import _executar_job, iniciar_job


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


# --- M2: transição guardada em _executar_job ---------------------------------

def test_executar_job_inline_rowcount_zero_desiste_sem_executar_fonte():
    """Corrida inline vs. worker: a thread inline chama _executar_job sem
    ja_reivindicado, mas outro executor (ex.: um worker) já reivindicou o
    mesmo job 'pendente' antes dela — o UPDATE guardado (WHERE status ==
    'pendente') não casa nenhuma linha. A função deve desistir sem executar a
    fonte (nunca chega em fonte.executar)."""
    db_mock = MagicMock()
    db_job_mock = MagicMock()
    job = MagicMock()
    job.dataset = "populacao"
    job.filtros = {"municipio_ids": [1]}
    db_job_mock.get.return_value = job
    db_job_mock.query.return_value.filter.return_value.update.return_value = 0

    fonte_mock = MagicMock()

    with patch("app.db.session.SessionLocal", side_effect=[db_mock, db_job_mock]), \
         patch("app.services.ingestao_automatica.runner.resolver_municipios", return_value=[MagicMock()]), \
         patch("app.services.ingestao_automatica.runner.FONTES_AUTOMATICAS", {"populacao": fonte_mock}):
        _executar_job(99, ja_reivindicado=False)

    fonte_mock.executar.assert_not_called()
    db_job_mock.commit.assert_called_once()   # commit do UPDATE de claim (0 linhas)
    db_job_mock.refresh.assert_not_called()   # retorno antecipado: nunca chega lá
    db_mock.close.assert_called_once()
    db_job_mock.close.assert_called_once()


# --- M3: normalização de INGESTAO_EXECUTOR ------------------------------------

def test_modo_worker_normaliza_espacos_e_caixa():
    db = _db_sem_job_ativo()
    with patch("app.services.ingestao_automatica.runner.settings") as st, \
         patch("app.services.ingestao_automatica.runner.threading.Thread") as thread:
        st.INGESTAO_EXECUTOR = " Worker "
        job = iniciar_job(db, "populacao", {"municipio_ids": [1]}, usuario_id=1)
    thread.assert_not_called()
    assert job is not None


def test_modo_worker_valor_invalido_loga_aviso_e_cai_para_inline():
    db = _db_sem_job_ativo()
    with patch("app.services.ingestao_automatica.runner.settings") as st, \
         patch("app.services.ingestao_automatica.runner.threading.Thread") as thread, \
         patch("app.services.ingestao_automatica.runner.logger") as logger_mock:
        st.INGESTAO_EXECUTOR = "workr"
        iniciar_job(db, "populacao", {"municipio_ids": [1]}, usuario_id=1)
    thread.assert_called_once()
    thread.return_value.start.assert_called_once()
    logger_mock.warning.assert_called_once()


# --- M1: abort de órfão com re-checagem (sweep do iniciar_job) ---------------

def test_iniciar_job_sweep_rowcount_zero_trata_job_como_ativo():
    """Corrida no sweep de órfãos: entre a leitura que decidiu 'é órfão' e o
    UPDATE condicional de aborto, outro executor reivindicou/atualizou o
    heartbeat do mesmo job — o UPDATE não casa nenhuma linha. iniciar_job deve
    tratar o job como ativo (409), e não como abortado."""
    agora = datetime.now(timezone.utc)
    ativo = SimpleNamespace(
        id=99, dataset="populacao", status="executando",
        atualizado_em=agora - timedelta(minutes=30),
        iniciado_em=None, criado_em=agora - timedelta(minutes=40),
    )

    db = MagicMock()
    municipio_q = MagicMock()
    municipio_q.filter.return_value = municipio_q
    municipio_q.all.return_value = [MagicMock()]
    job_q = MagicMock()
    job_q.filter.return_value = job_q
    job_q.all.return_value = [ativo]
    job_q.update.return_value = 0  # a UPDATE condicional não casa nenhuma linha
    db.query.side_effect = lambda model: municipio_q if model.__name__ == "Municipio" else job_q

    with pytest.raises(HTTPException) as exc_info:
        iniciar_job(db, "populacao", {"municipio_ids": [1]}, usuario_id=1)

    assert exc_info.value.status_code == 409
    assert "job 99" in exc_info.value.detail
    db.commit.assert_not_called()  # nunca chega a criar/commitar o job novo


# --- N2: guarda de fonte desconhecida em _executar_job ------------------------

def test_executar_job_fonte_desconhecida_marca_erro_sem_executar():
    """Job com dataset que não está mais registrado em FONTES_AUTOMATICAS (ex.:
    worker desatualizado após um deploy que removeu/renomeou a fonte) — e que
    não é o meta-job 'todas'. O runner deve marcar 'erro' diretamente (sem
    tentar o claim/transição de status nem o ticker) e jamais chamar
    fonte.executar (que explodiria com AttributeError em None)."""
    db_mock = MagicMock()
    db_job_mock = MagicMock()
    job = MagicMock()
    job.dataset = "inexistente"
    db_job_mock.get.return_value = job

    with patch("app.db.session.SessionLocal", side_effect=[db_mock, db_job_mock]), \
         patch("app.services.ingestao_automatica.runner.resolver_municipios") as resolver_mock, \
         patch("app.services.ingestao_automatica.runner.FONTES_AUTOMATICAS", {}):
        _executar_job(101, ja_reivindicado=False)

    assert job.status == "erro"
    assert "não registrada" in job.erro
    resolver_mock.assert_not_called()
    db_job_mock.query.assert_not_called()  # nunca chega ao claim/transição de status
    db_job_mock.commit.assert_called_once()
    db_mock.close.assert_called_once()
    db_job_mock.close.assert_called_once()


# --- teto de municípios declarado pela fonte (cnpj) ---------------------------

def test_iniciar_job_recusa_selecao_acima_do_maximo_da_fonte():
    """cnpj mantém em memória todos os estabelecimentos dos alvos: a fonte
    declara max_municipios e o job nem nasce quando a seleção o excede — o
    admin recebe 400 na hora, em vez de um job 'concluído' com 0 linhas e o
    aviso escondido no resumo."""
    from app.models.municipio import Municipio
    from app.services.ingestao_automatica.cnpj_rfb import MAX_MUNICIPIOS_POR_EXECUCAO

    db = _db_sem_job_ativo()
    n = MAX_MUNICIPIOS_POR_EXECUCAO + 1
    db.query(Municipio).all.return_value = [MagicMock() for _ in range(n)]
    with pytest.raises(HTTPException) as exc:
        iniciar_job(db, "cnpj", {"estado": "MG"}, usuario_id=1)
    assert exc.value.status_code == 400
    assert str(n) in exc.value.detail
    assert str(MAX_MUNICIPIOS_POR_EXECUCAO) in exc.value.detail
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_iniciar_job_aceita_selecao_no_limite_da_fonte():
    from app.models.municipio import Municipio
    from app.services.ingestao_automatica.cnpj_rfb import MAX_MUNICIPIOS_POR_EXECUCAO

    db = _db_sem_job_ativo()
    db.query(Municipio).all.return_value = [MagicMock() for _ in range(MAX_MUNICIPIOS_POR_EXECUCAO)]
    with patch("app.services.ingestao_automatica.runner.settings") as st,          patch("app.services.ingestao_automatica.runner.threading.Thread"):
        st.INGESTAO_EXECUTOR = "worker"
        job = iniciar_job(db, "cnpj", {"estado": "MG"}, usuario_id=1)
    assert job is not None
    db.commit.assert_called()


def test_fontes_sem_teto_nao_sao_limitadas():
    from app.models.municipio import Municipio

    db = _db_sem_job_ativo()
    db.query(Municipio).all.return_value = [MagicMock() for _ in range(500)]
    with patch("app.services.ingestao_automatica.runner.settings") as st,          patch("app.services.ingestao_automatica.runner.threading.Thread"):
        st.INGESTAO_EXECUTOR = "worker"
        job = iniciar_job(db, "populacao", {"estado": "MG"}, usuario_id=1)
    assert job is not None
