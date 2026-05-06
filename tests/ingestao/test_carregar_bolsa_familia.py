import csv
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


def _write_bolsa_csv(path: Path):
    caminho = path / "bolsa_familia.csv"
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["MÊS COMPETÊNCIA", "VALOR PARCELA", "Valor Bolsa", "Primeira Infância"])
        writer.writerow(["202301", "600,00", "400,00", "150,00"])
    return caminho


def test_carregar_inserts_row(tmp_path):
    _write_bolsa_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_bolsa_familia.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_bolsa_familia import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_called_once()
    db.commit.assert_called_once()


def test_carregar_skips_missing_file(tmp_path):
    db = MagicMock()

    with patch("ingestao.carregar_bolsa_familia.obter_ou_criar_municipio") as mock_obter:
        from ingestao.carregar_bolsa_familia import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
    mock_obter.assert_not_called()


def test_carregar_is_idempotent(tmp_path):
    _write_bolsa_csv(tmp_path)
    db = MagicMock()
    existing = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_bolsa_familia.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_bolsa_familia import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
