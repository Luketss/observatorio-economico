from pydantic import BaseModel, Field


class EsqueciSenhaIn(BaseModel):
    email: str = Field(min_length=3, max_length=150)


class RedefinirSenhaIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    nova_senha: str = Field(min_length=6)  # mesma regra de /auth/alterar-senha
