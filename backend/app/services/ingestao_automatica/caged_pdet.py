"""Fonte automática: Novo CAGED por município (microdados PDET/MTE, FTP).

Metodologia "com ajustes": saldo do mês M = MOV(M) + FOR(competência M)
− EXC(competência M). EXC entra com sinal -1 no MESMO lado da movimentação
original (admissão excluída decrementa admissões — não vira desligamento).
Arquivos FOR/EXC de um mês carregam competências antigas, por isso são
filtrados por `competencias_alvo`. Mapas código→rótulo seguem o layout
OFICIAL do Novo CAGED (xlsx no FTP) — a codificação difere do CAGED antigo
usado nos CSVs manuais (sexo 1/3, tamestabjan deslocado, tipomovimentação).
Rótulos mantêm as strings já existentes no banco quando o conceito coincide."""
import csv
import logging

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import parse_valor_br
from ingestao.carregar_caged import CNAE_SECAO_DESC, _faixa_etaria

logger = logging.getLogger(__name__)

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
    "10": "1000 ou mais",
}

TIPO_EMPREGADOR_MAP = {"0": "CNPJ raiz", "2": "CPF"}

TIPO_ESTABELECIMENTO_MAP = {
    "1": "CNPJ", "3": "CAEPF (pessoa física)", "4": "CNO (obra)",
    "5": "CEI (CAGED)",
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
        if secao and secao in CNAE_SECAO_DESC:
            _soma(agg["por_cnae"], (mid, ano, mes, secao, CNAE_SECAO_DESC[secao]), lado, inc)

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

        tam = TAMANHO_ESTAB_MAP.get(col(row, "tamestabjan"))
        if tam:
            _soma(agg["por_tamanho"], (mid, ano, mes, tam), lado, inc)
        emp = TIPO_EMPREGADOR_MAP.get(col(row, "tipoempregador"))
        if emp:
            _soma(agg["por_tipo_emp"], (mid, ano, mes, emp), lado, inc)
        estab = TIPO_ESTABELECIMENTO_MAP.get(col(row, "tipoestabelecimento"))
        if estab:
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
