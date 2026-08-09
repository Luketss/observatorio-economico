"""/pib/comparativo — envelope de pares. Padrão do repo: sem TestClient e sem DB;
o caminho mid=None retorna antes de tocar a Session, e o contrato da rota é
conferido pelo OpenAPI (que o FastAPI monta sem conexão)."""
from app.api.v1.routers.pib import comparativo_pib


def test_sem_municipio_selecionado_devolve_envelope_vazio():
    out = comparativo_pib(mid=None, fixados=None, db=object())
    assert out.motivo == "sem_municipio"
    assert out.foco is None
    assert out.itens == [] and out.pares == [] and out.fixados == []


def _openapi():
    from app.main import app
    return app.openapi()


def test_rota_expoe_o_envelope_e_os_parametros():
    schema = _openapi()
    op = schema["paths"]["/api/v1/pib/comparativo"]["get"]
    ref = op["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert ref.endswith("PibComparativoOut")

    props = schema["components"]["schemas"]["PibComparativoOut"]["properties"]
    assert {"foco", "pares", "fixados", "criterio_pares", "motivo", "itens"} <= set(props)

    params = {p["name"] for p in op.get("parameters", [])}
    assert {"municipio_id", "fixados"} <= params


def test_item_carrega_municipio_id():
    props = _openapi()["components"]["schemas"]["PibComparativoItem"]["properties"]
    assert "municipio_id" in props
