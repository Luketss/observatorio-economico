"""Parser puro do Pé-de-Meia (Portal da Transparência) — sem rede, sem DB."""
import io

from app.services.ingestao_automatica.pe_de_meia_portal import parse_pe_de_meia_csv

CSV = io.StringIO(
    "MÊS FOLHA;MÊS REFERÊNCIA;UF;CÓDIGO MUNICÍPIO SIAFI;NOME MUNICÍPIO;NIS BENEFICIÁRIO;"
    "ETAPA ENSINO;TIPO INCENTIVO;VALOR PARCELA\n"
    "202605;202605;MG;4771;DIVINOPOLIS;111;Ensino Médio;Frequência;200,00\n"
    "202605;202605;MG;4771;DIVINOPOLIS;222;Ensino Médio;Matrícula;200,00\n"
    "202605;202605;MG;4771;DIVINOPOLIS;333;EJA;Frequência;225,00\n"
    "202605;202605;SP;7107;SAO PAULO;444;Ensino Médio;Frequência;200,00\n"
)


def test_parse_pe_de_meia_agrega_resumo_e_etapa():
    out = parse_pe_de_meia_csv(CSV, {("divinopolis", "MG"): 42})
    assert out["resumo"][42] == {"total_estudantes": 3, "valor_total": 625.0}
    assert out["etapa"][(42, "Ensino Médio", "Frequência")] == {"total_estudantes": 1, "valor_total": 200.0}
    assert out["etapa"][(42, "EJA", "Frequência")]["valor_total"] == 225.0
