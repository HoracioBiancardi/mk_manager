"""Fixtures compartilhadas: banco de usuários em memória e sessão de admin nos clientes.

A API exige login (AuthMiddleware). Cada teste ganha um AuthService novo em memória com um
admin, e os `client` de módulo recebem o cookie dessa sessão — os testes continuam
exercitando o app com a autenticação ligada, sem tocar em data/mk_manager.db.
"""

import pytest

from mk_manager.services.auth_service import SESSION_COOKIE, AuthService, set_auth_service
from mk_manager.services.db_service import DatabaseService

ADMIN = ("admin", "senha-forte")


@pytest.fixture
def auth() -> AuthService:
    servico = AuthService(DatabaseService(":memory:"), iterations=1_000)
    set_auth_service(servico)
    yield servico
    set_auth_service(None)


@pytest.fixture
def session_cookie(auth: AuthService) -> dict[str, str]:
    """Cookie de uma sessão de admin válida."""
    user = auth.create_user(*ADMIN, is_admin=True)
    return {SESSION_COOKIE: auth.create_session(user)}


@pytest.fixture(autouse=True)
def _cliente_logado(request: pytest.FixtureRequest) -> None:
    """Módulos com `client` global: banco novo + cookie de admin. Os demais pedem `auth` direto."""
    client = getattr(request.module, "client", None)
    if client is not None:
        client.cookies.clear()
        client.cookies.update(request.getfixturevalue("session_cookie"))


@pytest.fixture
def client_logado(session_cookie: dict[str, str]):
    """Cliente novo já com sessão de admin."""
    from fastapi.testclient import TestClient

    from mk_manager.main import app

    return TestClient(app, cookies=session_cookie)
