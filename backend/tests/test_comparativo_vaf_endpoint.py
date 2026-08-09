"""/vaf/comparativo — envelope de pares (mesmo contrato do PIB, sobre ano_base)."""
from app.api.v1.routers.vaf import comparativo_vaf


def test_sem_municipio_selecionado_devolve_envelope_vazio():
    out = comparativo_vaf(mid=None, fixados=None, db=object())
    assert out.motivo == "sem_municipio"
    assert out.foco is None and out.itens == []


def test_rota_expoe_o_envelope_e_os_parametros():
    from app.main import app

    schema = app.openapi()
    op = schema["paths"]["/api/v1/vaf/comparativo"]["get"]
    ref = op["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert ref.endswith("VafComparativoOut")

    props = schema["components"]["schemas"]["VafComparativoOut"]["properties"]
    assert {"foco", "pares", "fixados", "criterio_pares", "motivo", "itens"} <= set(props)

    params = {p["name"] for p in op.get("parameters", [])}
    assert {"municipio_id", "fixados"} <= params

    item = schema["components"]["schemas"]["VafComparativoItem"]["properties"]
    assert "municipio_id" in item and "indice_participacao_municipal" in item
