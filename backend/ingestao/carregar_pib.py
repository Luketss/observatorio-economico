import csv
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.pib import PibAnual
from ingestao.utils import obter_ou_criar_municipio


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "pib.csv"
    if not caminho.exists():
        print(f"  [AVISO]  pib.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    by_key: dict[tuple[int, str], dict] = {}
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ano = int(row["Ano"])
            tipo = row["Tipo_Dado"].upper()
            by_key[(ano, tipo)] = {
                "municipio_id": municipio.id,
                "ano": ano,
                "tipo_dado": tipo,
                "pib_total": float(row["PIB_Total"] or 0),
                "va_agropecuaria": float(row["VA_Agropecuaria"]) if row["VA_Agropecuaria"] else None,
                "va_governo": float(row["VA_Governo"]) if row["VA_Governo"] else None,
                "va_industria": float(row["VA_Industria"]) if row["VA_Industria"] else None,
                "va_servicos": float(row["VA_Servicos"]) if row["VA_Servicos"] else None,
            }

    if not by_key:
        return

    stmt = pg_insert(PibAnual).values(list(by_key.values()))
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["municipio_id", "ano", "tipo_dado"],
    )
    db.execute(stmt)
    db.commit()
