"""Parsers puros do SICONV (captação federal) — sem rede, sem DB.
Headers copiados dos CSVs reais de repositorio.dados.gov.br/seges/detru/ (2026-07-07)."""
import io

import pytest

from app.services.ingestao_automatica.captacao_siconv import (
    ConveniosParse,
    montar_registros,
    parse_convenio_csv,
    parse_desembolso_csv,
    parse_emenda_csv,
    parse_proposta_csv,
)
from app.services.ingestao_automatica.util import indices_colunas, parse_valor_br

IBGE_PARA_MID = {"3126109": 42, "3505401": 7}

CSV_PROPOSTA = (
    "ID_PROPOSTA;UF_PROPONENTE;MUNIC_PROPONENTE;COD_MUNIC_IBGE;NATUREZA_JURIDICA\n"
    "100;MG;FORMIGA;3126109;Administração Pública Municipal\n"
    "101;MG;FORMIGA;3126109;Organização da Sociedade Civil\n"
    "102;SP;BARRA DO TURVO;3505401;Administração Pública Municipal\n"
    "103;RJ;RIO CLARO;3304409;Administração Pública Municipal\n"
)

CSV_CONVENIO = (
    "NR_CONVENIO;ID_PROPOSTA;DIA;MES;ANO;DIA_ASSIN_CONV;IND_ASSINADO;VL_GLOBAL_CONV;VL_REPASSE_CONV\n"
    "900001;100;22;3;2024;22/03/2024;SIM;1031000;1000000\n"
    "900002;100;10;7;2024;10/07/2024;SIM;515000;500000,50\n"
    "900003;102;05;1;2018;05/01/2018;SIM;200000;200000\n"      # fora da janela, mas entra em mid_por_convenio
    "900004;102;05;1;2024;;NÃO;99999;99999\n"                   # não assinado
    "900005;999;05;1;2024;05/01/2024;SIM;77777;77777\n"          # proposta desconhecida
)

CSV_EMENDA = (
    "ID_PROPOSTA;QUALIF_PROPONENTE;COD_PROGRAMA_EMENDA;NR_EMENDA;NOME_PARLAMENTAR;BENEFICIARIO_EMENDA;IND_IMPOSITIVO;TIPO_PARLAMENTAR;VALOR_REPASSE_PROPOSTA_EMENDA;VALOR_REPASSE_EMENDA\n"
    "100;BENEFICIARIO;5500020240001;81000306;DEPUTADO X;05193057000178;SIM;INDIVIDUAL;955000;300000\n"
    "100;BENEFICIARIO;5500020240002;81000307;DEPUTADA Y;05193057000178;SIM;INDIVIDUAL;100000;100000,25\n"
    "102;BENEFICIARIO;5500020180001;81000308;DEPUTADO Z;05193057000178;NÃO;INDIVIDUAL;50000;50000\n"  # proposta 102 assinada em 2018 → fora
    "999;BENEFICIARIO;5500020240003;81000309;DEPUTADO W;05193057000178;SIM;INDIVIDUAL;1;1\n"
)

CSV_DESEMBOLSO = (
    "ID_DESEMBOLSO;NR_CONVENIO;DT_ULT_DESEMBOLSO;QTD_DIAS_SEM_DESEMBOLSO;DATA_DESEMBOLSO;ANO_DESEMBOLSO;MES_DESEMBOLSO;NR_SIAFI;UG_EMITENTE_DH;OBSERVACAO_DH;VL_DESEMBOLSADO\n"
    "1;900001;21/05/2024;10;21/05/2024;2024;5;2024OB1;200005;obs;400000\n"
    "2;900001;21/08/2024;10;21/08/2024;2024;8;2024OB2;200005;obs;100000,75\n"
    "3;900003;21/05/2024;10;21/05/2024;2024;5;2024OB3;200005;obs;25000\n"   # convênio de 2018, desembolso 2024 → conta
    "4;900003;21/05/2017;10;21/05/2017;2017;5;2017OB1;200005;obs;99999\n"   # ano fora da janela
    "5;888888;21/05/2024;10;21/05/2024;2024;5;2024OB4;200005;obs;99999\n"   # convênio desconhecido
)


