"""Parser puro do PIX (Olinda/BCB) — sem rede, sem DB.
Fixture no formato real do recurso TransacoesPixPorMunicipio."""
from app.services.ingestao_automatica.pix_bcb import parse_pix_olinda

VALORES = [
    {"Municipio_Ibge": "3122306", "Municipio": "DIVINOPOLIS", "Estado": "MG",
     "VL_PagadorPF": 150000.50, "QT_PagadorPF": 1200, "QT_PES_PagadorPF": 300,
     "VL_PagadorPJ": 90000.0, "QT_PagadorPJ": 400, "QT_PES_PagadorPJ": 80,
     "VL_RecebedorPF": 140000.0, "QT_RecebedorPF": 1100, "QT_PES_RecebedorPF": 290,
     "VL_RecebedorPJ": 100000.0, "QT_RecebedorPJ": 500, "QT_PES_RecebedorPJ": 90},
    {"Municipio_Ibge": "9999999", "VL_PagadorPF": 1.0},  # fora do alvo
]


def test_parse_pix_filtra_alvo_e_mapeia_colunas():
    out = parse_pix_olinda(VALORES, {"3122306": 42})
    assert set(out) == {42}
    assert out[42]["vl_pagador_pf"] == 150000.50
    assert out[42]["qt_pes_recebedor_pj"] == 90


def test_parse_pix_valores_ausentes_viram_none():
    out = parse_pix_olinda([{"Municipio_Ibge": "3122306", "VL_PagadorPF": 10.0}], {"3122306": 42})
    assert out[42]["vl_pagador_pf"] == 10.0
    assert out[42]["qt_pagador_pf"] is None


def test_parse_pix_com_anomes_descarta_linhas_fora_da_competencia():
    """Guarda client-side: o $filter da API já falhou silenciosamente uma vez
    (Step 1) — se regredir, linhas de outro mês NÃO podem ser gravadas."""
    valores = [
        {"Municipio_Ibge": 3122306, "AnoMes": 202605, "VL_PagadorPF": 100.0},
        {"Municipio_Ibge": 3106200, "AnoMes": 202604, "VL_PagadorPF": 999.0},  # off-month
        {"Municipio_Ibge": 3170206, "AnoMes": "202605", "VL_PagadorPF": 50.0},  # string equivalente
        {"Municipio_Ibge": 3143302, "VL_PagadorPF": 7.0},  # AnoMes ausente → mismatch
        {"Municipio_Ibge": 3118601, "AnoMes": "x", "VL_PagadorPF": 8.0},  # não-numérico → mismatch
    ]
    alvo = {"3122306": 1, "3106200": 2, "3170206": 3, "3143302": 4, "3118601": 5}
    out = parse_pix_olinda(valores, alvo, anomes=202605)
    assert set(out) == {1, 3}
    assert out[1]["vl_pagador_pf"] == 100.0
    assert out[3]["vl_pagador_pf"] == 50.0
