import csv
import os
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.municipio import Municipio

BASE_PATH = "dados/Arrecadacao_Cidades_MG"


def normalizar_nome_municipio(nome_arquivo: str) -> str:
    # Exemplo: arrecadacao_OLIVEIRA.csv
    nome = nome_arquivo.replace("arrecadacao_", "").replace(".csv", "")
    return nome.strip().replace("_", " ").upper()


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
    nome_municipio = normalizar_nome_municipio(nome_arquivo)

    municipio = obter_ou_criar_municipio(db, nome_municipio)

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            ano = int(row["ano_particao"])
            mes = int(row["MES_ESTIMADO"])
            nome_mes = row["NOME_MES"]

            icms = float(row["vr_icms"] or 0)
            ipva = float(row["vr_ipva"] or 0)
            ipi = float(row["vr_ipi"] or 0)

            data_base = datetime.strptime(row["DATA_BASE"], "%Y-%m-%d").date()

            total = icms + ipva + ipi

            # Verifica se já existe
            existente = (
                db.query(ArrecadacaoMensal)
                .filter(
                    ArrecadacaoMensal.municipio_id == municipio.id,
                    ArrecadacaoMensal.ano == ano,
                    ArrecadacaoMensal.mes == mes,
                )
                .first()
            )

            if existente:
                continue

            novo = ArrecadacaoMensal(
                municipio_id=municipio.id,
                ano=ano,
                mes=mes,
                nome_mes=nome_mes,
                data_base=data_base,
                valor_icms=icms,
                valor_ipva=ipva,
                valor_ipi=ipi,
                valor_total=total,
            )

            db.add(novo)

        db.commit()


def main():
    db = SessionLocal()

    try:
        for arquivo in os.listdir(BASE_PATH):
            if arquivo.endswith(".csv"):
                caminho = os.path.join(BASE_PATH, arquivo)
                print(f"Processando {arquivo}...")
                carregar_csv(db, caminho)

        print("✅ Carga finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
