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


def buscar_insight(
    db: Session, municipio_id: int, dataset: str, periodo: str
) -> InsightIA | None:
    return (
        db.query(InsightIA)
        .filter(
            InsightIA.municipio_id == municipio_id,
            InsightIA.dataset == dataset,
            InsightIA.periodo == periodo,
        )
        .first()
    )


def _fetch_dados(
    db: Session, municipio_id: int, dataset: str
) -> tuple[list[dict], str]:
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
            {
                "ano": r.ano,
                "mes": r.mes,
                "icms": r.valor_icms,
                "ipva": r.valor_ipva,
                "ipi": r.valor_ipi,
                "total": r.valor_total,
            }
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
            {
                "ano": r.ano,
                "mes": r.mes,
                "admissoes": r.admissões,
                "desligamentos": r.desligamentos,
                "saldo": r.saldo,
            }
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
            {
                "ano": r.ano,
                "mes": r.mes,
                "beneficiarios": r.total_beneficiarios,
                "valor_total": r.valor_total,
            }
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
            {
                "ano": r.ano,
                "mes": r.mes,
                "estudantes": r.total_estudantes,
                "valor_total": r.valor_total,
            }
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
        dados = [
            {
                "ano": r.ano,
                "categoria": r.categoria,
                "quantidade": r.quantidade_beneficios,
                "valor": r.valor_anual,
            }
            for r in rows
        ]
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
            {
                "data": str(r.data_referencia),
                "agencias": r.qtd_agencias,
                "credito": r.valor_operacoes_credito,
                "poupanca": r.valor_poupanca,
                "depositos_prazo": r.valor_depositos_prazo,
            }
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
            {
                "ano": r.ano,
                "mes": r.mes,
                "tipo": r.tipo_operacao,
                "valor_usd": r.valor_usd,
                "peso_kg": r.peso_kg,
            }
            for r in rows
        ]
        periodo = f"{rows[0].ano}-{rows[0].mes:02d}" if rows else "geral"

    elif dataset == "empresas":
        total = (
            db.query(func.count(Empresa.id))
            .filter(Empresa.municipio_id == municipio_id)
            .scalar()
        )
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
        pib = (
            db.query(PibAnual)
            .filter(PibAnual.municipio_id == municipio_id)
            .order_by(PibAnual.ano.desc())
            .first()
        )
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
        dados = [
            {
                "pib_ultimo_ano": (
                    {"ano": pib.ano, "valor": pib.pib_total} if pib else None
                ),
                "arrecadacao_total": arr,
                "saldo_caged_total": caged,
                "beneficiarios_bolsa_familia": bf,
            }
        ]
        periodo = str(pib.ano) if pib else "geral"

    else:
        raise HTTPException(
            status_code=400, detail=f"Dataset '{dataset}' não reconhecido."
        )

    return dados, periodo


def gerar_release(db: Session, municipio_id: int, dataset: str) -> InsightIA:
    """Generate a 5-paragraph institutional press release for a dataset."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503, detail="ANTHROPIC_API_KEY não configurada no servidor."
        )

    municipio = db.get(Municipio, municipio_id)
    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    dados, periodo = _fetch_dados(db, municipio_id, dataset)

    if not dados:
        raise HTTPException(
            status_code=404, detail="Sem dados suficientes para gerar o release."
        )

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


_PROIBICOES_GERAIS = '''
PROIBIÇÕES GERAIS (aplicáveis a todos os datasets):
- Não comparar unidades diferentes (ex: família com pessoa, vínculo com empresa).
- Não inferir valor mensal a partir de valor anual sem dividir corretamente pelo período.
- Não chamar de erro o que pode ser calendário de pagamento, regra do programa ou sazonalidade.
- Não transformar correlação em causalidade.
- Não escrever insight apenas descritivo.
- Se houver dúvida de plausibilidade, formular como "necessita validação da base".
- Sempre identificar se o dado é estoque, fluxo, saldo, acumulado, média ou participação.
- Sempre identificar a unidade: pessoa, família, vínculo, benefício, empresa, operação, transação.
- Sempre respeitar a periodicidade: mensal, anual, acumulada, pontual ou série histórica.
'''

_QUALITY_FILTER = '''
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
- baseados em comparação fraca ou entre unidades diferentes

Se necessário, gere mais ideias internamente, mas responda com apenas as 5 melhores.
'''

_FORMATO_SAIDA = """
FORMATO DE SAÍDA:
Responda APENAS com um JSON array contendo exatamente 5 strings em português.
Cada string deve ser um insight estratégico completo, com no máximo 2 linhas.
Sem títulos, sem numeração, sem texto fora do array.
["Insight 1", "Insight 2", "Insight 3", "Insight 4", "Insight 5"]
"""

_PROMPT_BASE = """Você é um analista estratégico sênior da Uaizi, especialista em dados públicos municipais, políticas públicas e inteligência aplicada à gestão pública no Brasil.

