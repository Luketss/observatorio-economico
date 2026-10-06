from app.api.deps import get_current_user, get_db
from app.api.response import SuccessResponse
from app.core.permissions import permissoes_efetivas
from app.core.rate_limit import limiter
from app.schemas.auth import AlterarSenhaPayload, AuthenticatedUser
from app.schemas.redefinicao_senha import EsqueciSenhaIn, RedefinirSenhaIn
from app.services.auth_service import AuthService
from app.services.audit_service import origem_do_request
from app.services.email_service import mascarar_email
from app.services.redefinicao_senha_service import MENSAGEM_GENERICA, RedefinicaoSenhaService
from fastapi import APIRouter, Body, Depends, Query, Request
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

    ip, user_agent = origem_do_request(request)

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


# ---------- Esqueci minha senha (publico) ----------
# Spec: docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md, secao 2.


@router.post("/esqueci-senha", status_code=202)
@limiter.limit("3/minute")
def esqueci_senha(request: Request, payload: EsqueciSenhaIn, db: Session = Depends(get_db)):
    """Sempre 202 com a mesma mensagem: nao revela se o e-mail existe."""
    ip, _ = origem_do_request(request)
    RedefinicaoSenhaService(db).solicitar(payload.email, ip=ip)
    return {"message": MENSAGEM_GENERICA}


@router.get("/redefinir-senha/validar")
def validar_redefinicao(token: str = Query(..., max_length=200), db: Session = Depends(get_db)):
    user = RedefinicaoSenhaService(db).validar(token)
    return {"valido": True, "email_mascarado": mascarar_email(user.email)}


@router.post("/redefinir-senha")
@limiter.limit("5/minute")
def redefinir_senha(request: Request, payload: RedefinirSenhaIn, db: Session = Depends(get_db)):
    RedefinicaoSenhaService(db).redefinir(payload.token, payload.nova_senha, request=request)
    return {"message": "Senha redefinida. Faca login."}
