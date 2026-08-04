"""Agregação pura dos microdados de vínculos da RAIS (PDET) — sem rede, sem DB.

Formato REAL (validado no RAIS_VINC_PUB_NI.COMT de 2025): CSV com VÍRGULA e
aspas, decimal com ponto, campos podem ter espaços à esquerda, header com
sufixo ' - Código'. O ano NÃO vem no arquivo (1 arquivo por ano)."""
import io

from app.services.ingestao_automatica.rais_pdet import (
    agregar_arquivo,
    novo_agregados,
)

# Header real (subconjunto na ordem que usamos; agregar_arquivo resolve por NOME,
# então um header sintético com as colunas relevantes é suficiente)
HEADER = ",".join([
    '"Motivo Desligamento - Código"', '"CBO 2002 Ocupação - Código"',
    '"Ind Vínculo Ativo 31/12 - Código"', '"Faixa Etária - Código"',
    '"Faixa Rem Média (SM) - Código"', '"Faixa Tempo Emprego - Código"',
    '"Escolaridade Após 2005 - Código"', '"Mês Admissão - Código"',
    '"Mês Desligamento - Código"', '"Município Trab - Código"',
    '"Município - Código"', '"Natureza Jurídica - Código"',
    '"Ind Portador Defic - Código"', '"Qtd Dias Afastamento"',
    '"Raça Cor - Código"', '"Vl Rem Média Nom"',
    '"CNAE 2.0 Subclasse - Codigo"', '"Sexo - Código"',
    '"Tamanho Estabelecimento - Código"',
    '"Tipo Admissão Trabalhador - Código"', '"Tipo Vínculo - Código"',
    '"Ind Estabelecimento Participante SIMPLES - Código"',
    '"Ind Trabalho Intermitente - Código"', '"Ind Trabalho Parcial - Código"',
])

ALVO = {"310620": 1}  # Belo Horizonte (6 dígitos) -> municipio_id 1


def _linha(mun="310620", sexo="1", raca="2", cnae=" 4120400", fx_et="4",
           esc="7", fx_rem="3", fx_tempo="4", pcd="0", mun_trab="310620",
           dias_afas="0", rem="1637.69", motivo="0", cbo="717020",
           ativo="1", mes_adm="0", mes_des="0", nat="2062", tam="7",
           tipo_adm="0", tipo_vinc="10", simples="0", intermit="0", parcial="0"):
    vals = [motivo, cbo, ativo, fx_et, fx_rem, fx_tempo, esc, mes_adm, mes_des,
            mun_trab, mun, nat, pcd, dias_afas, raca, rem, cnae, sexo, tam,
            tipo_adm, tipo_vinc, simples, intermit, parcial]
    return ",".join(f'"{v}"' for v in vals)


def _agrega(linhas, ano=2025, agg=None):
    agg = agg or novo_agregados()
    f = io.StringIO("\n".join([HEADER] + linhas))
    processadas = agregar_arquivo(f, ano, ALVO, agg)
    return agg, processadas


def test_contagem_e_remuneracao_media_so_positivos():
    agg, n = _agrega([_linha(rem="1000.00"), _linha(rem="3000.00"), _linha(rem=".00")])
    assert n == 3
    v = agg["vinculos"][(1, 2025)]
    assert v["total"] == 3
    assert v["rem_soma"] == 4000.0 and v["rem_cnt"] == 2  # media 2000, .00 fora


def test_fora_do_alvo_e_ignorado():
    agg, n = _agrega([_linha(mun="999999"), _linha(mun="355030")])
    assert n == 2
    assert agg["vinculos"] == {}


def test_sexo_raca_labels_do_loader_manual():
    # 3ª linha fixa sexo="9" p/ não colidir com o default (sexo="1") da 1ª linha.
    agg, _ = _agrega([_linha(sexo="1"), _linha(sexo="2"), _linha(sexo="9", raca="8")])
    assert agg["por_sexo"][(1, 2025, "Masculino")]["total"] == 1
    assert agg["por_sexo"][(1, 2025, "Feminino")]["total"] == 1
    assert agg["por_raca"][(1, 2025, "Parda")]["total"] == 1


def test_cnae_secao_por_2_digitos_da_subclasse():
    agg, _ = _agrega([_linha(cnae=" 4120400")])  # 41 -> F Construção
    chave = (1, 2025, "F")
    assert agg["por_cnae"][chave]["total"] == 1
    assert agg["por_cnae"][chave]["descricao"] == "Construção"


def test_cnae_desconhecida_vira_bucket_nao_descarta():
    agg, _ = _agrega([_linha(cnae="0480000")])  # divisao 04 inexistente na CNAE 2.0
    chave = (1, 2025, "04")  # secao e String(5): a propria divisao vira a chave
    assert agg["por_cnae"][chave]["total"] == 1
    assert agg["por_cnae"][chave]["descricao"] == "Divisão CNAE 04 (fora do mapa)"


def test_todos_noves_e_nclass_viram_nao_identificado():
    agg, _ = _agrega([_linha(fx_et="99"), _linha(esc="{ñ class}")])
    assert agg["por_faixa_etaria"][(1, 2025, "Não identificado")]["total"] == 1
    assert agg["por_escolaridade"][(1, 2025, "Não identificado")]["total"] == 1


