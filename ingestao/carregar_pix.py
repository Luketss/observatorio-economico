import csv
import os

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.municipio import Municipio
from app.models.pix import PixMensal

BASE_PATH = "dados/PIX"


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


def obter_ou_criar_municipio(db: Session, nome: str, estado: str, codigo_ibge: str | None = None) -> Municipio:
    if codigo_ibge:
        m = db.query(Municipio).filter(Municipio.codigo_ibge == codigo_ibge).first()
        if m:
            return m
    m = db.query(Municipio).filter(Municipio.nome == nome, Municipio.estado == estado).first()
    if not m:
        m = Municipio(nome=nome, estado=estado, codigo_ibge=codigo_ibge, ativo=True)
        db.add(m)
        db.commit()
        db.refresh(m)
    return m


def carregar_csv(db: Session, caminho: str, estado: str):
    municipios_cache: dict[str, Municipio] = {}
    rows_inserted = 0
    rows_skipped = 0

    with open(caminho, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            anomes = row.get("AnoMes", "").strip()
            if len(anomes) != 6:
                rows_skipped += 1
                continue

            ano = int(anomes[:4])
            mes = int(anomes[4:])

            nome_cidade = row.get("Nome_Cidade", "").strip().upper()
            if not nome_cidade:
                rows_skipped += 1
                continue

            if nome_cidade not in municipios_cache:
                municipios_cache[nome_cidade] = obter_ou_criar_municipio(db, nome_cidade, estado)
            municipio = municipios_cache[nome_cidade]

            exists = (
                db.query(PixMensal)
                .filter(
                    PixMensal.municipio_id == municipio.id,
                    PixMensal.ano == ano,
                    PixMensal.mes == mes,
                )
                .first()
            )
            if exists:
                rows_skipped += 1
                continue

            db.add(PixMensal(
                municipio_id=municipio.id,
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
                qt_pes_recebedor_pf=_int(row.get("QT_PES_RecebedorPF", "")),
                vl_recebedor_pj=_float(row.get("VL_RecebedorPJ", "")),
                qt_recebedor_pj=_int(row.get("QT_RecebedorPJ", "")),
                qt_pes_recebedor_pj=_int(row.get("QT_PES_RecebedorPJ", "")),
            ))
            rows_inserted += 1

    db.commit()
    print(f"PIX: {rows_inserted} linhas inseridas, {rows_skipped} ignoradas.")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--estado", required=True, help="UF code, e.g. MG, MT")
    args = parser.parse_args()
    estado = args.estado.strip().upper()

    db = SessionLocal()
    try:
        for arquivo in os.listdir(BASE_PATH):
            if arquivo.endswith(".csv"):
                caminho = os.path.join(BASE_PATH, arquivo)
                print(f"Processando {arquivo}...")
                carregar_csv(db, caminho, estado)
        print("✅ Carga PIX finalizada com sucesso.")
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    main()
