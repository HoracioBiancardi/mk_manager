from fastapi.testclient import TestClient
from mk_manager.main import app

client = TestClient(app)

def test_system_health():
    response = client.get("/api/system/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "uptime_seconds" in data

def test_system_metrics():
    response = client.get("/api/system/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "uptime" in data
    assert "app_name" in data

def test_system_logs_and_clear():
    client.get("/api/system/health")
    response = client.get("/api/system/logs")
    assert response.status_code == 200
    assert "logs" in response.json()

    clear_response = client.post("/api/system/logs/clear", json={})
    assert clear_response.status_code == 200
    assert clear_response.json()["status"] == "ok"
