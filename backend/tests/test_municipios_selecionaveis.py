"""Lista enxuta para o seletor 'comparar com…'. /municipios devolve só o próprio
município para não-admin e carrega campos administrativos; esta rota é a que
qualquer autenticado usa para escolher com quem se comparar."""


def test_rota_existe_e_devolve_lista_enxuta():
    from app.main import app

    schema = app.openapi()
    op = schema["paths"]["/api/v1/municipios/selecionaveis"]["get"]
    item = op["responses"]["200"]["content"]["application/json"]["schema"]["items"]["$ref"]
    assert item.endswith("MunicipioSelecionavel")

    props = schema["components"]["schemas"]["MunicipioSelecionavel"]["properties"]
    assert set(props) == {"id", "nome", "estado"}


def test_nao_colide_com_a_rota_de_id():
    from app.main import app

    caminhos = set(app.openapi()["paths"])
    assert "/api/v1/municipios/selecionaveis" in caminhos
