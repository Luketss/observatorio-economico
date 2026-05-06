import csv
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


def _write_pe_meia_csv(path: Path):
    caminho = path / "pe_meia.csv"
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["MÊS REFERÊNCIA", "VALOR PARCELA", "ETAPA ENSINO", "TIPO INCENTIVO"])
        writer.writerow(["202401", "200.0", "Ensino Médio", "Matrícula"])
    return caminho


def test_carregar_inserts_row(tmp_path):
    _write_pe_meia_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_pe_de_meia.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_pe_de_meia import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    assert db.add.call_count == 2  # 1 PeDeMeiaResumo + 1 PeDeMeiaEtapa
    assert db.commit.call_count == 2


def test_carregar_skips_missing_file(tmp_path):
    db = MagicMock()

    with patch("ingestao.carregar_pe_de_meia.obter_ou_criar_municipio") as mock_obter:
        from ingestao.carregar_pe_de_meia import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
    mock_obter.assert_not_called()


def test_carregar_is_idempotent(tmp_path):
    _write_pe_meia_csv(tmp_path)
    db = MagicMock()
    existing = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_pe_de_meia.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_pe_de_meia import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
