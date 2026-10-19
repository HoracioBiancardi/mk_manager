"""Sincroniza a pasta de notas com o repositório git dela (Ajustes → "é repositório git").

As notas vivem num repo próprio usado em mais de uma máquina; o que só fica gravado numa
delas não chega à outra. Com a opção ligada, cada mudança gravada pelo app vira commit e
sobe (pull --rebase antes do push), e o app puxa o remoto ao subir e a cada poucos minutos.

- O salvamento local nunca depende do git: o sync roda em segundo plano, depois da resposta.
- Gravações em sequência (o editor salva sozinho ~1 s depois de parar de digitar) são
  agrupadas: o commit sai após `debounce` segundos sem nova gravação.
- Falha de rede, conflito ou falta de remoto viram `state="error"` com a mensagem do git; o
  commit local fica e a próxima rodada tenta de novo. Conflito no pull aborta o rebase (a
  pasta volta ao estado do commit local) e pede resolução manual.
"""

from __future__ import annotations

import logging
import os
import socket
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path

from mk_manager.config import get_settings

logger = logging.getLogger(__name__)

_DB_KEY = "git_sync"
# Sem prompt de usuário/senha: o servidor não tem terminal, um prompt travaria o sync.
_GIT_ENV = {"GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never", "LC_ALL": "C"}
# Commit sem user.name/user.email configurados falharia; o do repo/global ganha deste.
_FALLBACK_IDENTITY = ("MK Manager", "mk-manager@localhost")


class GitError(Exception):
    pass


def _git(cwd: Path, *args: str, timeout: int = 60, check: bool = True) -> subprocess.CompletedProcess[str]:
    try:
        r = subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=timeout, env={**os.environ, **_GIT_ENV},
        )
    except FileNotFoundError as e:
        raise GitError("git não encontrado no PATH.") from e
    except subprocess.TimeoutExpired as e:
        raise GitError(f"git {args[0]} demorou mais de {timeout}s (rede?).") from e
    if check and r.returncode != 0:
        raise GitError((r.stderr or r.stdout).strip() or f"git {args[0]} falhou ({r.returncode}).")
    return r


