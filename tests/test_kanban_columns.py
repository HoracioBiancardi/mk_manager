"""Colunas do Kanban no servidor (iguais para todos os usuários e navegadores)."""

from fastapi.testclient import TestClient

from mk_manager.main import app

client = TestClient(app)

COLS = [
    {"key": "", "label": "Backlog", "color": ""},
    {"key": "planning", "label": "Planejado", "color": "#60a5fa"},
    {"key": "bloqueado", "label": "Bloqueado", "color": "#f87171"},
]


def test_sem_colunas_salvas_devolve_null():
    r = client.get("/api/kanban/columns")
    assert r.status_code == 200
    assert r.json() == {"columns": None}


def test_salva_e_devolve_as_colunas():
    r = client.put("/api/kanban/columns", json={"columns": COLS})
    assert r.status_code == 200
    assert client.get("/api/kanban/columns").json()["columns"] == COLS


def test_recusa_chave_invalida_repetida_ou_cor_fora_do_formato():
    for cols in (
        [{"key": "a\nb", "label": "x"}],
        [{"key": " a", "label": "x"}],
        [{"key": "a", "label": "A"}, {"key": "a", "label": "B"}],
        [{"key": "a", "label": "A", "color": "red; background:url(x)"}],
        [{"key": "a", "label": "   "}],
        [],
    ):
        assert client.put("/api/kanban/columns", json={"columns": cols}).status_code == 422


def test_exige_sessao():
    anon = TestClient(app)
    assert anon.get("/api/kanban/columns").status_code == 401