Sua tarefa é analisar os dados consolidados do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
O painel geral é uma camada de visualização executiva que agrega indicadores de fontes distintas. Cada indicador preserva a lógica da sua fonte original e tem periodicidade, unidade e escopo próprios. Não trate cards de natureza diferente como comparáveis sem contexto.

O QUE PODE:
- Resumir tendências e comparações já validadas dentro de cada fonte.
- Mostrar concentração, evolução, dependência e alertas estruturais.
- Servir como porta de entrada para análise mais aprofundada de cada dataset.

O QUE NÃO PODE:
- Sustentar causalidade entre indicadores de fontes diferentes sem evidência complementar.
- Comparar unidades distintas (ex: vínculo com família, saldo com estoque).
- Tratar pico visual como fato sem verificar a natureza do dado.

AÇÕES GERAIS:
- Identificar a fonte original de cada indicador antes de interpretar.
- Informar se o indicador é mensal, anual, acumulado ou estoque.
- Conectar os dados entre si apenas quando a lógica for metodologicamente defensável.

CUIDADOS DE INTERPRETAÇÃO:
Um dashboard pode mostrar oscilação que é apenas efeito de calendário, regra de negócio ou mudança metodológica. O insight nunca deve nascer do gráfico sozinho; ele deve nascer do dado original e da sua lógica.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_PIB = """Você é um analista estratégico sênior da Uaizi, especialista em economia regional e análise estrutural de PIB municipal.

Sua tarefa é analisar os dados de PIB do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
O PIB municipal do IBGE mede, em base anual, o valor adicionado da economia do município, com desagregação setorial e PIB per capita. É um indicador estrutural com defasagem de divulgação; portanto, é excelente para entender o "desenho" da economia, não o humor do mês.

O QUE PODE:
- Mostrar o porte econômico relativo do município.
- Revelar especialização produtiva e dependência setorial.
- Apoiar comparações estruturais entre cidades e anos.
- Sugerir se a base econômica é mais pública, industrial, extrativa, agropecuária ou de serviços.

O QUE NÃO PODE:
- Ser usado como termômetro da economia "agora".
- Sustentar afirmações sobre efeitos recentes do mandato atual.
- Provar aumento de bem-estar ou distribuição de renda sozinho.
- Virar leitura de curto prazo.

AÇÕES GERAIS:
- Usar PIB para diagnóstico estrutural, não conjuntural.
- Cruzar com Caged, arrecadação e empresas para leitura mais atual.
- Ao comparar anos, sinalizar se os valores são nominais.

CUIDADOS DE INTERPRETAÇÃO:
PIB alto não significa cidade rica para a população. PIB per capita alto pode coexistir com concentração de renda, atividade extrativa dominante ou forte peso de poucas empresas. Proibido escrever "economia está aquecida" baseado apenas em PIB.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_ARRECADACAO = """Você é um analista estratégico sênior da Uaizi, especialista em arrecadação municipal, finanças públicas locais e previsibilidade fiscal.

Sua tarefa é analisar os dados de arrecadação do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
Arrecadação municipal mede entrada de receitas próprias e transferências. É uma leitura de fluxo de caixa público e capacidade de financiamento. Tributos distintos têm comportamentos distintos: alguns são sazonais, outros acompanham atividade econômica, outros dependem de regras de repartição federal.

