import csv
import os
from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.estban import EstbanMensal, EstbanPorInstituicao
from app.models.municipio import Municipio

BASE_PATH = "dados/Estban_Cidades_Completo"


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
    # Group by (municipio, data_referencia) — one bank per row, aggregate totals
    agregado: dict[tuple[str, str], dict] = defaultdict(
        lambda: {
            "qtd_agencias": 0,
            "valor_operacoes_credito": 0.0,
            "valor_depositos_vista": 0.0,
            "valor_poupanca": 0.0,
            "valor_depositos_prazo": 0.0,
        }
    )
    agregado_inst: dict[tuple[str, str, str], dict] = defaultdict(
        lambda: {
            "qtd_agencias": 0,
            "valor_operacoes_credito": 0.0,
            "valor_depositos_vista": 0.0,
            "valor_poupanca": 0.0,
            "valor_depositos_prazo": 0.0,
        }
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            nome_municipio = normalizar_nome(row["MUNICIPIO"])
            data_ref_str = row["DATA_REFERENCIA"].strip()

            chave = (nome_municipio, data_ref_str)
            agregado[chave]["qtd_agencias"] += int(row["QTD_AGENCIAS"] or 0)
            agregado[chave]["valor_operacoes_credito"] += float(
                row["VALOR_OPERACOES_CREDITO"] or 0
            )
            agregado[chave]["valor_depositos_vista"] += float(
                row["VALOR_DEPOSITOS_VISTA"] or 0
            )
            agregado[chave]["valor_poupanca"] += float(row["VALOR_POUPANCA"] or 0)
            agregado[chave]["valor_depositos_prazo"] += float(
                row["VALOR_DEPOSITOS_PRAZO"] or 0
            )

            nome_instituicao = row["NOME_INSTITUICAO"].strip()
            chave_inst = (nome_municipio, nome_instituicao, data_ref_str)
            agregado_inst[chave_inst]["qtd_agencias"] += int(row["QTD_AGENCIAS"] or 0)
            agregado_inst[chave_inst]["valor_operacoes_credito"] += float(
                row["VALOR_OPERACOES_CREDITO"] or 0
            )
            agregado_inst[chave_inst]["valor_depositos_vista"] += float(
                row["VALOR_DEPOSITOS_VISTA"] or 0
            )
            agregado_inst[chave_inst]["valor_poupanca"] += float(row["VALOR_POUPANCA"] or 0)
            agregado_inst[chave_inst]["valor_depositos_prazo"] += float(
                row["VALOR_DEPOSITOS_PRAZO"] or 0
            )

    for (nome_municipio, data_ref_str), totais in agregado.items():
        municipio = obter_ou_criar_municipio(db, nome_municipio)
        data_referencia = datetime.strptime(data_ref_str, "%Y-%m-%d").date()

        existente = (
            db.query(EstbanMensal)
            .filter(
                EstbanMensal.municipio_id == municipio.id,
                EstbanMensal.data_referencia == data_referencia,
            )
            .first()
        )

        if existente:
            continue

        novo = EstbanMensal(
            municipio_id=municipio.id,
            data_referencia=data_referencia,
            qtd_agencias=totais["qtd_agencias"],
            valor_operacoes_credito=totais["valor_operacoes_credito"],
            valor_depositos_vista=totais["valor_depositos_vista"],
            valor_poupanca=totais["valor_poupanca"],
            valor_depositos_prazo=totais["valor_depositos_prazo"],
        )

        db.add(novo)

    db.commit()

    for (nome_municipio, nome_instituicao, data_ref_str), totais in agregado_inst.items():
        municipio = obter_ou_criar_municipio(db, nome_municipio)
        data_referencia = datetime.strptime(data_ref_str, "%Y-%m-%d").date()
        existente = (
            db.query(EstbanPorInstituicao)
            .filter(
                EstbanPorInstituicao.municipio_id == municipio.id,
                EstbanPorInstituicao.data_referencia == data_referencia,
                EstbanPorInstituicao.nome_instituicao == nome_instituicao,
            )
            .first()
        )
        if existente:
            continue
        novo = EstbanPorInstituicao(
            municipio_id=municipio.id,
            data_referencia=data_referencia,
            nome_instituicao=nome_instituicao,
            **totais
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

        print("✅ Carga Estban finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
