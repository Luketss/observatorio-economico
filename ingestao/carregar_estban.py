import csv
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.estban import EstbanMensal, EstbanPorInstituicao
from ingestao.utils import obter_ou_criar_municipio

FILENAME = "estban.csv"


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    caminho = cidade_dir / FILENAME
    if not caminho.exists():
        print(f"  [AVISO]  {FILENAME} não encontrado em {cidade_dir} — pulando.")
        return
    municipio = obter_ou_criar_municipio(db, city_name, estado)

    agregado: dict[str, dict] = defaultdict(
        lambda: {
            "qtd_agencias": 0,
            "valor_operacoes_credito": 0.0,
            "valor_depositos_vista": 0.0,
            "valor_poupanca": 0.0,
            "valor_depositos_prazo": 0.0,
            "emprestimos_titulos_descontados": 0.0,
            "financiamentos_gerais": 0.0,
            "financiamento_agropecuario": 0.0,
            "financiamentos_imobiliarios": 0.0,
            "arrendamento_mercantil": 0.0,
            "emprestimos_setor_publico": 0.0,
            "outros_creditos": 0.0,
        }
    )
    agregado_inst: dict[tuple[str, str], dict] = defaultdict(
        lambda: {
            "qtd_agencias": 0,
            "valor_operacoes_credito": 0.0,
            "valor_depositos_vista": 0.0,
            "valor_poupanca": 0.0,
            "valor_depositos_prazo": 0.0,
            "emprestimos_titulos_descontados": 0.0,
            "financiamentos_gerais": 0.0,
            "financiamento_agropecuario": 0.0,
            "financiamentos_imobiliarios": 0.0,
            "arrendamento_mercantil": 0.0,
            "emprestimos_setor_publico": 0.0,
            "outros_creditos": 0.0,
        }
    )

    with open(caminho, newline="", encoding="utf-8-sig") as csvfile:
        reader = csv.DictReader(csvfile, delimiter=";")
        for row in reader:
            data_ref_str = row["DATA_REFERENCIA"].strip()
            credito_col = "TOTAL_OPERACOES_CREDITO" if "TOTAL_OPERACOES_CREDITO" in row else "VALOR_OPERACOES_CREDITO"

            agregado[data_ref_str]["qtd_agencias"] += int(float(row["QTD_AGENCIAS"] or 0))
            agregado[data_ref_str]["valor_operacoes_credito"] += float(row[credito_col] or 0)
            agregado[data_ref_str]["valor_depositos_vista"] += float(row["VALOR_DEPOSITOS_VISTA"] or 0)
            agregado[data_ref_str]["valor_poupanca"] += float(row["VALOR_POUPANCA"] or 0)
            agregado[data_ref_str]["valor_depositos_prazo"] += float(row["VALOR_DEPOSITOS_PRAZO"] or 0)
            agregado[data_ref_str]["emprestimos_titulos_descontados"] += float(row.get("EMPRESTIMOS_E_TITULOS_DESCONTADOS") or 0)
            agregado[data_ref_str]["financiamentos_gerais"] += float(row.get("FINANCIAMENTOS_GERAIS") or 0)
            agregado[data_ref_str]["financiamento_agropecuario"] += float(row.get("FINANCIAMENTO_AGROPECUARIO") or 0)
            agregado[data_ref_str]["financiamentos_imobiliarios"] += float(row.get("FINANCIAMENTOS_IMOBILIARIOS") or 0)
            agregado[data_ref_str]["arrendamento_mercantil"] += float(row.get("ARRENDAMENTO_MERCANTIL") or 0)
            agregado[data_ref_str]["emprestimos_setor_publico"] += float(row.get("EMPRESTIMOS_SETOR_PUBLICO") or 0)
            agregado[data_ref_str]["outros_creditos"] += float(row.get("OUTROS_CREDITOS") or 0)

            nome_instituicao = row["NOME_INSTITUICAO"].strip()
            chave_inst = (data_ref_str, nome_instituicao)
            agregado_inst[chave_inst]["qtd_agencias"] += int(float(row["QTD_AGENCIAS"] or 0))
            agregado_inst[chave_inst]["valor_operacoes_credito"] += float(row[credito_col] or 0)
            agregado_inst[chave_inst]["valor_depositos_vista"] += float(row["VALOR_DEPOSITOS_VISTA"] or 0)
            agregado_inst[chave_inst]["valor_poupanca"] += float(row["VALOR_POUPANCA"] or 0)
            agregado_inst[chave_inst]["valor_depositos_prazo"] += float(row["VALOR_DEPOSITOS_PRAZO"] or 0)
            agregado_inst[chave_inst]["emprestimos_titulos_descontados"] += float(row.get("EMPRESTIMOS_E_TITULOS_DESCONTADOS") or 0)
            agregado_inst[chave_inst]["financiamentos_gerais"] += float(row.get("FINANCIAMENTOS_GERAIS") or 0)
            agregado_inst[chave_inst]["financiamento_agropecuario"] += float(row.get("FINANCIAMENTO_AGROPECUARIO") or 0)
            agregado_inst[chave_inst]["financiamentos_imobiliarios"] += float(row.get("FINANCIAMENTOS_IMOBILIARIOS") or 0)
            agregado_inst[chave_inst]["arrendamento_mercantil"] += float(row.get("ARRENDAMENTO_MERCANTIL") or 0)
            agregado_inst[chave_inst]["emprestimos_setor_publico"] += float(row.get("EMPRESTIMOS_SETOR_PUBLICO") or 0)
            agregado_inst[chave_inst]["outros_creditos"] += float(row.get("OUTROS_CREDITOS") or 0)

    for data_ref_str, totais in agregado.items():
        data_referencia = datetime.strptime(data_ref_str, "%Y-%m-%d").date()
        existente = (
            db.query(EstbanMensal)
            .filter(
                EstbanMensal.municipio_id == municipio.id,
                EstbanMensal.data_referencia == data_referencia,
            )
            .first()
        )
        if existente:
            continue
        db.add(EstbanMensal(
            municipio_id=municipio.id,
            data_referencia=data_referencia,
            **totais,
        ))

    db.commit()

    for (data_ref_str, nome_instituicao), totais in agregado_inst.items():
        data_referencia = datetime.strptime(data_ref_str, "%Y-%m-%d").date()
        existente = (
            db.query(EstbanPorInstituicao)
            .filter(
                EstbanPorInstituicao.municipio_id == municipio.id,
                EstbanPorInstituicao.data_referencia == data_referencia,
                EstbanPorInstituicao.nome_instituicao == nome_instituicao,
            )
            .first()
        )
        if existente:
            continue
        db.add(EstbanPorInstituicao(
            municipio_id=municipio.id,
            data_referencia=data_referencia,
            nome_instituicao=nome_instituicao,
            **totais,
        ))

    db.commit()