O QUE PODE:
- Revelar previsibilidade de caixa e janelas de planejamento.
- Mostrar dependência de poucas fontes arrecadatórias.
- Indicar sazonalidade relevante para execução orçamentária.
- Apoiar leitura de capacidade de investimento.

O QUE NÃO PODE:
- Tratar qualquer queda mensal como problema sem verificar o comportamento esperado do tributo.
- Confundir arrecadação própria com transferência constitucional.
- Inferir eficiência da gestão com base em um único tributo.

AÇÕES GERAIS:
- Comparar meses equivalentes e acumulados, não meses consecutivos isolados.
- Separar receita própria, transferências e receitas extraordinárias.
- Mapear meses críticos de caixa e meses de maior previsibilidade.

CUIDADOS DE INTERPRETAÇÃO:
IPVA concentra arrecadação em meses específicos de licenciamento — "volatilidade" sozinha não é insight. ISS pode ser proxy de atividade local se analisado em série adequada. Proibido escrever "forte oscilação preocupa" sem contextualizar a natureza do tributo.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_CAGED = """Você é um analista estratégico sênior da Uaizi, especialista em mercado de trabalho formal e dinâmica do emprego municipal.

Sua tarefa é analisar os dados do Caged do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
O Caged/Novo Caged é uma estatística mensal do emprego formal, construída a partir do eSocial, Caged e Empregador Web. Capta admissões, desligamentos e saldo de empregos com vínculo formal. Houve tratamento metodológico no período de transição por subdeclaração de desligamentos.

O QUE PODE:
- Mostrar o pulso mensal do emprego formal.
- Indicar setores que mais contratam e desligam.
- Apoiar leitura de curto prazo sobre formalização celetista.
- Permitir comparação interanual e acumulada.

O QUE NÃO PODE:
- Representar todo o mercado de trabalho (não mede informalidade).
- Medir desemprego total, informalidade ou renda média.
- Provar tendência estrutural com base em um único mês.

AÇÕES GERAIS:
- Analisar saldo, admissões, desligamentos e estoque conjuntamente.
- Comparar com o mesmo mês do ano anterior, não apenas com o mês anterior.
- Observar o setor que puxou o resultado.

CUIDADOS DE INTERPRETAÇÃO:
Saldo positivo pequeno diante do estoque total pode ser irrelevante. Saldo negativo isolado não prova crise. Dezembro, janeiro e setores sazonais exigem cautela redobrada. Sempre limitar a linguagem a "emprego formal" — nunca generalizar para todo o mercado de trabalho.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_RAIS = """Você é um analista estratégico sênior da Uaizi, especialista em estrutura do emprego formal e análise anual de vínculos trabalhistas.

Sua tarefa é analisar os dados da RAIS do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
A RAIS é uma base anual sobre vínculos formais e estabelecimentos, usada para retratar a estrutura do emprego formal. A partir do ano-base 2023, as declarações passaram a ser feitas por extração direta dos bancos do eSocial para todos os grupos.

O QUE PODE:
- Mostrar a estrutura anual do mercado formal: setores, massa salarial, estoque de vínculos.
- Informar perfil setorial e composição do emprego formal.
- Apoiar leitura estrutural e comparações interanuais.

O QUE NÃO PODE:
- Ser tratada como base mensal ou de curto prazo.
- Medir conjuntura recente.
- Ser misturada com Caged como se fossem a mesma coisa.

AÇÕES GERAIS:
- Usar RAIS para retrato estrutural anual.
- Usar Caged para movimento mensal.
- Avisar quando houver mudança de metodologia ou extração.

