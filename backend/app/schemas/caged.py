from pydantic import BaseModel


class CagedItem(BaseModel):
    ano: int
    mes: int
    admissões: int
    desligamentos: int
    saldo: int


class CagedResumo(BaseModel):
    total_admissoes: int
    total_desligamentos: int
    saldo_total: int


class CagedSexoItem(BaseModel):
    ano: int
    mes: int
    sexo: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedRacaItem(BaseModel):
    ano: int
    mes: int
    raca_cor: str
    admissoes: int
    desligamentos: int
    saldo: int


class CagedSalarioItem(BaseModel):
    ano: int
    mes: int
    salario_medio_admissoes: float | None
    salario_medio_desligamentos: float | None


class CagedCnaeItem(BaseModel):
    ano: int
    mes: int
    secao: str
    descricao_secao: str
    admissoes: int
    desligamentos: int
    saldo: int
