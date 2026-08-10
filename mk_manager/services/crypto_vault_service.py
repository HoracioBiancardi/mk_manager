import base64
import os
import hashlib
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

SALT_PREFIX = b"SALT_PBKDF2_V1:"
SALT_LEN = 16
PBKDF2_ITERATIONS = 600_000

class CryptoVaultService:
    """Módulo de cifra e decifra robusta com Fernet AES-128 e PBKDF2 (600k iterações + Salt)"""
    
    @staticmethod
    def derive_key_pbkdf2(master_key: str, salt: bytes) -> bytes:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=PBKDF2_ITERATIONS,
        )
        return base64.urlsafe_b64encode(kdf.derive(master_key.encode('utf-8')))

    @staticmethod
    def _legacy_derive_key(master_key: str) -> bytes:
        digest = hashlib.sha256(master_key.encode('utf-8')).digest()
        return base64.urlsafe_b64encode(digest)

    @classmethod
    def encrypt(cls, raw_data: bytes, master_key: str) -> bytes:
        salt = os.urandom(SALT_LEN)
        fernet_key = cls.derive_key_pbkdf2(master_key, salt)
        f = Fernet(fernet_key)
        encrypted_payload = f.encrypt(raw_data)
        return SALT_PREFIX + salt + encrypted_payload

    @classmethod
    def decrypt(cls, encrypted_data: bytes, master_key: str) -> bytes:
        if encrypted_data.startswith(SALT_PREFIX):
            salt_start = len(SALT_PREFIX)
            salt = encrypted_data[salt_start : salt_start + SALT_LEN]
            payload = encrypted_data[salt_start + SALT_LEN :]
            fernet_key = cls.derive_key_pbkdf2(master_key, salt)
            f = Fernet(fernet_key)
            return f.decrypt(payload)
        
        try:
            legacy_key = cls._legacy_derive_key(master_key)
            f_legacy = Fernet(legacy_key)
            return f_legacy.decrypt(encrypted_data)
        except InvalidToken:
            raise InvalidToken("Chave mestre incorreta ou cofre corrompido.")

    @staticmethod
    def generate_password(
        length: int = 16,
        use_uppercase: bool = True,
        use_lowercase: bool = True,
        use_digits: bool = True,
        use_symbols: bool = True
    ) -> str:
        """Gera uma senha aleatória segura usando secrets"""
        import secrets
        import string

        chars = ""
        if use_uppercase:
            chars += string.ascii_uppercase
        if use_lowercase:
            chars += string.ascii_lowercase
        if use_digits:
            chars += string.digits
        if use_symbols:
            chars += "!@#$%^&*()_+-=[]{}|;:,.<>?"

        if not chars:
            chars = string.ascii_letters + string.digits

        return "".join(secrets.choice(chars) for _ in range(max(4, length)))

    @staticmethod
    def evaluate_password_strength(password: str) -> dict:
        """Avalia a força e segurança de uma senha (score 0-100, nível e recomendações)."""
        if not password:
            return {"score": 0, "strength": "Muito Fraca", "feedback": ["Digite uma senha"]}

        score = 0
        feedback = []

        if len(password) >= 16:
            score += 35
        elif len(password) >= 12:
            score += 25
        elif len(password) >= 8:
            score += 15
        else:
            feedback.append("Aumente o comprimento para pelo menos 12 caracteres")

        import string
        has_upper = any(c in string.ascii_uppercase for c in password)
        has_lower = any(c in string.ascii_lowercase for c in password)
        has_digit = any(c in string.digits for c in password)
        has_symbol = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)

        types_count = sum([has_upper, has_lower, has_digit, has_symbol])
        score += types_count * 15

        if not has_upper:
            feedback.append("Adicione letras maiúsculas (A-Z)")
        if not has_lower:
            feedback.append("Adicione letras minúsculas (a-z)")
        if not has_digit:
            feedback.append("Adicione números (0-9)")
        if not has_symbol:
            feedback.append("Adicione símbolos especiais (!@#$)")

        score = min(100, score)

        if score >= 85:
            strength = "Excelente"
        elif score >= 65:
            strength = "Forte"
        elif score >= 45:
            strength = "Média"
        elif score >= 25:
            strength = "Fraca"
        else:
            strength = "Muito Fraca"

        return {
            "score": score,
            "strength": strength,
            "feedback": feedback if feedback else ["Senha altamente segura!"]
        }
