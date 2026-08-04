"""Fonte automática RAIS — vínculos anuais (PDET/FTP), agregados por município.

Formato REAL (validado no RAIS_VINC_PUB_NI.COMT de 2025, difere do layout xls):
CSV com VÍRGULA e aspas, decimal com ponto, campos com espaços à esquerda,
header com sufixo " - Código". O ano vem do diretório (1 arquivo por ano).

Regra do produto: NENHUM dado da origem é descartado silenciosamente — código
fora do mapa vira bucket rotulado (f"Código {raw}"), vazio/-1/{ñ class}/todos-
noves viram "Não identificado". Labels de códigos mapeados são byte-iguais aos
de backend/ingestao/carregar_rais.py (dados manuais e automáticos convivem).
Divergência deliberada do loader manual: ele DESCARTA códigos fora do mapa em
4 recortes (cnae/tamanho/natureza/cbo curto); aqui todos viram bucket.

Gravação: REPLACE por (município, ano) nas 15 tabelas rais_*, commit por
município. Município-alvo sem nenhuma linha no ano NÃO sofre delete (aviso).
ESCALA: agrega apenas municípios-alvo — memória cresce com a seleção, não com
o arquivo. Uma região por vez em disco (~4-6GB descomprimidos)."""
import contextlib
import csv
import ftplib
import logging
import os
import tempfile
from ftplib import FTP

import py7zr

from app.services.ingestao_automatica.base import (
    FonteAutomatica,
    ResumoIngestao,
    registrar,
)

logger = logging.getLogger(__name__)

FTP_HOST = "ftp.mtps.gov.br"
BASE_DIR = "/pdet/microdados/RAIS"

# UF -> arquivo regional de vínculos (RAIS_VINC_PUB_{REGIAO}.7z)
UF_REGIAO = {
    "MG": "MG_ES_RJ", "ES": "MG_ES_RJ", "RJ": "MG_ES_RJ",
    "SP": "SP",
    "PR": "SUL", "SC": "SUL", "RS": "SUL",
    "DF": "CENTRO_OESTE", "GO": "CENTRO_OESTE", "MT": "CENTRO_OESTE", "MS": "CENTRO_OESTE",
    "MA": "NORDESTE", "PI": "NORDESTE", "CE": "NORDESTE", "RN": "NORDESTE",
    "PB": "NORDESTE", "PE": "NORDESTE", "AL": "NORDESTE", "SE": "NORDESTE", "BA": "NORDESTE",
    "RO": "NORTE", "AC": "NORTE", "AM": "NORTE", "RR": "NORTE",
    "PA": "NORTE", "AP": "NORTE", "TO": "NORTE",
}

# ── Mapas de codificação (labels BYTE-IGUAIS ao carregar_rais.py) ────────────

SEXO_MAP = {"1": "Masculino", "2": "Feminino", "9": "Não identificado"}

RACA_COR_MAP = {
    "1": "Indígena", "2": "Branca", "4": "Preta",
    "6": "Amarela", "8": "Parda", "9": "Não identificada",
}

FAIXA_ETARIA_MAP = {
    "1": "Até 17 anos", "2": "18 a 24 anos", "3": "25 a 29 anos",
    "4": "30 a 39 anos", "5": "40 a 49 anos", "6": "50 a 64 anos",
    "7": "65 anos ou mais", "9": "Não identificado",
}

GRAU_INSTRUCAO_MAP = {
    "1": "Analfabeto", "2": "Até 5ª incompleto", "3": "5ª completo fundamental",
    "4": "6ª a 9ª fundamental", "5": "Fund. completo", "6": "Médio incompleto",
    "7": "Médio completo", "8": "Superior incompleto", "9": "Superior completo",
    "10": "Mestrado", "11": "Doutorado",
}

FAIXA_REMUNERACAO_MAP = {
    "1": "Até 0,5 SM", "2": "0,5 a 1 SM", "3": "1 a 1,5 SM", "4": "1,5 a 2 SM",
    "5": "2 a 3 SM", "6": "3 a 4 SM", "7": "4 a 5 SM", "8": "5 a 7 SM",
    "9": "7 a 10 SM", "10": "10 a 15 SM", "11": "15 a 20 SM",
    "12": "Mais de 20 SM", "99": "Não identificado",
}

FAIXA_TEMPO_EMPREGO_MAP = {
    "1": "Até 3 meses", "2": "3 a 6 meses", "3": "6 a 12 meses",
    "4": "1 a 2 anos", "5": "2 a 3 anos", "6": "3 a 5 anos",
    "7": "5 a 10 anos", "8": "10 anos ou mais", "9": "Não identificado",
}

