from app.api.deps import get_current_user, get_db
from app.api.response import SuccessResponse
from app.core.permissions import permissoes_efetivas
from app.core.rate_limit import limiter
from app.schemas.auth import AlterarSenhaPayload, AuthenticatedUser
from app.services.auth_service import AuthService
from fastapi import APIRouter, Body, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login")
@limiter.limit("5/minute")
@limiter.limit("20/hour")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    service = AuthService(db)

    # Prefer the client IP forwarded by a reverse proxy, falling back to the
    # direct socket peer.
    fwd = request.headers.get("x-forwarded-for")
    ip = fwd.split(",")[0].strip() if fwd else (
        request.client.host if request.client else None
    )
    user_agent = request.headers.get("user-agent")

    return service.authenticate(
        email=form_data.username,
        password=form_data.password,
        ip=ip,
        user_agent=user_agent,
    )


@router.post("/refresh")
def refresh_token(
    refresh_token: str = Body(..., embed=True),
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
            estado=current_user.municipio.estado if current_user.municipio else None,
            role=current_user.role.nome,
            ativo=current_user.ativo,
            permissoes=permissoes_efetivas(current_user.role),
        )
    )


@router.post("/alterar-senha")
@limiter.limit("5/minute")
@limiter.limit("20/hour")
def alterar_senha(
    request: Request,
    payload: AlterarSenhaPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service = AuthService(db)
    service.alterar_senha(current_user, payload.senha_atual, payload.nova_senha)
    return {"ok": True}
