import csv
import os
from collections import defaultdict

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.municipio import Municipio

BASE_PATH = "dados/Bolsa_Familia_Cidades_Completo"


def normalizar_nome(nome: str) -> str:
    return nome.strip().replace("_", " ").upper()


def parse_float(value) -> float:
    if not value:
        return 0.0
    return float(str(value).strip().replace(".", "").replace(",", "."))


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
    nome_arquivo = os.path.basename(caminho)
    # e.g. Bolsa_Familia_CARMO_DA_MATA.csv
    nome_municipio = normalizar_nome(
        nome_arquivo.replace("Bolsa_Familia_", "").replace(".csv", "")
    )

    municipio = obter_ou_criar_municipio(db, nome_municipio, estado)

    # Aggregate individual beneficiary records per (year, month)
    # MÊS COMPETÊNCIA format: YYYYMM (e.g. 202201)
    agregado: dict[tuple[int, int], dict] = defaultdict(
        lambda: {"beneficiarios": 0, "valor_total": 0.0, "valor_bolsa": 0.0, "valor_primeira_infancia": 0.0, "beneficiarios_primeira_infancia": 0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            mes_comp = str(row["MÊS COMPETÊNCIA"]).strip()
            ano = int(mes_comp[:4])
            mes = int(mes_comp[4:6])

            valor_parcela = parse_float(row["VALOR PARCELA"])
            valor_bolsa = parse_float(row["Valor Bolsa"])

            chave = (ano, mes)
            agregado[chave]["beneficiarios"] += 1
            agregado[chave]["valor_total"] += valor_parcela
            agregado[chave]["valor_bolsa"] += valor_bolsa

            primeira_infancia = parse_float(row.get("Primeira Infância"))
            agregado[chave]["valor_primeira_infancia"] += primeira_infancia
            if primeira_infancia > 0:
                agregado[chave]["beneficiarios_primeira_infancia"] += 1

    for (ano, mes), totais in agregado.items():
        existente = (
            db.query(BolsaFamiliaResumo)
            .filter(
                BolsaFamiliaResumo.municipio_id == municipio.id,
                BolsaFamiliaResumo.ano == ano,
                BolsaFamiliaResumo.mes == mes,
            )
            .first()
        )

        if existente:
            continue

        novo = BolsaFamiliaResumo(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            total_beneficiarios=totais["beneficiarios"],
            valor_total=totais["valor_total"],
            valor_bolsa=totais["valor_bolsa"],
            valor_primeira_infancia=totais["valor_primeira_infancia"],
            beneficiarios_primeira_infancia=totais["beneficiarios_primeira_infancia"],
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

        print("✅ Carga Bolsa Família finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
