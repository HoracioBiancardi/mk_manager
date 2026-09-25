"""Autenticação do MK Manager: usuários com senha e sessões por cookie (modelo do app_template).

Senha em hash PBKDF2-SHA256 (600k) com salt na tabela `users` do SQLite em `data/`;
bloqueio de 5 erros **por usuário** (inclusive inexistentes: não revela quem existe);
troca obrigatória quando a senha foi definida pelo admin. Diferente da SPA do template
(token em memória), aqui a sessão vai num cookie HttpOnly/SameSite=Strict — o app de
notas fica aberto o dia todo e não deve pedir login a cada recarregar — e expira por
inatividade no servidor, além do prazo máximo.
"""

import hashlib
import hmac
import re
import secrets
import time
from typing import Optional

from fastapi import HTTPException, Request

from mk_manager.services.db_service import DatabaseService

PBKDF2_ITERATIONS = 600_000
MIN_PASSWORD_LEN = 8
MAX_FAILURES = 5          # tentativas erradas seguidas (por usuário) antes do bloqueio
LOCKOUT_SECONDS = 30
SESSION_TTL_SECONDS = 12 * 3600      # prazo máximo desde o login
SESSION_IDLE_SECONDS = 30 * 60       # sem uso por 30 min: pede login de novo
SESSION_COOKIE = "mk_session"
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$")


class AuthLockedError(Exception):
    """Muitas tentativas erradas: novas tentativas recusadas por `retry_after` segundos."""
    def __init__(self, retry_after: int):
        super().__init__(f"Muitas tentativas. Tente novamente em {retry_after}s.")
        self.retry_after = retry_after


