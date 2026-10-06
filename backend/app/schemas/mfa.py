from datetime import datetime

from pydantic import BaseModel, Field


class MfaStatusOut(BaseModel):
    ativo: bool
    ativado_em: datetime | None = None
    codigos_restantes: int = 0


class MfaConfigurarOut(BaseModel):
    otpauth_url: str
    segredo: str
    qr_svg: str


class MfaCodigoIn(BaseModel):
    codigo: str = Field(min_length=6, max_length=12)


class MfaDesativarIn(BaseModel):
    senha_atual: str
    codigo: str = Field(min_length=6, max_length=12)


class MfaAtivarOut(BaseModel):
    codigos_recuperacao: list[str]


class MfaVerificarIn(BaseModel):
    mfa_token: str
    codigo: str = Field(min_length=6, max_length=12)
