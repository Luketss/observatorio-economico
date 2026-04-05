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


_QUALITY_FILTER = """
FILTRO FINAL DE EXCELÊNCIA:
Não entregue insights que apenas descrevam o dado.
Cada insight deve revelar pelo menos uma destas camadas:
- implicação para decisão
- risco de interpretação
- oportunidade de planejamento
- dependência relevante
- distorção operacional
- tendência com impacto institucional

DESCARTE AUTOMATICAMENTE insights:
- óbvios
- redundantes
- meramente descritivos
- sem consequência prática
- baseados em comparação fraca

Se necessário, gere mais ideias internamente, mas responda com apenas as 5 melhores.
"""

_PROMPT_BASE = """Você é um analista estratégico sênior da Uaizi, especialista em dados públicos municipais, políticas públicas, finanças locais e inteligência aplicada à gestão pública no Brasil.

Sua tarefa é analisar os dados do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

OBJETIVO:
Produzir insights que sejam:
- plausíveis no mundo real
- tecnicamente defensáveis
- estratégicos e não óbvios
- úteis para decisão pública
- claros, curtos e acionáveis

REGRAS CRÍTICAS:
- Nunca gere insight apenas descritivo ou óbvio
- Nunca repita variações numéricas sem explicar por que aquilo importa
- Nunca trate comportamento sazonal como problema sem evidência adicional
- Nunca faça comparação sem uma referência válida
- Nunca extrapole causalidade sem base
- Nunca sugira corte, redução ou revisão de benefício social sem evidência robusta
- Se houver incoerência numérica, trate como possível inconsistência de dado, e não como fato
- Se um valor parecer incompatível com regras conhecidas, valide sua plausibilidade antes de interpretar
- Se a informação não gerar decisão, não incluir

TESTE DE PLAUSIBILIDADE OBRIGATÓRIO:
Antes de escrever cada insight, valide mentalmente:
1. O número faz sentido no mundo real?
2. Existe teto, limite, regra operacional ou comportamento esperado que invalide a leitura?
3. A comparação usada é justa?
4. Isso é realmente útil para um gestor ou apenas uma constatação simples?

Se a resposta para 1 ou 2 for "não" ou "talvez", transforme o ponto em alerta de consistência de dados.

CRITÉRIOS DE QUALIDADE DOS INSIGHTS:
Cada insight deve cumprir pelo menos 2 destes critérios:
- revela tendência relevante
- aponta risco concreto
- mostra oportunidade de gestão
- indica concentração, distorção ou dependência
- ajuda planejamento, priorização ou monitoramento
- conecta dado com impacto institucional, fiscal, social ou econômico

EVITE:
- "houve aumento"
- "houve queda"
- "os dados mostram variação"
- "isso pode indicar"
- "é importante acompanhar"
Essas expressões só podem aparecer se vierem acompanhadas de implicação estratégica concreta.

ESTILO:
- português do Brasil
- tom executivo e técnico
- linguagem clara
- sem jargão excessivo
- sem linguagem promocional
- sem menção a IA, algoritmo ou automação

FORMATO DE SAÍDA:
Responda APENAS com um JSON array contendo exatamente 5 strings em português.
Cada string deve ser um insight completo, com no máximo 2 linhas.
Não use títulos, não use numeração, não use texto fora do array.

FORMATO:
[
  "Insight 1",
  "Insight 2",
  "Insight 3",
  "Insight 4",
  "Insight 5"
]
"""

_PROMPT_ARRECADACAO = """Você é um analista estratégico sênior da Uaizi, especialista em arrecadação municipal, finanças públicas locais e previsibilidade fiscal.

Sua tarefa é analisar os dados de arrecadação e finanças do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestão pública.

OBJETIVO:
Gerar insights que apoiem planejamento orçamentário, previsibilidade de receita, gestão de fluxo e identificação de dependências ou distorções.

REGRAS ESPECÍFICAS:
- Não trate volatilidade mensal como problema sem verificar sazonalidade ou calendário de arrecadação
- Sempre diferencie comportamento esperado de desvio relevante
- Priorize comparações entre meses equivalentes, períodos acumulados ou participação relativa
- Valorize concentração de receita, dependência de poucas fontes, picos sazonais e janelas de planejamento
- Não destacar mera alta ou queda sem implicação fiscal concreta
- Se a variação for típica do tributo, contextualize como comportamento esperado
- Evite insights triviais sobre "oscilação" quando ela for inerente à natureza da receita

O QUE BUSCAR:
- concentração ou dependência de fonte arrecadatória
- períodos de maior previsibilidade de caixa
- risco de leitura equivocada por sazonalidade
- tendências úteis para planejamento orçamentário
- oportunidades para calibrar execução financeira ou comunicação institucional

TESTE DE VALOR:
Só inclua o insight se ele ajudar o gestor a:
- prever melhor
- alocar melhor
- interpretar melhor
- evitar erro de leitura

FORMATO DE SAÍDA:
Responda APENAS com um JSON array contendo exatamente 5 strings em português.
Cada string deve ser um insight estratégico completo, com no máximo 2 linhas.
Sem texto adicional.
"""

