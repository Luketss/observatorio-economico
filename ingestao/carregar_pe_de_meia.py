import csv
import os
from collections import defaultdict

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.municipio import Municipio
from app.models.pe_de_meia import PeDeMeiaEtapa, PeDeMeiaResumo

BASE_PATH = "dados/Pe_De_Meia_Cidades_Completo"


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


def carregar_csv(db: Session, caminho: str):
    nome_arquivo = os.path.basename(caminho)
    # e.g. Pe_Meia_CARMO_DA_MATA.csv
    nome_municipio = normalizar_nome(
        nome_arquivo.replace("Pe_Meia_", "").replace(".csv", "")
    )

    municipio = obter_ou_criar_municipio(db, nome_municipio)

    # Aggregate individual student records per (year, month)
    # MÊS REFERÊNCIA format: YYYYMM (e.g. 202401)
    agregado: dict[tuple[int, int], dict] = defaultdict(
        lambda: {"estudantes": 0, "valor_total": 0.0}
    )
    agregado_etapa: dict[tuple[int, int, str, str], dict] = defaultdict(
        lambda: {"estudantes": 0, "valor_total": 0.0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            mes_ref = str(row["MÊS REFERÊNCIA"]).strip()
            ano = int(mes_ref[:4])
            mes = int(mes_ref[4:6])

            valor_parcela = float(row["VALOR PARCELA"] or 0)

            chave = (ano, mes)
            agregado[chave]["estudantes"] += 1
            agregado[chave]["valor_total"] += valor_parcela

            etapa_ensino = str(row["ETAPA ENSINO"]).strip()
            tipo_incentivo = str(row["TIPO INCENTIVO"]).strip()
            chave_etapa = (ano, mes, etapa_ensino, tipo_incentivo)
            agregado_etapa[chave_etapa]["estudantes"] += 1
            agregado_etapa[chave_etapa]["valor_total"] += valor_parcela

    for (ano, mes), totais in agregado.items():
        existente = (
            db.query(PeDeMeiaResumo)
            .filter(
                PeDeMeiaResumo.municipio_id == municipio.id,
                PeDeMeiaResumo.ano == ano,
                PeDeMeiaResumo.mes == mes,
            )
            .first()
        )

        if existente:
            continue

        novo = PeDeMeiaResumo(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            total_estudantes=totais["estudantes"],
            valor_total=totais["valor_total"],
        )

        db.add(novo)

    db.commit()

    for (ano, mes, etapa_ensino, tipo_incentivo), totais in agregado_etapa.items():
        existente = (
            db.query(PeDeMeiaEtapa)
            .filter(
                PeDeMeiaEtapa.municipio_id == municipio.id,
                PeDeMeiaEtapa.ano == ano,
                PeDeMeiaEtapa.mes == mes,
                PeDeMeiaEtapa.etapa_ensino == etapa_ensino,
                PeDeMeiaEtapa.tipo_incentivo == tipo_incentivo,
            )
            .first()
        )
        if existente:
            continue
        novo = PeDeMeiaEtapa(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            etapa_ensino=etapa_ensino,
            tipo_incentivo=tipo_incentivo,
            total_estudantes=totais["estudantes"],
            valor_total=totais["valor_total"],
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

        print("✅ Carga Pé-de-Meia finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
