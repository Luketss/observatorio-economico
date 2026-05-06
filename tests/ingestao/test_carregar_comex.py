import csv
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


def _write_comex_csv(path: Path):
    caminho = path / "comex.csv"
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["Nome_Cidade_API", "Data_Ref", "Tipo_Operacao", "Valor_USD", "Peso_KG", "Codigo_SH4", "Pais_Parceiro"])
        writer.writerow(["Cabo Verde - MG", "15/01/2023", "exportacao", "50000.0", "1000.0", "2701", "China"])
    return caminho


def test_carregar_inserts_rows(tmp_path):
    _write_comex_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_comex.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_comex import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    # 1 row: 1 ComexMensal + 1 ComexPorProduto + 1 ComexPorPais = 3 adds
    assert db.add.call_count == 3
    db.commit.assert_called_once()


def test_carregar_skips_missing_file(tmp_path):
    db = MagicMock()

    with patch("ingestao.carregar_comex.obter_ou_criar_municipio") as mock_obter:
        from ingestao.carregar_comex import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
    mock_obter.assert_not_called()
