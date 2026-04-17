from typing import List

from app.api.deps import get_current_user, get_db
from app.models.empresa import Empresa
from app.schemas.empresa import EmpresaResumo, EmpresaPorPorteItem, EmpresaPorCnaeItem
from fastapi import APIRouter, Depends
from sqlalchemy import func, case
from sqlalchemy.orm import Session

PORTE_LABELS = {
    "00": "Não informado",
    "01": "Micro",
    "03": "Pequena",
    "05": "Média",
    "07": "Grande",
}

SITUACAO_LABELS = {
    "01": "Nula",
    "02": "Ativa",
    "03": "Suspensa",
    "04": "Inapta",
    "08": "Baixada",
}

# CNAE division (2 digits) → section description
CNAE_SECAO = {
    "01": "Agricultura, pecuária e produção florestal", "02": "Agricultura, pecuária e produção florestal",
    "03": "Pesca e aquicultura",
    "05": "Extração de carvão mineral", "06": "Extração de petróleo e gás natural",
    "07": "Extração de minerais metálicos", "08": "Extração de minerais não metálicos",
    "09": "Atividades de apoio à extração de minerais",
    "10": "Fabricação de produtos alimentícios", "11": "Fabricação de bebidas",
    "12": "Fabricação de produtos do fumo", "13": "Fabricação de produtos têxteis",
    "14": "Confecção de artigos do vestuário", "15": "Fabricação de calçados e artefatos de couro",
    "16": "Fabricação de produtos de madeira", "17": "Fabricação de celulose e papel",
    "18": "Impressão e reprodução", "19": "Fabricação de coque e derivados de petróleo",
    "20": "Fabricação de produtos químicos", "21": "Fabricação de produtos farmoquímicos",
    "22": "Fabricação de produtos de borracha e plástico", "23": "Fabricação de minerais não metálicos",
    "24": "Metalurgia", "25": "Fabricação de produtos de metal",
    "26": "Fabricação de equipamentos de informática e eletrônicos",
    "27": "Fabricação de máquinas e equipamentos elétricos",
    "28": "Fabricação de máquinas e equipamentos",
    "29": "Fabricação de veículos automotores", "30": "Fabricação de outros equipamentos de transporte",
    "31": "Fabricação de móveis", "32": "Fabricação de produtos diversos",
    "33": "Manutenção e reparação de máquinas",
    "35": "Eletricidade e gás", "36": "Captação e distribuição de água",
    "37": "Esgoto e atividades relacionadas", "38": "Coleta e tratamento de resíduos",
    "39": "Descontaminação e outros serviços",
    "41": "Construção de edifícios", "42": "Obras de infraestrutura",
    "43": "Serviços especializados para construção",
    "45": "Comércio e reparação de veículos automotores",
    "46": "Comércio por atacado", "47": "Comércio varejista",
    "49": "Transporte terrestre", "50": "Transporte aquaviário",
    "51": "Transporte aéreo", "52": "Armazenamento e atividades auxiliares",
    "53": "Correio e outras atividades de entrega",
    "55": "Alojamento", "56": "Alimentação",
    "58": "Edição", "59": "Atividades cinematográficas e musicais",
    "60": "Atividades de rádio e televisão", "61": "Telecomunicações",
    "62": "Atividades de TI e informática", "63": "Prestação de serviços de informação",
    "64": "Atividades de serviços financeiros", "65": "Seguros e previdência",
    "66": "Atividades auxiliares dos serviços financeiros",
    "68": "Atividades imobiliárias",
    "69": "Atividades jurídicas e contábeis", "70": "Atividades das sedes de empresas",
    "71": "Arquitetura e engenharia", "72": "Pesquisa e desenvolvimento",
    "73": "Publicidade e pesquisa de mercado", "74": "Outras atividades profissionais",
    "75": "Atividades veterinárias",
    "77": "Aluguéis e gestão de bens", "78": "Seleção e agenciamento de mão-de-obra",
    "79": "Agências de viagem", "80": "Atividades de vigilância e segurança",
    "81": "Serviços para edifícios e paisagismo", "82": "Serviços de escritório e apoio",
    "84": "Administração pública e seguridade social",
    "85": "Educação",
    "86": "Atividades de atenção à saúde humana", "87": "Atividades de atenção residencial",
    "88": "Serviços sociais sem alojamento",
    "90": "Atividades artísticas, criativas e de espetáculos",
    "91": "Atividades de bibliotecas, arquivos e museus",
    "92": "Atividades de jogos de azar", "93": "Atividades esportivas e de lazer",
    "94": "Atividades de organizações associativas",
    "95": "Reparação de computadores e objetos pessoais",
    "96": "Outras atividades de serviços pessoais",
    "97": "Serviços domésticos",
    "99": "Organismos internacionais",
}

router = APIRouter(prefix="/empresas", tags=["Empresas"])


