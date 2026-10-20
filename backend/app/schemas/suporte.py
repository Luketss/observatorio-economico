import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

STATUS_VALIDOS = ("aberto", "em_atendimento", "resolvido")
CANAIS = ("email", "whatsapp")


def normalizar_whatsapp(valor: str | None) -> str | None:
    """Normaliza para digitos com DDI 55; vazio vira None."""
    if valor is None or not valor.strip():
        return None
    digitos = re.sub(r"\D", "", valor)
    # "+" explicito indica DDI: so o +55 e aceito
    if valor.strip().startswith("+") and not digitos.startswith("55"):
        raise ValueError("Informe um numero brasileiro com DDD")
    if len(digitos) in (10, 11):
        return "55" + digitos
    if len(digitos) in (12, 13) and digitos.startswith("55"):
        return digitos
    raise ValueError("Informe um numero brasileiro com DDD")


class TicketCreate(BaseModel):
    mensagem: str
    whatsapp: str | None = None
    canal_preferido: Literal["email", "whatsapp"] = "email"

    @field_validator("mensagem")
    @classmethod
    def validar_mensagem(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Descreva sua solicitacao com pelo menos 10 caracteres")
        if len(v) > 4000:
            raise ValueError("Descreva sua solicitacao com no maximo 4000 caracteres")
        return v

    @field_validator("whatsapp")
    @classmethod
    def validar_whatsapp(cls, v: str | None) -> str | None:
        return normalizar_whatsapp(v)

    @model_validator(mode="after")
    def canal_whatsapp_exige_numero(self) -> "TicketCreate":
        if self.canal_preferido == "whatsapp" and not self.whatsapp:
            raise ValueError("Informe o WhatsApp para ser contatado por esse canal")
        return self


class TicketMeuOut(BaseModel):
    id: int
    mensagem: str
    whatsapp: str | None
    canal_preferido: str
    status: str
    criado_em: datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}


class EventoOut(BaseModel):
    id: int
    tipo: str
    status_de: str | None
    status_para: str | None
    texto: str | None
    autor_email: str
    criado_em: datetime

    model_config = {"from_attributes": True}


class TicketAdminOut(BaseModel):
    id: int
    usuario_id: int | None
    usuario_nome: str
    usuario_email: str
    usuario_role: str
    municipio_id: int | None
    municipio_nome: str | None
    mensagem: str
    whatsapp: str | None
    canal_preferido: str
    status: str
    criado_em: datetime
    atualizado_em: datetime
    primeiro_contato_em: datetime | None
    resolvido_em: datetime | None

    model_config = {"from_attributes": True}


class TicketAdminDetalheOut(TicketAdminOut):
    eventos: list[EventoOut]


class StatusUpdate(BaseModel):
    status: Literal["aberto", "em_atendimento", "resolvido"]
    texto: str | None = None

    @field_validator("texto")
    @classmethod
    def validar_texto(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if len(v) > 2000:
            raise ValueError("O texto deve ter no maximo 2000 caracteres")
        return v or None


class AnotacaoCreate(BaseModel):
    texto: str

    @field_validator("texto")
    @classmethod
    def validar_texto(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Escreva a anotacao")
        if len(v) > 2000:
            raise ValueError("A anotacao deve ter no maximo 2000 caracteres")
        return v


class KpisOut(BaseModel):
    abertos: int
    em_atendimento: int
    abertos_30d: int
    resolvidos_30d: int
    tempo_medio_primeiro_contato_horas: float | None
