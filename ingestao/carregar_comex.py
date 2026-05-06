import csv
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.comex import ComexMensal, ComexPorPais, ComexPorProduto
from ingestao.utils import obter_ou_criar_municipio


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / "comex.csv"
    if not caminho.exists():
        print(f"  ⚠️  comex.csv não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    agregado: dict[tuple[int, int, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0, "peso_kg": 0.0}
    )
    agregado_produto: dict[tuple[int, str, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0, "peso_kg": 0.0}
    )
    agregado_pais: dict[tuple[int, str, str], dict] = defaultdict(
        lambda: {"valor_usd": 0.0}
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")
        for row in reader:
            data_ref = datetime.strptime(row["Data_Ref"].strip(), "%d/%m/%Y")
            ano = data_ref.year
            mes = data_ref.month
            tipo_operacao = row["Tipo_Operacao"].strip().lower()
            valor_usd = float(row["Valor_USD"] or 0)
            peso_kg = float(row["Peso_KG"] or 0)

            chave = (ano, mes, tipo_operacao)
            agregado[chave]["valor_usd"] += valor_usd
            agregado[chave]["peso_kg"] += peso_kg

            produto = row["Codigo_SH4"].strip()
            pais = row["Pais_Parceiro"].strip()
            agregado_produto[(ano, tipo_operacao, produto)]["valor_usd"] += valor_usd
            agregado_produto[(ano, tipo_operacao, produto)]["peso_kg"] += peso_kg
            agregado_pais[(ano, tipo_operacao, pais)]["valor_usd"] += valor_usd

    for (ano, mes, tipo_operacao), totais in agregado.items():
        existente = db.query(ComexMensal).filter(
            ComexMensal.municipio_id == municipio.id,
            ComexMensal.ano == ano,
            ComexMensal.mes == mes,
            ComexMensal.tipo_operacao == tipo_operacao,
        ).first()
        if not existente:
            db.add(ComexMensal(
                municipio_id=municipio.id,
                ano=ano,
                mes=mes,
                tipo_operacao=tipo_operacao,
                valor_usd=totais["valor_usd"],
                peso_kg=totais["peso_kg"],
            ))

    for (ano, tipo_operacao, produto), totais in agregado_produto.items():
        existente = db.query(ComexPorProduto).filter(
            ComexPorProduto.municipio_id == municipio.id,
            ComexPorProduto.ano == ano,
            ComexPorProduto.tipo_operacao == tipo_operacao,
            ComexPorProduto.produto == produto,
        ).first()
        if not existente:
            db.add(ComexPorProduto(municipio_id=municipio.id, ano=ano, tipo_operacao=tipo_operacao, produto=produto, **totais))

    for (ano, tipo_operacao, pais), totais in agregado_pais.items():
        existente = db.query(ComexPorPais).filter(
            ComexPorPais.municipio_id == municipio.id,
            ComexPorPais.ano == ano,
            ComexPorPais.tipo_operacao == tipo_operacao,
            ComexPorPais.pais == pais,
        ).first()
        if not existente:
            db.add(ComexPorPais(municipio_id=municipio.id, ano=ano, tipo_operacao=tipo_operacao, pais=pais, **totais))

    db.commit()
