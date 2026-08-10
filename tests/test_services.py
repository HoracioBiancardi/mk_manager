import logging

import pytest
from cryptography.fernet import InvalidToken

from mk_manager.services.crypto_vault_service import CryptoVaultService
from mk_manager.services.db_service import DatabaseService
from mk_manager.services.log_buffer_service import LogBufferService

def test_crypto_service():
    master_key = "ChaveSecretaMK"
    data = b"Nota secreta do MK Manager"
    enc = CryptoVaultService.encrypt(data, master_key)
    dec = CryptoVaultService.decrypt(enc, master_key)
    assert dec == data

def test_crypto_vault_invalid_key():
    master_key = "ChaveCorreta"
    wrong_key = "ChaveErrada"
    payload = "Conteúdo protegido".encode("utf-8")

    encrypted = CryptoVaultService.encrypt(payload, master_key)
    with pytest.raises(InvalidToken):
        CryptoVaultService.decrypt(encrypted, wrong_key)

def test_generate_password():
    pwd1 = CryptoVaultService.generate_password(length=16)
    assert len(pwd1) == 16

    pwd2 = CryptoVaultService.generate_password(length=32, use_symbols=False)
    assert len(pwd2) == 32

def test_evaluate_password_strength():
    res_weak = CryptoVaultService.evaluate_password_strength("123")
    assert res_weak["strength"] == "Muito Fraca"

    res_strong = CryptoVaultService.evaluate_password_strength("P@ssw0rd321!#Strong")
    assert res_strong["strength"] in ("Forte", "Excelente")

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

def test_log_buffer_service_levels_filter_and_clear():
    log_buffer = LogBufferService(max_entries=10)
    log_buffer.info("Info registrada", source="mk_manager")
    log_buffer.warning("Aviso registrado", source="mk_manager")
    log_buffer.error("Erro registrado", source="mk_manager")

    assert len(log_buffer.get_logs()) == 3

    warnings = log_buffer.get_logs(level="WARNING")
    assert len(warnings) == 1
    assert warnings[0]["message"] == "Aviso registrado"

    log_buffer.clear()
    assert len(log_buffer.get_logs()) == 0

def test_log_buffer_handler_captures_stdlib_logging():
    log_buffer = LogBufferService(max_entries=5)
    logger = logging.getLogger("test_mk_manager_log_buffer_handler")
    logger.setLevel(logging.INFO)
    logger.addHandler(log_buffer.get_handler())

    logger.warning("Aviso via logging padrão")

    logs = log_buffer.get_logs()
    assert len(logs) == 1
    assert logs[0]["level"] == "WARNING"
    assert logs[0]["source"] == "test_mk_manager_log_buffer_handler"
