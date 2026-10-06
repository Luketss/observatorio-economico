from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class MfaStatusOut(BaseModel):
    ativo: bool
    ativado_em: datetime | None = None
    codigos_restantes: int = 0
    metodo: str | None = None  # "totp" | "email" | None (sem MFA ativo)


class MfaConfigurarIn(BaseModel):
    metodo: Literal["totp", "email"] = "totp"


class MfaConfigurarOut(BaseModel):
    metodo: str
    # TOTP
    otpauth_url: str | None = None
    segredo: str | None = None
    qr_svg: str | None = None
    # e-mail
    enviado_para: str | None = None


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


class MfaReenviarIn(BaseModel):
    mfa_token: str
