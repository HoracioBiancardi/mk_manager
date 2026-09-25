import time

from fastapi.testclient import TestClient
from mk_manager.main import app

client = TestClient(app)

def test_start_demo_task_and_poll_status(session_cookie):
    # Usa o client como context manager: mantém um único portal/event loop vivo
    # entre as requisições, necessário para a task em segundo plano progredir
    # entre a chamada de start e as chamadas de polling subsequentes.
    with TestClient(app, cookies=session_cookie) as scoped_client:
        start_response = scoped_client.post("/api/tasks/start-demo", json={
            "name": "Tarefa de Teste",
            "steps": 2,
            "delay": 0.01,
        })
        assert start_response.status_code == 200
        task_id = start_response.json()["task_id"]

        for _ in range(50):
            status_response = scoped_client.get(f"/api/tasks/{task_id}")
            assert status_response.status_code == 200
            if status_response.json()["status"] == "completed":
                break
            time.sleep(0.02)
        else:
            assert False, "Tarefa não concluiu a tempo"

def test_list_tasks():
    client.post("/api/tasks/start-demo", json={"name": "Outra Tarefa", "steps": 1, "delay": 0.01})
    response = client.get("/api/tasks/list")
    assert response.status_code == 200
    assert isinstance(response.json()["tasks"], list)

def test_get_unknown_task_returns_404():
    response = client.get("/api/tasks/unknown-id")
    assert response.status_code == 404

def test_cancel_unknown_task_returns_400():
    response = client.post("/api/tasks/unknown-id/cancel", json={})
    assert response.status_code == 400
