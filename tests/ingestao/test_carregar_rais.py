import csv
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


def _write_rais_csv(path: Path):
    caminho = path / "rais_vinculos.csv"
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow([
            "ano", "valor_remuneracao_media", "sexo", "raca_cor",
            "cnae_2_subclasse", "faixa_etaria", "grau_instrucao_apos_2005",
            "faixa_remuneracao_media_sm", "faixa_tempo_emprego",
            "indicador_portador_deficiencia", "id_municipio", "id_municipio_trabalho",
            "quantidade_dias_afastamento",
        ])
        writer.writerow([
            "2023", "3500.0", "1", "2",
            "1011201", "4", "7",
            "5", "4",
            "0", "3141702", "3141702",
            "0",
        ])
    return caminho


def test_carregar_inserts_row(tmp_path):
    _write_rais_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter_by.return_value.first.return_value = None

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_rais.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_rais import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    # At least 1 add should have been called (RaisVinculo + breakdowns)
    assert db.add.call_count > 0
    db.commit.assert_called_once()


def test_carregar_skips_missing_file(tmp_path):
    db = MagicMock()

    with patch("ingestao.carregar_rais.obter_ou_criar_municipio") as mock_obter:
        from ingestao.carregar_rais import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
    mock_obter.assert_not_called()


def test_carregar_is_idempotent(tmp_path):
    _write_rais_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter_by.return_value.first.return_value = MagicMock()

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_rais.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_rais import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
