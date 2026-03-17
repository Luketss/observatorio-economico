import csv
import os

from sqlalchemy.orm import Session

from backend.app.db.session import SessionLocal
from backend.app.models.municipio import Municipio
from backend.app.models.rais import RaisVinculo

BASE_PATH = "Pacote_Trabalho_Multicidades/RAIS"


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

    nome_municipio = normalizar_nome(
        nome_arquivo.replace("rais_vinculos_2021_2024_", "").replace(".csv", "")
    )

    municipio = obter_ou_criar_municipio(db, nome_municipio)

    with open(caminho, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            ano = int(row["ano"])
            total_vinculos = int(row["total_vinculos"])

            existente = (
                db.query(RaisVinculo)
                .filter(
                    RaisVinculo.municipio_id == municipio.id,
                    RaisVinculo.ano == ano,
                )
                .first()
            )

            if existente:
                continue

            novo = RaisVinculo(
                municipio_id=municipio.id,
                ano=ano,
                total_vinculos=total_vinculos,
                setor=None,
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

        print("✅ Carga RAIS finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
