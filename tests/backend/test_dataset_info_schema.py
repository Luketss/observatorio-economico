"""
Tests for the dataset_info Pydantic schemas.

These run in the lightweight test venv (pydantic only — no FastAPI / DB).
The router endpoints themselves are exercised against the running app in the
devcontainer; here we lock down the partial-update contract that the router
relies on, since wiping titulo/conteudo when only fonte/date is sent would be
a silent data-loss regression.
"""
from app.schemas.dataset_info import DatasetInfoOut, DatasetInfoUpdate


def test_update_partial_excludes_unset_fields():
    """Sending only fonte/date must NOT include titulo/conteudo, so the
    router's setattr loop leaves the existing description untouched."""
    update = DatasetInfoUpdate(fonte="IBGE — SIDRA", data_atualizacao="Março/2026")
    fields = update.model_dump(exclude_unset=True)

    assert fields == {"fonte": "IBGE — SIDRA", "data_atualizacao": "Março/2026"}
    assert "titulo" not in fields
    assert "conteudo" not in fields


def test_update_all_fields_present_when_set():
    update = DatasetInfoUpdate(titulo="PIB", conteudo="...", fonte="IBGE", data_atualizacao="2024")
    fields = update.model_dump(exclude_unset=True)
    assert set(fields) == {"titulo", "conteudo", "fonte", "data_atualizacao"}


def test_out_defaults_fonte_and_data_to_none():
    """GET on a dataset with no metadata yet returns empty strings for the
    text fields and None for the new optional fields."""
    out = DatasetInfoOut(dataset="pib", titulo="", conteudo="")
    assert out.fonte is None
    assert out.data_atualizacao is None


def test_out_reads_from_orm_like_object():
    class FakeRow:
        dataset = "caged"
        titulo = "CAGED"
        conteudo = "Movimentação de empregos."
        fonte = "Ministério do Trabalho"
        data_atualizacao = "Abril/2026"

    out = DatasetInfoOut.model_validate(FakeRow())
    assert out.fonte == "Ministério do Trabalho"
    assert out.data_atualizacao == "Abril/2026"
