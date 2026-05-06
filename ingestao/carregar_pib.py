import csv
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.pib import PibAnual
from ingestao.utils import obter_ou_criar_municipio


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "pib.csv"
    if not caminho.exists():
        print(f"  [AVISO]  pib.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ano = int(row["Ano"])
            tipo = row["Tipo_Dado"].upper()
            if db.query(PibAnual).filter(
                PibAnual.municipio_id == municipio.id,
                PibAnual.ano == ano,
                PibAnual.tipo_dado == tipo,
            ).first():
                continue
            pib_total = float(row["PIB_Total"] or 0)
            va_agro = float(row["VA_Agropecuaria"] or 0) if row["VA_Agropecuaria"] else None
            va_gov = float(row["VA_Governo"] or 0) if row["VA_Governo"] else None
            va_ind = float(row["VA_Industria"] or 0) if row["VA_Industria"] else None
            va_serv = float(row["VA_Servicos"] or 0) if row["VA_Servicos"] else None
            db.add(PibAnual(
                municipio_id=municipio.id,
                ano=ano,
                tipo_dado=tipo,
                pib_total=pib_total,
                va_agropecuaria=va_agro,
                va_governo=va_gov,
                va_industria=va_ind,
                va_servicos=va_serv,
            ))
    db.commit()