@router.get("/resumo", response_model=EmpresaResumo)
def resumo_empresas(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(Empresa)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    registros = query.all()
    total = len(registros)
    ativas = sum(1 for r in registros if r.situacao == "02")
    mei = sum(1 for r in registros if r.opcao_mei)
    simples = sum(1 for r in registros if r.opcao_simples)
    return EmpresaResumo(total_empresas=total, total_ativas=ativas, total_mei=mei, total_simples=simples)


@router.get("/por_porte", response_model=List[EmpresaPorPorteItem])
def por_porte(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(Empresa.porte, func.count(Empresa.id).label("total"))
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    resultados = query.group_by(Empresa.porte).order_by(func.count(Empresa.id).desc()).all()
    return [
        EmpresaPorPorteItem(
            porte=PORTE_LABELS.get(r.porte or "00", r.porte or "Não informado"),
            total=r.total,
        )
        for r in resultados
    ]


@router.get("/por_cnae", response_model=List[EmpresaPorCnaeItem])
def por_cnae(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(Empresa.cnae_fiscal, func.count(Empresa.id).label("total"))
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    resultados = (
        query.filter(Empresa.cnae_fiscal.isnot(None))
        .group_by(Empresa.cnae_fiscal)
        .order_by(func.count(Empresa.id).desc())
        .limit(10)
        .all()
    )
    return [EmpresaPorCnaeItem(cnae_fiscal=r.cnae_fiscal, total=r.total) for r in resultados]


@router.get("/por_situacao")
def por_situacao(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Count of companies grouped by situacao (active, closed, etc.)."""
    query = db.query(Empresa.situacao, func.count(Empresa.id).label("total"))
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    resultados = query.group_by(Empresa.situacao).order_by(func.count(Empresa.id).desc()).all()
    return [
        {
            "label": SITUACAO_LABELS.get(r.situacao or "", r.situacao or "Não informado"),
            "situacao": r.situacao or "",
            "total": r.total,
        }
        for r in resultados
    ]


@router.get("/situacao_por_porte")
def situacao_por_porte(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Per-porte breakdown of active vs. closed companies."""
    query = db.query(
        Empresa.porte,
        func.count(Empresa.id).label("total"),
        func.sum(case((Empresa.situacao == "02", 1), else_=0)).label("ativas"),
        func.sum(case((Empresa.situacao != "02", 1), else_=0)).label("fechadas"),
    )
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    resultados = query.group_by(Empresa.porte).order_by(func.count(Empresa.id).desc()).all()
    return [
        {
            "porte": PORTE_LABELS.get(r.porte or "00", r.porte or "Não informado"),
            "total": r.total,
            "ativas": r.ativas or 0,
            "fechadas": r.fechadas or 0,
            "saldo": (r.ativas or 0) - (r.fechadas or 0),
        }
        for r in resultados
    ]


@router.get("/por_cnae_secao")
def por_cnae_secao(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Count of companies by CNAE 2-digit division with human-readable description."""
    query = db.query(Empresa.cnae_fiscal, func.count(Empresa.id).label("total"))
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    resultados = (
        query.filter(Empresa.cnae_fiscal.isnot(None))
        .group_by(Empresa.cnae_fiscal)
        .order_by(func.count(Empresa.id).desc())
        .all()
    )
    # Aggregate by 2-digit division
    divisoes: dict = {}
    for r in resultados:
        div = (r.cnae_fiscal or "")[:2]
        label = CNAE_SECAO.get(div, f"Divisão {div}")
        if label not in divisoes:
            divisoes[label] = 0
        divisoes[label] += r.total
    return sorted(
        [{"descricao": k, "total_vinculos": v} for k, v in divisoes.items()],
        key=lambda x: x["total_vinculos"],
        reverse=True,
    )[:20]


@router.get("/capital_por_porte")
def capital_por_porte(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Average and total capital social grouped by porte (active companies only)."""
    query = db.query(
        Empresa.porte,
        func.avg(Empresa.capital_social).label("capital_medio"),
        func.sum(Empresa.capital_social).label("capital_total"),
        func.count(Empresa.id).label("total"),
    ).filter(Empresa.capital_social.isnot(None), Empresa.capital_social > 0)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Empresa.municipio_id == current_user.municipio_id)
    resultados = query.group_by(Empresa.porte).order_by(func.sum(Empresa.capital_social).desc()).all()
    return [
        {
            "porte": PORTE_LABELS.get(r.porte or "00", r.porte or "Não informado"),
            "capital_medio": round(r.capital_medio or 0, 2),
            "capital_total": round(r.capital_total or 0, 2),
            "total": r.total,
        }
        for r in resultados
    ]


@router.get("/comparativo")
def comparativo_empresas(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models.municipio import Municipio
    from app.models.empresa import Empresa
    from sqlalchemy import func

    resultados = (
        db.query(
            Municipio.nome.label("municipio"),
            Municipio.id.label("municipio_id"),
            func.count(Empresa.id).label("total_empresas"),
        )
        .join(Empresa, Empresa.municipio_id == Municipio.id)
        .filter(Empresa.situacao == "02")
        .group_by(Municipio.nome, Municipio.id)
        .order_by(func.count(Empresa.id).desc())
        .all()
    )
    return [
        {"municipio": r.municipio, "municipio_id": r.municipio_id, "total_empresas": r.total_empresas or 0}
        for r in resultados
    ]
