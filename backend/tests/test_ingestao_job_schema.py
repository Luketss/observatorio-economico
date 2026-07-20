"""Schema do IngestaoJob — colunas e defaults, sem DB."""
from app.models.ingestao_job import IngestaoJob


def test_ingestao_job_colunas():
    cols = {c.name for c in IngestaoJob.__table__.columns}
    assert {
        "id", "dataset", "status", "filtros", "progresso_atual",
        "progresso_total", "etapa", "resumo", "erro", "usuario_id",
        "criado_em", "iniciado_em", "atualizado_em", "finalizado_em",
    } <= cols


def test_ingestao_job_defaults():
    tabela = IngestaoJob.__table__
    assert tabela.columns["status"].default.arg == "pendente"
    assert tabela.columns["progresso_atual"].default.arg == 0
    assert tabela.columns["usuario_id"].nullable is True
    assert tabela.columns["dataset"].nullable is False
