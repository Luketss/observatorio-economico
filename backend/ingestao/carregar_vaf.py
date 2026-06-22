import csv
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.vaf import VafAnual
from ingestao.utils import obter_ou_criar_municipio


def _num(valor: str | None) -> float | None:
    if valor is None or valor.strip() == "":
        return None
    return float(valor)


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "vaf.csv"
    if not caminho.exists():
        print(f"  [AVISO]  vaf.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    by_key: dict[int, dict] = {}
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ano_base = int(row["ano_base"])
            by_key[ano_base] = {
                "municipio_id": municipio.id,
                "ano_base": ano_base,
                "ano_aplicacao": int(row["ano_aplicacao"]) if row.get("ano_aplicacao") else None,
                "vaf_individual": _num(row.get("vaf_individual")),
                "pct_vaf_individual": _num(row.get("pct_vaf_individual")),
                "vaf_estado": _num(row.get("vaf_estado")),
                "pct_vaf_estado": _num(row.get("pct_vaf_estado")),
                "indice": _num(row.get("indice")),
                "pct_indice": _num(row.get("pct_indice")),
                "indice_medio": _num(row.get("indice_medio")),
                "pct_indice_medio": _num(row.get("pct_indice_medio")),
                "indice_participacao_municipal": _num(row.get("indice_participacao_municipal")),
                "pct_ipm": _num(row.get("pct_ipm")),
            }

    if not by_key:
        return

    stmt = pg_insert(VafAnual).values(list(by_key.values()))
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["municipio_id", "ano_base"],
    )
    db.execute(stmt)
    db.commit()
