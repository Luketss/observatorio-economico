from typing import List

from app.api.deps import get_current_user, get_db, require_role
from app.models.dataset_info import DatasetInfo
from app.schemas.dataset_info import DatasetInfoOut, DatasetInfoUpdate
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/dataset-info", tags=["Dataset Info"])


@router.get("", response_model=DatasetInfoOut)
def get_info(
    dataset: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    info = db.query(DatasetInfo).filter(DatasetInfo.dataset == dataset).first()
    if not info:
        return DatasetInfoOut(dataset=dataset, titulo="", conteudo="")
    return info


@router.get("/all", response_model=List[DatasetInfoOut])
def list_info(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return db.query(DatasetInfo).order_by(DatasetInfo.dataset).all()


@router.put("/{dataset}", response_model=DatasetInfoOut)
def upsert_info(
    dataset: str,
    data: DatasetInfoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    fields = data.model_dump(exclude_unset=True)

    info = db.query(DatasetInfo).filter(DatasetInfo.dataset == dataset).first()
    if not info:
        info = DatasetInfo(dataset=dataset)
        db.add(info)

    for key, value in fields.items():
        setattr(info, key, value)

    db.commit()
    db.refresh(info)
    return info


@router.delete("/{dataset}")
def delete_info(
    dataset: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    info = db.query(DatasetInfo).filter(DatasetInfo.dataset == dataset).first()
    if not info:
        raise HTTPException(status_code=404, detail="Dataset info não encontrado.")
    db.delete(info)
    db.commit()
    return {"ok": True}
