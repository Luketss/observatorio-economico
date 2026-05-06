import csv
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


def _write_pix_csv(path: Path):
    caminho = path / "pix.csv"
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow([
            "AnoMes", "Nome_Cidade",
            "VL_PagadorPF", "QT_PagadorPF", "QT_PES_PagadorPF",
            "VL_PagadorPJ", "QT_PagadorPJ", "QT_PES_PagadorPJ",
            "VL_RecebedorPF", "QT_RecebedorPF", "QT_PES_RecebedorPF",
            "VL_RecebedorPJ", "QT_RecebedorPJ", "QT_PES_RecebedorPJ",
        ])
        writer.writerow([
            "202301", "Cabo Verde",
            "1000.0", "50", "30",
            "2000.0", "20", "10",
            "500.0", "15", "10",
            "300.0", "5", "3",
        ])
    return caminho


def test_carregar_inserts_row(tmp_path):
    _write_pix_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_pix.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_pix import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_called_once()
    db.commit.assert_called_once()


def test_carregar_skips_missing_file(tmp_path):
    db = MagicMock()

    with patch("ingestao.carregar_pix.obter_ou_criar_municipio") as mock_obter:
        from ingestao.carregar_pix import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
    mock_obter.assert_not_called()


def test_carregar_is_idempotent(tmp_path):
    _write_pix_csv(tmp_path)
    db = MagicMock()
    existing = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_pix.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_pix import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
