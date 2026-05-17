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
