import csv
import os
from collections import defaultdict

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.caged import CagedMovimentacao, CagedPorCnae, CagedPorRaca, CagedPorSexo, CagedSalario
from app.models.municipio import Municipio

BASE_PATH = "dados/Pacote_Trabalho_Multicidades/CAGED"

SEXO_MAP = {
    "1": "Masculino",
    "2": "Feminino",
    "3": "Não informado",
    "9": "Não informado",
}

RACA_COR_MAP = {
    "1": "Branca",
    "2": "Preta",
    "3": "Parda",
    "4": "Amarela",
    "5": "Indígena",
    "6": "Não informada",
    "9": "Não informada",
}

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
    # e.g. caged_movimentacao_2025_Carmo_da_Mata.csv
    nome_municipio = normalizar_nome(
        nome_arquivo.replace("caged_movimentacao_2025_", "").replace(".csv", "")
    )

    municipio = obter_ou_criar_municipio(db, nome_municipio)

    # Aggregation buckets
    mensal: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    por_sexo: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    por_raca: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )
    # For salary: store (sum_salario_admissoes, count_admissoes, sum_salario_deslig, count_deslig)
    salario_agg: dict[tuple, dict] = defaultdict(
        lambda: {"sum_adm": 0.0, "cnt_adm": 0, "sum_des": 0.0, "cnt_des": 0}
    )
    por_cnae: dict[tuple, dict] = defaultdict(
        lambda: {"admissoes": 0, "desligamentos": 0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            ano = int(row["ano"])
            mes = int(row["mes"])
            saldo = int(row["saldo_movimentacao"])
            is_admission = saldo > 0

            chave_mes = (ano, mes)

            # Monthly totals
            if is_admission:
                mensal[chave_mes]["admissoes"] += saldo
            else:
                mensal[chave_mes]["desligamentos"] += abs(saldo)

            # Per sexo
            sexo_raw = str(row.get("sexo", "")).strip()
            sexo_label = SEXO_MAP.get(sexo_raw, "Não informado")
            chave_sexo = (ano, mes, sexo_label)
            if is_admission:
                por_sexo[chave_sexo]["admissoes"] += saldo
            else:
                por_sexo[chave_sexo]["desligamentos"] += abs(saldo)

            # Per raca_cor
            raca_raw = str(row.get("raca_cor", "")).strip()
            raca_label = RACA_COR_MAP.get(raca_raw, "Não informada")
            chave_raca = (ano, mes, raca_label)
            if is_admission:
                por_raca[chave_raca]["admissoes"] += saldo
            else:
                por_raca[chave_raca]["desligamentos"] += abs(saldo)

            # Salary
            try:
                sal = float(row.get("salario_mensal", "") or 0)
            except (ValueError, TypeError):
                sal = 0.0
            if sal > 0:
                if is_admission:
                    salario_agg[chave_mes]["sum_adm"] += sal * saldo
                    salario_agg[chave_mes]["cnt_adm"] += saldo
                else:
                    salario_agg[chave_mes]["sum_des"] += sal * abs(saldo)
                    salario_agg[chave_mes]["cnt_des"] += abs(saldo)

            # Per CNAE section
            secao = str(row.get("cnae_2_secao", "")).strip().upper()
            if secao:
                desc = CNAE_SECAO_DESC.get(secao, secao)
                chave_cnae = (ano, mes, secao, desc)
                if is_admission:
                    por_cnae[chave_cnae]["admissoes"] += saldo
                else:
                    por_cnae[chave_cnae]["desligamentos"] += abs(saldo)

    # ----- Persist CagedMovimentacao (monthly totals) -----
    for (ano, mes), totais in mensal.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedMovimentacao).filter(
            CagedMovimentacao.municipio_id == municipio.id,
            CagedMovimentacao.ano == ano,
            CagedMovimentacao.mes == mes,
        ).first():
            continue
        db.add(CagedMovimentacao(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            **{"admissões": adm},
            desligamentos=des,
            saldo=adm - des,
            setor=None,
        ))

    # ----- Persist CagedPorSexo -----
    for (ano, mes, sexo_label), totais in por_sexo.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorSexo).filter(
            CagedPorSexo.municipio_id == municipio.id,
            CagedPorSexo.ano == ano,
            CagedPorSexo.mes == mes,
            CagedPorSexo.sexo == sexo_label,
        ).first():
            continue
        db.add(CagedPorSexo(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            sexo=sexo_label,
            admissoes=adm,
            desligamentos=des,
            saldo=adm - des,
        ))

    # ----- Persist CagedPorRaca -----
    for (ano, mes, raca_label), totais in por_raca.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorRaca).filter(
            CagedPorRaca.municipio_id == municipio.id,
            CagedPorRaca.ano == ano,
            CagedPorRaca.mes == mes,
            CagedPorRaca.raca_cor == raca_label,
        ).first():
            continue
        db.add(CagedPorRaca(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            raca_cor=raca_label,
            admissoes=adm,
            desligamentos=des,
            saldo=adm - des,
        ))

    # ----- Persist CagedSalario -----
    for (ano, mes), agg in salario_agg.items():
        sal_adm = agg["sum_adm"] / agg["cnt_adm"] if agg["cnt_adm"] > 0 else None
        sal_des = agg["sum_des"] / agg["cnt_des"] if agg["cnt_des"] > 0 else None
        if db.query(CagedSalario).filter(
            CagedSalario.municipio_id == municipio.id,
            CagedSalario.ano == ano,
            CagedSalario.mes == mes,
        ).first():
            continue
        db.add(CagedSalario(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            salario_medio_admissoes=sal_adm,
            salario_medio_desligamentos=sal_des,
        ))

    # ----- Persist CagedPorCnae -----
    for (ano, mes, secao, desc), totais in por_cnae.items():
        adm = totais["admissoes"]
        des = totais["desligamentos"]
        if db.query(CagedPorCnae).filter(
            CagedPorCnae.municipio_id == municipio.id,
            CagedPorCnae.ano == ano,
            CagedPorCnae.mes == mes,
            CagedPorCnae.secao == secao,
        ).first():
            continue
        db.add(CagedPorCnae(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            secao=secao,
            descricao_secao=desc,
            admissoes=adm,
            desligamentos=des,
            saldo=adm - des,
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

        print("✅ Carga CAGED finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
