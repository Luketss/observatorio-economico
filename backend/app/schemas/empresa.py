from pydantic import BaseModel
from datetime import date
from typing import Optional


class EmpresaOut(BaseModel):
    cnpj_basico: str
    razao_social: str
    nome_fantasia: Optional[str]
    situacao: Optional[str]
    data_inicio: Optional[date]
    cnae_fiscal: Optional[str]
    porte: Optional[str]
    capital_social: Optional[float]
    opcao_simples: bool
    opcao_mei: bool


class EmpresaResumo(BaseModel):
    total_empresas: int
    total_ativas: int
    total_mei: int
    total_simples: int


class EmpresaPorPorteItem(BaseModel):
    porte: str
    total: int


class EmpresaPorCnaeItem(BaseModel):
    cnae_fiscal: str
    total: int
