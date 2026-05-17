"""
Unit tests for insights_service.gerar_prioridades.

Mocks the Anthropic client and _fetch_dados so tests are fast and have
no external dependencies. Same pattern as tests/ingestao/test_utils.py.
"""
import json
from unittest.mock import MagicMock, patch

import pytest

from backend.app.services import insights_service


def test_gerar_prioridades_happy_path():
    """When all datasets return data and Claude returns valid JSON,
    a new InsightIA row is upserted with dataset='prioridades'."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None  # no existing

    municipio = MagicMock()
    municipio.id = 1
    municipio.nome = "Cabo Verde"
    municipio.estado = "MG"
    db.get.return_value = municipio

    claude_response = MagicMock()
    claude_response.content = [MagicMock(text=json.dumps([
        {"titulo": "Atenção: queda em CAGED", "observacao": "Saldo negativo 3 meses.", "dataset_referencia": "caged"},
        {"titulo": "Oportunidade: PIX em alta", "observacao": "Volume +20% YoY.", "dataset_referencia": "pix"},
        {"titulo": "Risco: arrecadação volátil", "observacao": "IPVA concentrado em jan.", "dataset_referencia": "arrecadacao"},
    ]))]

    with patch.object(insights_service, "_fetch_dados") as mock_fetch, \
         patch.object(insights_service, "settings") as mock_settings, \
         patch.object(insights_service, "anthropic") as mock_anthropic:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_fetch.return_value = ([{"foo": "bar"}], "2026-05")
        mock_anthropic.Anthropic.return_value.messages.create.return_value = claude_response

        result = insights_service.gerar_prioridades(db, municipio_id=1)

    db.add.assert_called_once()
    db.commit.assert_called()
    added = db.add.call_args[0][0]
    assert added.dataset == "prioridades"
    assert added.municipio_id == 1
    parsed = json.loads(added.conteudo)
    assert len(parsed) == 3
    assert parsed[0]["dataset_referencia"] == "caged"


def test_httpexception_stub_preserves_attributes():
    """Sanity-check that conftest's fastapi.HTTPException stub stores status_code/detail."""
    from fastapi import HTTPException
    e = HTTPException(status_code=418, detail="teapot")
    assert e.status_code == 418
    assert e.detail == "teapot"
    assert "teapot" in str(e)


def test_gerar_prioridades_no_data_anywhere_raises_400():
    """When every dataset is empty, raise 400 instead of calling Claude."""
    from fastapi import HTTPException as _HE

    db = MagicMock()
    municipio = MagicMock()
    municipio.id = 1
    municipio.nome = "Vazio"
    municipio.estado = "MG"
    db.get.return_value = municipio

    with patch.object(insights_service, "_fetch_dados") as mock_fetch, \
         patch.object(insights_service, "settings") as mock_settings, \
         patch.object(insights_service, "anthropic") as mock_anthropic:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_fetch.return_value = ([], "geral")  # every dataset empty

        with pytest.raises(_HE) as exc_info:
            insights_service.gerar_prioridades(db, municipio_id=1)

    assert exc_info.value.status_code == 400
    assert "Sem dados suficientes" in exc_info.value.detail
    mock_anthropic.Anthropic.return_value.messages.create.assert_not_called()


def test_gerar_prioridades_missing_api_key_raises_503():
    """When ANTHROPIC_API_KEY is not set, raise 503."""
    from fastapi import HTTPException as _HE

    db = MagicMock()
    with patch.object(insights_service, "settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = None
        with pytest.raises(_HE) as exc_info:
            insights_service.gerar_prioridades(db, municipio_id=1)

    assert exc_info.value.status_code == 503


def test_gerar_prioridades_malformed_json_uses_fallback():
    """When Claude returns non-JSON, store a single fallback priority and don't crash."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    municipio = MagicMock()
    municipio.id = 1
    municipio.nome = "Cabo Verde"
    municipio.estado = "MG"
    db.get.return_value = municipio

    bad_response = MagicMock()
    bad_response.content = [MagicMock(text="not json at all")]

    with patch.object(insights_service, "_fetch_dados") as mock_fetch, \
         patch.object(insights_service, "settings") as mock_settings, \
         patch.object(insights_service, "anthropic") as mock_anthropic:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_fetch.return_value = ([{"foo": "bar"}], "2026-05")
        mock_anthropic.Anthropic.return_value.messages.create.return_value = bad_response

        result = insights_service.gerar_prioridades(db, municipio_id=1)

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    parsed = json.loads(added.conteudo)
    assert len(parsed) == 1
    assert parsed[0]["observacao"] == "not json at all"
    assert parsed[0]["dataset_referencia"] is None


def test_gerar_prioridades_some_datasets_missing_still_works():
    """When some datasets 404 in _fetch_dados, they're listed as ausentes and the call proceeds."""
    from fastapi import HTTPException as _HE

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    municipio = MagicMock()
    municipio.id = 1
    municipio.nome = "Parcial"
    municipio.estado = "MG"
    db.get.return_value = municipio

    def fake_fetch(_db, _mid, dataset):
        if dataset in {"caged", "pix"}:
            return ([{"foo": dataset}], "2026-05")
        raise _HE(status_code=404, detail=f"sem dados para {dataset}")

    good_response = MagicMock()
    good_response.content = [MagicMock(text=json.dumps([
        {"titulo": "Atenção: x", "observacao": "y", "dataset_referencia": "caged"},
        {"titulo": "Oportunidade: a", "observacao": "b", "dataset_referencia": "pix"},
        {"titulo": "Risco: c", "observacao": "d", "dataset_referencia": None},
    ]))]

    with patch.object(insights_service, "_fetch_dados", side_effect=fake_fetch), \
         patch.object(insights_service, "settings") as mock_settings, \
         patch.object(insights_service, "anthropic") as mock_anthropic:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_anthropic.Anthropic.return_value.messages.create.return_value = good_response

        result = insights_service.gerar_prioridades(db, municipio_id=1)

    # The prompt should mention the missing datasets
    prompt_arg = mock_anthropic.Anthropic.return_value.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "Datasets sem dados (ignore):" in prompt_arg
    for missing in ["arrecadacao", "pib", "rais", "bolsa_familia", "pe_de_meia", "inss", "estban", "comex", "empresas"]:
        assert missing in prompt_arg