# RAIS code 0 = ainda empregado em 31/12; >0 = desligado por este motivo.
MOTIVO_DESLIGAMENTO_MAP = {
    "10": "Rescisão sem justa causa pelo empregador",
    "11": "Rescisão com justa causa pelo empregador",
    "12": "Término do contrato",
    "20": "Rescisão por iniciativa do empregado",
    "21": "Rescisão antecipada do contrato",
    "22": "Rescisão por culpa recíproca",
    "30": "Aposentadoria",
    "31": "Falecimento",
    "32": "Falecimento decorrente de acidente do trabalho",
    "33": "Falecimento natural fora do trabalho",
    "40": "Reforma ou transferência",
    "41": "Mudança de regime trabalhista",
    "42": "Reintegração / readmissão",
    "43": "Acordo entre as partes (Lei 13.467/17)",
    "50": "Outros / Não identificado",
}

TIPO_ADMISSAO_MAP = {
    "0": "Não admitido no ano", "1": "Primeiro emprego", "2": "Reemprego",
    "3": "Transferência com ônus", "4": "Transferência sem ônus",
    "5": "Reintegração", "6": "Mudança de regime jurídico",
    "7": "Reativação", "8": "Outros",
}

TAMANHO_ESTAB_MAP = {
    "1": "Até 4 vínculos", "2": "5 a 9", "3": "10 a 19", "4": "20 a 49",
    "5": "50 a 99", "6": "100 a 249", "7": "250 a 499", "8": "500 a 999",
    "9": "1000 ou mais", "0": "Zero / não classificado",
}

# natureza_juridica: 4 dígitos; o primeiro identifica o macro-grupo.
NATUREZA_JURIDICA_GRUPO_MAP = {
    "1": "Administração Pública", "2": "Entidades Empresariais",
    "3": "Entidades sem Fins Lucrativos", "4": "Pessoas Físicas",
    "5": "Organizações Internacionais", "8": "Outras",
}

CNAE_DIVISAO_SECAO = {}
for _d in range(1, 4):
    CNAE_DIVISAO_SECAO[_d] = "A"
for _d in range(5, 10):
    CNAE_DIVISAO_SECAO[_d] = "B"
for _d in range(10, 34):
    CNAE_DIVISAO_SECAO[_d] = "C"
CNAE_DIVISAO_SECAO[35] = "D"
for _d in range(36, 40):
    CNAE_DIVISAO_SECAO[_d] = "E"
for _d in range(41, 44):
    CNAE_DIVISAO_SECAO[_d] = "F"
for _d in range(45, 48):
    CNAE_DIVISAO_SECAO[_d] = "G"
for _d in range(49, 54):
    CNAE_DIVISAO_SECAO[_d] = "H"
for _d in range(55, 57):
    CNAE_DIVISAO_SECAO[_d] = "I"
for _d in range(58, 64):
    CNAE_DIVISAO_SECAO[_d] = "J"
for _d in range(64, 67):
    CNAE_DIVISAO_SECAO[_d] = "K"
CNAE_DIVISAO_SECAO[68] = "L"
for _d in range(69, 76):
    CNAE_DIVISAO_SECAO[_d] = "M"
for _d in range(77, 83):
    CNAE_DIVISAO_SECAO[_d] = "N"
CNAE_DIVISAO_SECAO[84] = "O"
CNAE_DIVISAO_SECAO[85] = "P"
for _d in range(86, 89):
    CNAE_DIVISAO_SECAO[_d] = "Q"
for _d in range(90, 94):
    CNAE_DIVISAO_SECAO[_d] = "R"
for _d in range(94, 97):
    CNAE_DIVISAO_SECAO[_d] = "S"
CNAE_DIVISAO_SECAO[97] = "T"
CNAE_DIVISAO_SECAO[99] = "U"

CNAE_SECAO_DESC = {
    "A": "Agricultura, Pecuária e Silvicultura", "B": "Indústrias Extrativas",
    "C": "Indústrias de Transformação", "D": "Eletricidade e Gás",
    "E": "Água, Esgoto e Resíduos", "F": "Construção",
    "G": "Comércio e Reparação de Veículos", "H": "Transporte e Armazenagem",
    "I": "Alojamento e Alimentação", "J": "Informação e Comunicação",
    "K": "Atividades Financeiras e de Seguros", "L": "Atividades Imobiliárias",
    "M": "Atividades Profissionais e Científicas", "N": "Atividades Administrativas",
    "O": "Administração Pública e Defesa", "P": "Educação",
    "Q": "Saúde Humana e Serviços Sociais", "R": "Artes, Cultura e Esporte",
    "S": "Outras Atividades de Serviços", "T": "Serviços Domésticos",
    "U": "Organismos Internacionais",
}

