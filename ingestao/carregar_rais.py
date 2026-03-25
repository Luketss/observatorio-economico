import csv
import os
from collections import defaultdict

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.municipio import Municipio
from app.models.rais import RaisVinculo, RaisPorCnae, RaisPorRaca, RaisPorSexo

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
    """Extract CNAE section letter from 7-digit subclasse code."""
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
    return nome.strip().upper()


def obter_ou_criar_municipio(db: Session, nome: str) -> Municipio:
    municipio = db.query(Municipio).filter(Municipio.nome == nome).first()

    if not municipio:
        municipio = Municipio(
            nome=nome,
            estado="MG",
            codigo_ibge=None,
            ativo=True,
        )
        db.add(municipio)
        db.commit()
        db.refresh(municipio)

    return municipio


def carregar_csv(db: Session, caminho: str):
    nome_arquivo = os.path.basename(caminho)
    # e.g. rais_vinculos_2021_2024_Carmo_da_Mata.csv
    nome_municipio = normalizar_nome(
        nome_arquivo.replace("rais_vinculos_2021_2024_", "").replace(".csv", "")
    )

    municipio = obter_ou_criar_municipio(db, nome_municipio)

    # Aggregation: count vinculos per year
    contagem_por_ano: dict[int, int] = defaultdict(int)
    # Remuneracao: sum and count for average
    remun_agg: dict[int, dict] = defaultdict(lambda: {"soma": 0.0, "cnt": 0})

    # Per sexo: {(ano, sexo_label): {vinculos, soma_rem, cnt_rem}}
    por_sexo: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    # Per raca: {(ano, raca_label): {vinculos, soma_rem, cnt_rem}}
    por_raca: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})
    # Per cnae: {(ano, secao, desc): {vinculos, soma_rem, cnt_rem}}
    por_cnae: dict[tuple, dict] = defaultdict(lambda: {"vinculos": 0, "soma_rem": 0.0, "cnt_rem": 0})

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            ano = int(row["ano"])
            contagem_por_ano[ano] += 1

            # Remuneracao
            try:
                rem = float(row.get("valor_remuneracao_media", "") or 0)
            except (ValueError, TypeError):
                rem = 0.0
            if rem > 0:
                remun_agg[ano]["soma"] += rem
                remun_agg[ano]["cnt"] += 1

            # Sexo
            sexo_raw = str(row.get("sexo", "")).strip()
            sexo_label = SEXO_MAP.get(sexo_raw, "Não identificado")
            chave_sexo = (ano, sexo_label)
            por_sexo[chave_sexo]["vinculos"] += 1
            if rem > 0:
                por_sexo[chave_sexo]["soma_rem"] += rem
                por_sexo[chave_sexo]["cnt_rem"] += 1

            # Raca
            raca_raw = str(row.get("raca_cor", "")).strip()
            raca_label = RACA_COR_MAP.get(raca_raw, "Não identificada")
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

    # ----- Persist RaisVinculo (annual totals) -----
    for ano, total_vinculos in contagem_por_ano.items():
        if db.query(RaisVinculo).filter(
            RaisVinculo.municipio_id == municipio.id,
            RaisVinculo.ano == ano,
        ).first():
            continue
        rem_media = None
        if remun_agg[ano]["cnt"] > 0:
            rem_media = remun_agg[ano]["soma"] / remun_agg[ano]["cnt"]
        db.add(RaisVinculo(
            municipio_id=municipio.id,
            ano=ano,
            total_vinculos=total_vinculos,
            setor=None,
            remuneracao_media=rem_media,
        ))

    # ----- Persist RaisPorSexo -----
    for (ano, sexo_label), agg in por_sexo.items():
        if db.query(RaisPorSexo).filter(
            RaisPorSexo.municipio_id == municipio.id,
            RaisPorSexo.ano == ano,
            RaisPorSexo.sexo == sexo_label,
        ).first():
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] > 0 else None
        db.add(RaisPorSexo(
            municipio_id=municipio.id,
            ano=ano,
            sexo=sexo_label,
            total_vinculos=agg["vinculos"],
            remuneracao_media=rem_media,
        ))

    # ----- Persist RaisPorRaca -----
    for (ano, raca_label), agg in por_raca.items():
        if db.query(RaisPorRaca).filter(
            RaisPorRaca.municipio_id == municipio.id,
            RaisPorRaca.ano == ano,
            RaisPorRaca.raca_cor == raca_label,
        ).first():
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] > 0 else None
        db.add(RaisPorRaca(
            municipio_id=municipio.id,
            ano=ano,
            raca_cor=raca_label,
            total_vinculos=agg["vinculos"],
            remuneracao_media=rem_media,
        ))

    # ----- Persist RaisPorCnae -----
    for (ano, secao, desc), agg in por_cnae.items():
        if db.query(RaisPorCnae).filter(
            RaisPorCnae.municipio_id == municipio.id,
            RaisPorCnae.ano == ano,
            RaisPorCnae.secao == secao,
        ).first():
            continue
        rem_media = agg["soma_rem"] / agg["cnt_rem"] if agg["cnt_rem"] > 0 else None
        db.add(RaisPorCnae(
            municipio_id=municipio.id,
            ano=ano,
            secao=secao,
            descricao_secao=desc,
            total_vinculos=agg["vinculos"],
            remuneracao_media=rem_media,
        ))

    db.commit()


def main():
    db = SessionLocal()

    try:
        for arquivo in os.listdir(BASE_PATH):
            if arquivo.endswith(".csv"):
                caminho = os.path.join(BASE_PATH, arquivo)
                print(f"Processando {arquivo}...")
                carregar_csv(db, caminho)

        print("✅ Carga RAIS finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
