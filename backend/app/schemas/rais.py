from pydantic import BaseModel


class RaisItem(BaseModel):
    ano: int
    total_vinculos: int
    setor: str | None


class RaisResumo(BaseModel):
    total_vinculos: int
