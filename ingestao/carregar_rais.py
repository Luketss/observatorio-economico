import csv
from collections import defaultdict
from pathlib import Path

from tqdm import tqdm
from sqlalchemy.orm import Session

from app.models.rais import (
    RaisVinculo, RaisPorCnae, RaisPorRaca, RaisPorSexo,
    RaisPorFaixaEtaria, RaisPorEscolaridade, RaisPorFaixaRemuneracao,
    RaisPorFaixaTempoEmprego, RaisMetricasAnuais,
    RaisPorMotivoDesligamento, RaisPorTipoAdmissao, RaisPorCbo,
    RaisPorTamanhoEstabelecimento, RaisPorNaturezaJuridica, RaisTurnoverMensal,
)
from ingestao.utils import obter_ou_criar_municipio

SEXO_MAP = {
    "1": "Masculino",
    "2": "Feminino",
    "9": "Não identificado",
}

RACA_COR_MAP = {
    "1": "Indígena",
    "2": "Branca",
    "4": "Preta",
    "6": "Amarela",
    "8": "Parda",
    "9": "Não identificada",
}

FAIXA_ETARIA_MAP = {
    "1": "Até 17 anos",
    "2": "18 a 24 anos",
    "3": "25 a 29 anos",
    "4": "30 a 39 anos",
    "5": "40 a 49 anos",
    "6": "50 a 64 anos",
    "7": "65 anos ou mais",
    "9": "Não identificado",
}

GRAU_INSTRUCAO_MAP = {
    "1": "Analfabeto",
    "2": "Até 5ª incompleto",
    "3": "5ª completo fundamental",
    "4": "6ª a 9ª fundamental",
    "5": "Fund. completo",
    "6": "Médio incompleto",
    "7": "Médio completo",
    "8": "Superior incompleto",
    "9": "Superior completo",
    "10": "Mestrado",
    "11": "Doutorado",
}

FAIXA_REMUNERACAO_MAP = {
    "1": "Até 0,5 SM",
    "2": "0,5 a 1 SM",
    "3": "1 a 1,5 SM",
    "4": "1,5 a 2 SM",
    "5": "2 a 3 SM",
    "6": "3 a 4 SM",
    "7": "4 a 5 SM",
    "8": "5 a 7 SM",
    "9": "7 a 10 SM",
    "10": "10 a 15 SM",
    "11": "15 a 20 SM",
    "12": "Mais de 20 SM",
    "99": "Não identificado",
}

