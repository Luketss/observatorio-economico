import csv
import os

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.inss import InssAnual
from app.models.municipio import Municipio

BASE_PATH = "dados/INSS_Cidades_Completo"


def normalizar_nome(nome: str) -> str:
    return nome.strip().replace("_", " ").upper()


def obter_ou_criar_municipio(db: Session, nome: str, estado: str, codigo_ibge: str | None = None) -> Municipio:
    if codigo_ibge:
        m = db.query(Municipio).filter(Municipio.codigo_ibge == codigo_ibge).first()
        if m:
            return m
    municipio = db.query(Municipio).filter(Municipio.nome == nome, Municipio.estado == estado).first()
    if not municipio:
        municipio = Municipio(nome=nome, estado=estado, codigo_ibge=codigo_ibge, ativo=True)
        db.add(municipio)
        db.commit()
        db.refresh(municipio)
    return municipio


def carregar_csv(db: Session, caminho: str, estado: str):
    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            nome_municipio = normalizar_nome(row["Cidade"])
            municipio = obter_ou_criar_municipio(db, nome_municipio, estado)

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
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--estado", required=True, help="UF code, e.g. MG, MT")
    args = parser.parse_args()
    estado = args.estado.strip().upper()

    db = SessionLocal()

    try:
        for arquivo in os.listdir(BASE_PATH):
            if arquivo.endswith(".csv"):
                caminho = os.path.join(BASE_PATH, arquivo)
                print(f"Processando {arquivo}...")
                carregar_csv(db, caminho, estado)

        print("✅ Carga INSS finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
