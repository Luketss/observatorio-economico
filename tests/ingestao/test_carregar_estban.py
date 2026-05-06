import csv
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


def _write_estban_csv(path: Path):
    caminho = path / "estban.csv"
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow([
            "MUNICIPIO", "DATA_REFERENCIA", "NOME_INSTITUICAO", "QTD_AGENCIAS",
            "TOTAL_OPERACOES_CREDITO", "VALOR_DEPOSITOS_VISTA", "VALOR_POUPANCA",
            "VALOR_DEPOSITOS_PRAZO", "EMPRESTIMOS_E_TITULOS_DESCONTADOS",
            "FINANCIAMENTOS_GERAIS", "FINANCIAMENTO_AGROPECUARIO",
            "FINANCIAMENTOS_IMOBILIARIOS", "ARRENDAMENTO_MERCANTIL",
            "EMPRESTIMOS_SETOR_PUBLICO", "OUTROS_CREDITOS",
        ])
        writer.writerow([
            "CABO VERDE", "2023-01-01", "Banco Exemplo", "2",
            "5000000.0", "1000000.0", "800000.0",
            "600000.0", "200000.0",
            "400000.0", "300000.0",
            "100000.0", "50000.0",
            "75000.0", "25000.0",
        ])
    return caminho


def test_carregar_inserts_rows(tmp_path):
    _write_estban_csv(tmp_path)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    mock_municipio = MagicMock()
    mock_municipio.id = 1

    with patch("ingestao.carregar_estban.obter_ou_criar_municipio", return_value=mock_municipio):
        from ingestao.carregar_estban import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    # 1 row: 1 EstbanMensal + 1 EstbanPorInstituicao = 2 adds
    assert db.add.call_count == 2
    assert db.commit.call_count == 2


def test_carregar_skips_missing_file(tmp_path):
    db = MagicMock()

    with patch("ingestao.carregar_estban.obter_ou_criar_municipio") as mock_obter:
        from ingestao.carregar_estban import carregar
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()
    mock_obter.assert_not_called()