FAIXA_TEMPO_EMPREGO_MAP = {
    "1": "Até 3 meses",
    "2": "3 a 6 meses",
    "3": "6 a 12 meses",
    "4": "1 a 2 anos",
    "5": "2 a 3 anos",
    "6": "3 a 5 anos",
    "7": "5 a 10 anos",
    "8": "10 anos ou mais",
    "9": "Não identificado",
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

# Categorized hire types (RAIS tipo_admissao codes)
TIPO_ADMISSAO_MAP = {
    "0": "Não admitido no ano",
    "1": "Primeiro emprego",
    "2": "Reemprego",
    "3": "Transferência com ônus",
    "4": "Transferência sem ônus",
    "5": "Reintegração",
    "6": "Mudança de regime jurídico",
    "7": "Reativação",
    "8": "Outros",
}

# tamanho_estabelecimento codes
TAMANHO_ESTAB_MAP = {
    "1": "Até 4 vínculos",
    "2": "5 a 9",
    "3": "10 a 19",
    "4": "20 a 49",
    "5": "50 a 99",
    "6": "100 a 249",
    "7": "250 a 499",
    "8": "500 a 999",
    "9": "1000 ou mais",
    "0": "Zero / não classificado",
}

# natureza_juridica is a 4-digit code; first digit identifies the macro group.
NATUREZA_JURIDICA_GRUPO_MAP = {
    "1": "Administração Pública",
    "2": "Entidades Empresariais",
    "3": "Entidades sem Fins Lucrativos",
    "4": "Pessoas Físicas",
    "5": "Organizações Internacionais",
    "8": "Outras",
}

# Top 50 most common CBO 2002 family-code descriptions seen in CSV samples.
# (Loader uses these where available; otherwise stores the bare code.)
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

# CNAE 2.0: first 2 digits of subclasse → section letter
CNAE_DIVISAO_SECAO = {}
for d in range(1, 4):
    CNAE_DIVISAO_SECAO[d] = "A"
for d in range(5, 10):
    CNAE_DIVISAO_SECAO[d] = "B"
for d in range(10, 34):
    CNAE_DIVISAO_SECAO[d] = "C"
CNAE_DIVISAO_SECAO[35] = "D"
for d in range(36, 40):
    CNAE_DIVISAO_SECAO[d] = "E"
for d in range(41, 44):
    CNAE_DIVISAO_SECAO[d] = "F"
for d in range(45, 48):
    CNAE_DIVISAO_SECAO[d] = "G"
for d in range(49, 54):
    CNAE_DIVISAO_SECAO[d] = "H"
for d in range(55, 57):
    CNAE_DIVISAO_SECAO[d] = "I"
for d in range(58, 64):
    CNAE_DIVISAO_SECAO[d] = "J"
for d in range(64, 67):
    CNAE_DIVISAO_SECAO[d] = "K"
CNAE_DIVISAO_SECAO[68] = "L"
for d in range(69, 76):
    CNAE_DIVISAO_SECAO[d] = "M"
for d in range(77, 83):
    CNAE_DIVISAO_SECAO[d] = "N"
CNAE_DIVISAO_SECAO[84] = "O"
CNAE_DIVISAO_SECAO[85] = "P"
for d in range(86, 89):
    CNAE_DIVISAO_SECAO[d] = "Q"
for d in range(90, 94):
    CNAE_DIVISAO_SECAO[d] = "R"
for d in range(94, 97):
    CNAE_DIVISAO_SECAO[d] = "S"
CNAE_DIVISAO_SECAO[97] = "T"
CNAE_DIVISAO_SECAO[99] = "U"

CNAE_SECAO_DESC = {
    "A": "Agricultura, Pecuária e Silvicultura",
    "B": "Indústrias Extrativas",
    "C": "Indústrias de Transformação",
    "D": "Eletricidade e Gás",
    "E": "Água, Esgoto e Resíduos",
    "F": "Construção",
    "G": "Comércio e Reparação de Veículos",
    "H": "Transporte e Armazenagem",
    "I": "Alojamento e Alimentação",
    "J": "Informação e Comunicação",
    "K": "Atividades Financeiras e de Seguros",
    "L": "Atividades Imobiliárias",
    "M": "Atividades Profissionais e Científicas",
    "N": "Atividades Administrativas",
    "O": "Administração Pública e Defesa",
    "P": "Educação",
    "Q": "Saúde Humana e Serviços Sociais",
    "R": "Artes, Cultura e Esporte",
    "S": "Outras Atividades de Serviços",
    "T": "Serviços Domésticos",
    "U": "Organismos Internacionais",
}


def get_secao_from_subclasse(subclasse: str) -> tuple[str, str] | None:
    if not subclasse or len(subclasse) < 2:
        return None
    try:
        divisao = int(subclasse[:2])
    except ValueError:
        return None
    secao = CNAE_DIVISAO_SECAO.get(divisao)
    if not secao:
        return None
    return secao, CNAE_SECAO_DESC.get(secao, secao)


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "rais_vinculos.csv"
    if not caminho.exists():
        print(f"  [AVISO]  rais_vinculos.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    contagem_por_ano: dict[int, int] = defaultdict(int)
    remun_agg: dict[int, dict] = defaultdict(lambda: {"soma": 0.0, "cnt": 0})
    por_sexo: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_raca: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_cnae: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_faixa_etaria: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_escolaridade: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_faixa_rem: dict[tuple, int] = defaultdict(int)
    por_faixa_tempo: dict[tuple, int] = defaultdict(int)
    metricas: dict[int, dict] = defaultdict(lambda: {
        "total": 0, "pcd": 0, "outro_municipio": 0,
        "afastamento_soma": 0.0, "afastamento_cnt": 0,
        "ativo_dezembro": 0, "parcial": 0, "intermitente": 0,
        "simples": 0, "aprendiz_estimado": 0,
    })
    por_motivo: dict[tuple, int] = defaultdict(int)
    por_tipo_admissao: dict[tuple, int] = defaultdict(int)
    por_cbo: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_tamanho: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_natureza: dict[tuple, int] = defaultdict(int)
    turnover: dict[tuple, dict] = defaultdict(lambda: {"adm": 0, "des": 0})  # (ano, mes) -> counts

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")
        for row in tqdm(reader, desc=f"  {city_name}", leave=False, unit="rows"):
            ano = int(row["ano"])
            contagem_por_ano[ano] += 1
            metricas[ano]["total"] += 1

            try:
                rem = float(row.get("valor_remuneracao_media", "") or 0)
            except (ValueError, TypeError):
                rem = 0.0
            if rem > 0:
                remun_agg[ano]["soma"] += rem
                remun_agg[ano]["cnt"] += 1

            sexo_label = SEXO_MAP.get(str(row.get("sexo", "")).strip(), "Não identificado")
            chave_sexo = (ano, sexo_label)
            por_sexo[chave_sexo]["vinculos"] += 1
            if rem > 0:
                por_sexo[chave_sexo]["soma_rem"] += rem
                por_sexo[chave_sexo]["cnt_rem"] += 1

            raca_label = RACA_COR_MAP.get(str(row.get("raca_cor", "")).strip(), "Não identificada")
            chave_raca = (ano, raca_label)
            por_raca[chave_raca]["vinculos"] += 1
            if rem > 0:
                por_raca[chave_raca]["soma_rem"] += rem
                por_raca[chave_raca]["cnt_rem"] += 1

            subclasse = str(row.get("cnae_2_subclasse", "")).strip()
            secao_info = get_secao_from_subclasse(subclasse)
            if secao_info:
                secao, desc = secao_info
                chave_cnae = (ano, secao, desc)
                por_cnae[chave_cnae]["vinculos"] += 1
                if rem > 0:
                    por_cnae[chave_cnae]["soma_rem"] += rem
                    por_cnae[chave_cnae]["cnt_rem"] += 1

            fe_raw = str(row.get("faixa_etaria", "")).strip()
            fe_label = FAIXA_ETARIA_MAP.get(fe_raw, fe_raw or "Não identificado")
            chave_fe = (ano, fe_label)
            por_faixa_etaria[chave_fe]["vinculos"] += 1
            if rem > 0:
                por_faixa_etaria[chave_fe]["soma_rem"] += rem
                por_faixa_etaria[chave_fe]["cnt_rem"] += 1

            gi_raw = str(row.get("grau_instrucao_apos_2005", "")).strip()
            gi_label = GRAU_INSTRUCAO_MAP.get(gi_raw, gi_raw or "Não identificado")
            chave_gi = (ano, gi_label)
            por_escolaridade[chave_gi]["vinculos"] += 1
            if rem > 0:
                por_escolaridade[chave_gi]["soma_rem"] += rem
                por_escolaridade[chave_gi]["cnt_rem"] += 1

            fr_raw = str(row.get("faixa_remuneracao_media_sm", "")).strip()
            fr_label = FAIXA_REMUNERACAO_MAP.get(fr_raw, fr_raw or "Não identificado")
            por_faixa_rem[(ano, fr_label)] += 1

            ft_raw = str(row.get("faixa_tempo_emprego", "")).strip()
            ft_label = FAIXA_TEMPO_EMPREGO_MAP.get(ft_raw, ft_raw or "Não identificado")
            por_faixa_tempo[(ano, ft_label)] += 1

            pcd_raw = str(row.get("indicador_portador_deficiencia", "")).strip()
            if pcd_raw in ("1", "S", "SIM"):
                metricas[ano]["pcd"] += 1

            id_mun = str(row.get("id_municipio", "")).strip()
            id_mun_trab = str(row.get("id_municipio_trabalho", "")).strip()
            if id_mun and id_mun_trab and id_mun != id_mun_trab:
                metricas[ano]["outro_municipio"] += 1

            try:
                dias_af = float(row.get("quantidade_dias_afastamento", "") or 0)
                if dias_af > 0:
                    metricas[ano]["afastamento_soma"] += dias_af
                    metricas[ano]["afastamento_cnt"] += 1
            except (ValueError, TypeError):
                pass

            # ── New aggregations (2026-05) ──

            # Active on Dec 31
            if str(row.get("vinculo_ativo_3112", "")).strip() == "1":
                metricas[ano]["ativo_dezembro"] += 1

            # Contract type indicators
            if str(row.get("indicador_trabalho_parcial", "")).strip() in ("1", "S", "SIM"):
                metricas[ano]["parcial"] += 1
            if str(row.get("indicador_trabalho_intermitente", "")).strip() in ("1", "S", "SIM"):
                metricas[ano]["intermitente"] += 1
            if str(row.get("indicador_simples", "")).strip() in ("1", "S", "SIM"):
                metricas[ano]["simples"] += 1
            # Apprenticeship is not in RAIS schema; approximate via tipo_vinculo == "55" (menor aprendiz)
            if str(row.get("tipo_vinculo", "")).strip() == "55":
                metricas[ano]["aprendiz_estimado"] += 1

            # Hire / fire reason — only count rows where the event actually happened this year
            mes_adm_raw = str(row.get("mes_admissao", "") or "").strip()
            mes_des_raw = str(row.get("mes_desligamento", "") or "").strip()
            try:
                mes_adm = int(mes_adm_raw) if mes_adm_raw else 0
            except ValueError:
                mes_adm = 0
            try:
                mes_des = int(mes_des_raw) if mes_des_raw else 0
            except ValueError:
                mes_des = 0

            if mes_adm > 0:
                tipo_raw = str(row.get("tipo_admissao", "") or "").strip()
                tipo_label = TIPO_ADMISSAO_MAP.get(tipo_raw, "Outros")
                if tipo_label != "Não admitido no ano":
                    por_tipo_admissao[(ano, tipo_label)] += 1
                turnover[(ano, mes_adm)]["adm"] += 1

            if mes_des > 0:
                motivo_raw = str(row.get("motivo_desligamento", "") or "").strip()
                motivo_label = MOTIVO_DESLIGAMENTO_MAP.get(motivo_raw, "Outros / Não identificado")
                por_motivo[(ano, motivo_label)] += 1
                turnover[(ano, mes_des)]["des"] += 1

            # CBO 2002 family code (first 4 digits of 6-digit code)
            cbo_raw = str(row.get("cbo_2002", "") or "").strip()
            if cbo_raw and cbo_raw.isdigit() and len(cbo_raw) >= 4:
                fam = cbo_raw[:4]
                chave_cbo = (ano, fam)
                por_cbo[chave_cbo]["vinculos"] += 1
                if rem > 0:
                    por_cbo[chave_cbo]["soma_rem"] += rem
                    por_cbo[chave_cbo]["cnt_rem"] += 1

            # Establishment size band
            tam_raw = str(row.get("tamanho_estabelecimento", "") or "").strip()
            tam_label = TAMANHO_ESTAB_MAP.get(tam_raw)
            if tam_label:
                chave_tam = (ano, tam_label)
                por_tamanho[chave_tam]["vinculos"] += 1
                if rem > 0:
                    por_tamanho[chave_tam]["soma_rem"] += rem
                    por_tamanho[chave_tam]["cnt_rem"] += 1

            # Natureza jurídica — bucket by first digit
            nat_raw = str(row.get("natureza_juridica", "") or "").strip()
            if nat_raw and nat_raw[0] in NATUREZA_JURIDICA_GRUPO_MAP:
                grupo = NATUREZA_JURIDICA_GRUPO_MAP[nat_raw[0]]
                por_natureza[(ano, grupo)] += 1

    def _exists(model, **kwargs):
        return db.query(model).filter_by(**kwargs).first() is not None

    for ano, total_vinculos in contagem_por_ano.items():
        if _exists(RaisVinculo, municipio_id=municipio.id, ano=ano):
            continue
        rem_media = remun_agg[ano]["soma"] / remun_agg[ano]["cnt"] if remun_agg[ano]["cnt"] else None
        db.add(RaisVinculo(municipio_id=municipio.id, ano=ano, total_vinculos=total_vinculos, remuneracao_media=rem_media))

    for (ano, label), agg in por_sexo.items():
        if _exists(RaisPorSexo, municipio_id=municipio.id, ano=ano, sexo=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorSexo(municipio_id=municipio.id, ano=ano, sexo=label, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    for (ano, label), agg in por_raca.items():
        if _exists(RaisPorRaca, municipio_id=municipio.id, ano=ano, raca_cor=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorRaca(municipio_id=municipio.id, ano=ano, raca_cor=label, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    for (ano, secao, desc), agg in por_cnae.items():
        if _exists(RaisPorCnae, municipio_id=municipio.id, ano=ano, secao=secao):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorCnae(municipio_id=municipio.id, ano=ano, secao=secao, descricao_secao=desc, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    for (ano, label), agg in por_faixa_etaria.items():
        if _exists(RaisPorFaixaEtaria, municipio_id=municipio.id, ano=ano, faixa_etaria=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorFaixaEtaria(municipio_id=municipio.id, ano=ano, faixa_etaria=label, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    for (ano, label), agg in por_escolaridade.items():
        if _exists(RaisPorEscolaridade, municipio_id=municipio.id, ano=ano, grau_instrucao=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorEscolaridade(municipio_id=municipio.id, ano=ano, grau_instrucao=label, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    for (ano, label), cnt in por_faixa_rem.items():
        if _exists(RaisPorFaixaRemuneracao, municipio_id=municipio.id, ano=ano, faixa_remuneracao_sm=label):
            continue
        db.add(RaisPorFaixaRemuneracao(municipio_id=municipio.id, ano=ano, faixa_remuneracao_sm=label, total_vinculos=cnt))

    for (ano, label), cnt in por_faixa_tempo.items():
        if _exists(RaisPorFaixaTempoEmprego, municipio_id=municipio.id, ano=ano, faixa_tempo_emprego=label):
            continue
        db.add(RaisPorFaixaTempoEmprego(municipio_id=municipio.id, ano=ano, faixa_tempo_emprego=label, total_vinculos=cnt))

    for ano, m in metricas.items():
        if _exists(RaisMetricasAnuais, municipio_id=municipio.id, ano=ano):
            continue
        media_af = m["afastamento_soma"] / m["afastamento_cnt"] if m["afastamento_cnt"] else None
        db.add(RaisMetricasAnuais(
            municipio_id=municipio.id,
            ano=ano,
            total_vinculos=m["total"],
            total_pcd=m["pcd"],
            total_outro_municipio=m["outro_municipio"],
            media_dias_afastamento=media_af,
            total_ativo_dezembro=m["ativo_dezembro"],
            total_parcial=m["parcial"],
            total_intermitente=m["intermitente"],
            total_simples=m["simples"],
            total_aprendiz_estimado=m["aprendiz_estimado"],
        ))

    for (ano, motivo), cnt in por_motivo.items():
        if _exists(RaisPorMotivoDesligamento, municipio_id=municipio.id, ano=ano, motivo=motivo):
            continue
        db.add(RaisPorMotivoDesligamento(
            municipio_id=municipio.id, ano=ano, motivo=motivo, total_desligamentos=cnt,
        ))

    for (ano, tipo), cnt in por_tipo_admissao.items():
        if _exists(RaisPorTipoAdmissao, municipio_id=municipio.id, ano=ano, tipo=tipo):
            continue
        db.add(RaisPorTipoAdmissao(
            municipio_id=municipio.id, ano=ano, tipo=tipo, total_admissoes=cnt,
        ))

    for (ano, fam), agg in por_cbo.items():
        if _exists(RaisPorCbo, municipio_id=municipio.id, ano=ano, cbo_familia=fam):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorCbo(
            municipio_id=municipio.id, ano=ano,
            cbo_familia=fam, descricao=CBO_FAMILIA_DESC.get(fam),
            total_vinculos=agg["vinculos"], remuneracao_media=rem_media,
        ))

    for (ano, label), agg in por_tamanho.items():
        if _exists(RaisPorTamanhoEstabelecimento, municipio_id=municipio.id, ano=ano, tamanho=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorTamanhoEstabelecimento(
            municipio_id=municipio.id, ano=ano, tamanho=label,
            total_vinculos=agg["vinculos"], remuneracao_media=rem_media,
        ))

    for (ano, grupo), cnt in por_natureza.items():
        if _exists(RaisPorNaturezaJuridica, municipio_id=municipio.id, ano=ano, grupo=grupo):
            continue
        db.add(RaisPorNaturezaJuridica(
            municipio_id=municipio.id, ano=ano, grupo=grupo, total_vinculos=cnt,
        ))

    for (ano, mes), counts in turnover.items():
        if _exists(RaisTurnoverMensal, municipio_id=municipio.id, ano=ano, mes=mes):
            continue
        db.add(RaisTurnoverMensal(
            municipio_id=municipio.id, ano=ano, mes=mes,
            total_admissoes=counts["adm"], total_desligamentos=counts["des"],
        ))

    db.commit()
