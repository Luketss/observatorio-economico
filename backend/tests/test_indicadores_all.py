"""Contrato do GET /indicadores/all — padrão do repo: sem TestClient e sem DB;
o contrato da rota é conferido pelo OpenAPI (montado sem conexão)."""


def _openapi():
    from app.main import app
    return app.openapi()


def test_rota_all_existe_e_devolve_lista_de_indicador_info():
    schema = _openapi()
    op = schema["paths"]["/api/v1/indicadores/all"]["get"]
    resp = op["responses"]["200"]["content"]["application/json"]["schema"]
    assert resp["type"] == "array"
    assert resp["items"]["$ref"].endswith("IndicadorInfoOut")


def test_rota_unitaria_continua_existindo():
    schema = _openapi()
    assert "/api/v1/indicadores" in schema["paths"]
