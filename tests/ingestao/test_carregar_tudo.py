from unittest.mock import MagicMock, patch
from ingestao.carregar_tudo import normalizar_city_name, build_loader_list, _garantir_municipio


def test_normalizar_city_name():
    assert normalizar_city_name("cabo_verde") == "Cabo Verde"
    assert normalizar_city_name("nova_lima") == "Nova Lima"
    assert normalizar_city_name("sao_joao_del_rei") == "Sao Joao Del Rei"


def test_build_loader_list_returns_all_loaders():
    loaders = build_loader_list()
    names = [name for name, _ in loaders]
    assert "Arrecadação" in names
    assert "CNPJ" in names
    assert len(loaders) == 11


def test_garantir_municipio_sets_ibge_on_existing_record():
    municipio = MagicMock()
    municipio.codigo_ibge = None
    db = MagicMock()
    SessionLocal = MagicMock(return_value=db)

    with patch("ingestao.carregar_tudo.obter_ou_criar_municipio", return_value=municipio):
        _garantir_municipio("Cabo Verde", "MG", "3105905", SessionLocal)

    assert municipio.codigo_ibge == "3105905"
    db.commit.assert_called_once()


def test_garantir_municipio_skips_ibge_update_when_already_set():
    municipio = MagicMock()
    municipio.codigo_ibge = "3105905"
    db = MagicMock()
    SessionLocal = MagicMock(return_value=db)

    with patch("ingestao.carregar_tudo.obter_ou_criar_municipio", return_value=municipio):
        _garantir_municipio("Cabo Verde", "MG", "3105905", SessionLocal)

    db.commit.assert_not_called()


def test_garantir_municipio_no_ibge_does_not_commit():
    municipio = MagicMock()
    municipio.codigo_ibge = None
    db = MagicMock()
    SessionLocal = MagicMock(return_value=db)

    with patch("ingestao.carregar_tudo.obter_ou_criar_municipio", return_value=municipio):
        _garantir_municipio("Cabo Verde", "MG", None, SessionLocal)

    db.commit.assert_not_called()
