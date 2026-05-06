import csv
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch, call


def _write_arrecadacao_csv(path: Path):
    caminho = path / "arrecadacao.csv"
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["ano_particao", "MES_ESTIMADO", "NOME_MES", "DATA_BASE", "vr_icms", "vr_ipva", "vr_ipi"])
        writer.writerow(["2023", "1", "Janeiro", "2023-01-31", "1000.0", "200.0", "50.0"])
    return caminho


def test_carregar_inserts_row(tmp_path):
    _write_arrecadacao_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None  # no duplicate

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_arrecadacao.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_arrecadacao import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_called_once()
    db.commit.assert_called_once()


def test_carregar_skips_missing_file(tmp_path):
    db = MagicMock()

    with patch("ingestao.carregar_arrecadacao.obter_ou_criar_municipio") as mock_obter:
        from ingestao.carregar_arrecadacao import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
    mock_obter.assert_not_called()


def test_carregar_is_idempotent(tmp_path):
    _write_arrecadacao_csv(tmp_path)
    db = MagicMock()
    # Simulate existing record
    existing = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_arrecadacao.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_arrecadacao import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
