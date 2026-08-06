"""Parser puro do relatório mensal de repasses da SEFA-PR — sem rede, sem DB.

Fixture derivado da amostra REAL de 06/2024 (rrepassesmun_2024_06_mensal.html):
mesma estrutura de tabela (3 linhas de cabeçalho, 8 células por município,
linha final 'Total em Mês/Ano'), com 3 municípios reais transcritos."""
import pytest

from app.services.ingestao_automatica.arrecadacao_pr import (
    MesDivergente,
    decodificar,
    parse_html_mensal,
)
from app.services.ingestao_automatica.util import norm_nome_municipio

# Estrutura idêntica à da página real (tags, <sup> de nota de rodapé,
# entidades HTML, números BR); valores transcritos da amostra de 06/2024.
FIXTURE_PR = """
<html><body>
<table border="0" cellpadding="0" class="cinza">
  <tr class="tr_cabecalho">
    <td colspan="3"><b>Refer&ecirc;ncia: Junho/2024</b></td>
    <td colspan="5"><b>Em Reais</b></td>
  </tr>
  <tr class="tr_cabecalho">
    <td><p align="center"><b>Munic&iacute;pio</b></td>
    <td><b>&Iacute;ndices do FPM</b></td>
    <td colspan="2"><b>ICMS<sup>1</sup></b></td>
    <td><p align="center"><b>Fundo de Exporta&ccedil;&atilde;o<sup>2</sup></b></td>
    <td><b>Royalties Petr&oacute;leo<sup>3</sup></b></td>
    <td><b>IPVA<sup>4</sup></b></td>
    <td><p align="center"><b>Total Repasse L&iacute;quido</b></td>
  </tr>
  <tr class="tr_cabecalho">
    <td><span>Repasse Bruto</span></td>
    <td><span>Repasse L&iacute;quido</span></td>
  </tr>
  <tr>
    <td><font face="Arial" size=1>Abati&aacute;</font></td>
    <td>0,00059739134986</td>
    <td>585.309,96</td>
    <td>468.247,98</td>
    <td>8.122,05</td>
    <td>446,21</td>
    <td>40.789,94</td>
    <td>517.606,18</td>
  </tr>
  <tr>
    <td><font face="Arial" size=1>Boa Ventura de S&atilde;o Roque</font></td>
    <td>0,00151576302834</td>
    <td>1.485.108,86</td>
    <td>1.188.087,10</td>
    <td>20.608,10</td>
    <td>1.132,17</td>
    <td>48.966,08</td>
    <td>1.258.793,45</td>
  </tr>
  <tr>
    <td><font face="Arial" size=1>Xambr&ecirc;</font></td>
    <td>0,00067848862153</td>
    <td>664.767,14</td>
    <td>531.813,73</td>
    <td>9.224,64</td>
    <td>506,79</td>
    <td>43.229,40</td>
    <td>584.774,56</td>
  </tr>
  <tr>
    <td><strong>Total em Junho/2024</strong></td>
    <td>1,000000000000000000</td>
    <td>979.776.409,57</td>
    <td>783.821.134,06</td>
    <td>13.595.855,62</td>
    <td>746.933,08</td>
    <td>138.141.006,90</td>
    <td><strong>936.304.929,66</strong></td>
  </tr>
</table>
</body></html>
"""


def test_parse_extrai_municipios_e_mapeia_tributos():
    valores, ignoradas = parse_html_mensal(FIXTURE_PR, 2024, 6)
    assert len(valores) == 3 and ignoradas == []
    # (icms_liquido, fundo_exportacao, ipva) — bruto (col 2) NÃO é usado
    assert valores["Abatiá"] == (468247.98, 8122.05, 40789.94)
    assert valores["Xambrê"] == (531813.73, 9224.64, 43229.40)


def test_royalties_fica_fora_total_diverge_da_pagina():
    valores, _ = parse_html_mensal(FIXTURE_PR, 2024, 6)
    icms, ipi, ipva = valores["Abatiá"]
    # total das 3 partes = Total da página (517.606,18) − Royalties (446,21)
    assert round(icms + ipi + ipva, 2) == round(517606.18 - 446.21, 2)


def test_linhas_de_cabecalho_e_total_nao_viram_municipio():
    valores, _ = parse_html_mensal(FIXTURE_PR, 2024, 6)
    assert not any("Total em" in nome for nome in valores)
    assert "Município" not in valores and "Repasse Bruto" not in valores


def test_acentos_preservados_e_match_com_grafia_ibge():
    valores, _ = parse_html_mensal(FIXTURE_PR, 2024, 6)
    assert "Boa Ventura de São Roque" in valores
    assert norm_nome_municipio("Boa Ventura de São Roque") in {
        norm_nome_municipio(n) for n in valores
    }


def test_mes_divergente():
    with pytest.raises(MesDivergente):
        parse_html_mensal(FIXTURE_PR, 2024, 7)


def test_ano_divergente():
    with pytest.raises(MesDivergente):
        parse_html_mensal(FIXTURE_PR, 2023, 6)


def test_referencia_ausente_e_layout_hard_stop():
    sem_ref = FIXTURE_PR.replace("Refer&ecirc;ncia: Junho/2024", "Bem-vindo")
    with pytest.raises(ValueError, match="layout"):
        parse_html_mensal(sem_ref, 2024, 6)


def test_coluna_renomeada_e_layout_hard_stop():
    mudou = FIXTURE_PR.replace("<b>IPVA<sup>4</sup></b>", "<b>Frota<sup>4</sup></b>")
    with pytest.raises(ValueError, match="layout"):
        parse_html_mensal(mudou, 2024, 6)


def test_subcolunas_icms_divergentes_e_layout_hard_stop():
    mudou = FIXTURE_PR.replace("Repasse Bruto", "Bruto")
    with pytest.raises(ValueError, match="layout"):
        parse_html_mensal(mudou, 2024, 6)


def test_nota_de_rodape_renumerada_e_tolerada():
    # o <sup> cola dígitos no texto ("ICMS1"); renumeração não pode quebrar
    renum = FIXTURE_PR.replace("<sup>2</sup>", "<sup>9</sup>")
    valores, _ = parse_html_mensal(renum, 2024, 6)
    assert len(valores) == 3


def test_linha_ilegivel_vira_ignorada_nao_silenciosa():
    quebrada = FIXTURE_PR.replace("531.813,73", "n/d")
    valores, ignoradas = parse_html_mensal(quebrada, 2024, 6)
    assert "Xambrê" not in valores and ignoradas == ["Xambrê"]
    assert len(valores) == 2


def test_decodificar_utf8_e_fallback_cp1252():
    # amostra real de 2026-08-05 veio em UTF-8 (spec previa cp1252)
    assert decodificar("Referência: Março".encode("utf-8")) == "Referência: Março"
    assert decodificar("Referência: Março".encode("cp1252")) == "Referência: Março"
