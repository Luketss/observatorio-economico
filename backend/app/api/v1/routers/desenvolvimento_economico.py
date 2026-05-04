from datetime import date
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, get_db
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.desenvolvimento_economico import (
    CaptacaoRecurso,
    EmpresaRetencao,
    EscritaProjeto,
    InvestimentoFunil,
    Premiacao,
    VisitaRetencao,
)
from app.models.usuario import Usuario
from app.schemas.desenvolvimento_economico import (
    CaptacaoRecursoCreate,
    CaptacaoRecursoOut,
    CaptacaoRecursoUpdate,
    EmpresaRetencaoCreate,
    EmpresaRetencaoLeanOut,
    EmpresaRetencaoOut,
    EmpresaRetencaoUpdate,
    EscritaProjetoCreate,
    EscritaProjetoOut,
    EscritaProjetoUpdate,
    FunilResumo,
    InvestimentoFunilCreate,
    InvestimentoFunilOut,
    InvestimentoFunilUpdate,
    PremiacaoCreate,
    PremiacaoOut,
    PremiacaoUpdate,
    VisitaRetencaoCreate,
    VisitaRetencaoOut,
)

router = APIRouter(prefix="/desenvolvimento-economico", tags=["Desenvolvimento Econômico"])

ESTAGIOS_FUNIL = ["lead", "contato", "negociacao", "implantacao"]


def _check_pode_escrever(current_user: Usuario) -> None:
    role = current_user.role.nome
    if role == "VISUALIZADOR":
        raise ForbiddenException("Acesso negado")
    if role == "ADMIN_GLOBAL":
        raise ForbiddenException("ADMIN_GLOBAL não possui município associado")


def _municipio_id(current_user: Usuario) -> int:
    return current_user.municipio_id  # type: ignore[return-value]


def _apply_tenant(query, model, current_user: Usuario):
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(model.municipio_id == current_user.municipio_id)
    return query


# ── 3.1 Funil de Investimentos ─────────────────────────────────────────────

