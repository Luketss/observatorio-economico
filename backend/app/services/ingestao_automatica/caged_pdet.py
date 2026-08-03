"""Fonte automática: Novo CAGED por município (microdados PDET/MTE, FTP).

Metodologia "com ajustes": saldo do mês M = MOV(M) + FOR(competência M)
− EXC(competência M). EXC entra com sinal -1 no MESMO lado da movimentação
original (admissão excluída decrementa admissões — não vira desligamento).
Arquivos FOR/EXC de um mês carregam competências antigas, por isso são
filtrados por `competencias_alvo`. Mapas código→rótulo seguem o layout
OFICIAL do Novo CAGED (xlsx no FTP) — a codificação difere do CAGED antigo
usado nos CSVs manuais (sexo 1/3, tamestabjan deslocado, tipomovimentação).
Rótulos mantêm as strings já existentes no banco quando o conceito coincide.

REGRA GERAL: nenhum descarte silencioso — todo dado da origem entra em algum
recorte com rótulo. Códigos não mapeados recebem fallback: `f"Código {raw}"`
se inédito, `"Não informado"` se vazio.

EXCEÇÕES DELIBERADAS (não sofrem fallback):
- `por_tipo_def` (PCD): apenas códigos em TIPO_DEFICIENCIA_MAP (1–6) entram
  no recorte e no indicador pcd (0, 9 = "Não Identificado" ficam fora).
- `salario`: só média valores > 0 (desligados sem renda = ignorados).
"""
import csv
import ftplib
import os
from ftplib import FTP

import py7zr

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import parse_valor_br
from ingestao.carregar_caged import CNAE_SECAO_DESC, _faixa_etaria

SEXO_MAP = {"1": "Masculino", "3": "Feminino"}

RACA_COR_MAP = {
    "1": "Branca", "2": "Preta", "3": "Parda", "4": "Amarela",
    "5": "Indígena", "6": "Não informada",
}

GRAU_INSTRUCAO_MAP = {
    "1": "Analfabeto", "2": "Até 5ª incompleto", "3": "5ª completo fundamental",
    "4": "6ª a 9ª fundamental", "5": "Fund. completo", "6": "Médio incompleto",
    "7": "Médio completo", "8": "Superior incompleto", "9": "Superior completo",
    "10": "Mestrado", "11": "Doutorado", "80": "Pós-graduação completa",
}

TIPO_MOV_MAP = {
    "10": "Admissão por primeiro emprego",
    "20": "Admissão por reemprego",
    "25": "Admissão por contrato trabalho prazo determinado",
    "31": "Desligamento por demissão sem justa causa",
    "32": "Desligamento por demissão com justa causa",
    "33": "Culpa recíproca",
    "35": "Admissão por reintegração",
    "40": "Desligamento a pedido",
    "43": "Término contrato trabalho prazo determinado",
    "45": "Desligamento por término de contrato",
    "50": "Desligamento por aposentadoria",
    "60": "Desligamento por morte",
    "70": "Admissão por transferência",
    "80": "Desligamento por transferência",
    "90": "Desligamento por acordo entre empregado e empregador",
    "97": "Admissão de tipo ignorado",
    "98": "Desligamento de tipo ignorado",
}

TIPO_DEFICIENCIA_MAP = {
    "1": "Física", "2": "Auditiva", "3": "Visual",
    "4": "Mental / Intelectual", "5": "Múltipla", "6": "Reabilitado",
}

TAMANHO_ESTAB_MAP = {
    "1": "Zero", "2": "1 a 4", "3": "5 a 9", "4": "10 a 19", "5": "20 a 49",
    "6": "50 a 99", "7": "100 a 249", "8": "250 a 499", "9": "500 a 999",
    "10": "1000 ou mais", "90": "Não informado", "97": "Não se aplica",
    "98": "Inválido", "99": "Ignorado",
}

TIPO_EMPREGADOR_MAP = {"0": "CNPJ raiz", "2": "CPF", "9": "Não informado"}

TIPO_ESTABELECIMENTO_MAP = {
    "1": "CNPJ", "3": "CAEPF (pessoa física)", "4": "CNO (obra)",
    "5": "CEI (CAGED)", "9": "Não informado",
}

