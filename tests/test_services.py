from mk_manager.services.crypto_vault_service import CryptoVaultService
from mk_manager.services.db_service import DatabaseService
from mk_manager.services.log_buffer_service import LogBufferService

def test_crypto_service():
    master_key = "ChaveSecretaMK"
    data = b"Nota secreta do MK Manager"
    enc = CryptoVaultService.encrypt(data, master_key)
    dec = CryptoVaultService.decrypt(enc, master_key)
    assert dec == data

def test_db_service():
    db = DatabaseService(":memory:")
    assert db.set_key("mk_note_filter", "all") is True
    assert db.get_key("mk_note_filter") == "all"

def test_log_buffer_service():
    log_buffer = LogBufferService(max_entries=10)
    log_buffer.info("Nota criada", source="mk_manager")
    logs = log_buffer.get_logs()
    assert len(logs) == 1
    assert logs[0]["message"] == "Nota criada"