def test_codigo_fora_do_mapa_vira_bucket_rotulado():
    agg, _ = _agrega([_linha(tam="77"), _linha(nat="6110")])
    assert agg["por_tamanho"][(1, 2025, "Código 77")]["total"] == 1
    assert agg["por_natureza"][(1, 2025, "Código 6")]["total"] == 1


def test_metricas_anuais_regras_do_loader():
    agg, _ = _agrega([
        _linha(pcd="1", dias_afas="10", ativo="1", parcial="1", intermit="1",
               simples="1", tipo_vinc="55", mun_trab="310620"),
        _linha(pcd="0", dias_afas="0", ativo="0", mun_trab="354340"),  # trabalha fora
    ])
    m = agg["metricas"][(1, 2025)]
    assert m["total"] == 2 and m["pcd"] == 1 and m["outro_municipio"] == 1
    assert m["afas_soma"] == 10.0 and m["afas_cnt"] == 1
    assert m["ativo_dez"] == 1 and m["parcial"] == 1 and m["intermitente"] == 1
    assert m["simples"] == 1 and m["aprendiz"] == 1


def test_motivo_so_com_mes_desligamento_positivo():
    agg, _ = _agrega([
        _linha(mes_des="6", motivo="10"),
        _linha(mes_des="0", motivo="10"),  # ainda empregado: fora do recorte
    ])
    assert agg["por_motivo"][(1, 2025, "Rescisão sem justa causa pelo empregador")]["total"] == 1


def test_tipo_admissao_exclui_nao_admitido_mas_turnover_conta():
    agg, _ = _agrega([_linha(mes_adm="3", tipo_adm="0"), _linha(mes_adm="3", tipo_adm="1")])
    assert (1, 2025, "Não admitido no ano") not in agg["por_tipo_admissao"]
    assert agg["por_tipo_admissao"][(1, 2025, "Primeiro emprego")]["total"] == 1
    assert agg["turnover"][(1, 2025, 3)]["adm"] == 2


def test_turnover_admissoes_e_desligamentos_mensais():
    agg, _ = _agrega([_linha(mes_adm="2"), _linha(mes_des="11"), _linha()])
    assert agg["turnover"][(1, 2025, 2)]["adm"] == 1
    assert agg["turnover"][(1, 2025, 11)]["des"] == 1


def test_cbo_familia_4_digitos_e_curto_vira_bucket():
    agg, _ = _agrega([_linha(cbo="717020"), _linha(cbo="99")])
    assert agg["por_cbo"][(1, 2025, "7170")]["total"] == 1
    # cbo_familia e String(8): bucket NI usa a chave curta "NI" com descricao legivel
    assert agg["por_cbo"][(1, 2025, "NI")]["descricao"] == "Não identificado"


def test_linha_malformada_contada_e_nao_derruba():
    agg, n = _agrega([_linha(), '"só","três","campos"'])
    assert n == 2
    assert agg["vinculos"][(1, 2025)]["total"] == 1
    assert agg["malformadas"] == 1


def test_rotulo_de_bucket_truncado_ao_limite_da_coluna():
    agg, _ = _agrega([_linha(tam="X" * 80)])
    (chave,) = [k for k in agg["por_tamanho"] if k[0] == 1]
    assert len(chave[2]) <= 60  # String(60) de RaisPorTamanhoEstabelecimento


# ── Task 2: FTP/anos/regiões (fakes, sem rede) ───────────────────────────────
from unittest.mock import MagicMock

import app.services.ingestao_automatica.rais_pdet as rais_pdet
from app.services.ingestao_automatica.rais_pdet import (
    ano_padrao,
    regioes_para,
)


def test_regioes_para_agrupa_ufs():
    m1 = MagicMock(estado="MG"); m2 = MagicMock(estado="ES"); m3 = MagicMock(estado="SP")
    assert regioes_para([m1, m2, m3]) == ["MG_ES_RJ", "SP"]


def test_regioes_para_uf_desconhecida_e_erro_audivel():
    m = MagicMock(estado="XX")
    resumo = rais_pdet.ResumoIngestao(dataset="rais")
    assert regioes_para([m], resumo) == []
    assert any("XX" in e for e in resumo.erros)


def test_ano_padrao_prefere_final_sobre_parcial():
    dirs = ["2022", "2023", "2023 Parcial", "2024", "2024 Parcial", "2025", "Layouts"]
    assert ano_padrao(dirs) == (2025, False)


def test_ano_padrao_cai_para_parcial_quando_so_ha_parcial():
    dirs = ["2023", "2024 Parcial", "Layouts"]
    assert ano_padrao(dirs) == (2024, True)


def test_ano_padrao_sem_diretorios_numericos_e_erro_audivel():
    import pytest
    with pytest.raises(ValueError):
        ano_padrao(["Layouts"])


def test_dir_do_ano_escolhe_parcial_com_aviso():
    assert rais_pdet.dir_do_ano(2024, ["2024", "2024 Parcial"]) == ("2024", False)
    assert rais_pdet.dir_do_ano(2024, ["2024 Parcial"]) == ("2024 Parcial", True)
    assert rais_pdet.dir_do_ano(2021, ["2022"]) == (None, False)


def test_header_sem_coluna_esperada_levanta_layout_mudou():
    import pytest
    f = io.StringIO('"Só uma coluna"\n"x"')
    with pytest.raises(ValueError, match="layout mudou"):
        agregar_arquivo(f, 2025, ALVO, novo_agregados())
