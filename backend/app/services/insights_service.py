"""
AI Insights service — fetches dataset data, calls Claude API,
stores and retrieves insights per (municipio, dataset, periodo).
"""

import json
import logging
from datetime import datetime, timezone

import anthropic
from app.core.config import settings
from app.models.arrecadacao import ArrecadacaoMensal
from app.models.bolsa_familia import BolsaFamiliaResumo
from app.models.caged import CagedMovimentacao
from app.models.comex import ComexMensal
from app.models.empresa import Empresa
from app.models.estban import EstbanMensal
from app.models.insight_ia import InsightIA
from app.models.inss import InssAnual
from app.models.municipio import Municipio
from app.models.pe_de_meia import PeDeMeiaResumo
from app.models.pib import PibAnual
from app.models.pix import PixMensal
from app.models.rais import RaisVinculo
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"

DATASET_LABELS = {
    "arrecadacao": "Arrecadação Municipal (ICMS, IPVA, IPI)",
    "pib": "PIB Municipal",
    "caged": "CAGED — Movimentação de Empregos Formais",
    "rais": "RAIS — Vínculos Empregatícios",
    "bolsa_familia": "Bolsa Família — Beneficiários e Valores",
    "pe_de_meia": "Pé-de-Meia — Estudantes Beneficiados",
    "inss": "INSS — Benefícios Previdenciários",
    "estban": "Estban — Estatísticas Bancárias",
    "comex": "Comércio Exterior (Exportações e Importações)",
    "empresas": "Empresas Ativas no Município",
    "pix": "PIX — Transações Instantâneas (Banco Central)",
    "geral": "Visão Geral da Economia Municipal",
}


def buscar_insight(db: Session, municipio_id: int, dataset: str, periodo: str) -> InsightIA | None:
    return (
        db.query(InsightIA)
        .filter(
            InsightIA.municipio_id == municipio_id,
            InsightIA.dataset == dataset,
            InsightIA.periodo == periodo,
        )
        .first()
    )


