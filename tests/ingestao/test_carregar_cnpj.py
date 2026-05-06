from pathlib import Path
from unittest.mock import MagicMock, patch
from ingestao.carregar_cnpj import carregar

ESTAB_HEADER = "cnpj_basico;nome_fantasia;situacao;data_situacao;data_inicio;cnae_fiscal;bairro;municipio"
EMPR_HEADER = "cnpj_basico;razao_social;capital_social;porte"
SIMP_HEADER = "cnpj_basico;opcao_simples;opcao_mei"


def test_carregar_merges_three_files_and_inserts(tmp_path):
    (tmp_path / "estabelecimentos.csv").write_text(
        f"{ESTAB_HEADER}\n12345678;FANTASIA;02;;20100101;4711302;Centro;CABO VERDE\n",
        encoding="utf-8",
    )
    (tmp_path / "empresas.csv").write_text(
        f"{EMPR_HEADER}\n12345678;EMPRESA TESTE LTDA;100000,00;ME\n",
        encoding="utf-8",
    )
    (tmp_path / "simples.csv").write_text(
        f"{SIMP_HEADER}\n12345678;S;N\n",
        encoding="utf-8",
    )
    db = MagicMock()
    municipio = MagicMock(); municipio.id = 1
    db.query.return_value.filter.return_value.all.return_value = []  # no existing CNPJs

    with patch("ingestao.carregar_cnpj.obter_ou_criar_municipio", return_value=municipio):
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.razao_social == "EMPRESA TESTE LTDA"
    assert added.opcao_simples is True
    assert added.opcao_mei is False


def test_carregar_skips_if_cnpj_already_exists(tmp_path):
    (tmp_path / "estabelecimentos.csv").write_text(
        f"{ESTAB_HEADER}\n12345678;FANTASIA;02;;20100101;4711302;Centro;CABO VERDE\n",
        encoding="utf-8",
    )
    (tmp_path / "empresas.csv").write_text(
        f"{EMPR_HEADER}\n12345678;EMPRESA TESTE LTDA;100000,00;ME\n",
        encoding="utf-8",
    )
    (tmp_path / "simples.csv").write_text(
        f"{SIMP_HEADER}\n12345678;S;N\n",
        encoding="utf-8",
    )
    db = MagicMock()
    municipio = MagicMock(); municipio.id = 1

    existing_row = MagicMock()
    existing_row.__getitem__ = lambda self, i: "12345678"
    existing_row[0] = "12345678"
    db.query.return_value.filter.return_value.all.return_value = [("12345678",)]

    with patch("ingestao.carregar_cnpj.obter_ou_criar_municipio", return_value=municipio):
        carregar(tmp_path, "Cabo Verde", "MG", db)

    db.add.assert_not_called()


def test_carregar_skips_missing_estabelecimentos(tmp_path, capsys):
    db = MagicMock()
    carregar(tmp_path, "Cabo Verde", "MG", db)
    db.add.assert_not_called()
    assert "estabelecimentos.csv" in capsys.readouterr().out
