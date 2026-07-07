"""Matemática do Radar de Emendas — sem DB."""
from app.services.emendas_service import montar_radar_puro, pct_pago

EMENDAS = [
    {"ano": 2026, "codigo": "A", "numero": "1", "autor": "DEPUTADO X",
     "tipo": "Emenda Individual", "funcao": "Saúde",
     "empenhado": 1_000_000.0, "liquidado": 500_000.0, "pago": 300_000.0, "resto_pago": 200_000.0},
    {"ano": 2026, "codigo": "B", "numero": "2", "autor": "DEPUTADO X",
     "tipo": "Emenda Individual", "funcao": "Educação",
     "empenhado": 500_000.0, "liquidado": 0.0, "pago": 0.0, "resto_pago": 0.0},
    {"ano": 2025, "codigo": "C", "numero": "3", "autor": "DEPUTADA Y",
     "tipo": "Emenda de Bancada", "funcao": "Saúde",
     "empenhado": 2_000_000.0, "liquidado": 2_000_000.0, "pago": 2_000_000.0, "resto_pago": 0.0},
]


def test_pct_pago_clamp_e_divisor_zero():
    assert pct_pago(100.0, 50.0) == 50.0
    assert pct_pago(100.0, 150.0) == 100.0    # clamp (restos > empenho do ano)
    assert pct_pago(100.0, -10.0) == 0.0
    assert pct_pago(0.0, 10.0) is None
    assert pct_pago(None, 10.0) is None


def test_radar_kpis_e_agrupamentos():
    r = montar_radar_puro(EMENDAS)
    assert r["disponivel"] is True
    k = r["kpis"]
    assert k["total_empenhado"] == 3_500_000.0
    assert k["pago_total"] == 2_500_000.0          # (300k+200k) + 0 + 2M
    assert k["pct_pago"] == round(2_500_000.0 / 3_500_000.0 * 100, 1)
    assert k["num_emendas"] == 3
    assert k["num_parlamentares"] == 2
    assert k["top_autor"] == "DEPUTADA Y"          # 2M > 1.5M
    assert k["top_autor_valor"] == 2_000_000.0

    autores = {a["autor"]: a for a in r["por_autor"]}
    assert list(autores) == ["DEPUTADA Y", "DEPUTADO X"]   # ordenado por empenhado desc
    assert autores["DEPUTADO X"]["num_emendas"] == 2
    assert autores["DEPUTADO X"]["empenhado"] == 1_500_000.0
    assert autores["DEPUTADO X"]["pago_total"] == 500_000.0

    funcoes = {f["funcao"]: f["empenhado"] for f in r["por_funcao"]}
    assert funcoes == {"Saúde": 3_000_000.0, "Educação": 500_000.0}

    # emendas ordenadas por ano desc, empenhado desc; com pago_total/pct_pago
    assert [e["codigo"] for e in r["emendas"]] == ["A", "B", "C"]
    assert r["emendas"][0]["pago_total"] == 500_000.0
    assert r["emendas"][0]["pct_pago"] == 50.0


def test_radar_vazio():
    r = montar_radar_puro([])
    assert r["disponivel"] is False
    assert r["kpis"] is None
    assert r["por_autor"] == [] and r["por_funcao"] == [] and r["emendas"] == []
