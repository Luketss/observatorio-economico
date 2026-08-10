"""Parsing puro da fonte IPS (arquivo enviado pela tela) — sem DB/rede.
XLSX gerado em memória; CSV com BOM e vírgula decimal, como os reais."""
import io

from app.services.ingestao_automatica.ips_arquivo import (
    identificacao,
    ler_linhas,
    linha_para_kwargs,
    validar_headers,
)

HEADER = ["Código IBGE", "Município", "UF", "Área (km²)", "População 2022",
          "PIB per capita 2021", "Índice de Progresso Social", "Água e Saneamento"]


def _xlsx_bytes(header=HEADER, rows=None):
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Dados IPS"
    ws.append(header)
    for r in (rows or []):
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _csv_bytes():
    texto = (
        "Código IBGE;Município;UF;Área (km²);População 2022;PIB per capita 2021;"
        "Índice de Progresso Social;Água e Saneamento\n"
        "3122306;Divinópolis;MG;708,1;242328;35000,50;62,3;70,15\n"
    )
    return texto.encode("utf-8-sig")


def test_ler_linhas_xlsx_por_assinatura_zip():
    conteudo = _xlsx_bytes(rows=[["3122306", "Divinópolis (MG)", "MG",
                                  708.1, 242328, 35000.5, 62.3, 70.15]])
    linhas = ler_linhas(conteudo)
    assert len(linhas) == 1
    assert linhas[0]["Código IBGE"] == "3122306"
    assert linhas[0]["Água e Saneamento"] == 70.15


def test_ler_linhas_csv_com_bom_e_ponto_e_virgula():
    linhas = ler_linhas(_csv_bytes())
    assert len(linhas) == 1
    assert linhas[0]["Código IBGE"] == "3122306"
    assert linhas[0]["Água e Saneamento"] == "70,15"


def test_validar_headers_ok_e_arquivo_estranho():
    assert validar_headers(ler_linhas(_csv_bytes())) is None
    estranho = [{"foo": "1", "bar": "2"}]
    msg = validar_headers(estranho)
    assert msg is not None and "IPS" in msg
    assert validar_headers([]) is not None


def test_identificacao_strip_sufixo_uf():
    codigo, nome, uf = identificacao(
        {"Código IBGE": "3122306", "Município": "Divinópolis (MG)", "UF": "mg"})
    assert (codigo, nome, uf) == ("3122306", "Divinópolis", "MG")
    codigo, nome, uf = identificacao({"Município": "X", "UF": "SP"})
    assert codigo is None


def test_linha_para_kwargs_xlsx_float_e_csv_string():
    # XLSX: valores já numéricos
    row_x = dict(zip(HEADER, ["3122306", "Divinópolis (MG)", "MG",
                              708.1, 242328, 35000.5, 62.3, 70.15]))
    k = linha_para_kwargs(row_x, municipio_id=42, ano=2025)
    assert k["municipio_id"] == 42 and k["ano"] == 2025
    assert k["area_km2"] == 708.1
    assert k["populacao"] == 242328
    assert k["ips_geral"] == 62.3
    assert k["agua_saneamento"] == 70.15

    # CSV: strings com vírgula decimal
    row_c = ler_linhas(_csv_bytes())[0]
    k = linha_para_kwargs(row_c, municipio_id=42, ano=2025)
    assert k["area_km2"] == 708.1
    assert k["populacao"] == 242328
    assert k["pib_per_capita"] == 35000.5
    assert k["agua_saneamento"] == 70.15


def test_linha_para_kwargs_valor_vazio_vira_none():
    row = dict(zip(HEADER, ["3122306", "X", "MG", "", None, "", "", ""]))
    k = linha_para_kwargs(row, municipio_id=1, ano=2024)
    assert k["area_km2"] is None
    assert k["populacao"] is None
    assert k["ips_geral"] is None