def _linhas(texto):
    return io.StringIO(texto)


def test_parse_valor_br():
    assert parse_valor_br("1.234,56") == 1234.56
    assert parse_valor_br("1000000") == 1000000.0
    assert parse_valor_br("500000,50") == 500000.5
    assert parse_valor_br(" -   ") is None
    assert parse_valor_br("") is None
    assert parse_valor_br(None) is None


def test_indices_colunas_valida_header():
    idx = indices_colunas(["A", "B", "C"], ["A", "C"], "arquivo.csv")
    assert idx == {"A": 0, "B": 1, "C": 2}
    with pytest.raises(ValueError, match="layout mudou"):
        indices_colunas(["A", "B"], ["A", "Z"], "arquivo.csv")


def test_parse_proposta_filtra_natureza_e_alvo():
    out = parse_proposta_csv(_linhas(CSV_PROPOSTA), IBGE_PARA_MID)
    # 101 = OSC (fora); 103 = IBGE fora do alvo
    assert out == {"100": 42, "102": 7}


def test_parse_convenio_agrega_assinados_na_janela():
    proposta = {"100": 42, "102": 7}
    out = parse_convenio_csv(_linhas(CSV_CONVENIO), proposta, anos={2024, 2025})
    assert out.por_municipio_ano == {(42, 2024): {"firmado": 1500000.5, "qtd": 2}}
    assert out.ano_por_proposta == {"100": (42, 2024)}
    # convênio de 2018 entra no mapa p/ desembolso; não-assinado e proposta 999 não
    assert out.mid_por_convenio == {"900001": 42, "900002": 42, "900003": 7}


def test_parse_emenda_atribui_ao_ano_de_assinatura():
    ano_por_proposta = {"100": (42, 2024)}
    out = parse_emenda_csv(_linhas(CSV_EMENDA), ano_por_proposta)
    assert out == {(42, 2024): 400000.25}


def test_parse_desembolso_por_ano_do_desembolso():
    mid_por_convenio = {"900001": 42, "900002": 42, "900003": 7}
    out = parse_desembolso_csv(_linhas(CSV_DESEMBOLSO), mid_por_convenio, anos={2024, 2025})
    assert out == {(42, 2024): 500000.75, (7, 2024): 25000.0}


def test_montar_registros_une_as_tres_fontes():
    convenios = ConveniosParse(
        por_municipio_ano={(42, 2024): {"firmado": 1500000.5, "qtd": 2}},
        ano_por_proposta={"100": (42, 2024)},
        mid_por_convenio={},
    )
    registros = montar_registros(
        convenios,
        via_emenda={(42, 2024): 400000.25},
        desembolsos={(42, 2024): 500000.75, (7, 2024): 25000.0},
    )
    assert registros == [
        {"municipio_id": 7, "ano": 2024, "valor_firmado": 0.0, "qtd_convenios": 0,
         "valor_via_emenda": 0.0, "valor_desembolsado": 25000.0},
        {"municipio_id": 42, "ano": 2024, "valor_firmado": 1500000.5, "qtd_convenios": 2,
         "valor_via_emenda": 400000.25, "valor_desembolsado": 500000.75},
    ]


def test_parse_proposta_header_invalido():
    with pytest.raises(ValueError, match="layout mudou"):
        parse_proposta_csv(_linhas("FOO;BAR\n1;2\n"), IBGE_PARA_MID)


def test_fpm_stn_continua_usando_o_helper():
    from app.services.ingestao_automatica.fpm_stn import _parse_valor
    assert _parse_valor(" 12.281.019,33 ") == 12281019.33
