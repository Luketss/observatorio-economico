import csv
import os

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.inss import InssAnual
from app.models.municipio import Municipio

BASE_PATH = "dados/INSS_Cidades_Completo"


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
    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            nome_municipio = normalizar_nome(row["Cidade"])
            municipio = obter_ou_criar_municipio(db, nome_municipio)

            ano = int(float(row["Ano"]))
            categoria = row["Categoria"].strip()
            quantidade = int(float(row["Quantidade_Beneficios"] or 0))
            valor_anual = float(row["Valor_Anual_Injetado"] or 0)

            existente = (
                db.query(InssAnual)
                .filter(
                    InssAnual.municipio_id == municipio.id,
                    InssAnual.ano == ano,
                    InssAnual.categoria == categoria,
                )
                .first()
            )

            if existente:
                continue

            novo = InssAnual(
                municipio_id=municipio.id,
                ano=ano,
                categoria=categoria,
                quantidade_beneficios=quantidade,
                valor_anual=valor_anual,
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

        print("✅ Carga INSS finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
