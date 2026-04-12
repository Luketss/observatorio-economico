"""
Ingestion script for PIX BCB data.
Source: dados/pix_nova_lima.csv (semicolon-delimited, UTF-8 BOM)

Columns loaded:
  AnoMes → ano (YYYY) + mes (MM)
  Municipio_Ibge → lookup municipio_id via municipios.ibge
  VL_PagadorPF, QT_PagadorPF, QT_PES_PagadorPF
  VL_PagadorPJ, QT_PagadorPJ, QT_PES_PagadorPJ
  VL_RecebedorPF, QT_RecebedorPF
  VL_RecebedorPJ, QT_RecebedorPJ, QT_PES_RecebedorPJ
"""

import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.session import SessionLocal
from app.models.municipio import Municipio
from app.models.pix import PixMensal

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "dados", "pix_cabo_verde.csv")


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


def main():
    db = SessionLocal()
    try:
        # Build name → municipio_id cache (same pattern as other ingestion scripts)
        municipios_by_name = {
            m.nome.strip().lower(): m.id for m in db.query(Municipio).all()
        }

        rows_inserted = 0
        rows_skipped = 0

        with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                anomes = row.get("AnoMes", "").strip()
                if len(anomes) != 6:
                    rows_skipped += 1
                    continue

                ano = int(anomes[:4])
                mes = int(anomes[4:])

                nome_cidade = row.get("Nome_Cidade", "").strip().lower()
                municipio_id = municipios_by_name.get(nome_cidade)
                if municipio_id is None:
                    rows_skipped += 1
                    continue

                # Check for duplicate
                exists = (
                    db.query(PixMensal)
                    .filter(
                        PixMensal.municipio_id == municipio_id,
                        PixMensal.ano == ano,
                        PixMensal.mes == mes,
                    )
                    .first()
                )
                if exists:
                    rows_skipped += 1
                    continue

                record = PixMensal(
                    municipio_id=municipio_id,
                    ano=ano,
                    mes=mes,
                    vl_pagador_pf=_float(row.get("VL_PagadorPF", "")),
                    qt_pagador_pf=_int(row.get("QT_PagadorPF", "")),
                    qt_pes_pagador_pf=_int(row.get("QT_PES_PagadorPF", "")),
                    vl_pagador_pj=_float(row.get("VL_PagadorPJ", "")),
                    qt_pagador_pj=_int(row.get("QT_PagadorPJ", "")),
                    qt_pes_pagador_pj=_int(row.get("QT_PES_PagadorPJ", "")),
                    vl_recebedor_pf=_float(row.get("VL_RecebedorPF", "")),
                    qt_recebedor_pf=_int(row.get("QT_RecebedorPF", "")),
                    vl_recebedor_pj=_float(row.get("VL_RecebedorPJ", "")),
                    qt_recebedor_pj=_int(row.get("QT_RecebedorPJ", "")),
                    qt_pes_recebedor_pj=_int(row.get("QT_PES_RecebedorPJ", "")),
                )
                db.add(record)
                rows_inserted += 1

        db.commit()
        print(f"PIX: {rows_inserted} rows inserted, {rows_skipped} skipped.")

    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    main()
