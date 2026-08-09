import time
from collections import deque
from typing import List, Dict, Any, Optional

class LogBufferService:
    """Buffer circular de logs em memória para monitoramento em tempo real (estilo console CLI/Web)."""

    def __init__(self, max_entries: int = 500):
        self.max_entries = max_entries
        self._buffer: deque = deque(maxlen=max_entries)

    def log(self, level: str, message: str, source: str = "app", meta: Optional[Dict[str, Any]] = None):
        entry = {
            "timestamp": time.time(),
            "time_str": time.strftime("%H:%M:%S"),
            "level": level.upper(),
            "message": message,
            "source": source,
            "meta": meta or {}
        }
        self._buffer.append(entry)

    def info(self, message: str, source: str = "app"):
        self.log("INFO", message, source)

    def warning(self, message: str, source: str = "app"):
        self.log("WARNING", message, source)

    def error(self, message: str, source: str = "app", meta: Optional[Dict[str, Any]] = None):
        self.log("ERROR", message, source, meta)

    def success(self, message: str, source: str = "app"):
        self.log("SUCCESS", message, source)

    def get_logs(self, limit: int = 100, level: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
        entries = list(self._buffer)
        if level:
            lvl_upper = level.upper()
            entries = [e for e in entries if e["level"] == lvl_upper]
        if search:
            query = search.lower()
            entries = [e for e in entries if query in e["message"].lower() or query in e["source"].lower()]

        return entries[-limit:]

    def clear(self):
        self._buffer.clear()

log_buffer_service = LogBufferService()
