from typing import Generic, Optional, Sequence, Type, TypeVar

from app.db.base import Base
from sqlalchemy import select
from sqlalchemy.orm import Session

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """
    Base repository with common CRUD operations.
    Enterprise-ready foundation for data access layer.
    """

    def __init__(self, model: Type[ModelType], session: Session):
        self.model = model
        self.session = session

    def get_by_id(self, id: int) -> Optional[ModelType]:
        return self.session.get(self.model, id)

    def list(self, skip: int = 0, limit: int = 100) -> tuple[Sequence[ModelType], int]:
        total = self.session.query(self.model).count()

        stmt = select(self.model).offset(skip).limit(limit)
        items = self.session.scalars(stmt).all()

        return items, total

    def create(self, obj_in: dict) -> ModelType:
        db_obj = self.model(**obj_in)
        self.session.add(db_obj)
        self.session.commit()
        self.session.refresh(db_obj)
        return db_obj

    def update(self, db_obj: ModelType, updates: dict) -> ModelType:
        for field, value in updates.items():
            setattr(db_obj, field, value)

        self.session.add(db_obj)
        self.session.commit()
        self.session.refresh(db_obj)
        return db_obj

    def delete(self, db_obj: ModelType) -> None:
        self.session.delete(db_obj)
        self.session.commit()
