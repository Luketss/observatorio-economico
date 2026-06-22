from sqlalchemy.orm import Session
from app.models.municipio import Municipio


def normalizar_nome(nome: str) -> str:
    return nome.strip().replace("_", " ").upper()


def obter_ou_criar_municipio(db: Session, nome: str, estado: str, codigo_ibge: str | None = None) -> Municipio:
    if codigo_ibge:
        m = db.query(Municipio).filter(Municipio.codigo_ibge == codigo_ibge).first()
        if m:
            return m
    municipio = db.query(Municipio).filter(Municipio.nome == nome, Municipio.estado == estado).first()
    if not municipio:
        municipio = Municipio(nome=nome, estado=estado, codigo_ibge=codigo_ibge, ativo=True)
        db.add(municipio)
        db.commit()
        db.refresh(municipio)
    return municipio
