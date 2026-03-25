import csv
import os
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.empresa import Empresa
from app.models.municipio import Municipio

BASE_PATH = "dados/Pacote_CNPJ_Completo_Corrigido"


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


def parse_data(valor: str) -> "datetime.date | None":
    valor = valor.strip()
    if not valor:
        return None
    try:
        return datetime.strptime(valor, "%Y%m%d").date()
    except ValueError:
        return None


def parse_capital(valor: str) -> "float | None":
    valor = valor.strip()
    if not valor:
        return None
    try:
        # Capital social uses comma as decimal separator: "1.234,56"
        return float(valor.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def parse_bool(valor: str) -> bool:
    return valor.strip().upper() in ("S", "SIM", "1", "TRUE")


def carregar_csv(db: Session, caminho: str):
    nome_arquivo = os.path.basename(caminho)
    # e.g. CNPJ_Completo_Carmo_da_Mata.csv — city name is inside CSV (Nome_Cidade column)

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            nome_municipio = normalizar_nome(row["Nome_Cidade"])
            municipio = obter_ou_criar_municipio(db, nome_municipio)

            cnpj_basico = row["cnpj_basico"].strip()
            razao_social = row["razao_social"].strip()

            existente = (
                db.query(Empresa)
                .filter(
                    Empresa.municipio_id == municipio.id,
                    Empresa.cnpj_basico == cnpj_basico,
                )
                .first()
            )

            if existente:
                continue

            novo = Empresa(
                municipio_id=municipio.id,
                cnpj_basico=cnpj_basico,
                razao_social=razao_social,
                nome_fantasia=row["nome_fantasia"].strip() or None,
                situacao=row["situacao"].strip() or None,
                data_inicio=parse_data(row["data_inicio"]),
                cnae_fiscal=row["cnae_fiscal"].strip() or None,
                porte=row["porte"].strip() or None,
                capital_social=parse_capital(row["capital_social"]),
                opcao_simples=parse_bool(row["opcao_simples"]),
                opcao_mei=parse_bool(row["opcao_mei"]),
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

        print("✅ Carga CNPJ finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
