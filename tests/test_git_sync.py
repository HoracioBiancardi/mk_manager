"""Pasta de notas como repositório git: commit + pull --rebase + push ao salvar."""

import subprocess
from pathlib import Path

import pytest

from mk_manager.config import get_settings
from mk_manager.dependencies import reset_repository_cache
from mk_manager.services import git_sync_service as mod
from mk_manager.services.git_sync_service import GitSyncService


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def clone(remote: Path, dest: Path) -> Path:
    git(remote.parent, "clone", "-q", str(remote), str(dest))
    git(dest, "config", "user.name", "Teste")
    git(dest, "config", "user.email", "teste@exemplo")
    return dest


@pytest.fixture
def repos(tmp_path: Path, monkeypatch):
    """Remoto bare + duas máquinas (a = a do app, b = a outra)."""
    remote = tmp_path / "remote.git"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(remote))
    a = clone(remote, tmp_path / "a")
    (a / "inicio.md").write_text("# inicio\n")
    git(a, "add", ".")
    git(a, "commit", "-qm", "inicio")
    git(a, "push", "-q", "-u", "origin", "main")
    b = clone(remote, tmp_path / "b")
    monkeypatch.setattr(get_settings(), "notes_dir", a)
    yield a, b
    reset_repository_cache()


@pytest.fixture
def svc(auth) -> GitSyncService:
    s = GitSyncService(debounce=0.01)
    s.set_enabled(auth.db, True)
    return s


def test_save_commits_and_pushes(repos, svc):
    a, b = repos
    (a / "nova.md").write_text("# nova\n")
    st = svc.sync_now()
    assert st["state"] == "ok", st["message"]
    git(b, "pull", "-q")
    assert (b / "nova.md").read_text() == "# nova\n"
    assert "nova.md" in git(b, "log", "-1", "--format=%s")


def test_pulls_what_the_other_machine_pushed_before_pushing(repos, svc):
    a, b = repos
    (b / "de-b.md").write_text("b\n")
    git(b, "add", ".")
    git(b, "commit", "-qm", "b")
    git(b, "push", "-q")
    (a / "de-a.md").write_text("a\n")
    assert svc.sync_now()["state"] == "ok"
    assert (a / "de-b.md").exists()
    git(b, "pull", "-q")
    assert (b / "de-a.md").exists()


def test_conflict_reports_error_and_keeps_local_save(repos, svc):
    a, b = repos
    (b / "inicio.md").write_text("versão b\n")
    git(b, "commit", "-qam", "b")
    git(b, "push", "-q")
    (a / "inicio.md").write_text("versão a\n")
    st = svc.sync_now()
    assert st["state"] == "error"
    assert "conflito" in st["message"]
    assert (a / "inicio.md").read_text() == "versão a\n"
    assert git(a, "status", "--porcelain") == ""  # commitado local, sem rebase pela metade
    assert not (a / ".git" / "rebase-merge").exists()


def test_branch_without_upstream_is_an_error(tmp_path, monkeypatch, svc):
    repo = tmp_path / "solo"
    git(tmp_path, "init", "-q", str(repo))
    (repo / "x.md").write_text("x\n")
    monkeypatch.setattr(get_settings(), "notes_dir", repo)
    st = svc.sync_now()
    assert st["state"] == "error" and "upstream" in st["message"]
    assert git(repo, "log", "--oneline")  # o commit local saiu mesmo assim
    reset_repository_cache()


def test_disabled_does_nothing(repos, auth):
    a, _ = repos
    s = GitSyncService()
    s.set_enabled(auth.db, False)
    (a / "nova.md").write_text("x\n")
    s.notify_change()
    assert s.sync_now()["state"] == "off"
    assert "nova.md" in git(a, "status", "--porcelain")


def test_settings_refuses_git_sync_on_plain_folder(client_logado, tmp_path, monkeypatch):
    monkeypatch.setattr(mod.git_sync_service, "enabled", False)
    monkeypatch.setattr(get_settings(), "notes_dir", tmp_path / "padrao")
    r = client_logado.put("/api/settings/", json={"notes_dir": str(tmp_path / "comum"), "git_sync": True})
    assert r.status_code == 400
    assert get_settings().notes_dir == tmp_path / "padrao"  # nada aplicado
    reset_repository_cache()


def test_settings_turns_git_sync_on_for_repo(client_logado, repos, monkeypatch):
    a, _ = repos
    chamadas = []
    monkeypatch.setattr(mod.git_sync_service, "enabled", False)
    monkeypatch.setattr(mod.git_sync_service, "notify_change", lambda: chamadas.append(1))
    r = client_logado.put("/api/settings/", json={"notes_dir": str(a), "git_sync": True})
    assert r.status_code == 200
    assert r.json()["git_sync"] is True and r.json()["notes_dir_is_git"] is True
    assert chamadas
    assert client_logado.get("/api/sync/status").json()["enabled"] is True


def test_saving_a_note_schedules_sync(client_logado, tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "notes_dir", tmp_path)
    reset_repository_cache()
    chamadas = []
    monkeypatch.setattr(mod.git_sync_service, "notify_change", lambda: chamadas.append(1))
    r = client_logado.post("/api/files/", json={"title": "Nota", "content": "oi"})
    assert r.status_code == 201, r.text
    assert chamadas == [1]
    client_logado.get("/api/files/")
    assert chamadas == [1]  # leitura não agenda
    reset_repository_cache()