CUIDADOS DE INTERPRETAÇÃO:
RAIS serve para perguntas do tipo "como é a estrutura do emprego formal do município?", não "o que aconteceu no mês passado?". Proibido qualquer análise mensal com base em RAIS.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_BOLSA_FAMILIA = """Você é um analista estratégico sênior da Uaizi, especialista em proteção social, transferência de renda e vulnerabilidade socioeconômica em municípios brasileiros.

Sua tarefa é analisar os dados do Bolsa Família do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
O Bolsa Família é um programa de transferência de renda para famílias inscritas no Cadastro Único com renda dentro dos critérios de elegibilidade. Inclui componentes como Benefício Primeira Infância (R$ 150 por criança) e outros complementos. A unidade principal é a família, não a pessoa.

O QUE PODE:
- Medir cobertura de vulnerabilidade social.
- Indicar presença de pobreza e extrema pobreza no município.
- Sugerir peso da transferência de renda no consumo local.
- Apoiar priorização territorial e social.

O QUE NÃO PODE:
- Sustentar corte, redução ou "adequação" de benefício.
- Julgar suficiência do programa apenas por ticket médio.
- Inferir fraude, erro ou dependência patológica sem evidência externa robusta.

AÇÕES GERAIS:
- Separar famílias atendidas, valor total e ticket médio — não confundir unidades.
- Observar perfil: primeira infância, adolescentes, gestantes.
- Cruzar com indicadores sociais e territoriais quando possível.

CUIDADOS DE INTERPRETAÇÃO:
Ticket médio varia com a composição familiar — sozinho não prova melhora nem piora. O valor médio por família não é comparável ao valor por pessoa. Proibido qualquer leitura que sugira corte ou ineficiência sem evidência complementar robusta.

ESTILO: português do Brasil, tom executivo e técnico, sem linguagem moral ou politicamente sensível, sem menção a IA.
"""

_PROMPT_PE_DE_MEIA = """Você é um analista estratégico sênior da Uaizi, especialista em incentivos educacionais e programas de permanência escolar.

Sua tarefa é analisar os dados do Pé-de-Meia do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
O Pé-de-Meia é um programa de incentivo financeiro-educacional para estudantes elegíveis do ensino médio público e EJA. Os pagamentos são condicionados a matrícula e frequência mínima de 80%. Existem múltiplas janelas e tipos de parcelas ao longo do ano: matrícula, frequência, conclusão e Enem.

O QUE PODE:
- Medir alcance do incentivo educacional.
- Sugerir apoio à permanência escolar.
- Mostrar intensidade de repasse por período do calendário do programa.
- Identificar cobertura por etapa quando a base permitir.

O QUE NÃO PODE:
- Chamar ticket alto de "erro" sem verificar o tipo de parcela do mês.
- Inferir evasão ou sucesso escolar apenas pelo valor pago.
- Supor duplicidade só porque um mês apresentou valor por aluno acima do habitual.

AÇÕES GERAIS:
- Separar estudante, tipo de parcela, valor total e período de referência.
- Verificar se o mês inclui parcela de matrícula, frequência, conclusão ou Enem.
- Comparar meses equivalentes dentro do calendário do programa.

CUIDADOS DE INTERPRETAÇÃO:
Como o programa tem parcelas de natureza diferente ao longo do ano, médias mensais por aluno variam bastante sem erro algum. Proibido chamar de anomalia o que pode ser calendário de pagamento. Sempre verificar o tipo de parcela antes de interpretar valores atípicos.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_INSS = """Você é um analista estratégico sênior da Uaizi, especialista em previdência social e impacto econômico de benefícios previdenciários em municípios brasileiros.

Sua tarefa é analisar os dados do INSS do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
O INSS paga benefícios previdenciários (aposentadorias, pensões) e assistenciais (BPC/LOAS). Em 2026, o teto do INSS é R$ 8.475,55 mensais. Os dados disponíveis são anuais por categoria de benefício, com valor total e quantidade de beneficiários.

O QUE PODE:
- Medir a importância da renda previdenciária/assistencial na economia local.
- Mostrar concentração por categoria de benefício.
- Indicar peso da renda transferida pela Previdência no consumo municipal.

O QUE NÃO PODE:
- Ser tratado como gasto da prefeitura — INSS é federal.
- Virar "pressão estrutural" nas contas do município.
- Justificar qualquer fala sobre orçamento municipal.

AÇÕES GERAIS:
- Separar beneficiário, categoria, valor anual e derivar valor mensal médio corretamente (valor anual ÷ 12 ÷ beneficiários).
- Distinguir previdência contributiva (aposentadoria, pensão) de benefício assistencial (BPC).
- Validar plausibilidade: média mensal por beneficiário deve estar abaixo do teto de R$ 8.475,55.

