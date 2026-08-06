"""Interpretação pura dos .xls de repasses da Sefaz-RS — sem rede, sem DB,
sem BIFF: matrizes sintéticas (list[list]) com a MESMA forma das amostras
reais (rs_icms_202601.xls sheet 'JANEIRO 2026'; rs_ipva_202501.xls sheet
'Repasses'), valores transcritos delas. A extração xlrd (extrair_matriz) é
thin e fica fora dos testes por design."""
from datetime import date

import pytest

from app.services.ingestao_automatica.arrecadacao_rs import (
    MesDivergente,
    interpretar_matriz_icms,
    interpretar_matriz_ipva,
    montar_registros_rs,
)

# ICMS 01/2026 real tem 4 blocos semanais; aqui 2 (o parser DEVE achar o
# bloco TOTAL dinamicamente). Seriais 46028/46035 = 2026-01-06/13.
MATRIZ_ICMS = [
    ["MUNICIPIO", 46028.0, "", "", 46035.0, "", "",
     "TOTAL JANEIRO/2026", "", "", "TOTAL EM 2026", "", ""],
    ["", "REPASSE", "RETENÇÃO", "LÍQUIDO", "REPASSE", "RETENÇÃO", "LÍQUIDO",
     "REPASSE", "RETENÇÃO", "LÍQUIDO", "REPASSE", "RETENÇÃO", "LÍQUIDO"],
    ["ACEGUA", 73827.82, 2113.41, 71714.41, 52242.05, 51499.12, 742.93,
     1349464.36, 75900.72, 1273563.64, 1349464.36, 75900.72, 1273563.64],
    ["AGUA SANTA", 49164.69, 1902.07, 47262.62, 34789.91, 34000.0, 789.91,
     898658.38, 104037.13, 794621.25, 898658.38, 104037.13, 794621.25],
    ["XANGRI-LA", 40866.67, 5164.24, 35702.43, 28918.07, 26932.7, 1985.37,
     746982.81, 254512.0, 492470.81, 746982.81, 254512.0, 492470.81],
    ["REPASSE TOTAL ICMS", 50973749.04, 0.0, "", 36070045.66, "", "",
     931725330.9, "", "", 931725330.9, "", ""],
]

# IPVA 01/2025 real tem 22 seriais diários; aqui 3 (coluna 'Total Mês'
# localizada dinamicamente). Serial 45659 = 2025-01-02.
MATRIZ_IPVA = [
    ["NOME DO MUNICÍPIO", 45659.0, 45660.0, 45663.0, "Total Mês", "Total Ano"],
    ["ACEGUA", 33659.13, 117246.71, 17588.99, 279318.16, 279318.16],
    ["AGUA SANTA", 36082.34, 139570.08, 7040.73, 219682.51, 219682.51],
    ["XANGRI-LA", 123091.73, 501038.0, 46563.13, 1157990.51, 1157990.51],
    ["TOTAIS", 89269281.24, 233715889.4, 19228229.27, 505523459.6, 505523459.57],
]


def _clona(matriz):
    return [list(linha) for linha in matriz]


# ── ICMS ─────────────────────────────────────────────────────────────────────

def test_icms_usa_liquido_do_bloco_total_do_mes():
    valores, ignoradas = interpretar_matriz_icms(MATRIZ_ICMS, 2026, 1)
    assert valores == {"ACEGUA": 1273563.64, "AGUA SANTA": 794621.25,
                       "XANGRI-LA": 492470.81}
    assert ignoradas == []


def test_icms_bloco_total_localizado_dinamicamente():
    # mês com 1 semana a menos: bloco TOTAL desloca 3 colunas para a esquerda
    m = [linha[:4] + linha[7:] for linha in MATRIZ_ICMS]
    valores, _ = interpretar_matriz_icms(m, 2026, 1)
    assert valores["ACEGUA"] == 1273563.64


def test_icms_nao_confunde_total_em_ano_com_total_do_mes():
    # sem o bloco do mês, 'TOTAL EM 2026' NÃO pode ser usado no lugar
    m = [linha[:7] + linha[10:] for linha in MATRIZ_ICMS]
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_icms(m, 2026, 1)


def test_icms_mes_divergente():
    with pytest.raises(MesDivergente):
        interpretar_matriz_icms(MATRIZ_ICMS, 2026, 2)
    with pytest.raises(MesDivergente):
        interpretar_matriz_icms(MATRIZ_ICMS, 2025, 1)


def test_icms_linha_de_total_geral_pulada():
    valores, _ = interpretar_matriz_icms(MATRIZ_ICMS, 2026, 1)
    assert "REPASSE TOTAL ICMS" not in valores


def test_icms_header_municipio_mudou_e_layout_hard_stop():
    m = _clona(MATRIZ_ICMS)
    m[0][0] = "CIDADE"
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_icms(m, 2026, 1)


def test_icms_bloco_sem_liquido_e_layout_hard_stop():
    m = _clona(MATRIZ_ICMS)
    m[1][9] = "SALDO"  # LÍQUIDO do bloco TOTAL JANEIRO/2026
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_icms(m, 2026, 1)


