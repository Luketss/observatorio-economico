from pydantic import BaseModel, Field


class AuthenticatedUser(BaseModel):
    id: int
    nome: str
    email: str
    municipio_id: int | None
    estado: str | None = None
    role: str
    ativo: bool
    permissoes: dict = {}

    class Config:
        from_attributes = True


class AlterarSenhaPayload(BaseModel):
    senha_atual: str
    nova_senha: str = Field(min_length=6)
