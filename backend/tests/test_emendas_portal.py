"""Parser puro do CSV de emendas do Portal da Transparência — sem rede, sem DB.
Header copiado do EmendasParlamentares.csv real (download-de-dados, 2026-07-07)."""
import io

import pytest

from app.services.ingestao_automatica.emendas_portal import parse_emendas_csv

HEADER = (
    '"Código da Emenda";"Ano da Emenda";"Tipo de Emenda";"Código do Autor da Emenda";'
    '"Nome do Autor da Emenda";"Número da emenda";"Localidade de aplicação do recurso";'
    '"Código Município IBGE";"Município";"Código UF IBGE";"UF";"Região";"Código Função";'
    '"Nome Função";"Código Subfunção";"Nome Subfunção";"Código Programa";"Nome Programa";'
    '"Código Ação";"Nome Ação";"Código Plano Orçamentário";"Nome Plano Orçamentário";'
    '"Valor Empenhado";"Valor Liquidado";"Valor Pago";"Valor Restos A Pagar Inscritos";'
    '"Valor Restos A Pagar Cancelados";"Valor Restos A Pagar Pagos"'
)


def _linha(codigo, ano, tipo, autor, numero, ibge, municipio, funcao,
           empenhado, liquidado, pago, resto_pago):
    return (
        f'"{codigo}";"{ano}";"{tipo}";"S/I";"{autor}";"{numero}";"{municipio} - MG";'
        f'"{ibge}";"{municipio}";"3100000";"MINAS GERAIS";"Sudeste";"10";"{funcao}";'
        f'"301";"sub";"2015";"prog";"8581";"acao";"0000";"po";'
        f'"{empenhado}";"{liquidado}";"{pago}";"0,00";"0,00";"{resto_pago}"'
    )


IBGE_PARA_MID = {"3126109": 42}


def _csv(*linhas):
    return io.StringIO("\n".join([HEADER, *linhas]) + "\n")


def test_agrega_linhas_da_mesma_emenda_e_escolhe_funcao_dominante():
    texto = _csv(
        _linha("202638110001", 2026, "Emenda Individual - Transferências com Finalidade Definida",
               "DEPUTADO X", "38110001", "3126109", "FORMIGA", "Saúde",
               "100000,00", "50000,00", "40000,00", "10000,00"),
        _linha("202638110001", 2026, "Emenda Individual - Transferências com Finalidade Definida",
               "DEPUTADO X", "38110001", "3126109", "FORMIGA", "Urbanismo",
               "300000,00", "0,00", "0,00", "0,00"),
    )
    out = parse_emendas_csv(texto, IBGE_PARA_MID)
    assert set(out) == {42}
    reg = out[42]["202638110001"]
    assert reg["ano"] == 2026
    assert reg["autor"] == "DEPUTADO X"
    assert reg["valor_empenhado"] == 400000.0
    assert reg["valor_liquidado"] == 50000.0
    assert reg["valor_pago"] == 40000.0
    assert reg["valor_resto_pago"] == 10000.0
    assert reg["funcao"] == "Urbanismo"          # maior empenho
    assert reg["numero_emenda"] == "38110001"


def test_ignora_municipio_fora_do_alvo_e_filtra_anos():
    texto = _csv(
        _linha("202511110001", 2025, "Emenda de Bancada", "BANCADA MG", "11110001",
               "3126109", "FORMIGA", "Saúde", "10,00", "0,00", "0,00", "0,00"),
        _linha("202411110002", 2024, "Emenda de Bancada", "BANCADA MG", "11110002",
               "3126109", "FORMIGA", "Saúde", "20,00", "0,00", "0,00", "0,00"),
        _linha("202511110003", 2025, "Emenda de Bancada", "BANCADA SP", "11110003",
               "3550308", "SAO PAULO", "Saúde", "30,00", "0,00", "0,00", "0,00"),
    )
    out = parse_emendas_csv(texto, IBGE_PARA_MID, anos={2025})
    assert set(out[42]) == {"202511110001"}


def test_codigo_sem_informacao_gera_chave_sintetica():
    texto = _csv(
        _linha("Sem informação", 2025, "Emenda Individual", "DEPUTADA Y", "222",
               "3126109", "FORMIGA", "Saúde", "5,00", "0,00", "0,00", "0,00"),
    )
    out = parse_emendas_csv(texto, IBGE_PARA_MID)
    assert set(out[42]) == {"SI-2025-DEPUTADA Y-222"}


def test_header_invalido_falha_audivel():
    with pytest.raises(ValueError, match="layout mudou"):
        parse_emendas_csv(io.StringIO('"FOO";"BAR"\n"1";"2"\n'), IBGE_PARA_MID)


def test_codigo_sintetico_truncado_em_60_chars():
    texto = _csv(
        _linha("Sem informação", 2025, "Emenda de Bancada",
               "COMISSAO DE CIENCIA, TECNOLOGIA, COMUNICACAO E INFORMATICA", "10",
               "3126109", "FORMIGA", "Saúde", "5,00", "0,00", "0,00", "0,00"),
    )
    out = parse_emendas_csv(texto, IBGE_PARA_MID)
    (key,) = out[42].keys()
    assert key.startswith("SI-2025-COMISSAO")
    assert len(key) <= 60
