import csv
import os

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.municipio import Municipio
from app.models.pib import PibAnual

BASE_PATH = "dados/PIB_Cidades_Completo"


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
            ano = int(row["Ano"])
            nome_municipio = normalizar_nome(row["Cidade"])
            tipo = row["Tipo_Dado"].upper()

            pib_total = float(row["PIB_Total"] or 0)
            va_agro = (
                float(row["VA_Agropecuaria"] or 0) if row["VA_Agropecuaria"] else None
            )
            va_gov = float(row["VA_Governo"] or 0) if row["VA_Governo"] else None
            va_ind = float(row["VA_Industria"] or 0) if row["VA_Industria"] else None
            va_serv = float(row["VA_Servicos"] or 0) if row["VA_Servicos"] else None

            municipio = obter_ou_criar_municipio(db, nome_municipio)

            existente = (
                db.query(PibAnual)
                .filter(
                    PibAnual.municipio_id == municipio.id,
                    PibAnual.ano == ano,
                )
                .first()
            )

            if existente:
                continue

            novo = PibAnual(
                municipio_id=municipio.id,
                ano=ano,
                tipo_dado=tipo,
                pib_total=pib_total,
                va_agropecuaria=va_agro,
                va_governo=va_gov,
                va_industria=va_ind,
                va_servicos=va_serv,
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

        print("✅ Carga PIB finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
