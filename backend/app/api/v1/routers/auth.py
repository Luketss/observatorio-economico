from app.api.deps import get_current_user, get_db
from app.api.response import SuccessResponse
from app.schemas.auth import AuthenticatedUser
from app.services.auth_service import AuthService
from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    service = AuthService(db)

    return service.authenticate(
        email=form_data.username,
        password=form_data.password,
    )


@router.post("/refresh")
def refresh_token(
    refresh_token: str,
    db: Session = Depends(get_db),
):
    service = AuthService(db)
    return service.refresh(refresh_token)


@router.get("/me", response_model=SuccessResponse[AuthenticatedUser])
def get_me(
    current_user=Depends(get_current_user),
):
    return SuccessResponse(
        data=AuthenticatedUser(
            id=current_user.id,
            nome=current_user.nome,
            email=current_user.email,
            municipio_id=current_user.municipio_id,
            role=current_user.role.nome,
            ativo=current_user.ativo,
        )
    )
