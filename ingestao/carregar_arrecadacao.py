import csv
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.arrecadacao import ArrecadacaoMensal
from ingestao.utils import obter_ou_criar_municipio


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "arrecadacao.csv"
    if not caminho.exists():
        print(f"  ⚠️  arrecadacao.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            ano = int(row["ano_particao"])
            mes = int(row["MES_ESTIMADO"])
            if db.query(ArrecadacaoMensal).filter(
                ArrecadacaoMensal.municipio_id == municipio.id,
                ArrecadacaoMensal.ano == ano,
                ArrecadacaoMensal.mes == mes,
            ).first():
                continue
            icms = float(row["vr_icms"] or 0)
            ipva = float(row["vr_ipva"] or 0)
            ipi = float(row["vr_ipi"] or 0)
            data_base = datetime.strptime(row["DATA_BASE"], "%Y-%m-%d").date()
            db.add(ArrecadacaoMensal(
                municipio_id=municipio.id, ano=ano, mes=mes,
                nome_mes=row["NOME_MES"], data_base=data_base,
                valor_icms=icms, valor_ipva=ipva, valor_ipi=ipi,
                valor_total=icms + ipva + ipi,
            ))
    db.commit()
