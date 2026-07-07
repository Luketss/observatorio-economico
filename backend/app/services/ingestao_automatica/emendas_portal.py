"""Fonte automática: emendas parlamentares por município (Portal da Transparência).

Fonte: download-de-dados/emendas-parlamentares/UNICO — zip único (~32 MB) com
EmendasParlamentares.csv (latin-1, ';', campos entre aspas), uma linha por
emenda×ação orçamentária×localidade. Traz "Código Município IBGE" nativo (zero
fuzzy matching) e, desde mai/2026, a execução das emendas Pix (transferências
especiais). Linhas sem código municipal (localidade Nacional/UF) ficam fora —
o total municipal é um piso. Agregamos por (município, código da emenda)."""
import csv
import logging
import os
import tempfile
from datetime import date

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import indices_colunas, parse_valor_br, baixar_zip, linhas_zip

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


def executar(db, municipios, anos=None, usuario_id=None, notificar=True) -> ResumoIngestao:
    """Baixa o zip nacional de emendas, agrega por (município, emenda) e faz
    upsert em EmendaParlamentar com commit por município. Município sem emenda
    municipalizada não ganha linha (zero é dado, não erro)."""
    from app.models.emenda import EmendaParlamentar
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="emendas")
    alvo: dict[str, int] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    if not anos:
        anos = range(ANO_INICIO_PADRAO, date.today().year + 1)
    anos = set(anos)

    with tempfile.TemporaryDirectory(prefix="emendas_") as pasta:
        caminho = baixar_zip(URL_EMENDAS, os.path.join(pasta, "emendas.zip"))
        with linhas_zip(caminho, encoding="latin-1") as linhas:
            por_municipio = parse_emendas_csv(linhas, alvo, anos)

    ano_corrente = date.today().year
    novidades: dict[int, list] = {}
    for mid in sorted(set(alvo.values())):
        regs = por_municipio.get(mid)
        if not regs:
            continue
        existentes = {
            r.codigo_emenda: r
            for r in db.query(EmendaParlamentar)
            .filter(EmendaParlamentar.municipio_id == mid)
            .all()
        }
        for codigo, reg in regs.items():
            atual = existentes.get(codigo)
            if atual:
                atual.ano = reg["ano"]
                atual.numero_emenda = reg["numero_emenda"]
                atual.autor = reg["autor"]
                atual.tipo_emenda = reg["tipo_emenda"]
                atual.funcao = reg["funcao"]
                atual.valor_empenhado = reg["valor_empenhado"]
                atual.valor_liquidado = reg["valor_liquidado"]
                atual.valor_pago = reg["valor_pago"]
                atual.valor_resto_pago = reg["valor_resto_pago"]
            else:
                db.add(EmendaParlamentar(municipio_id=mid, **reg))
                if reg["ano"] == ano_corrente:
                    novidades.setdefault(mid, []).append(reg)
            resumo.linhas += 1
        resumo.municipios_ok += 1
        db.commit()

    if notificar and usuario_id and novidades:
        from app.services.emendas_service import gerar_notificacoes_emendas

        resumo.notificacoes = gerar_notificacoes_emendas(db, novidades, usuario_id)
    return resumo


registrar(FonteAutomatica(
    key="emendas",
    label="Emendas Parlamentares (Portal da Transparência)",
    fonte="Portal da Transparência/CGU — Emendas parlamentares por localidade (inclui emendas Pix desde mai/2026)",
    executar=executar,
))