def test_icms_retencao_sem_acento_tolerada():
    m = _clona(MATRIZ_ICMS)
    m[1] = [c.replace("RETENÇÃO", "RETENCAO").replace("LÍQUIDO", "LIQUIDO")
            if isinstance(c, str) else c for c in m[1]]
    valores, _ = interpretar_matriz_icms(m, 2026, 1)
    assert len(valores) == 3


def test_icms_celula_nao_numerica_vira_ignorada():
    m = _clona(MATRIZ_ICMS)
    m[3][9] = ""  # LÍQUIDO total de AGUA SANTA
    valores, ignoradas = interpretar_matriz_icms(m, 2026, 1)
    assert "AGUA SANTA" not in valores and ignoradas == ["AGUA SANTA"]


# ── IPVA ─────────────────────────────────────────────────────────────────────

def test_ipva_usa_coluna_total_mes():
    valores, ignoradas = interpretar_matriz_ipva(MATRIZ_IPVA, 2025, 1)
    assert valores == {"ACEGUA": 279318.16, "AGUA SANTA": 219682.51,
                       "XANGRI-LA": 1157990.51}
    assert ignoradas == []


def test_ipva_total_mes_localizado_dinamicamente():
    # mês com mais dias de repasse: 'Total Mês' desloca para a direita
    m = [[linha[0], linha[1], 45661.0, linha[2], linha[3], linha[4], linha[5]]
         for linha in MATRIZ_IPVA]
    valores, _ = interpretar_matriz_ipva(m, 2025, 1)
    assert valores["ACEGUA"] == 279318.16


def test_ipva_linha_totais_pulada():
    valores, _ = interpretar_matriz_ipva(MATRIZ_IPVA, 2025, 1)
    assert "TOTAIS" not in valores


def test_ipva_mes_divergente_pelo_serial():
    with pytest.raises(MesDivergente):
        interpretar_matriz_ipva(MATRIZ_IPVA, 2025, 2)
    with pytest.raises(MesDivergente):
        interpretar_matriz_ipva(MATRIZ_IPVA, 2024, 12)


def test_ipva_sem_coluna_total_mes_e_layout_hard_stop():
    m = [[c for c in linha[:4]] + [linha[5]] for linha in MATRIZ_IPVA]  # só Total Ano
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_ipva(m, 2025, 1)


def test_ipva_header_mudou_e_layout_hard_stop():
    m = _clona(MATRIZ_IPVA)
    m[0][0] = "MUNICIPIO"
    with pytest.raises(ValueError, match="layout"):
        interpretar_matriz_ipva(m, 2025, 1)


def test_ipva_celula_nao_numerica_vira_ignorada():
    m = _clona(MATRIZ_IPVA)
    m[2][4] = "-"
    valores, ignoradas = interpretar_matriz_ipva(m, 2025, 1)
    assert ignoradas == ["AGUA SANTA"] and "AGUA SANTA" not in valores


# ── Junção ICMS+IPVA (anti-meio-registro) ────────────────────────────────────

ALVO = {"acegua": 9}  # norm_nome_municipio("Aceguá") -> municipio_id 9


def test_montar_junta_por_nome_normalizado_e_ipi_zero():
    regs, sem_match = montar_registros_rs(
        {"ACEGUA": 1273563.64}, {"ACEGUA": 279318.16}, ALVO, 2026, 1)
    assert sem_match == []
    (r,) = regs
    assert r["municipio_id"] == 9 and r["ano"] == 2026 and r["mes"] == 1
    assert r["nome_mes"] == "Janeiro" and r["data_base"] == date(2026, 1, 1)
    assert r["valor_icms"] == 1273563.64 and r["valor_ipva"] == 279318.16
    assert r["valor_ipi"] == 0.0  # RS não publica IPI-Exportação
    assert r["valor_total"] == round(1273563.64 + 279318.16, 2)


def test_montar_alvo_so_num_arquivo_nao_grava_meio_registro():
    regs, sem_match = montar_registros_rs(
        {"ACEGUA": 1273563.64}, {}, ALVO, 2026, 1)
    assert regs == [] and sem_match == ["acegua: ausente no arquivo de IPVA"]


def test_montar_alvo_ausente_dos_dois_e_audivel():
    regs, sem_match = montar_registros_rs(
        {"OUTRA CIDADE": 1.0}, {"OUTRA CIDADE": 2.0}, ALVO, 2026, 1)
    assert regs == []
    assert sem_match == ["acegua: ausente nos arquivos de ICMS e IPVA"]


def test_montar_municipio_nao_alvo_e_ignorado():
    regs, sem_match = montar_registros_rs(
        {"ACEGUA": 1.0, "AGUA SANTA": 2.0}, {"ACEGUA": 3.0, "AGUA SANTA": 4.0},
        ALVO, 2026, 1)
    assert len(regs) == 1 and regs[0]["municipio_id"] == 9 and sem_match == []
