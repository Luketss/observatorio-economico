"""Parser puro do Bolsa Família (Portal da Transparência) — sem rede, sem DB."""
import io

from app.services.ingestao_automatica.bolsa_familia_portal import (
    calcular_primeira_infancia,
    parse_bolsa_familia_csv,
)

CSV = io.StringIO(
    "MÊS COMPETÊNCIA;MÊS REFERÊNCIA;UF;CÓDIGO MUNICÍPIO SIAFI;NOME MUNICÍPIO;NIS FAVORECIDO;VALOR PARCELA\n"
    "202605;202605;MG;4771;DIVINOPOLIS;123;600,00\n"
    "202605;202605;MG;4771;DIVINOPOLIS;456;900,00\n"     # 900 → PI=300, bolsa=600
    "202605;202605;SP;7107;SAO PAULO;789;650,00\n"        # fora do alvo
)


def test_calcular_primeira_infancia_regra_novo_bolsa():
    assert calcular_primeira_infancia(600.0) == 0.0
    assert calcular_primeira_infancia(900.0) == 300.0
    assert calcular_primeira_infancia(760.0) == 150.0   # (760-600)//150*150


def test_parse_bolsa_agrega_por_municipio():
    out = parse_bolsa_familia_csv(CSV, {("divinopolis", "MG"): 42}, eh_novo_bolsa=True)
    assert set(out) == {42}
    assert out[42]["total_beneficiarios"] == 2
    assert out[42]["valor_total"] == 1500.0
    assert out[42]["valor_primeira_infancia"] == 300.0
    assert out[42]["valor_bolsa"] == 1200.0
    assert out[42]["beneficiarios_primeira_infancia"] == 1


def test_parse_bolsa_auxilio_brasil_sem_primeira_infancia():
    csv2 = io.StringIO(
        "MÊS COMPETÊNCIA;UF;NOME MUNICÍPIO;VALOR PARCELA\n"
        "202207;MG;DIVINOPOLIS;900,00\n"
    )
    out = parse_bolsa_familia_csv(csv2, {("divinopolis", "MG"): 42}, eh_novo_bolsa=False)
    assert out[42]["valor_primeira_infancia"] == 0.0
    assert out[42]["valor_bolsa"] == 900.0
