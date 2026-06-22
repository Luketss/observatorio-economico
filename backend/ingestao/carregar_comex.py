import csv
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.comex import ComexMensal, ComexPorPais, ComexPorProduto
from ingestao.utils import obter_ou_criar_municipio


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "comex.csv"
    if not caminho.exists():
        print(f"  [AVISO]  comex.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    agregado: dict[tuple[int, int, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0, "peso_kg": 0.0}
    )
    agregado_produto: dict[tuple[int, str, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0, "peso_kg": 0.0}
    )
    agregado_pais: dict[tuple[int, str, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")
        for row in reader:
            data_ref = datetime.strptime(row["Data_Ref"].strip(), "%d/%m/%Y")
            ano = data_ref.year
            mes = data_ref.month
            tipo_operacao = row["Tipo_Operacao"].strip().lower()
            valor_usd = float(row["Valor_USD"] or 0)
            peso_kg = float(row["Peso_KG"] or 0)

            chave = (ano, mes, tipo_operacao)
            agregado[chave]["valor_usd"] += valor_usd
            agregado[chave]["peso_kg"] += peso_kg

            produto = row["Codigo_SH4"].strip()
            pais = row["Pais_Parceiro"].strip()
            agregado_produto[(ano, tipo_operacao, produto)]["valor_usd"] += valor_usd
            agregado_produto[(ano, tipo_operacao, produto)]["peso_kg"] += peso_kg
            agregado_pais[(ano, tipo_operacao, pais)]["valor_usd"] += valor_usd

    if agregado:
        rows = [
            {
                "municipio_id": municipio.id,
                "ano": ano,
                "mes": mes,
                "tipo_operacao": tipo_operacao,
                **totais,
            }
            for (ano, mes, tipo_operacao), totais in agregado.items()
        ]
        stmt = pg_insert(ComexMensal).values(rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["municipio_id", "ano", "mes", "tipo_operacao"],
        )
        db.execute(stmt)
        db.commit()

    if agregado_produto:
        rows = [
            {
                "municipio_id": municipio.id,
                "ano": ano,
                "tipo_operacao": tipo_operacao,
                "produto": produto,
                **totais,
            }
            for (ano, tipo_operacao, produto), totais in agregado_produto.items()
        ]
        stmt = pg_insert(ComexPorProduto).values(rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["municipio_id", "ano", "tipo_operacao", "produto"],
        )
        db.execute(stmt)
        db.commit()

    if agregado_pais:
        rows = [
            {
                "municipio_id": municipio.id,
                "ano": ano,
                "tipo_operacao": tipo_operacao,
                "pais": pais,
                **totais,
            }
            for (ano, tipo_operacao, pais), totais in agregado_pais.items()
        ]
        stmt = pg_insert(ComexPorPais).values(rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["municipio_id", "ano", "tipo_operacao", "pais"],
        )
        db.execute(stmt)
        db.commit()