def _fetch_dados(db: Session, municipio_id: int, dataset: str) -> tuple[list[dict], str]:
    """Return (list of data dicts, periodo string)."""

    if dataset == "arrecadacao":
        rows = (
            db.query(ArrecadacaoMensal)
            .filter(ArrecadacaoMensal.municipio_id == municipio_id)
            .order_by(ArrecadacaoMensal.ano.desc(), ArrecadacaoMensal.mes.desc())
            .limit(12)
            .all()
        )
        dados = [
            {"ano": r.ano, "mes": r.mes, "icms": r.valor_icms, "ipva": r.valor_ipva,
             "ipi": r.valor_ipi, "total": r.valor_total}
            for r in rows
        ]
        periodo = f"{rows[0].ano}-{rows[0].mes:02d}" if rows else "geral"

    elif dataset == "pib":
        rows = (
            db.query(PibAnual)
            .filter(PibAnual.municipio_id == municipio_id)
            .order_by(PibAnual.ano.desc())
            .limit(5)
            .all()
        )
        dados = [{"ano": r.ano, "valor": r.pib_total} for r in rows]
        periodo = str(rows[0].ano) if rows else "geral"

    elif dataset == "caged":
        rows = (
            db.query(CagedMovimentacao)
            .filter(CagedMovimentacao.municipio_id == municipio_id)
            .order_by(CagedMovimentacao.ano.desc(), CagedMovimentacao.mes.desc())
            .limit(12)
            .all()
        )
        dados = [
            {"ano": r.ano, "mes": r.mes, "admissoes": r.admissões,
             "desligamentos": r.desligamentos, "saldo": r.saldo}
            for r in rows
        ]
        periodo = f"{rows[0].ano}-{rows[0].mes:02d}" if rows else "geral"

    elif dataset == "rais":
        rows = (
            db.query(RaisVinculo)
            .filter(RaisVinculo.municipio_id == municipio_id)
            .order_by(RaisVinculo.ano.desc())
            .limit(5)
            .all()
        )
        dados = [{"ano": r.ano, "vinculos": r.total_vinculos} for r in rows]
        periodo = str(rows[0].ano) if rows else "geral"

    elif dataset == "bolsa_familia":
        rows = (
            db.query(BolsaFamiliaResumo)
            .filter(BolsaFamiliaResumo.municipio_id == municipio_id)
            .order_by(BolsaFamiliaResumo.ano.desc(), BolsaFamiliaResumo.mes.desc())
            .limit(12)
            .all()
        )
        dados = [
            {"ano": r.ano, "mes": r.mes, "beneficiarios": r.total_beneficiarios, "valor_total": r.valor_total}
            for r in rows
        ]
        periodo = f"{rows[0].ano}-{rows[0].mes:02d}" if rows else "geral"

    elif dataset == "pe_de_meia":
        rows = (
            db.query(PeDeMeiaResumo)
            .filter(PeDeMeiaResumo.municipio_id == municipio_id)
            .order_by(PeDeMeiaResumo.ano.desc(), PeDeMeiaResumo.mes.desc())
            .limit(12)
            .all()
        )
        dados = [
            {"ano": r.ano, "mes": r.mes, "estudantes": r.total_estudantes, "valor_total": r.valor_total}
            for r in rows
        ]
        periodo = f"{rows[0].ano}-{rows[0].mes:02d}" if rows else "geral"

    elif dataset == "inss":
        rows = (
            db.query(InssAnual)
            .filter(InssAnual.municipio_id == municipio_id)
            .order_by(InssAnual.ano.desc())
            .limit(15)
            .all()
        )
        dados = [{"ano": r.ano, "categoria": r.categoria, "quantidade": r.quantidade_beneficios,
                  "valor": r.valor_anual} for r in rows]
        periodo = str(rows[0].ano) if rows else "geral"

    elif dataset == "estban":
        rows = (
            db.query(EstbanMensal)
            .filter(EstbanMensal.municipio_id == municipio_id)
            .order_by(EstbanMensal.data_referencia.desc())
            .limit(12)
            .all()
        )
        dados = [
            {"data": str(r.data_referencia), "agencias": r.qtd_agencias,
             "credito": r.valor_operacoes_credito, "poupanca": r.valor_poupanca,
             "depositos_prazo": r.valor_depositos_prazo}
            for r in rows
        ]
        periodo = str(rows[0].data_referencia)[:7] if rows else "geral"

    elif dataset == "comex":
        rows = (
            db.query(ComexMensal)
            .filter(ComexMensal.municipio_id == municipio_id)
            .order_by(ComexMensal.ano.desc(), ComexMensal.mes.desc())
            .limit(24)
            .all()
        )
        dados = [
            {"ano": r.ano, "mes": r.mes, "tipo": r.tipo_operacao,
             "valor_usd": r.valor_usd, "peso_kg": r.peso_kg}
            for r in rows
        ]
        periodo = f"{rows[0].ano}-{rows[0].mes:02d}" if rows else "geral"

    elif dataset == "empresas":
        total = db.query(func.count(Empresa.id)).filter(Empresa.municipio_id == municipio_id).scalar()
        ativas = (
            db.query(func.count(Empresa.id))
            .filter(Empresa.municipio_id == municipio_id, Empresa.situacao == "02")
            .scalar()
        )
        mei = (
            db.query(func.count(Empresa.id))
            .filter(Empresa.municipio_id == municipio_id, Empresa.opcao_mei == True)
            .scalar()
        )
        dados = [{"total_empresas": total, "ativas": ativas, "mei": mei}]
        periodo = "geral"

    elif dataset == "pix":
        rows = (
            db.query(PixMensal)
            .filter(PixMensal.municipio_id == municipio_id)
            .order_by(PixMensal.ano.desc(), PixMensal.mes.desc())
            .limit(12)
            .all()
        )
        dados = [
            {
                "ano": r.ano,
                "mes": r.mes,
                "vl_pagador_pf": r.vl_pagador_pf,
                "qt_pagador_pf": r.qt_pagador_pf,
                "vl_pagador_pj": r.vl_pagador_pj,
                "qt_pagador_pj": r.qt_pagador_pj,
                "vl_recebedor_pf": r.vl_recebedor_pf,
                "vl_recebedor_pj": r.vl_recebedor_pj,
            }
            for r in rows
        ]
        periodo = f"{rows[0].ano}-{rows[0].mes:02d}" if rows else "geral"

    elif dataset == "geral":
        pib = db.query(PibAnual).filter(PibAnual.municipio_id == municipio_id).order_by(PibAnual.ano.desc()).first()
        arr = (
            db.query(func.sum(ArrecadacaoMensal.valor_total))
            .filter(ArrecadacaoMensal.municipio_id == municipio_id)
            .scalar()
        )
        caged = (
            db.query(func.sum(CagedMovimentacao.saldo))
            .filter(CagedMovimentacao.municipio_id == municipio_id)
            .scalar()
        )
        bf = (
            db.query(func.sum(BolsaFamiliaResumo.total_beneficiarios))
            .filter(BolsaFamiliaResumo.municipio_id == municipio_id)
            .scalar()
        )
        dados = [{
            "pib_ultimo_ano": {"ano": pib.ano, "valor": pib.pib_total} if pib else None,
            "arrecadacao_total": arr,
            "saldo_caged_total": caged,
            "beneficiarios_bolsa_familia": bf,
        }]
        periodo = str(pib.ano) if pib else "geral"

    else:
        raise HTTPException(status_code=400, detail=f"Dataset '{dataset}' não reconhecido.")

    return dados, periodo