def is_git_repo(path: Path) -> bool:
    try:
        r = _git(path, "rev-parse", "--is-inside-work-tree", timeout=10, check=False)
    except (GitError, OSError):
        return False
    return r.returncode == 0 and r.stdout.strip() == "true"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class GitSyncService:
    def __init__(self, debounce: float = 10.0, pull_interval: float = 300.0) -> None:
        self.debounce = debounce
        self.pull_interval = pull_interval
        self.enabled = False
        self.state = "off"  # off | pending | syncing | ok | error
        self.message = ""
        self.last_ok_at: str | None = None
        self._lock = threading.Lock()  # uma rodada de git por vez
        self._timer: threading.Timer | None = None
        self._timer_lock = threading.Lock()
        self._stop = threading.Event()
        self._loop: threading.Thread | None = None

    # ── configuração ──────────────────────────────────────────────────────
    def load(self, db) -> None:
        saved = db.get_key(_DB_KEY) or {}
        self.enabled = bool(isinstance(saved, dict) and saved.get("enabled"))
        self.state = "ok" if self.enabled else "off"
        self.message = ""

    def set_enabled(self, db, enabled: bool) -> None:
        db.set_key(_DB_KEY, {"enabled": enabled})
        self.enabled = enabled
        self.state, self.message = ("ok", "") if enabled else ("off", "")

    def status(self) -> dict:
        return {"enabled": self.enabled, "state": self.state, "message": self.message,
                "last_ok_at": self.last_ok_at}

    # ── gatilhos ──────────────────────────────────────────────────────────
    def notify_change(self) -> None:
        """Uma gravação aconteceu: agenda commit + push (agrupando as próximas)."""
        if not self.enabled:
            return
        with self._timer_lock:
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(self.debounce, self._run_safely)
            self._timer.daemon = True
            self._timer.start()
            if self.state != "syncing":
                self.state = "pending"

    def start_background(self) -> None:
        """Puxa o remoto ao subir e depois a cada `pull_interval` (a outra máquina pode ter subido algo)."""
        if self._loop is not None:
            return
        self._stop.clear()

        def loop() -> None:
            while not self._stop.is_set():
                if self.enabled:
                    self._run_safely()
                self._stop.wait(self.pull_interval)

        self._loop = threading.Thread(target=loop, name="git-sync", daemon=True)
        self._loop.start()

    def stop_background(self) -> None:
        self._stop.set()
        with self._timer_lock:
            if self._timer is not None:
                self._timer.cancel()
        self._loop = None

    # ── rodada de sync ────────────────────────────────────────────────────
    def _run_safely(self) -> None:
        try:
            self.sync_now()
        except Exception:  # nunca derruba a thread; o erro já ficou em state/message
            logger.exception("git sync falhou")

    def sync_now(self) -> dict:
        """commit (se houver mudança) → pull --rebase → push. Devolve o status."""
        if not self.enabled:
            return self.status()
        with self._lock:
            self.state = "syncing"
            try:
                self.message = self._sync(get_settings().notes_dir.resolve())
                self.state = "ok"
                self.last_ok_at = _now()
            except GitError as e:
                self.state, self.message = "error", str(e)
                logger.warning("git sync: %s", e)
            return self.status()

    def _sync(self, repo: Path) -> str:
        if not is_git_repo(repo):
            raise GitError(f"A pasta de notas não é um repositório git: {repo}")
        committed = self._commit(repo)
        upstream = _git(repo, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}", check=False)
        if upstream.returncode != 0:
            raise GitError("Commit feito só local: a branch não tem remoto (upstream) configurado. "
                           "Rode `git push -u origin <branch>` uma vez na pasta de notas.")
        pull = _git(repo, "pull", "--rebase", "--autostash", timeout=120, check=False)
        if pull.returncode != 0:
            self._abort_rebase(repo)
            raise GitError("Não deu para puxar o remoto (conflito ou rede). Suas mudanças estão "
                           "salvas e commitadas localmente; resolva na pasta de notas.\n"
                           + (pull.stderr or pull.stdout).strip())
        ahead = _git(repo, "rev-list", "--count", "@{u}..HEAD").stdout.strip()
        if ahead != "0":
            _git(repo, "push", timeout=120)
        return f"{committed} · enviado" if committed else "Em dia com o remoto"

    def _commit(self, repo: Path) -> str:
        _git(repo, "add", "-A", "--", ".")
        changed = _git(repo, "diff", "--cached", "--name-only", "--", ".").stdout.split("\n")
        changed = [c for c in changed if c.strip()]
        if not changed:
            return ""
        names = ", ".join(Path(c).name for c in changed[:3]) + (f" +{len(changed) - 3}" if len(changed) > 3 else "")
        msg = f"mk_manager: {names}\n\n{len(changed)} arquivo(s) gravado(s) em {socket.gethostname()}."
        identity: list[str] = []
        if not _git(repo, "config", "user.email", check=False).stdout.strip():
            identity = ["-c", f"user.name={_FALLBACK_IDENTITY[0]}", "-c", f"user.email={_FALLBACK_IDENTITY[1]}"]
        _git(repo, *identity, "commit", "-m", msg, "--", ".")
        return f"Commit de {len(changed)} arquivo(s)"

    @staticmethod
    def _abort_rebase(repo: Path) -> None:
        git_dir = _git(repo, "rev-parse", "--git-dir", check=False).stdout.strip()
        if git_dir and ((repo / git_dir / "rebase-merge").exists() or (repo / git_dir / "rebase-apply").exists()):
            _git(repo, "rebase", "--abort", check=False)


git_sync_service = GitSyncService()
