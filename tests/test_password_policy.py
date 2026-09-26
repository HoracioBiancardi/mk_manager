"""Regra de senha do ecossistema (= invest_sap): mínimo 10 caracteres e força pelo menos Média."""

from mk_manager.services import password_policy


def test_regra_e_gerador():
    assert "10 caracteres" in password_policy.problemas("Ab1!x")[0]
    assert "força Média" in password_policy.problemas("abcdefghijkl")[0]
    assert all(password_policy.problemas(password_policy.gerar()) == [] for _ in range(30))


def test_senha_fraca_recusada_e_redefinicao_gera_temporaria(client_logado, auth):
    r = client_logado.post("/api/auth/users", json={"username": "joao", "password": "abcdefghijkl"})
    assert r.status_code == 400 and "força Média" in r.json()["detail"]
    auth.create_user("maria", "senha-maria-1")
    r = client_logado.post("/api/auth/users/maria/password", json={})
    temporaria = r.json()["temporary_password"]
    assert r.status_code == 200 and auth.verify_password("maria", temporaria)
    assert auth.get_user("maria")["must_change_password"]
