"""Protege `/api/*` e `/assets/*` com a sessão (cookie) e barra CSRF — mesmo esquema do monitoramento.

- Rotas públicas: health, status/setup/login do primeiro acesso e troca de senha (tela de login).
- Métodos que mudam estado exigem `Content-Type: application/json` (um `<form>` de outro site
  não envia JSON sem preflight) e são recusados quando o navegador os marca como de outra
  origem (`Sec-Fetch-Site`) — outra porta do mesmo host é o mesmo "site", então o
  `SameSite=Strict` do cookie sozinho não barra. Uploads (`multipart/form-data`) de assets
  passam pela checagem de origem.
- A sessão validada fica em `request.state.session`.
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from mk_manager.services.auth_service import SESSION_COOKIE, get_auth_service

_PUBLIC = frozenset({"/api/system/health", "/api/auth/status", "/api/auth/setup", "/api/auth/login", "/api/auth/change-password"})
_PROTECTED = ("/api/", "/assets/")
_STATE_CHANGING = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_SAME_ORIGIN = frozenset({"same-origin", "none"})
_JSON_OR_UPLOAD = ("application/json", "multipart/form-data")


class AuthMiddleware(BaseHTTPMiddleware):
    """Exige sessão válida nas rotas da API."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        # /assets/ fica fora de /api mas serve e APAGA anexos das notas: também protegido.
        if not path.startswith(_PROTECTED):
            return await call_next(request)
        if request.method in _STATE_CHANGING:
            if request.headers.get("sec-fetch-site", "same-origin") not in _SAME_ORIGIN:
                return JSONResponse({"detail": "Requisição de outra origem recusada."}, 403)
            if not request.headers.get("content-type", "").startswith(_JSON_OR_UPLOAD):
                return JSONResponse({"detail": "Content-Type application/json obrigatório"}, 415)
        if path in _PUBLIC:
            return await call_next(request)
        sessao = get_auth_service().get_session(request.cookies.get(SESSION_COOKIE))
        if sessao is None:
            return JSONResponse({"detail": "Sessão inválida ou expirada. Entre novamente."}, 401)
        request.state.session = sessao
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """nosniff, X-Frame-Options e Referrer-Policy em tudo; no-cache no frontend (sem JS velho)."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        if request.url.path == "/" or request.url.path.startswith("/static/"):
            response.headers.setdefault("Cache-Control", "no-cache")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response
