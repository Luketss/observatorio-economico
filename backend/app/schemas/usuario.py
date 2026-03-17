from typing import Optional

from pydantic import BaseModel, EmailStr


class UsuarioBase(BaseModel):
    nome: str
    email: EmailStr
    municipio_id: Optional[int]
    role_id: int
    ativo: bool = True


class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    municipio_id: Optional[int]
    role_id: int


class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    senha: Optional[str] = None
    municipio_id: Optional[int] = None
    role_id: Optional[int] = None
    ativo: Optional[bool] = None


class UsuarioOut(BaseModel):
    id: int
    nome: str
    email: EmailStr
    municipio_id: Optional[int]
    role: str
    ativo: bool

    class Config:
        from_attributes = True
