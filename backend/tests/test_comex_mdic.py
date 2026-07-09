"""Parser puro do Comex Stat (MDIC) — sem rede, sem DB."""
import io

from app.services.ingestao_automatica.comex_mdic import parse_comex_mun

CSV_MUN = io.StringIO(
    '"CO_ANO";"CO_MES";"SH4";"CO_PAIS";"SG_UF_MUN";"CO_MUN";"KG_LIQUIDO";"VL_FOB"\n'
    '"2025";"1";"0901";"063";"MG";"3122306";"1000";"5000"\n'
    '"2025";"1";"0901";"063";"MG";"3122306";"500";"2500"\n'
    '"2025";"2";"7202";"160";"MG";"3122306";"20000";"90000"\n'
    '"2025";"1";"0901";"063";"SP";"3550308";"99";"99"\n'   # fora do alvo
)


def test_parse_comex_agrega_mensal_produto_pais():
    out = parse_comex_mun(CSV_MUN, {"3122306": 42}, "export")
    assert out["mensal"][(42, 2025, 1, "export")] == {"valor_usd": 7500.0, "peso_kg": 1500.0}
    assert out["mensal"][(42, 2025, 2, "export")]["valor_usd"] == 90000.0
    assert out["por_produto"][(42, 2025, "export", "0901")] == {"valor_usd": 7500.0, "peso_kg": 1500.0}
    assert out["por_pais"][(42, 2025, "export", "063")] == {"valor_usd": 7500.0}
