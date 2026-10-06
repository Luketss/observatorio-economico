"""Segundo fator TOTP: cadastro (so ADMIN_GLOBAL) e verificacao do login em duas etapas."""
from app.api.deps import get_db, require_role
from app.api.response import SuccessResponse
from app.core.rate_limit import limiter
from app.schemas.mfa import (
    MfaAtivarOut,
    MfaCodigoIn,
    MfaConfigurarOut,
    MfaDesativarIn,
    MfaStatusOut,
    MfaVerificarIn,
)
from app.services.audit_service import origem_do_request
from app.services.auth_service import AuthService
from app.services.mfa_service import MfaService
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth/mfa", tags=["MFA"])


@router.get("/status", response_model=SuccessResponse[MfaStatusOut])
@limiter.limit("30/minute")
def mfa_status(request: Request, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    return SuccessResponse(data=MfaStatusOut(**MfaService(db).status(current_user)))


@router.post("/configurar", response_model=SuccessResponse[MfaConfigurarOut])
@limiter.limit("5/minute")
def mfa_configurar(request: Request, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    return SuccessResponse(data=MfaConfigurarOut(**MfaService(db).configurar(current_user)))


@router.post("/ativar", response_model=SuccessResponse[MfaAtivarOut])
@limiter.limit("5/minute")
def mfa_ativar(request: Request, payload: MfaCodigoIn, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    codigos = MfaService(db).ativar(current_user, payload.codigo, request=request)
    return SuccessResponse(data=MfaAtivarOut(codigos_recuperacao=codigos))


@router.post("/desativar")
@limiter.limit("5/minute")
def mfa_desativar(request: Request, payload: MfaDesativarIn, db: Session = Depends(get_db), current_user=Depends(require_role("ADMIN_GLOBAL"))):
    MfaService(db).desativar(current_user, payload.senha_atual, payload.codigo, request=request)
    return {"ok": True}


@router.post("/verificar")
@limiter.limit("10/minute")
def mfa_verificar(request: Request, payload: MfaVerificarIn, db: Session = Depends(get_db)):
    ip, user_agent = origem_do_request(request)
    return AuthService(db).verificar_mfa(payload.mfa_token, payload.codigo, ip, user_agent)
