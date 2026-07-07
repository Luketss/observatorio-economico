"""Matemática do Dinheiro na Mesa (captação vs. pares) — sem DB."""
from app.services.captacao_federal_service import (
    ANO_INICIO,
    media,
    montar_diagnostico,
    posicao_no_grupo,
)

# capt: mid → ano → valores. Município 1 = "você"; 2 e 3 = pares; 4 = só nacional.
CAPT = {
    1: {2024: {"firmado": 1_100_000.0, "via_emenda": 400_000.0, "desembolsado": 250_000.0, "qtd": 3}},
    2: {2024: {"firmado": 5_000_000.0, "via_emenda": 0.0, "desembolsado": 0.0, "qtd": 5}},
    3: {2024: {"firmado": 3_400_000.0, "via_emenda": 100_000.0, "desembolsado": 0.0, "qtd": 2}},
    4: {2024: {"firmado": 9_000_000.0, "via_emenda": 0.0, "desembolsado": 0.0, "qtd": 9}},
}


def test_media_e_posicao():
    assert media([4.0, 2.0]) == 3.0
    assert media([]) is None
    assert posicao_no_grupo(1_100_000.0, [5_000_000.0, 3_400_000.0]) == 3
    assert posicao_no_grupo(6_000_000.0, [5_000_000.0, 3_400_000.0]) == 1


def test_diagnostico_basico_abaixo_dos_pares():
    d = montar_diagnostico(1, pares={2, 3}, nacional={2, 3, 4}, capt=CAPT, ano_corrente=2025)
    assert d["disponivel"] is True
    assert d["ano_referencia"] == 2024
    assert d["voce_firmado"] == 1_100_000.0
    assert d["media_pares"] == 4_200_000.0          # (5M + 3.4M) / 2
    assert d["media_nacional"] == 5_800_000.0       # (5M + 3.4M + 9M) / 3
    assert d["dinheiro_na_mesa"] == 3_100_000.0
    assert d["acima_da_media"] is False
    assert d["posicao"] == 3
    assert d["total_grupo"] == 3                    # 2 pares + você


def test_diagnostico_acima_dos_pares_zera_dinheiro_na_mesa():
    capt = {1: {2024: {"firmado": 9e6, "via_emenda": 0.0, "desembolsado": 0.0, "qtd": 1}},
            2: {2024: {"firmado": 1e6, "via_emenda": 0.0, "desembolsado": 0.0, "qtd": 1}}}
    d = montar_diagnostico(1, pares={2}, nacional={2}, capt=capt, ano_corrente=2025)
    assert d["acima_da_media"] is True
    assert d["dinheiro_na_mesa"] == 0.0
    assert d["posicao"] == 1


def test_par_sem_linha_conta_como_zero():
    # município 3 sem NENHUMA linha: média dos pares = (5M + 0) / 2
    capt = {1: CAPT[1], 2: CAPT[2]}
    d = montar_diagnostico(1, pares={2, 3}, nacional={2, 3}, capt=capt, ano_corrente=2025)
    assert d["media_pares"] == 2_500_000.0


def test_serie_cobre_janela_e_marca_parcial():
    d = montar_diagnostico(1, pares={2, 3}, nacional=set(), capt=CAPT, ano_corrente=2025)
    anos = [item["ano"] for item in d["serie"]]
    assert anos == list(range(ANO_INICIO, 2026))
    assert all(item["parcial"] is (item["ano"] == 2025) for item in d["serie"])
    item_2024 = next(i for i in d["serie"] if i["ano"] == 2024)
    assert item_2024["voce"] == 1_100_000.0
    assert item_2024["media_pares"] == 4_200_000.0
    assert item_2024["via_emenda"] == 400_000.0
    # ano sem dados: tudo zero, média zero (pares existem mas sem linhas)
    item_2019 = next(i for i in d["serie"] if i["ano"] == 2019)
    assert item_2019["voce"] == 0.0
    assert item_2019["media_pares"] == 0.0


def test_sem_pares_media_none():
    d = montar_diagnostico(1, pares=set(), nacional=set(), capt={1: CAPT[1]}, ano_corrente=2025)
    assert d["disponivel"] is True
    assert d["media_pares"] is None
    assert d["dinheiro_na_mesa"] == 0.0
    assert d["acima_da_media"] is False
    assert d["total_grupo"] == 1


def test_grupo_inteiro_sem_dados():
    d = montar_diagnostico(1, pares={2, 3}, nacional=set(), capt={}, ano_corrente=2025)
    assert d["disponivel"] is False
    assert d["motivo"] == "sem_dados"
