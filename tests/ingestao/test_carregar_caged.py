import csv
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


def _write_caged_csv(path: Path):
    caminho = path / "caged.csv"
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["ano", "mes", "saldo_movimentacao", "sexo", "raca_cor", "salario_mensal", "cnae_2_secao"])
        writer.writerow(["2025", "1", "5", "1", "2", "2500.0", "C"])
    return caminho


def test_carregar_inserts_row(tmp_path):
    _write_caged_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_caged.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_caged import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    # 1 row with admission (saldo=5): CagedMovimentacao + CagedPorSexo + CagedPorRaca + CagedSalario + CagedPorCnae = 5 adds
    assert db.add.call_count == 5
    db.commit.assert_called_once()


def test_carregar_skips_missing_file(tmp_path):
    db = MagicMock()

    with patch("ingestao.carregar_caged.obter_ou_criar_municipio") as mock_obter:
        from ingestao.carregar_caged import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
    mock_obter.assert_not_called()


def test_carregar_is_idempotent(tmp_path):
    _write_caged_csv(tmp_path)
    db = MagicMock()
    existing = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_caged.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_caged import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
