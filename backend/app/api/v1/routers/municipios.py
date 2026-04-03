from typing import List

from app.api.deps import get_current_user, get_db, require_role
from app.models.municipio import Municipio
from app.schemas.municipio import MunicipioCreate, MunicipioOut, MunicipioUpdate
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/municipios", tags=["Municípios"])


# ==============================
# Listar municípios
# ==============================
@router.get("", response_model=List[MunicipioOut])
def listar_municipios(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # ADMIN_GLOBAL vê todos
    if current_user.role.nome == "ADMIN_GLOBAL":
        municipios = db.query(Municipio).all()
    else:
        municipios = (
            db.query(Municipio).filter(Municipio.id == current_user.municipio_id).all()
        )

    return municipios


# ==============================
# Criar município
# ==============================
@router.post("/", response_model=MunicipioOut)
def criar_municipio(
    data: MunicipioCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    novo = Municipio(
        nome=data.nome,
        estado=data.estado,
        codigo_ibge=data.codigo_ibge,
        ativo=data.ativo,
    )

    db.add(novo)
    db.commit()
    db.refresh(novo)

    return novo


# ==============================
# Atualizar município
# ==============================
@router.put("/{municipio_id}", response_model=MunicipioOut)
def atualizar_municipio(
    municipio_id: int,
    data: MunicipioUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    municipio = db.get(Municipio, municipio_id)

    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(municipio, field, value)

    db.commit()
    db.refresh(municipio)

    return municipio
