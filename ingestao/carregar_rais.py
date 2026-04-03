import csv
import os
from collections import defaultdict

from tqdm import tqdm
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.municipio import Municipio
from app.models.rais import (
    RaisVinculo, RaisPorCnae, RaisPorRaca, RaisPorSexo,
    RaisPorFaixaEtaria, RaisPorEscolaridade, RaisPorFaixaRemuneracao,
    RaisPorFaixaTempoEmprego, RaisMetricasAnuais,
)

BASE_PATH = "dados/Pacote_Trabalho_Multicidades/RAIS"

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


def normalizar_nome(nome: str) -> str:
    return nome.strip().replace("_", " ").upper()


def obter_ou_criar_municipio(db: Session, nome: str) -> Municipio:
    municipio = db.query(Municipio).filter(Municipio.nome == nome).first()
    if not municipio:
        municipio = Municipio(nome=nome, estado="MG", codigo_ibge=None, ativo=True)
        db.add(municipio)
        db.commit()
        db.refresh(municipio)
    return municipio


def _count_rows(caminho: str) -> int:
    with open(caminho, encoding="utf-8-sig") as f:
        return sum(1 for _ in f) - 1  # subtract header


def carregar_csv(db: Session, caminho: str):
    nome_arquivo = os.path.basename(caminho)
    nome_municipio = normalizar_nome(
        nome_arquivo.replace("rais_vinculos_2021_2024_", "").replace(".csv", "")
    )
    municipio = obter_ou_criar_municipio(db, nome_municipio)

    # Aggregation buckets
    contagem_por_ano: dict[int, int] = defaultdict(int)
    remun_agg: dict[int, dict] = defaultdict(lambda: {"soma": 0.0, "cnt": 0})

    por_sexo: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_raca: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_cnae: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})

    por_faixa_etaria: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_escolaridade: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    por_faixa_rem: dict[tuple, int] = defaultdict(int)
    por_faixa_tempo: dict[tuple, int] = defaultdict(int)

    # Metricas anuais
    metricas: dict[int, dict] = defaultdict(lambda: {
        "total": 0, "pcd": 0, "outro_municipio": 0,
        "afastamento_soma": 0.0, "afastamento_cnt": 0,
    })

    total_rows = _count_rows(caminho)
    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")
        for row in tqdm(reader, total=total_rows, desc=f"  {nome_municipio}", leave=False, unit="rows"):
            ano = int(row["ano"])
            contagem_por_ano[ano] += 1
            metricas[ano]["total"] += 1

            # Remuneracao
            try:
                rem = float(row.get("valor_remuneracao_media", "") or 0)
            except (ValueError, TypeError):
                rem = 0.0
            if rem > 0:
                remun_agg[ano]["soma"] += rem
                remun_agg[ano]["cnt"] += 1

            # Sexo
            sexo_label = SEXO_MAP.get(str(row.get("sexo", "")).strip(), "Não identificado")
            chave_sexo = (ano, sexo_label)
            por_sexo[chave_sexo]["vinculos"] += 1
            if rem > 0:
                por_sexo[chave_sexo]["soma_rem"] += rem
                por_sexo[chave_sexo]["cnt_rem"] += 1

            # Raca
            raca_label = RACA_COR_MAP.get(str(row.get("raca_cor", "")).strip(), "Não identificada")
            chave_raca = (ano, raca_label)
            por_raca[chave_raca]["vinculos"] += 1
            if rem > 0:
                por_raca[chave_raca]["soma_rem"] += rem
                por_raca[chave_raca]["cnt_rem"] += 1

            # CNAE
            subclasse = str(row.get("cnae_2_subclasse", "")).strip()
            secao_info = get_secao_from_subclasse(subclasse)
            if secao_info:
                secao, desc = secao_info
                chave_cnae = (ano, secao, desc)
                por_cnae[chave_cnae]["vinculos"] += 1
                if rem > 0:
                    por_cnae[chave_cnae]["soma_rem"] += rem
                    por_cnae[chave_cnae]["cnt_rem"] += 1

            # Faixa etária
            fe_raw = str(row.get("faixa_etaria", "")).strip()
            fe_label = FAIXA_ETARIA_MAP.get(fe_raw, fe_raw or "Não identificado")
            chave_fe = (ano, fe_label)
            por_faixa_etaria[chave_fe]["vinculos"] += 1
            if rem > 0:
                por_faixa_etaria[chave_fe]["soma_rem"] += rem
                por_faixa_etaria[chave_fe]["cnt_rem"] += 1

            # Escolaridade
            gi_raw = str(row.get("grau_instrucao_apos_2005", "")).strip()
            gi_label = GRAU_INSTRUCAO_MAP.get(gi_raw, gi_raw or "Não identificado")
            chave_gi = (ano, gi_label)
            por_escolaridade[chave_gi]["vinculos"] += 1
            if rem > 0:
                por_escolaridade[chave_gi]["soma_rem"] += rem
                por_escolaridade[chave_gi]["cnt_rem"] += 1

            # Faixa remuneração
            fr_raw = str(row.get("faixa_remuneracao_media_sm", "")).strip()
            fr_label = FAIXA_REMUNERACAO_MAP.get(fr_raw, fr_raw or "Não identificado")
            por_faixa_rem[(ano, fr_label)] += 1

            # Faixa tempo emprego
            ft_raw = str(row.get("faixa_tempo_emprego", "")).strip()
            ft_label = FAIXA_TEMPO_EMPREGO_MAP.get(ft_raw, ft_raw or "Não identificado")
            por_faixa_tempo[(ano, ft_label)] += 1

            # PCD
            pcd_raw = str(row.get("indicador_portador_deficiencia", "")).strip()
            if pcd_raw in ("1", "S", "SIM"):
                metricas[ano]["pcd"] += 1

            # Outro município
            id_mun = str(row.get("id_municipio", "")).strip()
            id_mun_trab = str(row.get("id_municipio_trabalho", "")).strip()
            if id_mun and id_mun_trab and id_mun != id_mun_trab:
                metricas[ano]["outro_municipio"] += 1

            # Afastamento
            try:
                dias_af = float(row.get("quantidade_dias_afastamento", "") or 0)
                if dias_af > 0:
                    metricas[ano]["afastamento_soma"] += dias_af
                    metricas[ano]["afastamento_cnt"] += 1
            except (ValueError, TypeError):
                pass

    # ── Persist ───────────────────────────────────────────────────────────────

    def _exists(model, **kwargs):
        return db.query(model).filter_by(**kwargs).first() is not None

    # RaisVinculo
    for ano, total_vinculos in contagem_por_ano.items():
        if _exists(RaisVinculo, municipio_id=municipio.id, ano=ano):
            continue
        rem_media = remun_agg[ano]["soma"] / remun_agg[ano]["cnt"] if remun_agg[ano]["cnt"] else None
        db.add(RaisVinculo(municipio_id=municipio.id, ano=ano, total_vinculos=total_vinculos, remuneracao_media=rem_media))

    # RaisPorSexo
    for (ano, label), agg in por_sexo.items():
        if _exists(RaisPorSexo, municipio_id=municipio.id, ano=ano, sexo=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorSexo(municipio_id=municipio.id, ano=ano, sexo=label, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    # RaisPorRaca
    for (ano, label), agg in por_raca.items():
        if _exists(RaisPorRaca, municipio_id=municipio.id, ano=ano, raca_cor=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorRaca(municipio_id=municipio.id, ano=ano, raca_cor=label, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    # RaisPorCnae
    for (ano, secao, desc), agg in por_cnae.items():
        if _exists(RaisPorCnae, municipio_id=municipio.id, ano=ano, secao=secao):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorCnae(municipio_id=municipio.id, ano=ano, secao=secao, descricao_secao=desc, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    # RaisPorFaixaEtaria
    for (ano, label), agg in por_faixa_etaria.items():
        if _exists(RaisPorFaixaEtaria, municipio_id=municipio.id, ano=ano, faixa_etaria=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorFaixaEtaria(municipio_id=municipio.id, ano=ano, faixa_etaria=label, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    # RaisPorEscolaridade
    for (ano, label), agg in por_escolaridade.items():
        if _exists(RaisPorEscolaridade, municipio_id=municipio.id, ano=ano, grau_instrucao=label):
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] else None
        db.add(RaisPorEscolaridade(municipio_id=municipio.id, ano=ano, grau_instrucao=label, total_vinculos=agg["vinculos"], remuneracao_media=rem_media))

    # RaisPorFaixaRemuneracao
    for (ano, label), cnt in por_faixa_rem.items():
        if _exists(RaisPorFaixaRemuneracao, municipio_id=municipio.id, ano=ano, faixa_remuneracao_sm=label):
            continue
        db.add(RaisPorFaixaRemuneracao(municipio_id=municipio.id, ano=ano, faixa_remuneracao_sm=label, total_vinculos=cnt))

    # RaisPorFaixaTempoEmprego
    for (ano, label), cnt in por_faixa_tempo.items():
        if _exists(RaisPorFaixaTempoEmprego, municipio_id=municipio.id, ano=ano, faixa_tempo_emprego=label):
            continue
        db.add(RaisPorFaixaTempoEmprego(municipio_id=municipio.id, ano=ano, faixa_tempo_emprego=label, total_vinculos=cnt))

    # RaisMetricasAnuais
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
        ))

    db.commit()


def main():
    db = SessionLocal()
    try:
        arquivos = [f for f in os.listdir(BASE_PATH) if f.endswith(".csv")]
        for arquivo in tqdm(arquivos, desc="RAIS", unit="cidade"):
            caminho = os.path.join(BASE_PATH, arquivo)
            carregar_csv(db, caminho)
        print("✅ Carga RAIS finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