@router.get("/funil/resumo", response_model=FunilResumo)
def resumo_funil(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _apply_tenant(db.query(InvestimentoFunil), InvestimentoFunil, current_user)
    items = query.all()
    por_estagio = {e: 0 for e in ESTAGIOS_FUNIL}
    valor_total = 0.0
    for item in items:
        if item.estagio in por_estagio:
            por_estagio[item.estagio] += 1
        valor_total += item.valor_estimado or 0.0
    total = len(items)
    implantados = por_estagio.get("implantacao", 0)
    taxa = round(implantados / total * 100, 1) if total else 0.0
    return FunilResumo(por_estagio=por_estagio, valor_total_estimado=valor_total, taxa_conversao=taxa)


@router.get("/funil", response_model=List[InvestimentoFunilOut])
def listar_funil(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _apply_tenant(db.query(InvestimentoFunil), InvestimentoFunil, current_user)
    return query.order_by(InvestimentoFunil.criado_em.desc()).all()


@router.post("/funil", response_model=InvestimentoFunilOut)
def criar_funil(
    data: InvestimentoFunilCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = InvestimentoFunil(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/funil/{item_id}", response_model=InvestimentoFunilOut)
def atualizar_funil(
    item_id: int,
    data: InvestimentoFunilUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = db.get(InvestimentoFunil, item_id)
    if not item:
        raise NotFoundException("Lead não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/funil/{item_id}")
def deletar_funil(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = db.get(InvestimentoFunil, item_id)
    if not item:
        raise NotFoundException("Lead não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── 3.2 Retenção & Expansão ────────────────────────────────────────────────

@router.get("/retencao", response_model=List[EmpresaRetencaoLeanOut])
def listar_retencao(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _apply_tenant(db.query(EmpresaRetencao), EmpresaRetencao, current_user)
    return query.order_by(EmpresaRetencao.nome).all()


@router.get("/retencao/{empresa_id}", response_model=EmpresaRetencaoOut)
def detalhe_retencao(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    empresa = (
        db.query(EmpresaRetencao)
        .options(selectinload(EmpresaRetencao.visitas))
        .filter(EmpresaRetencao.id == empresa_id)
        .first()
    )
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    empresa.visitas.sort(key=lambda v: v.data_visita)
    return empresa


@router.post("/retencao", response_model=EmpresaRetencaoLeanOut)
def criar_retencao(
    data: EmpresaRetencaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    empresa = EmpresaRetencao(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return empresa


@router.put("/retencao/{empresa_id}", response_model=EmpresaRetencaoLeanOut)
def atualizar_retencao(
    empresa_id: int,
    data: EmpresaRetencaoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(empresa, field, value)
    db.commit()
    db.refresh(empresa)
    return empresa


@router.delete("/retencao/{empresa_id}")
def deletar_retencao(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(empresa)
    db.commit()
    return {"ok": True}


@router.post("/retencao/{empresa_id}/visitas", response_model=VisitaRetencaoOut)
def adicionar_visita(
    empresa_id: int,
    data: VisitaRetencaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    empresa = db.get(EmpresaRetencao, empresa_id)
    if not empresa:
        raise NotFoundException("Empresa não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and empresa.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    visita = VisitaRetencao(
        **data.model_dump(),
        empresa_id=empresa_id,
        municipio_id=empresa.municipio_id,
    )
    db.add(visita)
    db.commit()
    db.refresh(visita)
    return visita


@router.delete("/retencao/visitas/{visita_id}")
def deletar_visita(
    visita_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    visita = db.get(VisitaRetencao, visita_id)
    if not visita:
        raise NotFoundException("Visita não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and visita.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(visita)
    db.commit()
    return {"ok": True}


# ── 3.3 Captação de Recursos ───────────────────────────────────────────────

@router.get("/captacao", response_model=List[CaptacaoRecursoOut])
def listar_captacao(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _apply_tenant(db.query(CaptacaoRecurso), CaptacaoRecurso, current_user)
    return query.order_by(CaptacaoRecurso.criado_em.desc()).all()


@router.post("/captacao", response_model=CaptacaoRecursoOut)
def criar_captacao(
    data: CaptacaoRecursoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = CaptacaoRecurso(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/captacao/{item_id}", response_model=CaptacaoRecursoOut)
def atualizar_captacao(
    item_id: int,
    data: CaptacaoRecursoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = db.get(CaptacaoRecurso, item_id)
    if not item:
        raise NotFoundException("Oportunidade não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/captacao/{item_id}")
def deletar_captacao(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = db.get(CaptacaoRecurso, item_id)
    if not item:
        raise NotFoundException("Oportunidade não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── 3.4 Escrita de Projetos ────────────────────────────────────────────────

@router.get("/escrita", response_model=List[EscritaProjetoOut])
def listar_escrita(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _apply_tenant(db.query(EscritaProjeto), EscritaProjeto, current_user)
    return query.order_by(EscritaProjeto.criado_em.desc()).all()


@router.post("/escrita", response_model=EscritaProjetoOut)
def criar_escrita(
    data: EscritaProjetoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = EscritaProjeto(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/escrita/{item_id}", response_model=EscritaProjetoOut)
def atualizar_escrita(
    item_id: int,
    data: EscritaProjetoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = db.get(EscritaProjeto, item_id)
    if not item:
        raise NotFoundException("Projeto não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/escrita/{item_id}")
def deletar_escrita(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = db.get(EscritaProjeto, item_id)
    if not item:
        raise NotFoundException("Projeto não encontrado")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ── 3.5 Premiações ─────────────────────────────────────────────────────────

@router.get("/premiacoes", response_model=List[PremiacaoOut])
def listar_premiacoes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = _apply_tenant(db.query(Premiacao), Premiacao, current_user)
    return query.order_by(Premiacao.criado_em.desc()).all()


@router.post("/premiacoes", response_model=PremiacaoOut)
def criar_premiacao(
    data: PremiacaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = Premiacao(
        **data.model_dump(),
        municipio_id=_municipio_id(current_user),
        criado_por=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/premiacoes/{item_id}", response_model=PremiacaoOut)
def atualizar_premiacao(
    item_id: int,
    data: PremiacaoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = db.get(Premiacao, item_id)
    if not item:
        raise NotFoundException("Premiação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/premiacoes/{item_id}")
def deletar_premiacao(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _check_pode_escrever(current_user)
    item = db.get(Premiacao, item_id)
    if not item:
        raise NotFoundException("Premiação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and item.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(item)
    db.commit()
    return {"ok": True}
