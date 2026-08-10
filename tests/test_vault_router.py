from fastapi.testclient import TestClient
from mk_manager.main import app

client = TestClient(app)

def test_vault_encrypt_and_decrypt_roundtrip():
    encrypt_response = client.post("/api/vault/encrypt", json={
        "text": "Segredo do MK Manager",
        "master_key": "ChaveMestraTeste",
    })
    assert encrypt_response.status_code == 200
    encrypted_base64 = encrypt_response.json()["encrypted_base64"]

    decrypt_response = client.post("/api/vault/decrypt", json={
        "encrypted_base64": encrypted_base64,
        "master_key": "ChaveMestraTeste",
    })
    assert decrypt_response.status_code == 200
    assert decrypt_response.json()["decrypted_text"] == "Segredo do MK Manager"

def test_vault_decrypt_wrong_key_fails():
    encrypt_response = client.post("/api/vault/encrypt", json={
        "text": "Segredo do MK Manager",
        "master_key": "ChaveCorreta",
    })
    encrypted_base64 = encrypt_response.json()["encrypted_base64"]

    decrypt_response = client.post("/api/vault/decrypt", json={
        "encrypted_base64": encrypted_base64,
        "master_key": "ChaveErrada",
    })
    assert decrypt_response.status_code == 400

def test_vault_generate_password():
    response = client.post("/api/vault/generate-password", json={"length": 20})
    assert response.status_code == 200
    data = response.json()
    assert data["length"] == 20
    assert len(data["password"]) == 20