# Descrições de famílias CBO conhecidas (paridade com o loader manual; demais
# famílias ficam com descricao=None — coluna nullable).
CBO_FAMILIA_DESC = {
    "5211": "Vendedores e demonstradores em lojas",
    "7825": "Motoristas de veículos de cargas em geral",
    "5141": "Trabalhadores nos serviços de manutenção de edificações",
    "9152": "Mecânicos de manutenção de máquinas industriais",
    "5174": "Vigilantes e guardas de segurança",
    "4110": "Escriturários em geral, agentes, assistentes e auxiliares administrativos",
    "5132": "Cozinheiros",
    "5134": "Garçons, barmen, copeiros e sommeliers",
    "5143": "Trabalhadores nos serviços de limpeza e conservação",
    "6210": "Trabalhadores agrícolas na cultura de plantas",
    "6225": "Tratoristas agrícolas",
    "6410": "Trabalhadores na exploração agropecuária",
    "7152": "Pedreiros",
    "7155": "Serventes e ajudantes de obras",
    "7841": "Operadores de máquinas para fabricação",
    "8485": "Trabalhadores na fabricação de alimentos",
}

# Colunas do header real (NI 2025) que o parse usa, por papel interno
COLUNAS = {
    "municipio": "Município - Código",
    "rem_media": "Vl Rem Média Nom",
    "sexo": "Sexo - Código",
    "raca": "Raça Cor - Código",
    "cnae_sub": "CNAE 2.0 Subclasse - Codigo",  # sem acento no header real
    "faixa_etaria": "Faixa Etária - Código",
    "escolaridade": "Escolaridade Após 2005 - Código",
    "faixa_rem": "Faixa Rem Média (SM) - Código",
    "faixa_tempo": "Faixa Tempo Emprego - Código",
    "pcd": "Ind Portador Defic - Código",
    "mun_trab": "Município Trab - Código",
    "dias_afas": "Qtd Dias Afastamento",
    "ativo_dez": "Ind Vínculo Ativo 31/12 - Código",
    "parcial": "Ind Trabalho Parcial - Código",
    "intermitente": "Ind Trabalho Intermitente - Código",
    "simples": "Ind Estabelecimento Participante SIMPLES - Código",
    "tipo_vinculo": "Tipo Vínculo - Código",
    "mes_adm": "Mês Admissão - Código",
    "mes_des": "Mês Desligamento - Código",
    "motivo": "Motivo Desligamento - Código",
    "tipo_adm": "Tipo Admissão Trabalhador - Código",
    "cbo": "CBO 2002 Ocupação - Código",
    "tamanho": "Tamanho Estabelecimento - Código",
    "natureza": "Natureza Jurídica - Código",
}


def _limpo(v: str) -> str:
    """Normaliza um campo: strip; -1 / {ñ class} / todos-noves (len>=2) viram ''."""
    v = (v or "").strip()
    if not v or v == "-1" or "{ñ" in v:
        return ""
    if len(v) >= 2 and set(v) == {"9"}:
        return ""
    return v


def _float(v: str) -> float:
    try:
        return float((v or "").strip())
    except (TypeError, ValueError):
        return 0.0


def _int(v: str) -> int:
    try:
        return int(float((v or "").strip()))
    except (TypeError, ValueError):
        return 0


def _label(mapa: dict, raw: str, nao_ident: str = "Não identificado") -> str:
    """Label do mapa; código inédito vira bucket 'Código X'; vazio/NI vira o
    label de não identificado do recorte (nenhum descarte silencioso)."""
    raw = _limpo(raw)
    if not raw:
        return nao_ident
    return mapa.get(raw, f"Código {raw}")


