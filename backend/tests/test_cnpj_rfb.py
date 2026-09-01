"""Núcleo puro da fonte CNPJ/RFB — sem rede, sem DB.

Arquivos reais: CSV ';' com aspas, latin-1, SEM header, posicionais
(Estabelecimentos 30 colunas, Empresas 7, Simples 7, Municípios 2).
Município nas linhas de Estabelecimentos = código TOM da RFB (não IBGE);
match via mapa TOM->nome + UF da própria linha."""
import io
from unittest.mock import MagicMock, patch

import pytest

from app.services.ingestao_automatica.cnpj_rfb import (
    COLS_ESTAB,
    MAX_MUNICIPIOS_POR_EXECUCAO,
    carregar_mapa_tom,
    indexar_alvos,
    montar_linhas,
    processar_empresas,
    processar_estabelecimentos,
    processar_simples,
    validar_colunas,
)


def _mun(mid, nome, estado):
    m = MagicMock()
    m.id, m.nome, m.estado = mid, nome, estado
    return m


ALVOS_MUNS = [_mun(1, "Belo Horizonte", "MG")]


def _csv(linhas):
    return io.StringIO("\n".join(linhas))


def _estab(cnpj="12345678", matriz="1", fantasia="PADARIA X", situacao="02",
           data_ini="20200115", cnae="4721102", uf="MG", tom="4123"):
    campos = [""] * COLS_ESTAB
    campos[0], campos[3], campos[4], campos[5] = cnpj, matriz, fantasia, situacao
    campos[10], campos[11], campos[19], campos[20] = data_ini, cnae, uf, tom
    return ";".join(f'"{c}"' for c in campos)


MAPA_TOM = {"4123": "BELO HORIZONTE", "7107": "SAO PAULO"}


def _roda_estab(linhas, alvos=None):
    alvos = alvos if alvos is not None else indexar_alvos(ALVOS_MUNS)
    colhidas, stats = {}, {"tom_desconhecido": 0, "malformadas": 0}
    processar_estabelecimentos(_csv(linhas), MAPA_TOM, alvos, colhidas, stats)
    return colhidas, stats


def test_indexar_alvos_normaliza_nome_e_uf():
    alvos = indexar_alvos([_mun(7, "São Paulo", "sp")])
    assert list(alvos.values()) == [7]
    (chave,) = alvos
    assert chave[1] == "SP"


def test_carregar_mapa_tom():
    mapa = carregar_mapa_tom(_csv(['"4123";"BELO HORIZONTE"', '"7107";"SAO PAULO"']))
    assert mapa == MAPA_TOM


def test_estabelecimento_do_alvo_e_colhido():
    colhidas, stats = _roda_estab([_estab()])
    assert (1, "12345678") in colhidas
    e = colhidas[(1, "12345678")]
    assert e["situacao"] == "02" and e["cnae_fiscal"] == "4721102"
    assert e["nome_fantasia"] == "PADARIA X" and e["matriz"] is True
    assert stats["tom_desconhecido"] == 0


def test_fora_do_alvo_uf_ou_tom_diferente_ignorado():
    colhidas, _ = _roda_estab([_estab(tom="7107", uf="SP")])
    assert colhidas == {}


def test_matriz_preferida_sobre_filial():
    colhidas, _ = _roda_estab([
        _estab(matriz="2", fantasia="FILIAL"),
        _estab(matriz="1", fantasia="MATRIZ"),
        _estab(matriz="2", fantasia="OUTRA FILIAL"),
    ])
    assert colhidas[(1, "12345678")]["nome_fantasia"] == "MATRIZ"


def test_tom_desconhecido_e_contado_nao_silencioso():
    colhidas, stats = _roda_estab([_estab(tom="9998")])
    assert colhidas == {} and stats["tom_desconhecido"] == 1


def test_linha_malformada_contada_apos_primeira():
    colhidas, stats = _roda_estab([_estab(), '"so";"tres";"campos"'])
    assert (1, "12345678") in colhidas
    assert stats["malformadas"] == 1


def test_validar_colunas_layout_mudou():
    with pytest.raises(ValueError, match="layout mudou"):
        validar_colunas(["a", "b"], COLS_ESTAB, "Estabelecimentos0")


def _stats():
    return {"tom_desconhecido": 0, "malformadas": 0}


def test_processar_empresas_filtra_por_cnpj_e_parseia_capital():
    dados, stats = {}, _stats()
    processar_empresas(
        _csv(['"12345678";"PADARIA X LTDA";"2062";"49";"1.000,50";"01";""',
              '"99999999";"OUTRA";"2062";"49";"5,00";"05";""']),
        {"12345678"}, dados, stats)
    assert set(dados) == {"12345678"}
    assert dados["12345678"]["razao_social"] == "PADARIA X LTDA"
    assert dados["12345678"]["capital_social"] == 1000.5
    assert dados["12345678"]["porte"] == "01"
    assert stats["malformadas"] == 0


def test_processar_empresas_conta_malformada_apos_primeira():
    dados, stats = {}, _stats()
    processar_empresas(
        _csv(['"12345678";"PADARIA X LTDA";"2062";"49";"1.000,50";"01";""',
              '"so";"tres";"campos"',
              '"99999999";"OUTRA";"2062";"49";"5,00";"05";""']),
        {"12345678", "99999999"}, dados, stats)
    assert stats["malformadas"] == 1
    assert set(dados) == {"12345678", "99999999"}


