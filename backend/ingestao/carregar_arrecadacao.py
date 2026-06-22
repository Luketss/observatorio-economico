import csv
from datetime import datetime
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.arrecadacao import ArrecadacaoMensal
from ingestao.utils import obter_ou_criar_municipio


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "arrecadacao.csv"
    if not caminho.exists():
        print(f"  [AVISO]  arrecadacao.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    # Dedup by natural key in-Python before the bulk upsert. This protects
    # against CSV files that contain duplicate (ano, mes) rows — the bug that
    # surfaced for Cabo Verde — by taking the last occurrence as the canonical
    # value within a single ingest run.
    by_key: dict[tuple[int, int], dict] = {}
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ano = int(row["ano_particao"])
            mes = int(row["MES_ESTIMADO"])
            icms = float(row["vr_icms"] or 0)
            ipva = float(row["vr_ipva"] or 0)
            ipi = float(row["vr_ipi"] or 0)
            data_base = datetime.strptime(row["DATA_BASE"], "%Y-%m-%d").date()
            by_key[(ano, mes)] = {
                "municipio_id": municipio.id,
                "ano": ano,
                "mes": mes,
                "nome_mes": row["NOME_MES"],
                "data_base": data_base,
                "valor_icms": icms,
                "valor_ipva": ipva,
                "valor_ipi": ipi,
                "valor_total": icms + ipva + ipi,
            }

    if not by_key:
        return

    stmt = pg_insert(ArrecadacaoMensal).values(list(by_key.values()))
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["municipio_id", "ano", "mes"],
    )
    db.execute(stmt)
    db.commit()
