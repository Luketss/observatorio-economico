"""Lógica de decisão do runner de jobs — sem DB, sem thread."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.ingestao_automatica.runner import job_orfao, job_para_dict

AGORA = datetime(2026, 7, 9, 12, 0, tzinfo=timezone.utc)


def _job(status, ha_minutos, **kw):
    ts = AGORA - timedelta(minutes=ha_minutos)
    base = dict(
        id=1, dataset="fpm", status=status, filtros={"estado": "MG"},
        progresso_atual=0, progresso_total=None, etapa=None, resumo=None,
        erro=None, usuario_id=4, criado_em=ts, iniciado_em=None,
        atualizado_em=None, finalizado_em=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_job_executando_sem_heartbeat_recente_e_orfao():
    job = _job("executando", ha_minutos=30, atualizado_em=AGORA - timedelta(minutes=30))
    assert job_orfao(job, agora=AGORA) is True


def test_job_executando_com_heartbeat_recente_nao_e_orfao():
    job = _job("executando", ha_minutos=30, atualizado_em=AGORA - timedelta(minutes=2))
    assert job_orfao(job, agora=AGORA) is False


def test_job_pendente_recente_nao_e_orfao_mas_antigo_sim():
    assert job_orfao(_job("pendente", ha_minutos=3), agora=AGORA) is False
    assert job_orfao(_job("pendente", ha_minutos=30), agora=AGORA) is True


def test_job_finalizado_nunca_e_orfao():
    assert job_orfao(_job("concluido", ha_minutos=999), agora=AGORA) is False
    assert job_orfao(_job("erro", ha_minutos=999), agora=AGORA) is False


def test_job_executando_sem_atualizado_em_usa_iniciado_ou_criado():
    job = _job("executando", ha_minutos=30)  # atualizado_em=None, iniciado_em=None
    assert job_orfao(job, agora=AGORA) is True


def test_job_para_dict_serializa_datas_e_campos():
    job = _job("concluido", ha_minutos=5, resumo={"linhas": 10},
               finalizado_em=AGORA, progresso_atual=7, progresso_total=7)
    d = job_para_dict(job)
    assert d["id"] == 1 and d["dataset"] == "fpm" and d["status"] == "concluido"
    assert d["progresso_atual"] == 7 and d["progresso_total"] == 7
    assert d["resumo"] == {"linhas": 10}
    assert d["filtros"] == {"estado": "MG"}
    assert d["finalizado_em"] == AGORA.isoformat()
    assert d["iniciado_em"] is None