class AuthService:
    """Usuários com senha (hash PBKDF2-SHA256 + salt na tabela `users` do SQLite) e sessões por
    token em memória. O primeiro usuário, criado no primeiro acesso, é administrador."""

    def __init__(self, db: DatabaseService, iterations: int = PBKDF2_ITERATIONS):
        self._db = db
        self._iterations = iterations
        self._sessions: dict[str, dict] = {}
        self._failures: dict[str, int] = {}
        self._locked_until: dict[str, float] = {}
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                salt TEXT NOT NULL,
                iterations INTEGER NOT NULL,
                hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                must_change_password INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        # Banco criado antes da coluna must_change_password: acrescenta sem perder usuários.
        colunas = {r["name"] for r in self._db.fetch_all("PRAGMA table_info(users)")}
        if "must_change_password" not in colunas:
            self._db.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")
        # Hash de um usuário inexistente: login com nome desconhecido gasta o mesmo tempo que
        # um nome válido (não dá para descobrir quais usuários existem medindo a resposta).
        self._dummy = {"salt": secrets.token_hex(16), "iterations": iterations, "hash": ""}

    # ── Usuários ─────────────────────────────────────────────────
    @staticmethod
    def normalize(username: str) -> str:
        return (username or "").strip().lower()

    def is_configured(self) -> bool:
        return self._db.fetch_one("SELECT 1 AS ok FROM users LIMIT 1") is not None

    _COLS = "username, is_admin, must_change_password, created_at"

    @staticmethod
    def _user(row) -> dict:
        return {"username": row["username"], "is_admin": bool(row["is_admin"]),
                "must_change_password": bool(row["must_change_password"]), "created_at": row["created_at"]}

    def get_user(self, username: str) -> Optional[dict]:
        row = self._db.fetch_one(f"SELECT {self._COLS} FROM users WHERE username = ?", (self.normalize(username),))
        return self._user(row) if row else None

    def list_users(self) -> list[dict]:
        return [self._user(r) for r in self._db.fetch_all(f"SELECT {self._COLS} FROM users ORDER BY username")]

    def _count_admins(self) -> int:
        return self._db.fetch_one("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1")["n"]

    @staticmethod
    def _hash(password: str, salt: bytes, iterations: int) -> str:
        return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations).hex()

    @staticmethod
    def _check_password(password: str) -> None:
        if len(password) < MIN_PASSWORD_LEN:
            raise ValueError(f"A senha precisa ter pelo menos {MIN_PASSWORD_LEN} caracteres.")

    def create_user(self, username: str, password: str, is_admin: bool = False, must_change: bool = False) -> dict:
        """`must_change`: senha definida por outra pessoa (admin) — o dono troca no próximo login."""
        nome = self.normalize(username)
        if not USERNAME_RE.match(nome):
            raise ValueError("Usuário deve ter de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou _.")
        self._check_password(password)
        if self.get_user(nome):
            raise ValueError(f"O usuário “{nome}” já existe.")
        salt = secrets.token_bytes(16)
        self._db.execute(
            "INSERT INTO users (username, salt, iterations, hash, is_admin, must_change_password) VALUES (?, ?, ?, ?, ?, ?)",
            (nome, salt.hex(), self._iterations, self._hash(password, salt, self._iterations), int(is_admin), int(must_change)),
        )
        return self.get_user(nome)

    def setup_admin(self, username: str, password: str) -> dict:
        """Primeiro acesso: cria o administrador. Recusa se já houver usuários."""
        if self.is_configured():
            raise PermissionError("O primeiro acesso já foi feito.")
        return self.create_user(username, password, is_admin=True)

    def set_password(self, username: str, password: str, must_change: bool = False) -> None:
        """Grava a senha e encerra as sessões do usuário. `must_change=True` quando quem define
        é o admin (ele conhece a senha); a troca feita pelo próprio dono zera a marca."""
        self._check_password(password)
        nome = self.normalize(username)
        salt = secrets.token_bytes(16)
        n = self._db.execute(
            "UPDATE users SET salt = ?, iterations = ?, hash = ?, must_change_password = ? WHERE username = ?",
            (salt.hex(), self._iterations, self._hash(password, salt, self._iterations), int(must_change), nome),
        )
        if not n:
            raise ValueError("Usuário não encontrado.")
        self.revoke_user(nome)

    def delete_user(self, username: str) -> None:
        user = self.get_user(username)
        if not user:
            raise ValueError("Usuário não encontrado.")
        if user["is_admin"] and self._count_admins() <= 1:
            raise ValueError("Não é possível remover o último administrador.")
        self._db.execute("DELETE FROM users WHERE username = ?", (user["username"],))
        self.revoke_user(user["username"])

    def verify_password(self, username: str, password: str) -> Optional[dict]:
        """Usuário se a senha confere, senão None; aplica o bloqueio por tentativas (AuthLockedError)."""
        nome = self.normalize(username)
        remaining = self._locked_until.get(nome, 0) - time.time()
        if remaining > 0:
            raise AuthLockedError(int(remaining) + 1)

        row = self._db.fetch_one("SELECT salt, iterations, hash FROM users WHERE username = ?", (nome,)) or self._dummy
        calculado = self._hash(password, bytes.fromhex(row["salt"]), row["iterations"])
        ok = bool(row["hash"]) and hmac.compare_digest(calculado, row["hash"])
        if ok:
            self._failures.pop(nome, None)
            return self.get_user(nome)
        self._failures[nome] = self._failures.get(nome, 0) + 1
        if self._failures[nome] >= MAX_FAILURES:
            self._failures.pop(nome, None)
            self._locked_until[nome] = time.time() + LOCKOUT_SECONDS
        return None

    def change_password(self, username: str, current: str, new: str) -> bool:
        """Troca a própria senha se `current` estiver correta; encerra as sessões desse usuário."""
        if not self.verify_password(username, current):
            return False
        self.set_password(username, new)
        return True

    # ── Sessões ──────────────────────────────────────────────────
    def create_session(self, user: dict, vault_key: Optional[str] = None) -> str:
        """`vault_key`: chave mestre do cofre para telas renderizadas no servidor (/kit), que não
        têm onde guardá-la no navegador. Fica só em memória e some no logout/expiração."""
        token = secrets.token_hex(32)
        agora = time.time()
        self._sessions[token] = {
            "username": user["username"], "is_admin": bool(user["is_admin"]),
            "must_change_password": bool(user.get("must_change_password")),
            "created_at": agora, "last_activity": agora, "vault_key": vault_key,
        }
        return token

    def get_session(self, token: Optional[str], activity: bool = True) -> Optional[dict]:
        """Sessão válida do token (renova a inatividade quando `activity`)."""
        sessao = self._sessions.get(token) if token else None
        agora = time.time()
        if sessao and (agora - sessao["created_at"] > SESSION_TTL_SECONDS
                       or agora - sessao.get("last_activity", sessao["created_at"]) > SESSION_IDLE_SECONDS):
            self._sessions.pop(token, None)
            return None
        if sessao and activity:
            sessao["last_activity"] = agora
        return sessao

    def verify_token(self, token: Optional[str]) -> bool:
        return self.get_session(token) is not None

    def revoke(self, token: str) -> None:
        self._sessions.pop(token, None)

    def revoke_user(self, username: str) -> None:
        for token in [t for t, s in self._sessions.items() if s["username"] == username]:
            self._sessions.pop(token, None)


_auth_service: Optional[AuthService] = None


def get_auth_service() -> AuthService:
    """Singleton criado sob demanda (importar o app não cria o arquivo do banco).
    Nos testes, sobrescreva com `set_auth_service(AuthService(DatabaseService(":memory:"), 1_000))`."""
    global _auth_service
    if _auth_service is None:
        from mk_manager.config import get_settings
        db_path = get_settings().data_dir / "mk_manager.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _auth_service = AuthService(DatabaseService(db_path))
    return _auth_service


def set_auth_service(service: Optional[AuthService]) -> None:
    """Troca o singleton (testes)."""
    global _auth_service
    _auth_service = service


def current_session(request: Request) -> dict:
    """Sessão validada pelo `AuthMiddleware` (dependência das rotas que precisam do usuário)."""
    sessao = getattr(request.state, "session", None)
    if sessao is None:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Entre novamente.")
    return sessao


def require_admin(request: Request) -> dict:
    """Dependência das rotas de administração de usuários."""
    sessao = current_session(request)
    if not sessao["is_admin"]:
        raise HTTPException(status_code=403, detail="Restrito a administradores.")
    return sessao
