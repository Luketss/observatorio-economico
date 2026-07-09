"""Parser puro do PIB (IBGE agregado 5938) — sem rede, sem DB.
Fixture no formato real da API de agregados (2026-07)."""
from app.services.ingestao_automatica.pib_ibge import parse_pib_ibge

PAYLOAD = [
    {"id": "37", "variavel": "Produto Interno Bruto a preços correntes", "unidade": "Mil Reais",
     "resultados": [{"series": [
         {"localidade": {"id": "3122306"}, "serie": {"2020": "9000000", "2021": "10500000"}},
     ]}]},
    {"id": "513", "variavel": "Valor adicionado bruto a preços correntes da agropecuária", "unidade": "Mil Reais",
     "resultados": [{"series": [
         {"localidade": {"id": "3122306"}, "serie": {"2020": "100000", "2021": "..."}},
     ]}]},
    {"id": "525", "variavel": "VAB adm pública", "unidade": "Mil Reais",
     "resultados": [{"series": [
         {"localidade": {"id": "3122306"}, "serie": {"2020": "800000"}},
     ]}]},
]


def test_parse_pib_agrupa_por_codigo_ano_e_coluna():
    out = parse_pib_ibge(PAYLOAD)
    assert out["3122306"][2020]["pib_total"] == 9000000.0
    assert out["3122306"][2020]["va_agropecuaria"] == 100000.0
    assert out["3122306"][2020]["va_governo"] == 800000.0
    assert out["3122306"][2021] == {"pib_total": 10500000.0}  # "..." ignorado


def test_parse_pib_payload_vazio():
    assert parse_pib_ibge([]) == {}
    assert parse_pib_ibge(None) == {}
