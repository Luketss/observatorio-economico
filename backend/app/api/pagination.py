from typing import Generic, List, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    success: bool = True
    items: List[T]
    total: int
    skip: int
    limit: int
