from typing import Dict, Optional

from pydantic import BaseModel


class MunicipioBase(BaseModel):
    nome: str
    estado: str
    codigo_ibge: Optional[str] = None
    ativo: bool = True
    # When True, this município is hidden from cross-município analytics.
    # Sentinel `None` (the default on Create) means "decide based on
    # whether a clone source was provided" — auto-set to True if cloning.
    is_demo: Optional[bool] = None


class MunicipioCreate(MunicipioBase):
    # If set, clone all dataset rows from the source município into the
    # newly-created município after it is persisted. When cloning AND
    # is_demo wasn't explicitly provided, the new município is marked as
    # demo by default.
    clone_from_id: Optional[int] = None


class MunicipioUpdate(BaseModel):
    nome: Optional[str] = None
    estado: Optional[str] = None
    codigo_ibge: Optional[str] = None
    ativo: Optional[bool] = None
    plano: Optional[str] = None
    brasao: Optional[str] = None
    is_demo: Optional[bool] = None


class MunicipioOut(BaseModel):
    id: int
    nome: str
    estado: str
    codigo_ibge: Optional[str]
    ativo: bool
    plano: str = "paid"
    brasao: Optional[str] = None
    is_demo: bool = False

    class Config:
        from_attributes = True


class MunicipioCreatedResult(BaseModel):
    """Response shape for POST /municipios when clone_from_id may be set.

    `clone_summary` is None when no clone was requested, otherwise maps
    each model class name to the number of rows copied.
    """
    municipio: MunicipioOut
    clone_summary: Optional[Dict[str, int]] = None


class MunicipioDeletedResult(BaseModel):
    deleted: int
    summary: Dict[str, int]
