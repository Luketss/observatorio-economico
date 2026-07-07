"""Núcleo puro do Alerta de Faixa do FPM — faixas do FPM-Interior
(DL 1.881/81), distâncias, janela de 12 meses e montagem do alerta."""
import pytest

from app.services.fpm_service import (
    FAIXAS_FPM,
    Faixa,
    faixa_para_populacao,
    fpm_12m,
    montar_alerta,
)


# ── faixas ───────────────────────────────────────────────────────────────────
def test_faixas_tem_18_entradas_e_cobre_de_0_a_infinito():
    assert len(FAIXAS_FPM) == 18
    assert FAIXAS_FPM[0][0] == 0 and FAIXAS_FPM[0][2] == 0.6
    assert FAIXAS_FPM[-1][1] is None and FAIXAS_FPM[-1][2] == 4.0


@pytest.mark.parametrize("pop,coef", [
    (1, 0.6), (10_188, 0.6),          # fronteira superior da 1ª faixa
    (10_189, 0.8), (13_584, 0.8),     # fronteiras exatas da 2ª
    (13_585, 1.0),
    (156_216, 3.8),                   # última faixa finita
    (156_217, 4.0), (2_000_000, 4.0), # teto
])
def test_fronteiras_exatas_de_faixa(pop, coef):
    assert faixa_para_populacao(pop).coeficiente == coef


# ── fpm_12m ──────────────────────────────────────────────────────────────────
def test_fpm_12m_soma_ultimos_12_meses():
    meses = [(2025, m, 100_000.0) for m in range(1, 13)] + [(2024, 12, 999_999.0)]
    total, parcial = fpm_12m(meses)
    assert total == pytest.approx(1_200_000.0)
    assert parcial is False


def test_fpm_12m_anualiza_quando_ha_menos_de_12_meses():
    meses = [(2026, m, 100_000.0) for m in range(1, 7)]  # 6 meses
    total, parcial = fpm_12m(meses)
    assert total == pytest.approx(1_200_000.0)  # média 100k × 12
    assert parcial is True


def test_fpm_12m_sem_dados():
    assert fpm_12m([]) == (None, False)


# ── montar_alerta ────────────────────────────────────────────────────────────
FPM_1M_POR_PONTO = [(2025, m, 100_000.0) for m in range(1, 13)]  # 1,2M/ano


def test_alerta_oportunidade_com_valores():
    # pop 23.000 → faixa 1,2 (16.981–23.772); faltam 773 hab. (≤ 5% de 23.000)
    a = montar_alerta((2025, 23_000, "Estimativa IBGE"), FPM_1M_POR_PONTO)
    assert a["disponivel"] is True
    assert a["status"] == "oportunidade"
    assert a["coeficiente"] == 1.2
    assert a["hab_para_subir"] == 773
    assert a["hab_para_cair"] == 6_020
    assert a["fpm_12m"] == pytest.approx(1_200_000.0)
    assert a["valor_por_ponto"] == pytest.approx(1_000_000.0)
    assert a["ganho_proxima_faixa"] == pytest.approx(200_000.0)   # (1,4−1,2)×1M
    assert a["perda_faixa_anterior"] == pytest.approx(200_000.0)  # (1,2−1,0)×1M
    assert a["divergencia"] is None
    assert len(a["faixas"]) == 18
    assert [f for f in a["faixas"] if f["atual"]][0]["coeficiente"] == 1.2


def test_alerta_risco():
    # pop 10.200 → faixa 0,8 (piso 10.189); 12 hab. acima do piso
    a = montar_alerta((2025, 10_200, "Estimativa IBGE"), [])
    assert a["status"] == "risco"
    assert a["hab_para_cair"] == 12
    assert a["fpm_12m"] is None and a["ganho_proxima_faixa"] is None


def test_alerta_teto_sem_proxima_faixa():
    a = montar_alerta((2025, 200_000, "Estimativa IBGE"), [])
    assert a["status"] == "teto"
    assert a["coeficiente"] == 4.0
    assert a["hab_para_subir"] is None
    assert a["hab_para_cair"] == 43_784


def test_alerta_estavel_primeira_faixa_nao_tem_queda():
    a = montar_alerta((2025, 5_000, "Estimativa IBGE"), [])
    assert a["status"] == "estavel"
    assert a["hab_para_cair"] is None
    assert a["hab_para_subir"] == 5_189


def test_alerta_capital_nao_se_aplica():
    a = montar_alerta((2025, 500_000, "Estimativa IBGE"), [], eh_capital=True)
    assert a["disponivel"] is False and a["nao_aplicavel"] is True
    assert a["motivo"] == "fpm_capitais"


def test_alerta_sem_populacao():
    a = montar_alerta(None, [])
    assert a["disponivel"] is False and a["motivo"] == "sem_populacao"
