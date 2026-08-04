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
