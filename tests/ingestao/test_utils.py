import pytest
from unittest.mock import MagicMock, patch
from ingestao.utils import normalizar_nome, obter_ou_criar_municipio


def test_normalizar_nome_converts_underscore_and_case():
    assert normalizar_nome("cabo_verde") == "CABO VERDE"
    assert normalizar_nome("  Nova_Lima  ") == "NOVA LIMA"


def test_obter_ou_criar_municipio_creates_if_not_found():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with patch("ingestao.utils.Municipio") as MockMunicipio:
        mock_m = MagicMock()
        MockMunicipio.return_value = mock_m
        result = obter_ou_criar_municipio(db, "CABO VERDE", "MG")

    db.add.assert_called_once()
    db.commit.assert_called_once()


def test_obter_ou_criar_municipio_returns_existing():
    db = MagicMock()
    existing = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing

    result = obter_ou_criar_municipio(db, "CABO VERDE", "MG")
    assert result is existing
    db.add.assert_not_called()