def test_processar_simples_flags():
    dados, stats = {}, _stats()
    processar_simples(
        _csv(['"12345678";"S";"20200101";"";"20200101";"20200101";""']),
        {"12345678"}, dados, stats)
    assert dados["12345678"]["opcao_simples"] is True
    assert dados["12345678"]["opcao_mei"] is True  # data AAAAMMDD vale como flag
    assert stats["malformadas"] == 0


def test_processar_simples_conta_malformada_apos_primeira():
    dados, stats = {}, _stats()
    processar_simples(
        _csv(['"12345678";"S";"20200101";"";"20200101";"20200101";""',
              '"so";"tres";"campos"']),
        {"12345678"}, dados, stats)
    assert stats["malformadas"] == 1
    assert set(dados) == {"12345678"}


def test_montar_linhas_junta_passadas_e_faz_fallback_de_razao():
    colhidas = {(1, "12345678"): {"nome_fantasia": "PADARIA X", "situacao": "02",
                                  "data_inicio": "20200115", "cnae_fiscal": "4721102",
                                  "matriz": True}}
    linhas = montar_linhas(colhidas, {}, {})  # passada 2 vazia (degradada)
    (row,) = linhas[1]
    assert row["razao_social"] == "PADARIA X"  # fallback: nome_fantasia
    assert row["opcao_simples"] is False and row["opcao_mei"] is False
    assert str(row["data_inicio"]) == "2020-01-15"
    assert row["cnpj_basico"] == "12345678"


def test_montar_linhas_com_passada_2_completa():
    colhidas = {(1, "12345678"): {"nome_fantasia": None, "situacao": "08",
                                  "data_inicio": "", "cnae_fiscal": "4721102",
                                  "matriz": False}}
    linhas = montar_linhas(
        colhidas,
        {"12345678": {"razao_social": "R" * 200, "capital_social": 10.0, "porte": "05"}},
        {"12345678": {"opcao_simples": False, "opcao_mei": False}})
    (row,) = linhas[1]
    assert len(row["razao_social"]) == 150  # truncado ao String(150)
    assert row["porte"] == "05" and row["data_inicio"] is None


def test_tom_vazio_conta_como_malformada():
    colhidas, stats = _roda_estab([_estab(tom="")])
    assert colhidas == {} and stats["malformadas"] == 1 and stats["tom_desconhecido"] == 0


# ── Task 2: transporte/orquestração (fakes, sem rede) ────────────────────────
import app.services.ingestao_automatica.cnpj_rfb as cnpj_rfb


def test_extrair_meses_do_propfind():
    xml = "<d:href>/public.php/webdav/2026-06/</d:href><d:href>/public.php/webdav/2026-07/</d:href>"
    assert cnpj_rfb.extrair_meses(xml) == ["2026-06", "2026-07"]


def test_extrair_meses_vazio_e_erro_audivel():
    with pytest.raises(ValueError, match="nenhum mês"):
        cnpj_rfb.extrair_meses("<xml/>")


def test_nomes_dos_zips():
    nomes = cnpj_rfb.nomes_zips()
    assert nomes[0] == "Municipios.zip"
    assert "Estabelecimentos9.zip" in nomes and "Empresas0.zip" in nomes
    assert nomes[-1] == "Simples.zip" and len(nomes) == 22
    assert "Socios0.zip" not in nomes


def test_cnpj_registrado_fora_do_todas():
    from app.services.ingestao_automatica.base import (
        FONTES_AUTOMATICAS,
        FONTES_FORA_DO_TODAS,
        ORDEM_EXECUCAO_TODAS,
    )
    assert "cnpj" in FONTES_AUTOMATICAS
    assert "cnpj" in FONTES_FORA_DO_TODAS
    assert "cnpj" not in ORDEM_EXECUCAO_TODAS


def test_executar_recusa_selecao_grande_sem_chamada_de_rede():
    """Seleção acima do limite (memória: todos os estabelecimentos dos alvos
    ficam em RAM durante as passadas) é recusada audivelmente ANTES de
    qualquer chamada de rede — nem listar_meses() é acionado."""
    n = MAX_MUNICIPIOS_POR_EXECUCAO + 1
    municipios = [_mun(i, f"Municipio{i}", f"E{i:02d}") for i in range(n)]
    with patch.object(cnpj_rfb, "listar_meses") as listar_meses_mock:
        resumo = cnpj_rfb.executar(MagicMock(), municipios)
    listar_meses_mock.assert_not_called()
    assert resumo.municipios_ok == 0 and resumo.linhas == 0
    (erro,) = resumo.erros
    assert f"{n} municípios" in erro
    assert f"limite de {MAX_MUNICIPIOS_POR_EXECUCAO}" in erro


def test_fonte_registrada_declara_o_teto_de_municipios():
    """O runner recusa a seleção no POST (400) a partir deste campo — a guarda
    dentro de executar() continua como defesa em profundidade."""
    from app.services.ingestao_automatica.base import FONTES_AUTOMATICAS

    assert FONTES_AUTOMATICAS["cnpj"].max_municipios == MAX_MUNICIPIOS_POR_EXECUCAO
