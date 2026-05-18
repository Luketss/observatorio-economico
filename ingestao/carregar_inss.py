import csv
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.inss import InssAnual
from ingestao.utils import obter_ou_criar_municipio


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "inss.csv"
    if not caminho.exists():
        print(f"  [AVISO]  inss.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    by_key: dict[tuple[int, str], dict] = {}
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ano = int(float(row["Ano"]))
            categoria = row["Categoria"].strip()
            quantidade = int(float(row["Quantidade_Beneficios"] or 0))
            valor_anual = float(row["Valor_Anual_Injetado"] or 0)
            by_key[(ano, categoria)] = {
                "municipio_id": municipio.id,
                "ano": ano,
                "categoria": categoria,
                "quantidade_beneficios": quantidade,
                "valor_anual": valor_anual,
            }

    if not by_key:
        return

    stmt = pg_insert(InssAnual).values(list(by_key.values()))
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["municipio_id", "ano", "categoria"],
    )
    db.execute(stmt)
    db.commit()