_COLUNAS = (
    "competênciamov", "município", "seção", "saldomovimentação",
    "graudeinstrução", "idade", "raçacor", "sexo", "tipoempregador",
    "tipoestabelecimento", "tipomovimentação", "tipodedeficiência",
    "indtrabintermitente", "indtrabparcial", "salário", "tamestabjan",
    "indicadoraprendiz", "indicadordeforadoprazo",
)

_CHAVES_AGG = (
    "mensal", "por_sexo", "por_raca", "salario", "por_cnae",
    "por_escolaridade", "por_faixa_etaria", "por_tipo_mov", "por_tipo_def",
    "por_tamanho", "por_tipo_emp", "por_tipo_estab", "indicadores",
)


def novo_agregados() -> dict:
    return {k: {} for k in _CHAVES_AGG}


def _soma(d: dict, chave, lado: str, inc: int) -> None:
    item = d.setdefault(chave, {"admissoes": 0, "desligamentos": 0})
    item[lado] += inc


def agregar_arquivo(linhas, ibge6_para_mid, competencias_alvo, agg, sinal: int = 1) -> int:
    """Agrega um arquivo (MOV/FOR com sinal=+1; EXC com sinal=-1) em `agg`.
    `linhas` = iterável de linhas de texto (header incluso). Retorna quantas
    linhas entraram na agregação."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CAGED: arquivo vazio")
    idx = {c.strip(): i for i, c in enumerate(header)}
    faltando = [c for c in _COLUNAS if c not in idx]
    if faltando:
        raise ValueError(f"CAGED: colunas ausentes {faltando} — layout mudou?")

    def col(row, nome):
        return row[idx[nome]].strip()

    agregadas = 0
    for row in reader:
        try:
            mid = ibge6_para_mid.get(col(row, "município"))
            if mid is None:
                continue
            comp = col(row, "competênciamov")
            ano, mes = int(comp[:4]), int(comp[4:6])
            if (ano, mes) not in competencias_alvo:
                continue
            saldo = int(col(row, "saldomovimentação"))
        except (IndexError, ValueError):
            continue
        lado = "admissoes" if saldo > 0 else "desligamentos"
        inc = sinal * abs(saldo)
        agregadas += 1

        _soma(agg["mensal"], (mid, ano, mes), lado, inc)
        _soma(agg["por_sexo"], (mid, ano, mes, SEXO_MAP.get(col(row, "sexo"), "Não informado")), lado, inc)
        _soma(agg["por_raca"], (mid, ano, mes, RACA_COR_MAP.get(col(row, "raçacor"), "Não informada")), lado, inc)
        _soma(agg["por_escolaridade"], (mid, ano, mes, GRAU_INSTRUCAO_MAP.get(col(row, "graudeinstrução"), "Não informado")), lado, inc)

        secao = col(row, "seção").upper()
        secao_label = CNAE_SECAO_DESC.get(secao, secao) if secao else "Não informada"
        secao_chave = secao if secao else "?"
        _soma(agg["por_cnae"], (mid, ano, mes, secao_chave, secao_label), lado, inc)

        try:
            idade = int(col(row, "idade") or 0)
        except ValueError:
            idade = 0
        _soma(agg["por_faixa_etaria"], (mid, ano, mes, _faixa_etaria(idade)), lado, inc)

        tipo_mov = col(row, "tipomovimentação")
        rotulo_mov = TIPO_MOV_MAP.get(tipo_mov, f"Código {tipo_mov}" if tipo_mov else "Não informado")
        _soma(agg["por_tipo_mov"], (mid, ano, mes, rotulo_mov), lado, inc)

        tipo_def = col(row, "tipodedeficiência")
        eh_pcd = tipo_def in TIPO_DEFICIENCIA_MAP
        if eh_pcd:
            _soma(agg["por_tipo_def"], (mid, ano, mes, TIPO_DEFICIENCIA_MAP[tipo_def]), lado, inc)

        raw_tam = col(row, "tamestabjan")
        tam = TAMANHO_ESTAB_MAP.get(raw_tam) or (f"Código {raw_tam}" if raw_tam else "Não informado")
        _soma(agg["por_tamanho"], (mid, ano, mes, tam), lado, inc)
        raw_emp = col(row, "tipoempregador")
        emp = TIPO_EMPREGADOR_MAP.get(raw_emp) or (f"Código {raw_emp}" if raw_emp else "Não informado")
        _soma(agg["por_tipo_emp"], (mid, ano, mes, emp), lado, inc)
        raw_estab = col(row, "tipoestabelecimento")
        estab = TIPO_ESTABELECIMENTO_MAP.get(raw_estab) or (f"Código {raw_estab}" if raw_estab else "Não informado")
        _soma(agg["por_tipo_estab"], (mid, ano, mes, estab), lado, inc)

        sal = parse_valor_br(col(row, "salário")) or 0.0
        if sal > 0:
            s = agg["salario"].setdefault((mid, ano, mes), {"sum_adm": 0.0, "cnt_adm": 0, "sum_des": 0.0, "cnt_des": 0})
            if saldo > 0:
                s["sum_adm"] += sinal * sal * abs(saldo)
                s["cnt_adm"] += inc
            else:
                s["sum_des"] += sinal * sal * abs(saldo)
                s["cnt_des"] += inc

        ind = agg["indicadores"].setdefault((mid, ano), {
            "total": 0, "parcial": 0, "intermitente": 0,
            "aprendiz": 0, "pcd": 0, "fora_prazo": 0,
        })
        ind["total"] += inc
        if col(row, "indtrabparcial") == "1":
            ind["parcial"] += inc
        if col(row, "indtrabintermitente") == "1":
            ind["intermitente"] += inc
        if col(row, "indicadoraprendiz") == "1":
            ind["aprendiz"] += inc
        if eh_pcd:
            ind["pcd"] += inc
        if col(row, "indicadordeforadoprazo") == "1":
            ind["fora_prazo"] += inc
    return agregadas


def anos_completos(meses_ok: set, ultimo_publicado: tuple) -> list:
    """Anos cujo total anual pode ser recomputado: todos os meses publicados
    do ano (jan..dez, ou jan..último publicado para o ano corrente) foram
    processados com sucesso nesta execução. Ano parcial preserva o valor
    existente em caged_indicadores_contrato."""
    anos = sorted({a for (a, _m) in meses_ok})
    completos = []
    for ano in anos:
        fim = ultimo_publicado[1] if ano == ultimo_publicado[0] else 12
        if all((ano, m) in meses_ok for m in range(1, fim + 1)):
            completos.append(ano)
    return completos


def meses_forexc(competencias: list, hoje) -> list:
    """FOR/EXC precisam ir do início da janela até o mês anterior a `hoje`:
    exclusões/atrasos de uma competência antiga aparecem em arquivos de
    meses posteriores (validado: linhas de 202001 no EXC de 202606)."""
    ano, mes = min(competencias)
    fim = (hoje.year, hoje.month - 1) if hoje.month > 1 else (hoje.year - 1, 12)
    out = []
    while (ano, mes) <= fim:
        out.append((ano, mes))
        ano, mes = (ano, mes + 1) if mes < 12 else (ano + 1, 1)
    return out


FTP_HOST = "ftp.mtps.gov.br"
FTP_DIR = "/pdet/microdados/NOVO CAGED/{ano}/{ano}{mes:02d}"


def conectar_ftp() -> FTP:
    ftp = FTP(FTP_HOST, timeout=120)
    ftp.login()
    ftp.encoding = "latin-1"  # caminhos do PDET têm acento
    return ftp


def baixar_e_extrair(ftp, tipo: str, ano: int, mes: int, destino_dir: str) -> str | None:
    """RETR do CAGED{tipo}{AAAAMM}.7z para disco + extractall (py7zr 1.1 não
    lê em memória). 550 = competência não publicada → None (aviso, não erro).
    O .7z é removido em todos os caminhos (sucesso, 550, falha de extração)."""
    nome = f"CAGED{tipo}{ano}{mes:02d}"
    remoto = f"{FTP_DIR.format(ano=ano, mes=mes)}/{nome}.7z"
    caminho_7z = os.path.join(destino_dir, f"{nome}.7z")
    try:
        with open(caminho_7z, "wb") as f:
            ftp.retrbinary(f"RETR {remoto}", f.write)
        with py7zr.SevenZipFile(caminho_7z) as z:
            nomes = z.getnames()
            z.extractall(destino_dir)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise
    finally:
        if os.path.exists(caminho_7z):
            os.remove(caminho_7z)
    return os.path.join(destino_dir, nomes[0])
