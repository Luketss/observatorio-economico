"""Fonte automática: emendas parlamentares por município (Portal da Transparência).

Fonte: download-de-dados/emendas-parlamentares/UNICO — zip único (~32 MB) com
EmendasParlamentares.csv (latin-1, ';', campos entre aspas), uma linha por
emenda×ação orçamentária×localidade. Traz "Código Município IBGE" nativo (zero
fuzzy matching) e, desde mai/2026, a execução das emendas Pix (transferências
especiais). Linhas sem código municipal (localidade Nacional/UF) ficam fora —
o total municipal é um piso. Agregamos por (município, código da emenda)."""
import csv
import logging

from app.services.ingestao_automatica.util import indices_colunas, parse_valor_br

logger = logging.getLogger(__name__)

URL_EMENDAS = "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO"
ANO_INICIO_PADRAO = 2019

_COLS = ["Código da Emenda", "Ano da Emenda", "Tipo de Emenda", "Nome do Autor da Emenda",
         "Número da emenda", "Código Município IBGE", "Nome Função",
         "Valor Empenhado", "Valor Liquidado", "Valor Pago", "Valor Restos A Pagar Pagos"]


def parse_emendas_csv(linhas, ibge_para_mid: dict[str, int],
                      anos: set[int] | None = None) -> dict[int, dict[str, dict]]:
    """CSV do Portal → {mid: {codigo_emenda: registro}} (registro = colunas do
    model EmendaParlamentar, sem municipio_id). Ver docstring do módulo."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("EmendasParlamentares.csv vazio")
    idx = indices_colunas(header, _COLS, "EmendasParlamentares.csv")

    out: dict[int, dict[str, dict]] = {}
    funcoes: dict[tuple[int, str], dict[str, float]] = {}
    for row in reader:
        try:
            mid = ibge_para_mid.get(row[idx["Código Município IBGE"]].strip())
            if mid is None:
                continue
            ano = int(row[idx["Ano da Emenda"]])
        except (IndexError, ValueError):
            continue
        if anos and ano not in anos:
            continue

        autor = row[idx["Nome do Autor da Emenda"]].strip()
        numero = row[idx["Número da emenda"]].strip()
        codigo = row[idx["Código da Emenda"]].strip()
        if not codigo or codigo.lower() == "sem informação":
            codigo = f"SI-{ano}-{autor}-{numero}"

        reg = out.setdefault(mid, {}).get(codigo)
        if reg is None:
            reg = {
                "ano": ano, "codigo_emenda": codigo,
                "numero_emenda": (numero if numero and numero.upper() != "S/I" else None),
                "autor": autor,
                "tipo_emenda": row[idx["Tipo de Emenda"]].strip(),
                "funcao": None,
                "valor_empenhado": 0.0, "valor_liquidado": 0.0,
                "valor_pago": 0.0, "valor_resto_pago": 0.0,
            }
            out[mid][codigo] = reg
        for campo, col in (("valor_empenhado", "Valor Empenhado"),
                           ("valor_liquidado", "Valor Liquidado"),
                           ("valor_pago", "Valor Pago"),
                           ("valor_resto_pago", "Valor Restos A Pagar Pagos")):
            reg[campo] += parse_valor_br(row[idx[col]]) or 0.0

        funcao = row[idx["Nome Função"]].strip()
        if funcao:
            chave = (mid, codigo)
            empenho_linha = parse_valor_br(row[idx["Valor Empenhado"]]) or 0.0
            funcoes.setdefault(chave, {})
            funcoes[chave][funcao] = funcoes[chave].get(funcao, 0.0) + empenho_linha

    for (mid, codigo), por_funcao in funcoes.items():
        out[mid][codigo]["funcao"] = max(por_funcao, key=por_funcao.get)
    for regs in out.values():
        for reg in regs.values():
            for campo in ("valor_empenhado", "valor_liquidado", "valor_pago", "valor_resto_pago"):
                reg[campo] = round(reg[campo], 2)
    return out
