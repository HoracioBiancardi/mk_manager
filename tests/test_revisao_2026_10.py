"""Regressões da revisão de 2026-10-15: pastas, configuração, anexos, sessão e gravação."""

import asyncio
import io
from pathlib import Path

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient

from mk_manager.config import get_settings
from mk_manager.dependencies import reset_repository_cache
from mk_manager.main import app
from mk_manager.models.schemas import FileCreateRequest, FileUpdateRequest
from mk_manager.repositories.markdown import MarkdownFileRepository
from mk_manager.routers import assets as assets_router
from mk_manager.services.auth_service import SESSION_COOKIE
from mk_manager.services.file_service import FileConflictError, FileService


@pytest.fixture
def base(tmp_path: Path) -> Path:
    (tmp_path / "fora.txt").write_text("fora das notas")
    return tmp_path


@pytest.fixture
def service(base: Path) -> FileService:
    return FileService(MarkdownFileRepository(base / "notes"))


@pytest.fixture
def notes_env(base: Path, monkeypatch):
    """Aponta o app para notes/ temporário (rotas HTTP)."""
    s = get_settings()
    monkeypatch.setattr(s, "notes_dir", base / "notes")
    monkeypatch.setattr(s, "assets_dir", None)
    reset_repository_cache()
    yield base / "notes"
    reset_repository_cache()


# ── Pastas ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("pasta", ["", "/", "..", "../..", "a/../..", "_trash", "assets"])
def test_excluir_pasta_invalida_nao_apaga_nada(service, base, pasta):
    service.create_file(FileCreateRequest(title="Nota A", content="x"))
    with pytest.raises(ValueError):
        service.delete_folder(pasta)
    assert (base / "fora.txt").exists()
    assert (base / "notes" / "nota-a.md").exists()


@pytest.mark.parametrize("origem,destino", [("..", "x"), ("", "x"), ("proj", ".."), ("proj", "proj/sub"), ("proj", "_archive")])
def test_renomear_pasta_invalida_e_recusado(service, base, origem, destino):
    service.create_file(FileCreateRequest(title="Nota P", content="x", folder="proj"))
    with pytest.raises(ValueError):
        service.rename_folder(origem, destino)
    assert (base / "notes" / "proj" / "nota-p.md").exists()


def test_excluir_pasta_preserva_arquivos_que_o_servico_nao_lista(service, base):
    service.create_file(FileCreateRequest(title="Nota B", content="x", folder="proj"))
    (base / "notes" / "proj" / ".oculto").write_text("segredo")
    (base / "notes" / "proj" / "quebrado.md").write_text("---\n: [yaml inválido\n---\ntexto")
    service.delete_folder("proj")
    notes = base / "notes"
    assert (notes / "nota-b.md").exists()
    assert (notes / ".oculto").read_text() == "segredo"
    assert (notes / "quebrado.md").exists()
    assert not (notes / "proj").exists()


def test_renomear_pasta_move_subpastas(service, base):
    service.create_file(FileCreateRequest(title="Nota C", content="x", folder="a/b"))
    assert service.rename_folder("a", "z") == 1
    assert (base / "notes" / "z" / "b" / "nota-c.md").exists()
    assert not (base / "notes" / "a").exists()


def test_rota_de_pasta_responde_400(client_logado, notes_env):
    r = client_logado.request("DELETE", "/api/files/folder", params={"path": ".."},
                              headers={"Content-Type": "application/json"})
    assert r.status_code == 400
    assert notes_env.parent.joinpath("fora.txt").exists()


# ── Configuração só para admin ────────────────────────────────────────────────

@pytest.fixture
def client_comum(auth):
    user = auth.create_user("comum", "Senha-Comum-2026!")
    return TestClient(app, cookies={SESSION_COOKIE: auth.create_session(user)})


@pytest.mark.parametrize("metodo,rota", [
    ("GET", "/api/settings/"), ("PUT", "/api/settings/"), ("GET", "/api/settings/browse"),
    ("GET", "/api/system/logs"), ("POST", "/api/system/logs/clear"), ("GET", "/api/system/metrics"),
    ("POST", "/api/tasks/start-demo"), ("POST", "/api/vault/generate-password"),
])
def test_rotas_de_admin_recusam_usuario_comum(client_comum, metodo, rota):
    r = client_comum.request(metodo, rota, json={"notes_dir": "/"})
    assert r.status_code == 403


def test_usuario_comum_continua_usando_as_notas(client_comum, notes_env):
    assert client_comum.get("/api/files/").status_code == 200


def test_demo_limita_passos(client_logado):
    r = client_logado.post("/api/tasks/start-demo", json={"steps": 10**9, "delay": 0})
    assert r.status_code == 422


# ── Troca de senha obrigatória ────────────────────────────────────────────────

def test_troca_obrigatoria_bloqueia_a_api(auth, notes_env):
    user = auth.create_user("novo", "Senha-Temporaria-1!", must_change=True)
    c = TestClient(app, cookies={SESSION_COOKIE: auth.create_session(user)})
    assert c.get("/api/files/").status_code == 403
    assert c.get("/api/auth/me").status_code == 200
    r = c.post("/api/auth/change-password", json={
        "username": "novo", "current_password": "Senha-Temporaria-1!", "new_password": "Nova-Senha-Forte-2026!"})
    assert r.status_code == 200


# ── Anexos ────────────────────────────────────────────────────────────────────

def test_limpeza_de_anexo_remove_so_o_link_certo(service):
    conteudo = "\n".join([
        "Veja ![a](/assets/a.png) e o resto da linha",
        "![a](/api/assets/a.png)",
        "![outro](/assets/data.png)",
        "[bak](/assets/a.png.bak)",
        "texto citando a.png sem link",
        '<img src="/assets/a.png" width="10">',
    ])
    nota = service.create_file(FileCreateRequest(title="Com anexos", content=conteudo))
    assert assets_router.find_asset_usage("data.png", service)[0]["id"] == nota.id
    assert assets_router.cleanup_asset_references("a.png", service) == ["Com anexos"]
    assert service.get_file(nota.id).content.split("\n") == [
        "Veja  e o resto da linha",
        "![outro](/assets/data.png)",
        "[bak](/assets/a.png.bak)",
        "texto citando a.png sem link",
    ]


def test_anexo_com_espaco_e_nome_codificado(service):
    nota = service.create_file(FileCreateRequest(title="Espaco", content="![x](/assets/meu%20print.png)\nfim"))
    assets_router.cleanup_asset_references("meu print.png", service)
    assert service.get_file(nota.id).content == "fim"


def test_excluir_anexo_inexistente_nao_mexe_nas_notas(client_logado, notes_env):
    client_logado.post("/api/files/", json={"title": "Ref", "content": "![x](/assets/sumiu.png)"})
    r = client_logado.request("DELETE", "/api/assets/sumiu.png", headers={"Content-Type": "application/json"})
    assert r.status_code == 404
    assert client_logado.get("/api/files/ref").json()["content"] == "![x](/assets/sumiu.png)"


def test_svg_sai_com_csp_sandbox_e_png_nao(client_logado, notes_env):
    pasta = notes_env / "assets"
    pasta.mkdir(parents=True)
    (pasta / "x.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    (pasta / "x.png").write_bytes(b"\x89PNG")
    assert "sandbox" in client_logado.get("/assets/x.svg").headers["content-security-policy"]
    assert "content-security-policy" not in client_logado.get("/assets/x.png").headers


def test_anexo_com_porcento_no_nome(client_logado, notes_env):
    pasta = notes_env / "assets"
    pasta.mkdir(parents=True)
    (pasta / "50%.png").write_bytes(b"png")
    assert client_logado.get("/assets/50%25.png").content == b"png"


def test_upload_acima_do_limite_e_recusado(notes_env, monkeypatch):
    monkeypatch.setattr(assets_router, "MAX_UPLOAD_SIZE_BYTES", 10)
    monkeypatch.setattr(assets_router, "_UPLOAD_CHUNK", 4)
    with pytest.raises(Exception) as exc:
        asyncio.run(assets_router.upload_asset(UploadFile(filename="big.bin", file=io.BytesIO(b"x" * 50))))
    assert getattr(exc.value, "status_code", None) == 413


# ── Gravação ──────────────────────────────────────────────────────────────────

def test_conflito_de_edicao(service):
    nota = service.create_file(FileCreateRequest(title="Conflito", content="v1"))
    lida = nota.modified
    service.update_file(nota.id, FileUpdateRequest(content="outra aba"))
    with pytest.raises(FileConflictError):
        service.update_file(nota.id, FileUpdateRequest(content="minha", expected_modified=lida))
    assert service.get_file(nota.id).content == "outra aba"
    atual = service.get_file(nota.id).modified
    assert service.update_file(nota.id, FileUpdateRequest(content="minha", expected_modified=atual)).content == "minha"


def test_conflito_responde_409(client_logado, notes_env):
    nota = client_logado.post("/api/files/", json={"title": "Http", "content": "v1"}).json()
    client_logado.put("/api/files/http", json={"content": "v2"})
    r = client_logado.put("/api/files/http", json={"content": "v3", "expected_modified": nota["modified"]})
    assert r.status_code == 409


def test_gravacao_atomica_nao_deixa_temporario(service, base, monkeypatch):
    nota = service.create_file(FileCreateRequest(title="Atomica", content="original"))
    caminho = base / "notes" / "atomica.md"

    def falha(*_a, **_k):
        raise OSError("disco cheio")

    import mk_manager.repositories.markdown as md
    monkeypatch.setattr(md.os, "replace", falha)
    with pytest.raises(OSError):
        service.update_file(nota.id, FileUpdateRequest(content="novo"))
    assert "original" in caminho.read_text()
    assert not list((base / "notes").glob(".*.tmp"))