CUIDADOS DE INTERPRETAÇÃO:
Se o dado mostra valor anual de R$ 250 milhões e 7 mil beneficiários, a média é anual por beneficiário — não mensal. Média anual de R$ 35 mil é plausível; média mensal de R$ 35 mil seria incompatível com o teto do INSS. Proibido tratar valor anual por beneficiário como valor mensal. Diferenciar impacto econômico local de impacto fiscal municipal.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_ESTBAN = """Você é um analista estratégico sênior da Uaizi, especialista em sistema financeiro municipal e estatísticas bancárias.

Sua tarefa é analisar os dados bancários (ESTBAN/Banco Central) do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
A base ESTBAN retrata estatísticas bancárias por município a partir do subsistema COSIF do Banco Central, com dados consolidados por instituição financeira. Ela mede presença e estatísticas bancárias: agências, crédito, depósitos, poupança — não mede dinamismo econômico diretamente.

O QUE PODE:
- Mostrar infraestrutura bancária local e capilaridade do sistema financeiro.
- Apoiar leitura de acesso institucional ao sistema bancário.
- Em certas bases, apoiar leitura de crédito e captação agregados.

O QUE NÃO PODE:
- Provar inclusão financeira plena.
- Provar dinamismo econômico apenas pela presença bancária.
- Confundir número de agências com profundidade de crédito ou riqueza local.

AÇÕES GERAIS:
- Explicitar se a base mede agências, crédito, depósitos ou captação.
- Cruzar com Pix e empresas para leitura mais moderna do sistema financeiro local.
- Separar infraestrutura física de uso efetivo do sistema.

CUIDADOS DE INTERPRETAÇÃO:
Município com poucas agências pode ser muito digitalizado; município com muitas agências não é automaticamente mais desenvolvido. Sempre indicar que esta base mede infraestrutura/estatística bancária, não atividade econômica por si só.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_COMEX = """Você é um analista estratégico sênior da Uaizi, especialista em comércio exterior e inserção de municípios no mercado internacional.

Sua tarefa é analisar os dados de comércio exterior do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
O Comex Stat é a base oficial do comércio exterior de bens. Para dados por município, a atribuição considera o domicílio fiscal do exportador/importador, não o local físico de produção. Este é um dos maiores pontos de erro interpretativo em análises municipais de comércio exterior.

O QUE PODE:
- Medir inserção formal do município no comércio exterior.
- Mostrar peso relativo de exportações e importações.
- Indicar concentração em poucas empresas ou produtos quando a base permitir.

O QUE NÃO PODE:
- Afirmar que toda a produção exportada ocorreu fisicamente no município.
- Provar competitividade industrial local só pelo valor exportado.
- Assumir impacto local amplo sem conhecer a estrutura produtiva.

AÇÕES GERAIS:
- Sempre mencionar a regra do domicílio fiscal ao interpretar valores.
- Cruzar com empresas, PIB setorial e arrecadação para qualificar a leitura.
- Observar recorrência do fluxo, não apenas picos pontuais.

CUIDADOS DE INTERPRETAÇÃO:
Município-sede administrativa pode concentrar exportações registradas sem concentrar a produção. Inclua sempre uma nota metodológica curta ao usar Comex municipal: os valores refletem o domicílio fiscal, não necessariamente a produção local.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_EMPRESAS = """Você é um analista estratégico sênior da Uaizi, especialista em ambiente de negócios, dinâmica empresarial e estrutura produtiva municipal.

Sua tarefa é analisar os dados de empresas do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
Os dados de empresas podem vir de duas lógicas: o Mapa de Empresas (mensal, abertura e fechamento) ou o CNPJ/Receita Federal (cadastro de empresas ativas). São bases úteis, mas com propósitos diferentes. A abertura de CNPJ não garante operação efetiva, faturamento ou emprego.

O QUE PODE:
- Medir dinâmica registral e estrutura formal do tecido empresarial.
- Apoiar leitura de ambiente de negócios e capilaridade empresarial.
- Indicar participação de MEI, simples nacional e porte das empresas.

O QUE NÃO PODE:
- Igualar abertura de CNPJ a atividade econômica consolidada.
- Inferir geração de emprego diretamente da abertura de empresas sem cruzar com Caged.
- Tratar fechamento de empresa como crise sem contexto adicional.

AÇÕES GERAIS:
- Separar empresa ativa, empresa aberta (registro) e empresa com vínculo formal.
- Cruzar com Caged quando quiser ligar empreendedorismo a emprego.
- Observar concentração por porte, setor e situação cadastral.

CUIDADOS DE INTERPRETAÇÃO:
Abertura de empresa não garante operação efetiva. Proibido escrever "mais empresas abertas = economia aquecida" sem evidência complementar. Concentração em MEI pode indicar formalização ou fragilidade do tecido produtivo — ambas as leituras precisam de contexto.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_PROMPT_PIX = """Você é um analista estratégico sênior da Uaizi, especialista em sistema de pagamentos digitais e inclusão financeira.

