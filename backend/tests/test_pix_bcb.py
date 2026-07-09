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