def gerar_release(db: Session, municipio_id: int, dataset: str) -> InsightIA:
    """Generate a 5-paragraph institutional press release for a dataset."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY não configurada no servidor.")

    municipio = db.get(Municipio, municipio_id)
    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    dados, periodo = _fetch_dados(db, municipio_id, dataset)

    if not dados:
        raise HTTPException(status_code=404, detail="Sem dados suficientes para gerar o release.")

    release_dataset = f"release_{dataset}"
    dataset_label = DATASET_LABELS.get(dataset, dataset)
    dados_json = json.dumps(dados, ensure_ascii=False, default=str)

    prompt = f"""Atue como um assessor de imprensa especializado em comunicação institucional pública no Brasil.

Sua tarefa é redigir um release de mídia institucional para a Prefeitura de {municipio.nome}, com foco em divulgação para jornais locais, portais de notícia e redes sociais (Instagram e Facebook).

ESTRUTURA (5 parágrafos curtos e objetivos):
1. Introdução: Apresente a temática principal, cite "Prefeitura de {municipio.nome}", explique o dado em uma frase objetiva e deixe explícito o objetivo da divulgação.
2. Desenvolvimento 1: dados numéricos e informações concretas.
3. Desenvolvimento 2: mais dados, contexto e indicadores relevantes.
4. Desenvolvimento 3: resultados, ações das secretarias, iniciativas da administração pública.
5. Conclusão: se dados positivos → reforce que os resultados são fruto de gestão eficiente e planejamento; se negativos/mistos → enfatize que as secretarias já atuam ativamente para solucionar os desafios e indique perspectiva de melhoria.

TOM E ESTILO: linguagem formal mas acessível, ativa, clara e objetiva. Sem jargões excessivos. Adequado para imprensa e redes sociais. Destaque resultados e números de forma positiva.

Dataset: {dataset_label}
Cidade: {municipio.nome} ({municipio.estado})
Dados: {dados_json}

Responda APENAS com um JSON array de 5 strings, cada string sendo um parágrafo completo e independente. Sem texto adicional fora do array.
["Parágrafo 1...", "Parágrafo 2...", "Parágrafo 3...", "Parágrafo 4...", "Parágrafo 5..."]"""

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    if raw.startswith("```"):
        lines = raw.splitlines()
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw = "\n".join(lines).strip()

    try:
        paragraphs = json.loads(raw)
        if not isinstance(paragraphs, list):
            paragraphs = [raw]
    except json.JSONDecodeError:
        paragraphs = [raw]

    conteudo = json.dumps(paragraphs, ensure_ascii=False)

    existing = buscar_insight(db, municipio_id, release_dataset, periodo)
    if existing:
        existing.conteudo = conteudo
        existing.modelo = MODEL
        existing.gerado_em = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    release = InsightIA(
        municipio_id=municipio_id,
        dataset=release_dataset,
        periodo=periodo,
        conteudo=conteudo,
        modelo=MODEL,
    )
    db.add(release)
    db.commit()
    db.refresh(release)
    return release


def gerar_insight(db: Session, municipio_id: int, dataset: str) -> InsightIA:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY não configurada no servidor.")

    municipio = db.get(Municipio, municipio_id)
    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    dados, periodo = _fetch_dados(db, municipio_id, dataset)

    if not dados:
        raise HTTPException(status_code=404, detail="Sem dados suficientes para gerar insights.")

    dataset_label = DATASET_LABELS.get(dataset, dataset)
    dados_json = json.dumps(dados, ensure_ascii=False, default=str)

    prompt = f"""Você é um analista econômico especializado em municípios brasileiros de pequeno e médio porte.

Analise os dados abaixo do município de {municipio.nome} ({municipio.estado}) e responda APENAS com um JSON array contendo exatamente 4 strings em português. Cada string deve ser um bullet point de insight conciso (máximo 2 linhas). Destaque tendências, comparações entre períodos, pontos de atenção e oportunidades para gestores municipais.

Dataset: {dataset_label}
Dados: {dados_json}

Responda APENAS com o JSON array, sem texto adicional. Exemplo de formato:
["Insight 1 aqui.", "Insight 2 aqui.", "Insight 3 aqui.", "Insight 4 aqui."]"""

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Strip markdown code fences if Claude wrapped the response
    if raw.startswith("```"):
        lines = raw.splitlines()
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw = "\n".join(lines).strip()

    try:
        bullets = json.loads(raw)
        if not isinstance(bullets, list):
            bullets = [raw]
    except json.JSONDecodeError:
        bullets = [raw]

    conteudo = json.dumps(bullets, ensure_ascii=False)

    existing = buscar_insight(db, municipio_id, dataset, periodo)
    if existing:
        existing.conteudo = conteudo
        existing.modelo = MODEL
        existing.gerado_em = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    insight = InsightIA(
        municipio_id=municipio_id,
        dataset=dataset,
        periodo=periodo,
        conteudo=conteudo,
        modelo=MODEL,
    )
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight
