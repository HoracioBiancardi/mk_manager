"""A pasta de notas escolhida em Ajustes sobrevive a reiniciar o app."""

from pathlib import Path

from mk_manager.config import get_settings
from mk_manager.dependencies import reset_repository_cache
from mk_manager.routers.settings import load_saved_paths


def test_saved_notes_dir_comes_back_after_restart(client_logado, tmp_path: Path, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "notes_dir", tmp_path / "padrao")
    monkeypatch.setattr(s, "assets_dir", None)
    escolhida = tmp_path / "vault"
    r = client_logado.put("/api/settings/", json={"notes_dir": str(escolhida)})
    assert r.status_code == 200

    s.notes_dir = tmp_path / "padrao"  # o que a subida do app teria sem o salvo
    load_saved_paths()
    assert s.notes_dir == escolhida.resolve()
    reset_repository_cache()


def test_env_var_wins_over_saved_folder(auth, tmp_path: Path, monkeypatch):
    (tmp_path / "salva").mkdir()
    auth.db.set_key("paths", {"notes_dir": str(tmp_path / "salva"), "assets_dir": ""})
    s = get_settings()
    monkeypatch.setattr(s, "notes_dir", tmp_path / "env")
    monkeypatch.setattr("mk_manager.config.ENV_FIELDS", frozenset({"notes_dir"}))
    load_saved_paths()
    assert s.notes_dir == tmp_path / "env"
    reset_repository_cache()