def novo_agregados() -> dict:
    return {
        "vinculos": {},          # (mid, ano) -> {total, rem_soma, rem_cnt}
        "por_sexo": {},          # (mid, ano, label) -> {total, rem_soma, rem_cnt}
        "por_raca": {},
        "por_cnae": {},          # (mid, ano, secao) -> {total, rem_soma, rem_cnt, descricao}
        "por_faixa_etaria": {},
        "por_escolaridade": {},
        "por_faixa_rem": {},     # (mid, ano, label) -> {total}
        "por_faixa_tempo": {},   # (mid, ano, label) -> {total}
        "metricas": {},          # (mid, ano) -> {total, pcd, outro_municipio, afas_soma, afas_cnt, ativo_dez, parcial, intermitente, simples, aprendiz}
        "por_motivo": {},        # (mid, ano, label) -> {total}
        "por_tipo_admissao": {},
        "por_cbo": {},           # (mid, ano, familia) -> {total, rem_soma, rem_cnt, descricao}
        "por_tamanho": {},
        "por_natureza": {},      # (mid, ano, grupo_label) -> {total}
        "turnover": {},          # (mid, ano, mes) -> {adm, des}
        "malformadas": 0,
    }


def _cont_rem(d: dict, chave, rem: float, extra: dict | None = None) -> None:
    e = d.setdefault(chave, {"total": 0, "rem_soma": 0.0, "rem_cnt": 0, **(extra or {})})
    e["total"] += 1
    if rem > 0:
        e["rem_soma"] += rem
        e["rem_cnt"] += 1


def _cont(d: dict, chave) -> None:
    d.setdefault(chave, {"total": 0})["total"] += 1


def agregar_arquivo(fobj, ano: int, alvo_por_cod6: dict, agg: dict) -> int:
    """Streaming: agrega um arquivo de vínculos (1 ano) nos dicts de agg,
    apenas para municípios presentes em alvo_por_cod6. Devolve linhas lidas."""
    reader = csv.reader(fobj, delimiter=",", quotechar='"')
    header = [h.strip() for h in next(reader)]
    idx = {}
    for papel, nome in COLUNAS.items():
        if nome in header:
            idx[papel] = header.index(nome)

    def campo(row, papel):
        i = idx.get(papel)
        return row[i] if i is not None and i < len(row) else ""

    processadas = 0
    minimo = max(idx.values()) + 1 if idx else 0
    for row in reader:
        processadas += 1
        if len(row) < minimo:
            agg["malformadas"] += 1
            continue
        mid = alvo_por_cod6.get(_limpo(campo(row, "municipio")))
        if mid is None:
            continue

        rem = _float(campo(row, "rem_media"))
        _cont_rem(agg["vinculos"], (mid, ano), rem)
        _cont_rem(agg["por_sexo"], (mid, ano, _label(SEXO_MAP, campo(row, "sexo"))), rem)
        _cont_rem(agg["por_raca"], (mid, ano, _label(RACA_COR_MAP, campo(row, "raca"), "Não identificada")), rem)
        _cont_rem(agg["por_faixa_etaria"], (mid, ano, _label(FAIXA_ETARIA_MAP, campo(row, "faixa_etaria"))), rem)
        _cont_rem(agg["por_escolaridade"], (mid, ano, _label(GRAU_INSTRUCAO_MAP, campo(row, "escolaridade"))), rem)
        _cont(agg["por_faixa_rem"], (mid, ano, _label(FAIXA_REMUNERACAO_MAP, campo(row, "faixa_rem"))))
        _cont(agg["por_faixa_tempo"], (mid, ano, _label(FAIXA_TEMPO_EMPREGO_MAP, campo(row, "faixa_tempo"))))

        # CNAE: seção pelos 2 primeiros dígitos da subclasse
        cnae = _limpo(campo(row, "cnae_sub"))
        if cnae[:2].isdigit() and int(cnae[:2]) in CNAE_DIVISAO_SECAO:
            secao = CNAE_DIVISAO_SECAO[int(cnae[:2])]
            desc = CNAE_SECAO_DESC[secao]
        elif cnae:
            # secao e String(5): a propria divisao (2 digitos) vira a chave do bucket
            secao, desc = cnae[:2][:5], f"Divisão CNAE {cnae[:2]} (fora do mapa)"[:150]
        else:
            secao, desc = "NI", "Não identificada"
        _cont_rem(agg["por_cnae"], (mid, ano, secao), rem, {"descricao": desc})

        # CBO: família = 4 primeiros dígitos; NI usa chave curta (coluna String(8))
        cbo = _limpo(campo(row, "cbo"))
        familia = cbo[:4] if cbo.isdigit() and len(cbo) >= 4 else "NI"
        _cont_rem(agg["por_cbo"], (mid, ano, familia[:8]), rem,
                  {"descricao": "Não identificado" if familia == "NI" else CBO_FAMILIA_DESC.get(familia)})

        _cont_rem(agg["por_tamanho"], (mid, ano, _label(TAMANHO_ESTAB_MAP, campo(row, "tamanho"), "Não identificado")[:60]), rem)

        nat = _limpo(campo(row, "natureza"))
        if nat and nat[0] in NATUREZA_JURIDICA_GRUPO_MAP:
            grupo = NATUREZA_JURIDICA_GRUPO_MAP[nat[0]]
        elif nat:
            grupo = f"Código {nat[0]}"
        else:
            grupo = "Não identificado"
        _cont(agg["por_natureza"], (mid, ano, grupo[:80]))

        # Métricas anuais (regras do loader manual)
        m = agg["metricas"].setdefault((mid, ano), {
            "total": 0, "pcd": 0, "outro_municipio": 0, "afas_soma": 0.0,
            "afas_cnt": 0, "ativo_dez": 0, "parcial": 0, "intermitente": 0,
            "simples": 0, "aprendiz": 0,
        })
        m["total"] += 1
        if _limpo(campo(row, "pcd")) in ("1", "S", "SIM"):
            m["pcd"] += 1
        mun_raw, trab_raw = _limpo(campo(row, "municipio")), _limpo(campo(row, "mun_trab"))
        if mun_raw and trab_raw and mun_raw != trab_raw:
            m["outro_municipio"] += 1
        dias = _float(campo(row, "dias_afas"))
        if dias > 0:
            m["afas_soma"] += dias
            m["afas_cnt"] += 1
        if _limpo(campo(row, "ativo_dez")) == "1":
            m["ativo_dez"] += 1
        if _limpo(campo(row, "parcial")) in ("1", "S", "SIM"):
            m["parcial"] += 1
        if _limpo(campo(row, "intermitente")) in ("1", "S", "SIM"):
            m["intermitente"] += 1
        if _limpo(campo(row, "simples")) in ("1", "S", "SIM"):
            m["simples"] += 1
        if _limpo(campo(row, "tipo_vinculo")) == "55":
            m["aprendiz"] += 1

        # Turnover + recortes de admissão/desligamento
        mes_adm = _int(campo(row, "mes_adm"))
        mes_des = _int(campo(row, "mes_des"))
        if mes_adm > 0:
            t = agg["turnover"].setdefault((mid, ano, mes_adm), {"adm": 0, "des": 0})
            t["adm"] += 1
            tipo_label = _label(TIPO_ADMISSAO_MAP, campo(row, "tipo_adm"), "Outros")
            if tipo_label != "Não admitido no ano":
                _cont(agg["por_tipo_admissao"], (mid, ano, tipo_label[:120]))
        if mes_des > 0:
            t = agg["turnover"].setdefault((mid, ano, mes_des), {"adm": 0, "des": 0})
            t["des"] += 1
            _cont(agg["por_motivo"], (mid, ano, _label(MOTIVO_DESLIGAMENTO_MAP, campo(row, "motivo"), "Outros / Não identificado")[:120]))

    return processadas


