import csv
import os
import re
from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.comex import ComexMensal, ComexPorPais, ComexPorProduto
from app.models.municipio import Municipio

BASE_PATH = "dados/Comex_Cidades_Completo"


def normalizar_nome(nome: str) -> str:
    # Strip state suffix e.g. "Carmo do Rio Claro - MG" → "CARMO DO RIO CLARO"
    nome = re.sub(r"\s*-\s*[A-Z]{2}\s*$", "", nome.strip())
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
    # Aggregate per (municipio, year, month, tipo_operacao)
    agregado: dict[tuple[str, int, int, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0, "peso_kg": 0.0}
    )
    agregado_produto: dict[tuple[str, int, str, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0, "peso_kg": 0.0}
    )
    agregado_pais: dict[tuple[str, int, str, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")

        for row in reader:
            nome_municipio = normalizar_nome(row["Nome_Cidade_API"])
            # Data_Ref format: DD/MM/YYYY
            data_ref = datetime.strptime(row["Data_Ref"].strip(), "%d/%m/%Y")
            ano = data_ref.year
            mes = data_ref.month
            tipo_operacao = row["Tipo_Operacao"].strip().lower()

            valor_usd = float(row["Valor_USD"] or 0)
            peso_kg = float(row["Peso_KG"] or 0)

            chave = (nome_municipio, ano, mes, tipo_operacao)
            agregado[chave]["valor_usd"] += valor_usd
            agregado[chave]["peso_kg"] += peso_kg

            produto = row["Codigo_SH4"].strip()
            pais = row["Pais_Parceiro"].strip()
            chave_produto = (nome_municipio, ano, tipo_operacao, produto)
            agregado_produto[chave_produto]["valor_usd"] += valor_usd
            agregado_produto[chave_produto]["peso_kg"] += peso_kg
            chave_pais = (nome_municipio, ano, tipo_operacao, pais)
            agregado_pais[chave_pais]["valor_usd"] += valor_usd

    for (nome_municipio, ano, mes, tipo_operacao), totais in agregado.items():
        municipio = obter_ou_criar_municipio(db, nome_municipio)

        existente = (
            db.query(ComexMensal)
            .filter(
                ComexMensal.municipio_id == municipio.id,
                ComexMensal.ano == ano,
                ComexMensal.mes == mes,
                ComexMensal.tipo_operacao == tipo_operacao,
            )
            .first()
        )

        if existente:
            continue

        novo = ComexMensal(
            municipio_id=municipio.id,
            ano=ano,
            mes=mes,
            tipo_operacao=tipo_operacao,
            valor_usd=totais["valor_usd"],
            peso_kg=totais["peso_kg"],
        )

        db.add(novo)

    for (nome_municipio, ano, tipo_operacao, produto), totais in agregado_produto.items():
        municipio = obter_ou_criar_municipio(db, nome_municipio)
        existente = db.query(ComexPorProduto).filter(
            ComexPorProduto.municipio_id == municipio.id,
            ComexPorProduto.ano == ano,
            ComexPorProduto.tipo_operacao == tipo_operacao,
            ComexPorProduto.produto == produto,
        ).first()
        if not existente:
            db.add(ComexPorProduto(municipio_id=municipio.id, ano=ano, tipo_operacao=tipo_operacao, produto=produto, **totais))

    for (nome_municipio, ano, tipo_operacao, pais), totais in agregado_pais.items():
        municipio = obter_ou_criar_municipio(db, nome_municipio)
        existente = db.query(ComexPorPais).filter(
            ComexPorPais.municipio_id == municipio.id,
            ComexPorPais.ano == ano,
            ComexPorPais.tipo_operacao == tipo_operacao,
            ComexPorPais.pais == pais,
        ).first()
        if not existente:
            db.add(ComexPorPais(municipio_id=municipio.id, ano=ano, tipo_operacao=tipo_operacao, pais=pais, **totais))

    db.commit()


def main():
    db = SessionLocal()

    try:
        for arquivo in os.listdir(BASE_PATH):
            if arquivo.endswith(".csv"):
                caminho = os.path.join(BASE_PATH, arquivo)
                print(f"Processando {arquivo}...")
                carregar_csv(db, caminho)

        print("✅ Carga Comex finalizada com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
