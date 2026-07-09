"""Parser puro do ESTBAN por agência (Bacen) — sem rede, sem DB.

Fixture recortada do CSV real 202603_ESTBAN_AG.csv.zip (header capturado em
2026-07-09): preâmbulo de 2 linhas + header '#DATA_BASE;UF;CODMUN;MUNICIPIO;
CNPJ;NOME_INSTITUICAO;AGENCIA;VERBETE_...;CODMUN_IBGE'. Nomes de coluna são
os EXATOS do arquivo real (inclusive a coluna combinada 401..419 de depósitos
à vista); valores inteiros sem separador, como no real."""
import io

import pytest

from app.services.ingestao_automatica.estban_bcb import MAPA_VERBETES, parse_estban_agencia

_VISTA = (
    "VERBETE_401_SERVICOS_PUBLICOS + VERBETE_402_ATIVIDADES_EMPRESARIAIS + "
    "VERBETE_403_ESPECIAIS_DO_TESOURO_NACIONAL + "
    "VERBETE_404_SALDOS_CREDORES_EM_CONTAS_DE_EMPRESTIMOS_E_FINAN + "
    "VERBETE_411_DE_PESSOAS_FISICAS + VERBETE_412_DE_PESSOAS_JURIDICAS + "
    "VERBETE_413_DE_INSTITUICOES_FINANCEIRAS + VERBETE_414_JUDICIAIS + "
    "VERBETE_415_OBRIGATORIOS + VERBETE_416_PARA_INVESTIMENTOS + "
    "VERBETE_417_VINCULADOS + VERBETE_418_DEMAIS_DEPOSITOS + "
    "VERBETE_419_SLD_CRED_CTAS_EMPR_FINANC_OUTR"
)

_HEADER = (
    "#DATA_BASE;UF;CODMUN;MUNICIPIO;CNPJ;NOME_INSTITUICAO;AGENCIA;"
    "VERBETE_160_OPERACOES_DE_CREDITO;VERBETE_161_EMPRES_E_TIT_DESCONTADOS;"
    f"{_VISTA};VERBETE_420_DEPOSITOS_DE_POUPANCA;CODMUN_IBGE"
)

_CSV = (
    "ESTBAN (Documento 4500) por agencia\n"
    "Data de geracao dos dados: 2026-06-01\n"
    f"{_HEADER}\n"
    "202603;MG;20134;DIVINOPOLIS;00000000;BCO DO BRASIL S.A.;'00000000001234;1000;600;300;200;3122306\n"
    "202603;MG;20134;DIVINOPOLIS;00000000;BCO DO BRASIL S.A.;'00000000005678;500;100;100;50;3122306\n"
    "202603;MG;20134;DIVINOPOLIS;00360305;CAIXA ECONOMICA FEDERAL;'00360305009999;2000;900;700;400;3122306\n"
    "202603;SP;11111;OUTRA CIDADE;00000000;BCO DO BRASIL S.A.;'00000000001111;9;9;9;9;3599999\n"
)


def _csv():
    return io.StringIO(_CSV)


def test_parse_estban_agrega_municipio_e_instituicao():
    out = parse_estban_agencia(_csv(), {("divinopolis", "MG"): 42})
    mun = out["municipio"][42]
    assert mun["qtd_agencias"] == 3
    assert mun["valor_operacoes_credito"] == 3500.0
    assert mun["emprestimos_titulos_descontados"] == 1600.0
    assert mun["valor_depositos_vista"] == 1100.0
    assert mun["valor_poupanca"] == 650.0
    # conceito sem verbete correspondente no layout por agência: fica 0.0
    assert mun["emprestimos_setor_publico"] == 0.0
    inst = out["instituicao"]
    assert inst[(42, "BCO DO BRASIL S.A.")]["qtd_agencias"] == 2
    assert inst[(42, "BCO DO BRASIL S.A.")]["valor_operacoes_credito"] == 1500.0
    assert inst[(42, "CAIXA ECONOMICA FEDERAL")]["valor_poupanca"] == 400.0
    # outra cidade fora do alvo não entra
    assert set(out["municipio"]) == {42}


def test_parse_estban_match_primario_por_codigo_ibge():
    # grafia divergente do nome não casa por (nome, UF), mas o CODMUN_IBGE casa
    csv_ibge = _CSV.replace("DIVINOPOLIS", "DIVINOPOLIS SEDE")
    out = parse_estban_agencia(
        io.StringIO(csv_ibge), {("divinopolis", "MG"): 42}, alvo_ibge={"3122306": 42}
    )
    assert out["municipio"][42]["qtd_agencias"] == 3
    assert out["municipio"][42]["valor_operacoes_credito"] == 3500.0


def test_parse_estban_sem_header_explode():
    with pytest.raises(ValueError, match="DATA_BASE"):
        parse_estban_agencia(io.StringIO("lixo\nsem;header\n"), {("x", "MG"): 1})


def test_mapa_verbetes_cobre_todas_as_colunas_do_model():
    esperadas = {
        "valor_operacoes_credito", "valor_depositos_vista", "valor_poupanca",
        "valor_depositos_prazo", "emprestimos_titulos_descontados",
        "financiamentos_gerais", "financiamento_agropecuario",
        "financiamentos_imobiliarios", "arrendamento_mercantil",
        "emprestimos_setor_publico", "outros_creditos",
    }
    assert set(MAPA_VERBETES) == esperadas
