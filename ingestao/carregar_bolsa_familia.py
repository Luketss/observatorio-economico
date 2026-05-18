import csv
from collections import defaultdict
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.bolsa_familia import BolsaFamiliaResumo
from ingestao.utils import obter_ou_criar_municipio


def _parse_float(value) -> float:
    if not value:
        return 0.0
    return float(str(value).strip().replace(".", "").replace(",", "."))


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "bolsa_familia.csv"
    if not caminho.exists():
        print(f"  [AVISO]  bolsa_familia.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    agregado: dict[tuple[int, int], dict] = defaultdict(
        lambda: {"beneficiarios": 0, "valor_total": 0.0, "valor_bolsa": 0.0, "valor_primeira_infancia": 0.0, "beneficiarios_primeira_infancia": 0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            mes_comp = str(row["MÊS COMPETÊNCIA"]).strip()
            ano = int(mes_comp[:4])
            mes = int(mes_comp[4:6])
            valor_parcela = _parse_float(row["VALOR PARCELA"])
            valor_bolsa = _parse_float(row["Valor Bolsa"])
            chave = (ano, mes)
            agregado[chave]["beneficiarios"] += 1
            agregado[chave]["valor_total"] += valor_parcela
            agregado[chave]["valor_bolsa"] += valor_bolsa
            primeira_infancia = _parse_float(row.get("Primeira Infância"))
            agregado[chave]["valor_primeira_infancia"] += primeira_infancia
            if primeira_infancia > 0:
                agregado[chave]["beneficiarios_primeira_infancia"] += 1

    if not agregado:
        return

    rows = [
        {
            "municipio_id": municipio.id,
            "ano": ano,
            "mes": mes,
            "total_beneficiarios": totais["beneficiarios"],
            "valor_total": totais["valor_total"],
            "valor_bolsa": totais["valor_bolsa"],
            "valor_primeira_infancia": totais["valor_primeira_infancia"],
            "beneficiarios_primeira_infancia": totais["beneficiarios_primeira_infancia"],
        }
        for (ano, mes), totais in agregado.items()
    ]

    stmt = pg_insert(BolsaFamiliaResumo).values(rows)
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["municipio_id", "ano", "mes"],
    )
    db.execute(stmt)
    db.commit()
