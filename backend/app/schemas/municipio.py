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


class DatasetDescriptor(BaseModel):
    """A dataset key + human-readable label, listed by GET /municipios/datasets."""
    key: str
    label: str


class MunicipioDatasetSummary(BaseModel):
    """Row counts per dataset for one município (for the Datasets admin page)."""
    municipio_id: int
    counts: Dict[str, int]


class DatasetDeletedResult(BaseModel):
    """Response shape for DELETE /municipios/{id}/datasets/{key}."""
    municipio_id: int
    dataset_key: str
    summary: Dict[str, int]


class IngestaoDeletedResult(BaseModel):
    """Response shape for DELETE /municipios/{id}/datasets — wipes every
    dataset (the whole ingestion) for the município, keeping operational data
    and the município row."""
    municipio_id: int
    summary: Dict[str, int]


class SanidadeItem(BaseModel):
    """One data-sanity finding for a município."""
    dataset: str
    nivel: str  # 'ok' | 'aviso' | 'erro'
    mensagem: str


class ReingestResult(BaseModel):
    """Response shape for POST /municipios/{id}/datasets/{key}/reingest."""
    municipio_id: int
    dataset_key: str
    linhas_removidas: int
    linhas_inseridas: int
    detalhe: Optional[str] = None


class MunicipioSelecionavel(BaseModel):
    """Projeção mínima para seletores de comparação — sem campos administrativos."""
    id: int
    nome: str
    estado: str

    model_config = {"from_attributes": True}
