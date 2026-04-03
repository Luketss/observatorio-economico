import csv
import os
from datetime import datetime

from tqdm import tqdm

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.empresa import Empresa
from app.models.municipio import Municipio

BASE_PATH = "dados/Pacote_CNPJ_Completo_Corrigido"


def normalizar_nome(nome: str) -> str:
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


BATCH_SIZE = 500


def carregar_csv(db: Session, caminho: str):
    # e.g. CNPJ_Completo_Carmo_da_Mata.csv — city name is inside CSV (Nome_Cidade column)

    # First pass: resolve unique municipalities in this file and preload existing CNPJs
    municipios_cache: dict[str, Municipio] = {}
    existentes_cache: dict[int, set[str]] = {}  # municipio_id → set of cnpj_basico

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")
        for row in reader:
            nome = normalizar_nome(row["Nome_Cidade"])
            if nome not in municipios_cache:
                m = obter_ou_criar_municipio(db, nome)
                municipios_cache[nome] = m
                # Load all existing CNPJ basics for this municipality at once
                existentes = db.query(Empresa.cnpj_basico).filter(
                    Empresa.municipio_id == m.id
                ).all()
                existentes_cache[m.id] = {r[0] for r in existentes}

    # Second pass: insert new rows in batches
    pendente = 0
    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")
        for row in tqdm(reader, desc="    Empresas", unit="reg", leave=False):
            nome = normalizar_nome(row["Nome_Cidade"])
            municipio = municipios_cache[nome]
            cnpj_basico = row["cnpj_basico"].strip()

            if cnpj_basico in existentes_cache[municipio.id]:
                continue

            existentes_cache[municipio.id].add(cnpj_basico)

            db.add(Empresa(
                municipio_id=municipio.id,
                cnpj_basico=cnpj_basico,
                razao_social=row["razao_social"].strip(),
                nome_fantasia=row["nome_fantasia"].strip() or None,
                situacao=row["situacao"].strip() or None,
                data_inicio=parse_data(row["data_inicio"]),
                cnae_fiscal=row["cnae_fiscal"].strip() or None,
                porte=row["porte"].strip() or None,
                capital_social=parse_capital(row["capital_social"]),
                opcao_simples=parse_bool(row["opcao_simples"]),
                opcao_mei=parse_bool(row["opcao_mei"]),
            ))
            pendente += 1

            if pendente >= BATCH_SIZE:
                db.commit()
                pendente = 0

    if pendente:
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
