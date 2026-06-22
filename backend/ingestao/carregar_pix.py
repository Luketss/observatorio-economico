import csv
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.pix import PixMensal
from ingestao.utils import obter_ou_criar_municipio


def _float(val: str) -> float | None:
    if not val or val.strip() == "":
        return None
    try:
        return float(val.replace(",", "."))
    except ValueError:
        return None


def _int(val: str) -> int | None:
    if not val or val.strip() == "":
        return None
    try:
        return int(float(val.replace(",", ".")))
    except ValueError:
        return None


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "pix.csv"
    if not caminho.exists():
        print(f"  [AVISO]  pix.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    by_key: dict[tuple[int, int], dict] = {}
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            anomes = row.get("AnoMes", "").strip()
            if len(anomes) != 6:
                continue
            ano = int(anomes[:4])
            mes = int(anomes[4:])
            by_key[(ano, mes)] = {
                "municipio_id": municipio.id,
                "ano": ano,
                "mes": mes,
                "vl_pagador_pf": _float(row.get("VL_PagadorPF", "")),
                "qt_pagador_pf": _int(row.get("QT_PagadorPF", "")),
                "qt_pes_pagador_pf": _int(row.get("QT_PES_PagadorPF", "")),
                "vl_pagador_pj": _float(row.get("VL_PagadorPJ", "")),
                "qt_pagador_pj": _int(row.get("QT_PagadorPJ", "")),
                "qt_pes_pagador_pj": _int(row.get("QT_PES_PagadorPJ", "")),
                "vl_recebedor_pf": _float(row.get("VL_RecebedorPF", "")),
                "qt_recebedor_pf": _int(row.get("QT_RecebedorPF", "")),
                "qt_pes_recebedor_pf": _int(row.get("QT_PES_RecebedorPF", "")),
                "vl_recebedor_pj": _float(row.get("VL_RecebedorPJ", "")),
                "qt_recebedor_pj": _int(row.get("QT_RecebedorPJ", "")),
                "qt_pes_recebedor_pj": _int(row.get("QT_PES_RecebedorPJ", "")),
            }

    if not by_key:
        return

    stmt = pg_insert(PixMensal).values(list(by_key.values()))
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["municipio_id", "ano", "mes"],
    )
    db.execute(stmt)
    db.commit()