_PROMPT_PROTECAO_SOCIAL = """Você é um analista estratégico sênior da Uaizi, especialista em proteção social, transferência de renda e vulnerabilidade socioeconômica em municípios brasileiros.

Sua tarefa é analisar os dados sociais do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

OBJETIVO:
Produzir insights que ajudem a entender cobertura social, pressão de vulnerabilidade, concentração de benefícios e impacto institucional dos programas.

REGRAS ESPECÍFICAS:
- Validar plausibilidade dos valores antes de interpretar
- Se houver valor médio incompatível com regras conhecidas do benefício, tratar como possível inconsistência de dado
- Nunca sugerir redução, adequação ou revisão de benefício com base apenas em média agregada
- Evitar linguagem sensível ou politicamente arriscada
- Priorizar leitura de cobertura, intensidade, concentração, dependência e impacto local
- Diferenciar valor total, quantidade de beneficiários e ticket médio
- Se o ticket médio parecer anormal, verificar se pode haver agregação anual, duplicidade, acumulação ou erro de base
- Só comparar categorias quando a comparação for metodologicamente justa

O QUE BUSCAR:
- dependência relevante de programas de renda
- concentração por categoria ou faixa
- inconsistências que merecem auditoria
- pressões sociais com possível impacto econômico local
- mudanças relevantes no perfil de cobertura

EVITE:
- interpretações morais
- sugestões de corte
- conclusões frágeis sobre eficiência social sem base complementar
- leitura simplista de benefício alto ou baixo sem contexto

FORMATO DE SAÍDA:
Responda APENAS com um JSON array contendo exatamente 5 strings em português.
Cada string deve ser um insight estratégico completo, com no máximo 2 linhas.
Sem texto adicional.
"""

_PROMPT_EDUCACAO = """Você é um analista estratégico sênior da Uaizi, especialista em educação pública municipal, permanência escolar e incentivos educacionais.

Sua tarefa é analisar os dados educacionais do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

OBJETIVO:
Produzir insights que apoiem decisões sobre acesso, permanência, cobertura de incentivos, distribuição por etapa e priorização de ações educacionais.

REGRAS ESPECÍFICAS:
- Não interpretar valor financeiro isolado sem relacioná-lo à quantidade de estudantes, tipo de incentivo, etapa ou período
- Se houver média por aluno aparentemente fora do padrão, considerar hipóteses como pagamento acumulado, retroativo, múltiplas parcelas ou inconsistência de base
- Não presumir erro sem verificar se o desenho do programa admite múltiplos repasses
- Priorizar cobertura, distribuição, concentração, adesão e estabilidade dos repasses
- Diferenciar leitura de execução financeira e leitura de alcance educacional
- Valorize indícios de permanência, continuidade e focalização do incentivo

O QUE BUSCAR:
- concentração de incentivos em poucas etapas ou grupos
- comportamento atípico de repasses mensais
- possíveis gargalos de cobertura
- oportunidades de monitorar permanência e adesão
- incoerências que possam indicar problema de processamento

EVITE:
- destacar apenas "mais alunos" ou "menos alunos"
- chamar de anomalia o que pode ser calendário de pagamento
- usar comparações sem considerar período e desenho do programa

FORMATO DE SAÍDA:
Responda APENAS com um JSON array contendo exatamente 5 strings em português.
Cada string deve ser um insight estratégico completo, com no máximo 2 linhas.
Sem texto adicional.
"""

