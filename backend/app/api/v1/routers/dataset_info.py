from app.api.deps import get_current_user, get_db
from app.models.dataset_info import DatasetInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/dataset-info", tags=["Dataset Info"])


class DatasetInfoOut(BaseModel):
    dataset: str
    titulo: str
    conteudo: str

    class Config:
        from_attributes = True


class DatasetInfoUpdate(BaseModel):
    titulo: str
    conteudo: str


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


@router.put("/{dataset}", response_model=DatasetInfoOut)
def upsert_info(
    dataset: str,
    data: DatasetInfoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.nome != "ADMIN_GLOBAL":
        raise HTTPException(status_code=403, detail="Acesso negado.")

    info = db.query(DatasetInfo).filter(DatasetInfo.dataset == dataset).first()
    if not info:
        info = DatasetInfo(dataset=dataset, titulo=data.titulo, conteudo=data.conteudo)
        db.add(info)
    else:
        info.titulo = data.titulo
        info.conteudo = data.conteudo

    db.commit()
    db.refresh(info)
    return info
