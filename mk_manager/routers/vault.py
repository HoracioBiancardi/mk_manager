import base64
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from mk_manager.services.crypto_vault_service import CryptoVaultService
from mk_manager.services.log_buffer_service import log_buffer_service

router = APIRouter(prefix="/api/vault", tags=["Vault"])

class EncryptRequest(BaseModel):
    text: str
    master_key: str

class DecryptRequest(BaseModel):
    encrypted_base64: str
    master_key: str

class GeneratePasswordRequest(BaseModel):
    length: int = Field(16, ge=4, le=128)
    use_uppercase: bool = True
    use_lowercase: bool = True
    use_digits: bool = True
    use_symbols: bool = True

@router.post("/encrypt")
def encrypt_payload(req: EncryptRequest):
    if not req.text or not req.master_key:
        raise HTTPException(status_code=400, detail="Texto e chave mestre são obrigatórios.")
    try:
        raw_bytes = req.text.encode("utf-8")
        encrypted_bytes = CryptoVaultService.encrypt(raw_bytes, req.master_key)
        enc_b64 = base64.b64encode(encrypted_bytes).decode("utf-8")
        log_buffer_service.info("Payload cifrado no Vault", source="vault_router")
        return {"encrypted_base64": enc_b64, "length": len(enc_b64)}
    except Exception as e:
        log_buffer_service.error(f"Erro ao cifrar: {e}", source="vault_router")
        raise HTTPException(status_code=500, detail=f"Erro de cifragem: {str(e)}")

@router.post("/decrypt")
def decrypt_payload(req: DecryptRequest):
    if not req.encrypted_base64 or not req.master_key:
        raise HTTPException(status_code=400, detail="Payload cifrado e chave mestre são obrigatórios.")
    try:
        raw_encrypted = base64.b64decode(req.encrypted_base64)
        decrypted_bytes = CryptoVaultService.decrypt(raw_encrypted, req.master_key)
        decrypted_text = decrypted_bytes.decode("utf-8")
        log_buffer_service.info("Payload decifrado com sucesso no Vault", source="vault_router")
        return {"decrypted_text": decrypted_text}
    except Exception as e:
        log_buffer_service.warning(f"Falha ao decifrar: {e}", source="vault_router")
        raise HTTPException(status_code=400, detail="Falha ao decifrar. Chave incorreta ou dados corrompidos.")

@router.post("/generate-password")
def generate_password(req: GeneratePasswordRequest):
    pwd = CryptoVaultService.generate_password(
        length=req.length,
        use_uppercase=req.use_uppercase,
        use_lowercase=req.use_lowercase,
        use_digits=req.use_digits,
        use_symbols=req.use_symbols
    )
    log_buffer_service.info(f"Nova senha aleatória gerada ({req.length} chars)", source="vault_router")
    return {"password": pwd, "length": len(pwd)}
