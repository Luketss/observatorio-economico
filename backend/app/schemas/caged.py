from pydantic import BaseModel


class CagedItem(BaseModel):
    ano: int
    mes: int
    admissões: int
    desligamentos: int
    saldo: int
    setor: str | None


class CagedResumo(BaseModel):
    total_admissoes: int
    total_desligamentos: int
    saldo_total: int
