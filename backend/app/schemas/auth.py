from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    id: int
    nome: str
    email: str
    municipio_id: int | None
    role: str
    ativo: bool

    class Config:
        from_attributes = True
