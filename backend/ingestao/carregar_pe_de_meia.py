import csv
from collections import defaultdict
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.pe_de_meia import PeDeMeiaEtapa, PeDeMeiaResumo
from ingestao.utils import obter_ou_criar_municipio


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "pe_meia.csv"
    if not caminho.exists():
        print(f"  [AVISO]  pe_meia.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    agregado: dict[tuple[int, int], dict] = defaultdict(
        lambda: {"estudantes": 0, "valor_total": 0.0}
    )
    agregado_etapa: dict[tuple[int, int, str, str], dict] = defaultdict(
        lambda: {"estudantes": 0, "valor_total": 0.0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            mes_ref = str(row["MÊS REFERÊNCIA"]).strip()
            ano = int(mes_ref[:4])
            mes = int(mes_ref[4:6])
            valor_parcela = float(row["VALOR PARCELA"] or 0)
            chave = (ano, mes)
            agregado[chave]["estudantes"] += 1
            agregado[chave]["valor_total"] += valor_parcela
            etapa_ensino = str(row["ETAPA ENSINO"]).strip()
            tipo_incentivo = str(row["TIPO INCENTIVO"]).strip()
            chave_etapa = (ano, mes, etapa_ensino, tipo_incentivo)
            agregado_etapa[chave_etapa]["estudantes"] += 1
            agregado_etapa[chave_etapa]["valor_total"] += valor_parcela

    if agregado:
        resumo_rows = [
            {
                "municipio_id": municipio.id,
                "ano": ano,
                "mes": mes,
                "total_estudantes": totais["estudantes"],
                "valor_total": totais["valor_total"],
            }
            for (ano, mes), totais in agregado.items()
        ]
        stmt = pg_insert(PeDeMeiaResumo).values(resumo_rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["municipio_id", "ano", "mes"],
        )
        db.execute(stmt)
        db.commit()

    if agregado_etapa:
        etapa_rows = [
            {
                "municipio_id": municipio.id,
                "ano": ano,
                "mes": mes,
                "etapa_ensino": etapa_ensino,
                "tipo_incentivo": tipo_incentivo,
                "total_estudantes": totais["estudantes"],
                "valor_total": totais["valor_total"],
            }
            for (ano, mes, etapa_ensino, tipo_incentivo), totais in agregado_etapa.items()
        ]
        stmt = pg_insert(PeDeMeiaEtapa).values(etapa_rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["municipio_id", "ano", "mes", "etapa_ensino", "tipo_incentivo"],
        )
        db.execute(stmt)
        db.commit()
