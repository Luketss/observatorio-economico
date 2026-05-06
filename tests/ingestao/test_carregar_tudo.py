from ingestao.carregar_tudo import normalizar_city_name, build_loader_list


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