# ── FTP / seleção de anos e regiões ─────────────────────────────────────────

def conectar_ftp() -> FTP:
    ftp = FTP(FTP_HOST, timeout=120)
    ftp.login()
    ftp.encoding = "latin-1"  # paths do PDET têm acento
    return ftp


def regioes_para(municipios, resumo: ResumoIngestao | None = None) -> list[str]:
    """Regiões (ordenadas) que cobrem as UFs dos municípios-alvo; UF fora do
    mapa vira erro audível no resumo (nunca silêncio)."""
    regioes = []
    for m in municipios:
        reg = UF_REGIAO.get((m.estado or "").upper())
        if reg is None:
            if resumo is not None:
                resumo.erros.append(f"UF desconhecida no mapa de regiões da RAIS: {m.estado}")
            continue
        if reg not in regioes:
            regioes.append(reg)
    return sorted(regioes)


def dir_do_ano(ano: int, dirs: list[str]) -> tuple[str | None, bool]:
    """Diretório do FTP para o ano: prefere o final; cai para 'X Parcial' com
    flag de aviso; (None, False) se o ano não existe."""
    if str(ano) in dirs:
        return str(ano), False
    if f"{ano} Parcial" in dirs:
        return f"{ano} Parcial", True
    return None, False


def ano_padrao(dirs: list[str]) -> tuple[int, bool]:
    """Ano default: o maior ano com diretório (final preferido; parcial conta)."""
    anos = set()
    for d in dirs:
        base = d.replace(" Parcial", "")
        if base.isdigit():
            anos.add(int(base))
    if not anos:
        raise ValueError("FTP da RAIS sem diretórios de ano")
    ano = max(anos)
    _, parcial = dir_do_ano(ano, dirs)
    return ano, parcial


