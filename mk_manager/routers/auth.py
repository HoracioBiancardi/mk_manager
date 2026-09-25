"""Rotas de login e da tela Usuários (mesmo contrato do app_template, sessão por cookie)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from mk_manager.services.auth_service import (
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    AuthLockedError,
    AuthService,
    current_session,
    get_auth_service,
    require_admin,
)
from mk_manager.services.log_buffer_service import log_buffer_service

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    username: str
    current_password: str
    new_password: str


class NewUserRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class ResetPasswordRequest(BaseModel):
    password: str


def _locked(exc: AuthLockedError) -> HTTPException:
    return HTTPException(status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)})


def _abrir_sessao(request: Request, response: Response, auth: AuthService, user: dict) -> dict:
    response.set_cookie(
        SESSION_COOKIE, auth.create_session(user), httponly=True, samesite="strict",
        secure=request.url.scheme == "https", max_age=SESSION_TTL_SECONDS,
    )
    return {"ok": True, "user": user}


@router.get("/status")
def auth_status(auth: AuthService = Depends(get_auth_service)):
    return {"configured": auth.is_configured()}


@router.post("/setup")
def setup_admin(req: LoginRequest, request: Request, response: Response, auth: AuthService = Depends(get_auth_service)):
    """Primeiro acesso (o app só escuta em 127.0.0.1): cria o administrador."""
    try:
        user = auth.setup_admin(req.username, req.password)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_buffer_service.info(f"Administrador “{user['username']}” criado (primeiro acesso)", source="auth")
    return _abrir_sessao(request, response, auth, user)


@router.post("/login")
def login(req: LoginRequest, request: Request, response: Response, auth: AuthService = Depends(get_auth_service)):
    if not auth.is_configured():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Crie o administrador primeiro.")
    try:
        user = auth.verify_password(req.username, req.password)
    except AuthLockedError as e:
        raise _locked(e)
    if not user:
        log_buffer_service.warning("Tentativa de login com usuário ou senha incorretos", source="auth")
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")
    return _abrir_sessao(request, response, auth, user)


@router.post("/logout")
def logout(request: Request, response: Response, auth: AuthService = Depends(get_auth_service)):
    token: Optional[str] = request.cookies.get(SESSION_COOKIE)
    if token:
        auth.revoke(token)
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.get("/me")
def me(sessao: dict = Depends(current_session)):
    return {"username": sessao["username"], "is_admin": sessao["is_admin"],
            "must_change_password": sessao.get("must_change_password", False)}


@router.post("/change-password")
def change_password(req: ChangePasswordRequest, auth: AuthService = Depends(get_auth_service)):
    try:
        ok = auth.change_password(req.username, req.current_password, req.new_password)
    except AuthLockedError as e:
        raise _locked(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not ok:
        raise HTTPException(status_code=401, detail="Usuário ou senha atual incorretos.")
    return {"ok": True}


@router.get("/users", dependencies=[Depends(require_admin)])
def list_users(auth: AuthService = Depends(get_auth_service)):
    return {"users": auth.list_users()}


@router.post("/users")
def create_user(req: NewUserRequest, sessao: dict = Depends(require_admin), auth: AuthService = Depends(get_auth_service)):
    try:
        user = auth.create_user(req.username, req.password, req.is_admin, must_change=True)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_buffer_service.info(f"Usuário “{user['username']}” criado por “{sessao['username']}”", source="auth")
    return {"user": user, "users": auth.list_users()}


@router.post("/users/{username}/password")
def reset_password(username: str, req: ResetPasswordRequest, sessao: dict = Depends(require_admin),
                   auth: AuthService = Depends(get_auth_service)):
    try:
        auth.set_password(username, req.password, must_change=auth.normalize(username) != sessao["username"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.delete("/users/{username}")
def delete_user(username: str, sessao: dict = Depends(require_admin), auth: AuthService = Depends(get_auth_service)):
    if auth.normalize(username) == sessao["username"]:
        raise HTTPException(status_code=400, detail="Você não pode remover o próprio usuário.")
    try:
        auth.delete_user(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"users": auth.list_users()}
