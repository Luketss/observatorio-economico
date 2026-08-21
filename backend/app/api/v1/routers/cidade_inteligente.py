"""Cidade Inteligente — acompanhamento genérico de certificações de cidade.
Escrita por permissão de área + tenancy inline (moldes da Gestão Empresarial/F3).
Gate de plano fica no front via NAV_FLAT."""
from app.api.deps import get_current_user, get_db
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.cidade_inteligente import CertificacaoCidade, CertificacaoRequisito
from app.models.usuario import Usuario
from app.schemas.cidade_inteligente import (
    CertificacaoCreate,
    CertificacaoOut,
    CertificacaoResumoOut,
    CertificacaoUpdate,
    RequisitoCreate,
    RequisitoOut,
    RequisitoUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session, selectinload

router = APIRouter(prefix="/cidade-inteligente", tags=["Cidade Inteligente"])


def _assert_write(user: Usuario, verbo: str):
    from app.core.permissions import tem_permissao

    if not tem_permissao(user.role, "cidade_inteligente", verbo):
        raise ForbiddenException(f"Sem permissão para {verbo} em cidade_inteligente")


def _exigir_municipio(current_user: Usuario) -> None:
    """Criação usa o município do usuário — ADMIN_GLOBAL não tem um."""
    if current_user.municipio_id is None:
        raise ForbiddenException("ADMIN_GLOBAL não possui município associado")


def _normaliza_evidencia(url: str | None) -> str | None:
    """Mesma regra do link do marco: http(s) ou 400; '' limpa (vira None)."""
    if url is None:
        return None
    url = url.strip()
    if not url:
        return None
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Evidência deve começar com http:// ou https://.")
    return url


def _resumo_query(db: Session):
    return (
        db.query(
            CertificacaoCidade,
            func.count(CertificacaoRequisito.id).label("total"),
            func.sum(case((CertificacaoRequisito.status == "atendido", 1), else_=0)).label("atendidos"),
            func.sum(case((CertificacaoRequisito.status == "em_andamento", 1), else_=0)).label("em_andamento"),
            func.sum(case((CertificacaoRequisito.status == "pendente", 1), else_=0)).label("pendentes"),
        )
        .outerjoin(CertificacaoRequisito, CertificacaoRequisito.certificacao_id == CertificacaoCidade.id)
        .group_by(CertificacaoCidade.id)
    )


def _resumo_out(cert, total, atendidos, em_andamento, pendentes) -> CertificacaoResumoOut:
    return CertificacaoResumoOut(
        id=cert.id, nome=cert.nome, entidade=cert.entidade, descricao=cert.descricao,
        total=int(total or 0), atendidos=int(atendidos or 0),
        em_andamento=int(em_andamento or 0), pendentes=int(pendentes or 0),
    )


@router.get("/certificacoes", response_model=list[CertificacaoResumoOut])
def listar_certificacoes(
    municipio_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    q = _resumo_query(db).filter(CertificacaoCidade.ativo.is_(True))
    if current_user.role.nome != "ADMIN_GLOBAL":
        q = q.filter(CertificacaoCidade.municipio_id == current_user.municipio_id)
    elif municipio_id is not None:
        q = q.filter(CertificacaoCidade.municipio_id == municipio_id)
    else:
        return []
    linhas = q.order_by(CertificacaoCidade.nome).all()
    return [_resumo_out(*linha) for linha in linhas]


@router.get("/certificacoes/{cert_id}", response_model=CertificacaoOut)
def detalhe_certificacao(
    cert_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    cert = (
        db.query(CertificacaoCidade)
        .options(selectinload(CertificacaoCidade.requisitos))
        .filter(CertificacaoCidade.id == cert_id)
        .first()
    )
    if not cert:
        raise NotFoundException("Certificação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    reqs = sorted(cert.requisitos, key=lambda r: ((r.categoria or "").lower(), r.titulo.lower()))
    contagem = {"atendido": 0, "em_andamento": 0, "pendente": 0}
    for r in reqs:
        contagem[r.status] = contagem.get(r.status, 0) + 1
    return CertificacaoOut(
        id=cert.id, nome=cert.nome, entidade=cert.entidade, descricao=cert.descricao,
        total=len(reqs), atendidos=contagem["atendido"],
        em_andamento=contagem["em_andamento"], pendentes=contagem["pendente"],
        requisitos=[RequisitoOut.model_validate(r) for r in reqs],
    )


@router.post("/certificacoes", response_model=CertificacaoResumoOut)
def criar_certificacao(
    data: CertificacaoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "criar")
    _exigir_municipio(current_user)
    cert = CertificacaoCidade(municipio_id=current_user.municipio_id, **data.model_dump())
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return _resumo_out(cert, 0, 0, 0, 0)


@router.put("/certificacoes/{cert_id}", response_model=CertificacaoResumoOut)
def atualizar_certificacao(
    cert_id: int,
    data: CertificacaoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "editar")
    cert = db.get(CertificacaoCidade, cert_id)
    if not cert:
        raise NotFoundException("Certificação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cert, field, value)
    db.commit()
    db.refresh(cert)
    linha = _resumo_query(db).filter(CertificacaoCidade.id == cert.id).first()
    return _resumo_out(*linha)


@router.delete("/certificacoes/{cert_id}")
def excluir_certificacao(
    cert_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "excluir")
    cert = db.get(CertificacaoCidade, cert_id)
    if not cert:
        raise NotFoundException("Certificação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(cert)
    db.commit()
    return {"ok": True}


@router.post("/certificacoes/{cert_id}/requisitos", response_model=RequisitoOut)
def adicionar_requisito(
    cert_id: int,
    data: RequisitoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "editar")
    cert = db.get(CertificacaoCidade, cert_id)
    if not cert:
        raise NotFoundException("Certificação não encontrada")
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    payload = data.model_dump()
    payload["evidencia_url"] = _normaliza_evidencia(payload.get("evidencia_url"))
    req = CertificacaoRequisito(certificacao_id=cert.id, **payload)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.put("/requisitos/{req_id}", response_model=RequisitoOut)
def atualizar_requisito(
    req_id: int,
    data: RequisitoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "editar")
    req = db.get(CertificacaoRequisito, req_id)
    if not req:
        raise NotFoundException("Requisito não encontrado")
    cert = db.get(CertificacaoCidade, req.certificacao_id)
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    campos = data.model_dump(exclude_unset=True)
    if "evidencia_url" in campos:
        campos["evidencia_url"] = _normaliza_evidencia(campos["evidencia_url"])
    for field, value in campos.items():
        setattr(req, field, value)
    db.commit()
    db.refresh(req)
    return req


@router.delete("/requisitos/{req_id}")
def excluir_requisito(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _assert_write(current_user, "editar")
    req = db.get(CertificacaoRequisito, req_id)
    if not req:
        raise NotFoundException("Requisito não encontrado")
    cert = db.get(CertificacaoCidade, req.certificacao_id)
    if current_user.role.nome != "ADMIN_GLOBAL" and cert.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Acesso negado")
    db.delete(req)
    db.commit()
    return {"ok": True}