def listar_dirs_rais(ftp: FTP) -> list[str]:
    return [d.rsplit("/", 1)[-1] for d in ftp.nlst(BASE_DIR)]


def baixar_e_extrair(ftp: FTP, dir_ano: str, regiao: str, destino_dir: str) -> str | None:
    """Baixa RAIS_VINC_PUB_{regiao}.7z para destino_dir e extrai; devolve o
    caminho do arquivo extraído (o 7z contém 1 arquivo .COMT/.txt) ou None
    quando o FTP responde 550 (não publicado). O .7z é removido sempre."""
    remoto = f"{BASE_DIR}/{dir_ano}/RAIS_VINC_PUB_{regiao}.7z"
    caminho_7z = os.path.join(destino_dir, f"{regiao}.7z")
    try:
        with open(caminho_7z, "wb") as f:
            ftp.retrbinary(f"RETR {remoto}", f.write)
        with py7zr.SevenZipFile(caminho_7z) as z:
            nomes = z.getnames()
            z.extractall(destino_dir)
        return os.path.join(destino_dir, nomes[0])
    except ftplib.error_perm as exc:
        if "550" in str(exc):
            return None
        raise
    finally:
        with contextlib.suppress(OSError):
            os.remove(caminho_7z)


def baixar_tolerante(ftp, dir_ano: str, regiao: str, destino_dir: str):
    """(ftp, caminho, erro): 1 reconexão em falha transitória; conexão morta
    devolve ftp=None (o chamador reconecta na próxima região — nunca reusa
    conexão zumbi). Padrão do caged_pdet."""
    try:
        if ftp is None:
            ftp = conectar_ftp()
        caminho = baixar_e_extrair(ftp, dir_ano, regiao, destino_dir)
        return ftp, caminho, None if caminho else "nao_publicado"
    except ftplib.all_errors as exc:
        with contextlib.suppress(Exception):
            ftp.close()
        try:
            ftp = conectar_ftp()
            caminho = baixar_e_extrair(ftp, dir_ano, regiao, destino_dir)
            return ftp, caminho, None if caminho else "nao_publicado"
        except ftplib.all_errors as exc2:
            with contextlib.suppress(Exception):
                ftp.close()
            return None, None, f"{type(exc2).__name__}: {exc2}"


# ── Gravação (REPLACE por município/ano) ────────────────────────────────────