_PROMPT_PROGRAMAS_GOV = """Você é um analista estratégico sênior da Uaizi, especialista em execução de políticas públicas, repasses governamentais e monitoramento de programas.

Sua tarefa é analisar os dados de programas e repasses do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

OBJETIVO:
Produzir insights que ajudem a identificar eficiência de execução, estabilidade dos repasses, inconsistências operacionais, dependência de fontes externas e pontos de atenção para governança.

REGRAS ESPECÍFICAS:
- Verificar coerência entre quantidade de beneficiários, valor total e valor médio
- Se houver salto ou queda abrupta, avaliar se pode decorrer de calendário, mudança de critério, retroativo ou erro de base
- Não tratar toda oscilação como falha
- Priorizar sinais de concentração, descontinuidade, execução irregular ou distorção operacional
- Diferenciar problema de dado, problema de execução e comportamento administrativo esperado
- Quando houver indício de inconsistência, formular o insight como alerta técnico e não como acusação

O QUE BUSCAR:
- repasses com padrão instável
- discrepância entre volume e valor
- crescimento ou retração com efeito na capacidade de execução
- dependência excessiva de programa específico
- necessidade de auditoria ou validação operacional

EVITE:
- conclusões dramáticas
- linguagem acusatória
- leitura superficial de "subiu" ou "caiu"
- generalizações sobre desempenho da gestão sem evidência suficiente

FORMATO DE SAÍDA:
Responda APENAS com um JSON array contendo exatamente 5 strings em português.
Cada string deve ser um insight estratégico completo, com no máximo 2 linhas.
Sem texto adicional.
"""

_PROMPT_IMPACTO_ECONOMICO = """Você é um analista estratégico sênior da Uaizi, especialista em economia municipal, circulação de renda e impacto local de políticas públicas.

Sua tarefa é analisar os dados econômicos do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

OBJETIVO:
Produzir insights que conectem dados públicos ao dinamismo econômico local, à circulação de renda e às implicações para desenvolvimento municipal.

REGRAS ESPECÍFICAS:
- Priorize leitura de impacto econômico concreto, e não apenas descrição de valores
- Relacione volume financeiro, quantidade de beneficiários e possível efeito sobre comércio, consumo ou renda local
- Evite inferências causais fortes sem base suficiente
- Valorize concentração, dependência e estabilidade da injeção de recursos no território
- Quando possível, destaque implicações para desenvolvimento local, planejamento econômico e articulação institucional
- Não tratar qualquer valor elevado como benefício econômico amplo sem observar distribuição

O QUE BUSCAR:
- peso econômico de determinados fluxos na economia local
- dependência de renda transferida
- estabilidade ou fragilidade da circulação de recursos
- sinais de concentração com baixo espalhamento
- oportunidades para políticas de desenvolvimento e formalização

EVITE:
- frases genéricas sobre "movimentar a economia"
- leitura excessivamente otimista
- confundir impacto potencial com efeito comprovado

FORMATO DE SAÍDA:
Responda APENAS com um JSON array contendo exatamente 5 strings em português.
Cada string deve ser um insight estratégico completo, com no máximo 2 linhas.
Sem texto adicional.
"""

_DATASET_PROMPT_MAP = {
    "geral": _PROMPT_BASE,
    "arrecadacao": _PROMPT_ARRECADACAO,
    "bolsa_familia": _PROMPT_PROTECAO_SOCIAL,
    "pe_de_meia": _PROMPT_EDUCACAO,
    "inss": _PROMPT_PROGRAMAS_GOV,
}


def _build_prompt(dataset: str, municipio, dataset_label: str, dados_json: str) -> str:
    template = _DATASET_PROMPT_MAP.get(dataset, _PROMPT_IMPACTO_ECONOMICO)
    body = template.format(nome=municipio.nome, estado=municipio.estado)
    tipo_leitura = "Análise histórica e estrutural"
    return (
        body
        + _QUALITY_FILTER
        + f"\nENTRADA:\n"
        + f"Tipo de leitura: {tipo_leitura}\n"
        + f"Dataset: {dataset_label}\n"
        + f"Cidade: {municipio.nome} ({municipio.estado})\n"
        + f"Dados: {dados_json}"
    )


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

    prompt = _build_prompt(dataset, municipio, dataset_label, dados_json)

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=MODEL,
        max_tokens=700,
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
