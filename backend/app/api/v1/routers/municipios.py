from typing import List

from app.api.deps import get_current_user, get_db, require_role
from app.models.municipio import Municipio
from app.schemas.municipio import (
    DatasetDeletedResult,
    DatasetDescriptor,
    MunicipioCreate,
    MunicipioCreatedResult,
    MunicipioDatasetSummary,
    MunicipioDeletedResult,
    MunicipioOut,
    MunicipioUpdate,
)
from app.services.municipio_management import (
    DATASET_LABELS,
    DATASET_REGISTRY,
    clone_municipio_data,
    count_dataset_rows_for_municipio,
    delete_dataset_for_municipio,
    delete_municipio_cascade,
)
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
# Criar município (opcionalmente clonando dados de outro)
# ==============================
@router.post("/", response_model=MunicipioCreatedResult)
def criar_municipio(
    data: MunicipioCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    # When the caller is cloning AND didn't explicitly set is_demo, default
    # to True — cloning is overwhelmingly used to create demo data. The
    # caller can still pass is_demo=False explicitly to opt out.
    is_demo_resolved = (
        data.is_demo
        if data.is_demo is not None
        else (data.clone_from_id is not None)
    )

    novo = Municipio(
        nome=data.nome,
        estado=data.estado,
        codigo_ibge=data.codigo_ibge,
        ativo=data.ativo,
        is_demo=is_demo_resolved,
    )

    db.add(novo)
    db.commit()
    db.refresh(novo)

    clone_summary = None
    if data.clone_from_id is not None:
        # If cloning fails the new município row stays; admin can delete it.
        clone_summary = clone_municipio_data(
            db, source_id=data.clone_from_id, target_id=novo.id
        )

    return MunicipioCreatedResult(municipio=novo, clone_summary=clone_summary)


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


# ==============================
# Excluir município (cascade — wipes 55 dependent tables)
# ==============================
@router.delete("/{municipio_id}", response_model=MunicipioDeletedResult)
def excluir_municipio(
    municipio_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    summary = delete_municipio_cascade(db, municipio_id)
    return MunicipioDeletedResult(deleted=municipio_id, summary=summary)


# ==============================
# Datasets — catalog + per-município row counts + per-dataset wipe
# ==============================
@router.get("/datasets", response_model=List[DatasetDescriptor])
def listar_datasets(current_user=Depends(get_current_user)):
    """Catalog of all datasets the admin can target. Open to any logged-in
    user (cheap metadata)."""
    return [
        DatasetDescriptor(key=key, label=DATASET_LABELS.get(key, key))
        for key in DATASET_REGISTRY.keys()
    ]


@router.get(
    "/{municipio_id}/datasets-summary",
    response_model=MunicipioDatasetSummary,
)
def resumir_datasets_municipio(
    municipio_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    counts = count_dataset_rows_for_municipio(db, municipio_id)
    return MunicipioDatasetSummary(municipio_id=municipio_id, counts=counts)


@router.delete(
    "/{municipio_id}/datasets/{dataset_key}",
    response_model=DatasetDeletedResult,
)
def excluir_dataset_municipio(
    municipio_id: int,
    dataset_key: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    summary = delete_dataset_for_municipio(db, municipio_id, dataset_key)
    return DatasetDeletedResult(
        municipio_id=municipio_id,
        dataset_key=dataset_key,
        summary=summary,
    )