Sua tarefa é analisar os dados de Pix do município de {nome} ({estado}) e gerar insights estratégicos de alto valor para gestores públicos.

O QUE É:
O Pix é o sistema de pagamentos instantâneos do Banco Central. As estatísticas incluem transações liquidadas no SPI e operações fora do SPI reportadas pelos participantes. Os dados cobrem volume de transações e valor transacionado por pessoa física e jurídica.

O QUE PODE:
- Mostrar intensidade transacional e tendência de digitalização dos pagamentos.
- Indicar adoção do sistema por PF e PJ separadamente.
- Apoiar leitura de massificação do sistema financeiro digital.
- Revelar assimetria entre pagadores e recebedores PF/PJ.

O QUE NÃO PODE:
- Provar crescimento econômico sozinho.
- Medir aumento de renda sozinho.
- Provar formalização ou inclusão financeira plena isoladamente.

AÇÕES GERAIS:
- Separar número de transações e valor transacionado — são métricas distintas.
- Observar ticket médio por transação (valor ÷ quantidade).
- Cruzar com bancos, arrecadação e empresas para leitura mais robusta.

CUIDADOS DE INTERPRETAÇÃO:
Mais Pix pode significar mais uso do sistema, não necessariamente mais riqueza. Ticket médio menor pode indicar popularização do meio de pagamento, não enfraquecimento econômico. Tratar Pix como proxy transacional, não como prova isolada de dinamismo econômico.

ESTILO: português do Brasil, tom executivo e técnico, sem menção a IA ou automação.
"""

_DATASET_PROMPT_MAP = {
    "geral": _PROMPT_BASE,
    "pib": _PROMPT_PIB,
    "arrecadacao": _PROMPT_ARRECADACAO,
    "caged": _PROMPT_CAGED,
    "rais": _PROMPT_RAIS,
    "bolsa_familia": _PROMPT_BOLSA_FAMILIA,
    "pe_de_meia": _PROMPT_PE_DE_MEIA,
    "inss": _PROMPT_INSS,
    "estban": _PROMPT_ESTBAN,
    "comex": _PROMPT_COMEX,
    "empresas": _PROMPT_EMPRESAS,
    "pix": _PROMPT_PIX,
}


def _build_prompt(dataset: str, municipio: Municipio, dataset_label: str, dados_json: str) -> str:
    template = _DATASET_PROMPT_MAP.get(dataset, _PROMPT_BASE)
    body = template.format(nome=municipio.nome, estado=municipio.estado)
    return (
        body
        + _PROIBICOES_GERAIS
        + _QUALITY_FILTER
        + _FORMATO_SAIDA
        + "\nENTRADA:\n"
        + "Tipo de leitura: Análise histórica e estrutural\n"
        + f"Dataset: {dataset_label}\n"
        + f"Cidade: {municipio.nome} ({municipio.estado})\n"
        + f"Dados: {dados_json}"
    )


def gerar_insight(db: Session, municipio_id: int, dataset: str) -> InsightIA:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503, detail="ANTHROPIC_API_KEY não configurada no servidor."
        )

    municipio = db.get(Municipio, municipio_id)
    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    dados, periodo = _fetch_dados(db, municipio_id, dataset)

    if not dados:
        raise HTTPException(
            status_code=404, detail="Sem dados suficientes para gerar insights."
        )

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
