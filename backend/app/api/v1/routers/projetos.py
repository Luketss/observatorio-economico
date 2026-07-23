from typing import List, Optional

from app.api.deps import get_current_user, get_db, require_permissao, require_role
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.projeto import Projeto, ProjetoEixo, ProjetoImagemPreset, ProjetoTemplate
from app.models.usuario import Usuario
from app.schemas.projeto import (
    EixoCreate,
    EixoOut,
    EixoUpdate,
    ImagemPresetCreate,
    ImagemPresetOut,
    ProjetoCreate,
    ProjetoOut,
    ProjetoTemplateCreate,
    ProjetoTemplateOut,
    ProjetoTemplateUpdate,
    ProjetoUpdate,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/projetos", tags=["Projetos"])

MAX_IMAGEM_PRESETS = 6


# ── Imagens de capa (presets globais, ADMIN_GLOBAL) ─────────────────────────────

@router.get("/imagens", response_model=List[ImagemPresetOut])
def listar_imagens(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(ProjetoImagemPreset).order_by(ProjetoImagemPreset.ordem, ProjetoImagemPreset.id).all()


@router.post("/imagens", response_model=ImagemPresetOut)
def criar_imagem(
    data: ImagemPresetCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    total = db.query(ProjetoImagemPreset).count()
    if total >= MAX_IMAGEM_PRESETS:
        raise HTTPException(
            status_code=400,
            detail=f"Limite de {MAX_IMAGEM_PRESETS} imagens de capa atingido. Remova uma antes de adicionar outra.",
        )
    preset = ProjetoImagemPreset(**data.model_dump())
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


@router.delete("/imagens/{imagem_id}")
def deletar_imagem(
    imagem_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    preset = db.get(ProjetoImagemPreset, imagem_id)
    if not preset:
        raise NotFoundException("Imagem not found")
    # Detach from any eixo using it (FK is SET NULL, but be explicit/portable).
    db.query(ProjetoEixo).filter(ProjetoEixo.imagem_id == imagem_id).update(
        {ProjetoEixo.imagem_id: None}, synchronize_session=False
    )
    db.delete(preset)
    db.commit()
    return {"ok": True}


# ── Eixos ─────────────────────────────────────────────────────────────────────

@router.get("/eixos", response_model=List[EixoOut])
def listar_eixos(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(ProjetoEixo).order_by(ProjetoEixo.ordem, ProjetoEixo.nome).all()


@router.post("/eixos", response_model=EixoOut)
def criar_eixo(
    data: EixoCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    eixo = ProjetoEixo(**data.model_dump())
    db.add(eixo)
    db.commit()
    db.refresh(eixo)
    return eixo


@router.put("/eixos/{eixo_id}", response_model=EixoOut)
def atualizar_eixo(
    eixo_id: int,
    data: EixoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    eixo = db.get(ProjetoEixo, eixo_id)
    if not eixo:
        raise NotFoundException("Eixo not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(eixo, field, value)
    db.commit()
    db.refresh(eixo)
    return eixo


@router.delete("/eixos/{eixo_id}")
def deletar_eixo(
    eixo_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    eixo = db.get(ProjetoEixo, eixo_id)
    if not eixo:
        raise NotFoundException("Eixo not found")
    db.delete(eixo)
    db.commit()
    return {"ok": True}


# ── Acervo (templates) ────────────────────────────────────────────────────────

@router.get("/acervo", response_model=List[ProjetoTemplateOut])
def listar_acervo(
    eixo_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(ProjetoTemplate)
    if eixo_id:
        query = query.filter(ProjetoTemplate.eixo_id == eixo_id)
    return query.order_by(ProjetoTemplate.criado_em.desc()).all()


@router.post("/acervo", response_model=ProjetoTemplateOut)
def criar_template(
    data: ProjetoTemplateCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    tmpl = ProjetoTemplate(**data.model_dump(), criado_por=current_user.id)
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return tmpl


@router.put("/acervo/{template_id}", response_model=ProjetoTemplateOut)
def atualizar_template(
    template_id: int,
    data: ProjetoTemplateUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    tmpl = db.get(ProjetoTemplate, template_id)
    if not tmpl:
        raise NotFoundException("Template not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tmpl, field, value)
    db.commit()
    db.refresh(tmpl)
    return tmpl


@router.delete("/acervo/{template_id}")
def deletar_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role("ADMIN_GLOBAL")),
):
    tmpl = db.get(ProjetoTemplate, template_id)
    if not tmpl:
        raise NotFoundException("Template not found")
    db.delete(tmpl)
    db.commit()
    return {"ok": True}


@router.post("/acervo/{template_id}/selecionar", response_model=ProjetoOut)
def selecionar_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("projetos", "criar")),
):
    if current_user.municipio_id is None:
        raise ForbiddenException("ADMIN_GLOBAL não possui município associado")
    tmpl = db.get(ProjetoTemplate, template_id)
    if not tmpl:
        raise NotFoundException("Template not found")
    if not tmpl.eixo_id:
        raise ForbiddenException("Este modelo não possui eixo associado e não pode ser selecionado")
    projeto = Projeto(
        eixo_id=tmpl.eixo_id,
        municipio_id=current_user.municipio_id,
        template_id=tmpl.id,
        titulo=tmpl.titulo,
        descricao=tmpl.descricao,
        conteudo=tmpl.conteudo,
        status="nao_iniciado",
        criado_por=current_user.id,
    )
    db.add(projeto)
    db.commit()
    db.refresh(projeto)
    return projeto


# ── Projetos (Acompanhamento) ─────────────────────────────────────────────────

@router.get("", response_model=List[ProjetoOut])
def listar_projetos(
    eixo_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    query = db.query(Projeto)
    if current_user.role.nome != "ADMIN_GLOBAL":
        query = query.filter(Projeto.municipio_id == current_user.municipio_id)
    if eixo_id:
        query = query.filter(Projeto.eixo_id == eixo_id)
    return query.order_by(Projeto.criado_em.desc()).all()


@router.post("", response_model=ProjetoOut)
def criar_projeto(
    data: ProjetoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("projetos", "criar")),
):
    if current_user.municipio_id is None:
        raise ForbiddenException("ADMIN_GLOBAL não possui município associado")
    projeto = Projeto(
        **data.model_dump(),
        municipio_id=current_user.municipio_id,
        criado_por=current_user.id,
    )
    db.add(projeto)
    db.commit()
    db.refresh(projeto)
    return projeto


@router.put("/{projeto_id}", response_model=ProjetoOut)
def atualizar_projeto(
    projeto_id: int,
    data: ProjetoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("projetos", "editar")),
):
    projeto = db.get(Projeto, projeto_id)
    if not projeto:
        raise NotFoundException("Projeto not found")
    if current_user.role.nome != "ADMIN_GLOBAL" and projeto.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Insufficient permissions")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(projeto, field, value)
    db.commit()
    db.refresh(projeto)
    return projeto


@router.delete("/{projeto_id}")
def deletar_projeto(
    projeto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_permissao("projetos", "excluir")),
):
    projeto = db.get(Projeto, projeto_id)
    if not projeto:
        raise NotFoundException("Projeto not found")
    if current_user.role.nome != "ADMIN_GLOBAL" and projeto.municipio_id != current_user.municipio_id:
        raise ForbiddenException("Insufficient permissions")
    db.delete(projeto)
    db.commit()
    return {"ok": True}