def _linhas_do_municipio(agg: dict, mid: int, ano: int) -> dict[str, list[dict]]:
    """Converte os dicts agregados em rows por tabela, só do município/ano."""
    def rem_media(e):
        return round(e["rem_soma"] / e["rem_cnt"], 2) if e["rem_cnt"] else None

    out = {k: [] for k in (
        "vinculos", "por_sexo", "por_raca", "por_cnae", "por_faixa_etaria",
        "por_escolaridade", "por_faixa_rem", "por_faixa_tempo", "metricas",
        "por_motivo", "por_tipo_admissao", "por_cbo", "por_tamanho",
        "por_natureza", "turnover",
    )}
    v = agg["vinculos"].get((mid, ano))
    if v:
        out["vinculos"].append({"municipio_id": mid, "ano": ano,
                                "total_vinculos": v["total"], "remuneracao_media": rem_media(v)})
    for (m, a, label), e in agg["por_sexo"].items():
        if (m, a) == (mid, ano):
            out["por_sexo"].append({"municipio_id": mid, "ano": ano, "sexo": label[:30],
                                    "total_vinculos": e["total"], "remuneracao_media": rem_media(e)})
    for (m, a, label), e in agg["por_raca"].items():
        if (m, a) == (mid, ano):
            out["por_raca"].append({"municipio_id": mid, "ano": ano, "raca_cor": label[:50],
                                    "total_vinculos": e["total"], "remuneracao_media": rem_media(e)})
    for (m, a, secao), e in agg["por_cnae"].items():
        if (m, a) == (mid, ano):
            out["por_cnae"].append({"municipio_id": mid, "ano": ano, "secao": secao[:5],
                                    "descricao_secao": (e.get("descricao") or "Não identificada")[:150],
                                    "total_vinculos": e["total"], "remuneracao_media": rem_media(e)})
    for (m, a, label), e in agg["por_faixa_etaria"].items():
        if (m, a) == (mid, ano):
            out["por_faixa_etaria"].append({"municipio_id": mid, "ano": ano, "faixa_etaria": label[:50],
                                            "total_vinculos": e["total"], "remuneracao_media": rem_media(e)})
    for (m, a, label), e in agg["por_escolaridade"].items():
        if (m, a) == (mid, ano):
            out["por_escolaridade"].append({"municipio_id": mid, "ano": ano, "grau_instrucao": label[:80],
                                            "total_vinculos": e["total"], "remuneracao_media": rem_media(e)})
    for (m, a, label), e in agg["por_faixa_rem"].items():
        if (m, a) == (mid, ano):
            out["por_faixa_rem"].append({"municipio_id": mid, "ano": ano,
                                         "faixa_remuneracao_sm": label[:50], "total_vinculos": e["total"]})
    for (m, a, label), e in agg["por_faixa_tempo"].items():
        if (m, a) == (mid, ano):
            out["por_faixa_tempo"].append({"municipio_id": mid, "ano": ano,
                                           "faixa_tempo_emprego": label[:50], "total_vinculos": e["total"]})
    met = agg["metricas"].get((mid, ano))
    if met:
        out["metricas"].append({
            "municipio_id": mid, "ano": ano, "total_vinculos": met["total"],
            "total_pcd": met["pcd"], "total_outro_municipio": met["outro_municipio"],
            "media_dias_afastamento": round(met["afas_soma"] / met["afas_cnt"], 1) if met["afas_cnt"] else None,
            "total_ativo_dezembro": met["ativo_dez"], "total_parcial": met["parcial"],
            "total_intermitente": met["intermitente"], "total_simples": met["simples"],
            "total_aprendiz_estimado": met["aprendiz"],
        })
    for (m, a, label), e in agg["por_motivo"].items():
        if (m, a) == (mid, ano):
            out["por_motivo"].append({"municipio_id": mid, "ano": ano, "motivo": label[:120],
                                      "total_desligamentos": e["total"]})
    for (m, a, label), e in agg["por_tipo_admissao"].items():
        if (m, a) == (mid, ano):
            out["por_tipo_admissao"].append({"municipio_id": mid, "ano": ano, "tipo": label[:120],
                                             "total_admissoes": e["total"]})
    for (m, a, fam), e in agg["por_cbo"].items():
        if (m, a) == (mid, ano):
            out["por_cbo"].append({"municipio_id": mid, "ano": ano, "cbo_familia": fam[:8],
                                   "descricao": (e.get("descricao") or None),
                                   "total_vinculos": e["total"], "remuneracao_media": rem_media(e)})
    for (m, a, label), e in agg["por_tamanho"].items():
        if (m, a) == (mid, ano):
            out["por_tamanho"].append({"municipio_id": mid, "ano": ano, "tamanho": label[:60],
                                       "total_vinculos": e["total"], "remuneracao_media": rem_media(e)})
    for (m, a, label), e in agg["por_natureza"].items():
        if (m, a) == (mid, ano):
            out["por_natureza"].append({"municipio_id": mid, "ano": ano, "grupo": label[:80],
                                        "total_vinculos": e["total"]})
    for (m, a, mes), e in agg["turnover"].items():
        if (m, a) == (mid, ano):
            out["turnover"].append({"municipio_id": mid, "ano": ano, "mes": mes,
                                    "total_admissoes": e["adm"], "total_desligamentos": e["des"]})
    return out


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    """Executa a fonte RAIS. `notificar` é aceito e ignorado (fonte anual, sem
    regra de notificação neste ciclo)."""
    from app.models.rais import (
        RaisMetricasAnuais, RaisPorCbo, RaisPorCnae, RaisPorEscolaridade,
        RaisPorFaixaEtaria, RaisPorFaixaRemuneracao, RaisPorFaixaTempoEmprego,
        RaisPorMotivoDesligamento, RaisPorNaturezaJuridica, RaisPorRaca,
        RaisPorSexo, RaisPorTamanhoEstabelecimento, RaisPorTipoAdmissao,
        RaisTurnoverMensal, RaisVinculo,
    )

    TABELAS = {
        "vinculos": RaisVinculo, "por_sexo": RaisPorSexo, "por_raca": RaisPorRaca,
        "por_cnae": RaisPorCnae, "por_faixa_etaria": RaisPorFaixaEtaria,
        "por_escolaridade": RaisPorEscolaridade, "por_faixa_rem": RaisPorFaixaRemuneracao,
        "por_faixa_tempo": RaisPorFaixaTempoEmprego, "metricas": RaisMetricasAnuais,
        "por_motivo": RaisPorMotivoDesligamento, "por_tipo_admissao": RaisPorTipoAdmissao,
        "por_cbo": RaisPorCbo, "por_tamanho": RaisPorTamanhoEstabelecimento,
        "por_natureza": RaisPorNaturezaJuridica, "turnover": RaisTurnoverMensal,
    }

    resumo = ResumoIngestao(dataset="rais")
    alvo_por_cod6 = {}
    for m in municipios:
        cod = (m.codigo_ibge or "").strip()
        if len(cod) >= 6 and cod[:6].isdigit():
            alvo_por_cod6[cod[:6]] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}: codigo_ibge inválido para RAIS ({cod!r})")
    if not alvo_por_cod6:
        return resumo

    ftp = None
    try:
        ftp = conectar_ftp()
        dirs = listar_dirs_rais(ftp)
    except ftplib.all_errors as exc:
        resumo.erros.append(f"FTP indisponível: {type(exc).__name__}: {exc}")
        return resumo

    if anos:
        anos_alvo = [int(a) for a in anos]
    else:
        try:
            ano, parcial = ano_padrao(dirs)
        except ValueError as exc:
            resumo.erros.append(str(exc))
            return resumo
        anos_alvo = [ano]
        if parcial:
            resumo.erros.append(f"ano {ano}: apenas dados parciais disponíveis")

    regioes = regioes_para(municipios, resumo)
    agg = novo_agregados()
    anos_ok: set[int] = set()
    total_etapas = max(len(anos_alvo) * len(regioes), 1)
    etapa = 0
    for ano in anos_alvo:
        dir_ano, parcial = dir_do_ano(ano, dirs)
        if dir_ano is None:
            resumo.erros.append(f"ano {ano}: não existe no FTP da RAIS")
            etapa += len(regioes)
            continue
        if parcial and anos:
            resumo.erros.append(f"ano {ano}: apenas dados parciais disponíveis")
        ano_teve_regiao = False
        for regiao in regioes:
            if progresso:
                progresso(etapa, total_etapas, f"RAIS {ano}: baixando {regiao}")
            with tempfile.TemporaryDirectory(prefix="rais_") as tmp:
                ftp, caminho, erro = baixar_tolerante(ftp, dir_ano, regiao, tmp)
                if erro:
                    resumo.erros.append(f"ano {ano} {regiao}: {erro}")
                    etapa += 1
                    continue
                if progresso:
                    progresso(etapa, total_etapas, f"RAIS {ano}: processando {regiao}")
                with open(caminho, encoding="latin-1", newline="") as f:
                    agregar_arquivo(f, ano, alvo_por_cod6, agg)
                ano_teve_regiao = True
            etapa += 1
        if ano_teve_regiao:
            anos_ok.add(ano)
    with contextlib.suppress(Exception):
        if ftp is not None:
            ftp.quit()

    if agg["malformadas"]:
        resumo.erros.append(f"{agg['malformadas']} linha(s) malformada(s) puladas")

    # Gravação: REPLACE por (município, ano) — só anos que tiveram região lida
    mids = sorted(set(alvo_por_cod6.values()))
    for i, mid in enumerate(mids, start=1):
        if progresso:
            progresso(i, len(mids), "gravando municípios")
        gravou_algo = False
        for ano in sorted(anos_ok):
            linhas = _linhas_do_municipio(agg, mid, ano)
            if not any(linhas.values()):
                nome = next((m.nome for m in municipios if m.id == mid), mid)
                resumo.erros.append(
                    f"{nome} ({ano}): sem vínculos no arquivo — dados anteriores mantidos")
                continue
            for chave, model in TABELAS.items():
                db.query(model).filter(model.municipio_id == mid, model.ano == ano).delete(
                    synchronize_session=False)
                for row in linhas[chave]:
                    db.add(model(**row))
                    resumo.linhas += 1
            gravou_algo = True
        db.commit()
        if gravou_algo:
            resumo.municipios_ok += 1
    return resumo


registrar(FonteAutomatica(
    key="rais",
    label="RAIS (PDET)",
    fonte="MTE — RAIS, microdados de vínculos (PDET/FTP)",
    executar=executar,
))
