"""Regressões da 2ª rodada da revisão de segurança (2026-09-29)."""

from concurrent.futures import ThreadPoolExecutor

from mk_manager.services import auth_service as auth_mod


def test_rajada_de_senhas_em_paralelo_confere_no_maximo_o_limite(auth, monkeypatch):
    """Antes, a checagem do bloqueio vinha antes do hash e a contagem depois: 40 tentativas em
    paralelo testavam 40 senhas."""
    auth.create_user("alvo", "Senha-Certa-2026!")
    conferidas = []
    original = auth._hash

    def espiao(senha, salt, iteracoes):
        conferidas.append(senha)
        return original(senha, salt, iteracoes)

    monkeypatch.setattr(auth, "_hash", espiao)

    def tentar(i):
        try:
            auth.verify_password("alvo", f"errada-{i}")
        except auth_mod.AuthLockedError:
            pass

    with ThreadPoolExecutor(20) as pool:
        list(pool.map(tentar, range(40)))
    assert len(conferidas) <= auth_mod.MAX_FAILURES



def test_preview_markdown_passa_pelo_dompurify():
    """As notas são compartilhadas: o HTML do marked vai para innerHTML só depois do DOMPurify."""
    import re
    from pathlib import Path

    js = Path("mk_manager/frontend/js")
    assert "sanitizeHtml(" in (js / "preview.js").read_text(encoding="utf-8")
    assert "sanitizeHtml(marked.parse" in (js / "export.js").read_text(encoding="utf-8")
    html = Path("mk_manager/frontend/index.html").read_text(encoding="utf-8")
    assert "purify.min.js" in html
    for tag in re.findall(r"<(?:script|link)[^>]+(?:src|href)=\"https://(?!fonts\.)[^>]+>", html):
        assert 'integrity="sha384-' in tag, tag
