from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    Base declarativa central do SQLAlchemy.

    ⚠️ IMPORTANTE:
    NÃO importar models aqui para evitar circular imports.
    Os models devem ser carregados via app.models (models/__init__.py).
    """

    pass
