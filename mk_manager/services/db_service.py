import sqlite3
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

class DatabaseService:
    """Módulo de persistência SQLite leve com WAL mode, consultas parametrizadas e suporte JSON."""
    
    def __init__(self, db_path: Union[str, Path] = ":memory:"):
        self.db_path = str(db_path)
        self._mem_conn = None
        if self.db_path == ":memory:":
            self._mem_conn = sqlite3.connect(":memory:", check_same_thread=False)
            self._mem_conn.row_factory = sqlite3.Row
        self._init_db()

    def get_connection(self) -> sqlite3.Connection:
        if self._mem_conn:
            return self._mem_conn
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    def _init_db(self):
        """Inicializa esquema padrão de exemplo (tabela de configurações do app)."""
        conn = self.get_connection()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS app_kv_store (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()
        finally:
            if not self._mem_conn:
                conn.close()

    def execute(self, query: str, params: tuple = ()) -> int:
        """Executa comandos INSERT/UPDATE/DELETE e retorna número de linhas afetadas."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(query, params)
            conn.commit()
            return cursor.rowcount
        finally:
            if not self._mem_conn:
                conn.close()

    def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """Busca um único registro e retorna como dicionário."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(query, params)
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            if not self._mem_conn:
                conn.close()

    def fetch_all(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Busca múltiplos registros e retorna como lista de dicionários."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
        finally:
            if not self._mem_conn:
                conn.close()

    def set_key(self, key: str, value: Any) -> bool:
        """Armazena um valor (que será serializado em JSON se for objeto/lista)."""
        val_str = json.dumps(value) if isinstance(value, (dict, list)) else str(value)
        query = """
            INSERT INTO app_kv_store (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP;
        """
        return self.execute(query, (key, val_str)) > 0

    def get_key(self, key: str, default: Any = None) -> Any:
        """Recupera um valor por chave com parsing automático de JSON se aplicável."""
        row = self.fetch_one("SELECT value FROM app_kv_store WHERE key = ?", (key,))
        if not row:
            return default
        raw = row["value"]
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw

    def delete_key(self, key: str) -> bool:
        return self.execute("DELETE FROM app_kv_store WHERE key = ?", (key,)) > 0

db_service = DatabaseService()
