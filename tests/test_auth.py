"""Login com usuários, tela Usuários e defesas (mesmo contrato do app_template, sessão por cookie)."""

from fastapi.testclient import TestClient

from mk_manager.main import app
from mk_manager.services import auth_service as auth_mod
from mk_manager.services.auth_service import AuthService

ADMIN = {"username": "chefe", "password": "senha-forte"}
JSON = {"Content-Type": "application/json"}


def _novo() -> TestClient:
    return TestClient(app)


def test_primeiro_acesso_cria_admin_e_loga(auth: AuthService) -> None:
    c = _novo()
    assert c.get("/api/auth/status").json() == {"configured": False}
    assert c.get("/api/files/").status_code == 401
    r = c.post("/api/auth/setup", json=ADMIN)
    assert r.status_code == 200 and r.json()["user"]["is_admin"] and "httponly" in r.headers["set-cookie"].lower()
    assert "samesite=strict" in r.headers["set-cookie"].lower()
    assert c.get("/api/auth/me").json()["username"] == "chefe"
    assert c.post("/api/auth/setup", json={"username": "outro", "password": "senha-forte"}).status_code == 409


def test_login_sem_enumeracao_e_bloqueio_por_usuario(auth: AuthService) -> None:
    c = _novo()
    c.post("/api/auth/setup", json=ADMIN)
    c.cookies.clear()
    a = c.post("/api/auth/login", json={"username": "ninguem", "password": "x"})
    b = c.post("/api/auth/login", json={"username": "chefe", "password": "errada"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()
    for _ in range(auth_mod.MAX_FAILURES - 1):
        c.post("/api/auth/login", json={"username": "chefe", "password": "errada"})
    assert c.post("/api/auth/login", json=ADMIN).status_code == 429
    troca = {"username": "chefe", "current_password": "senha-forte", "new_password": "nova-senha1"}
    assert c.post("/api/auth/change-password", json=troca).status_code == 429


def test_admin_gerencia_usuarios_e_troca_obrigatoria(auth: AuthService) -> None:
    admin = _novo()
    admin.post("/api/auth/setup", json=ADMIN)
    r = admin.post("/api/auth/users", json={"username": "maria", "password": "senha-admin1"})
    assert r.json()["user"]["must_change_password"] is True
    maria = _novo()
    assert maria.post("/api/auth/login", json={"username": "maria", "password": "senha-admin1"}).json()["user"]["must_change_password"]
    assert maria.get("/api/auth/users").status_code == 403
    troca = {"username": "maria", "current_password": "senha-admin1", "new_password": "senha-dela1"}
    assert maria.post("/api/auth/change-password", json=troca).status_code == 200
    assert maria.get("/api/auth/me").status_code == 401  # a troca encerra as sessões dela
    assert admin.request("DELETE", "/api/auth/users/chefe", headers=JSON).status_code == 400  # a si mesmo
    assert [u["username"] for u in admin.request("DELETE", "/api/auth/users/maria", headers=JSON).json()["users"]] == ["chefe"]


def test_assets_fora_de_api_tambem_exigem_login(auth: AuthService) -> None:
    c = _novo()
    assert c.get("/assets/qualquer.png").status_code == 401
    assert c.request("DELETE", "/assets/qualquer.png", headers=JSON).status_code == 401


def test_outra_origem_e_sem_json_sao_recusados(client_logado: TestClient) -> None:
    corpo = {"name": "invasao", "content": "x", "folder": ""}
    r = client_logado.post("/api/files/", json=corpo, headers={"Sec-Fetch-Site": "same-site"})
    assert r.status_code == 403
    r = client_logado.post("/api/files/", content='{"name":"x"}', headers={"Content-Type": "text/plain"})
    assert r.status_code == 415


def test_sem_cors_e_cabecalhos_de_seguranca(auth: AuthService) -> None:
    c = _novo()
    r = c.get("/api/system/health", headers={"Origin": "http://127.0.0.1:8080"})
    assert "access-control-allow-origin" not in r.headers
    r = c.get("/")
    assert r.headers["x-frame-options"] == "DENY" and r.headers["cache-control"] == "no-cache"
