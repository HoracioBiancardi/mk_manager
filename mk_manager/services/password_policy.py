"""Regra de senha do ecossistema (= `scripts/password_service.py` do invest_sap).

Mínimo de 10 caracteres e força pelo menos "Média" (score 45) na pontuação do
`crypto_vault_service.evaluate_password_strength` (comprimento + classes de caractere). O
servidor é quem decide; o medidor da tela (`frontend/js/senha.js` e o `/kit`) só antecipa.
Senha gerada sempre cumpre a regra (ao menos um caractere de cada classe).
"""

from __future__ import annotations

import secrets
import string
from dataclasses import dataclass

MIN_TAMANHO = 10
SCORE_MINIMO = 45       # "Média"
SCORE_FORTE = 65        # "Forte" (segredos mais sensíveis, ex.: senha mestra)
SIMBOLOS = "!@#$%^&*()_+-=[]{}|;:,.<>?"


@dataclass(frozen=True)
class ForcaSenha:
    score: int
    nivel: str
    feedback: tuple[str, ...]


def avaliar(senha: str) -> ForcaSenha:
    """Score 0-100, nível e dicas (mesmas regras do invest_sap e do crypto_vault_service)."""
    if not senha:
        return ForcaSenha(0, "Muito Fraca", ("Digite uma senha",))
    score, dicas = 0, []
    if len(senha) >= 16:
        score += 35
    elif len(senha) >= 12:
        score += 25
    elif len(senha) >= 8:
        score += 15
    else:
        dicas.append("Aumente o comprimento para pelo menos 12 caracteres")
    for presente, dica in (
        (any(c in string.ascii_uppercase for c in senha), "Adicione letras maiúsculas (A-Z)"),
        (any(c in string.ascii_lowercase for c in senha), "Adicione letras minúsculas (a-z)"),
        (any(c in string.digits for c in senha), "Adicione números (0-9)"),
        (any(c in SIMBOLOS for c in senha), "Adicione símbolos especiais (!@#$)"),
    ):
        if presente:
            score += 15
        else:
            dicas.append(dica)
    score = min(100, score)
    nivel = ("Excelente" if score >= 85 else "Forte" if score >= 65 else "Média" if score >= 45
             else "Fraca" if score >= 25 else "Muito Fraca")
    return ForcaSenha(score, nivel, tuple(dicas) or ("Senha altamente segura!",))


def problemas(senha: str, score_minimo: int = SCORE_MINIMO) -> list[str]:
    """O que impede a senha de ser aceita (lista vazia = aceitável)."""
    if len(senha) < MIN_TAMANHO:
        return [f"A senha precisa ter ao menos {MIN_TAMANHO} caracteres."]
    forca = avaliar(senha)
    if forca.score < score_minimo:
        rotulo = "Forte" if score_minimo >= SCORE_FORTE else "Média"
        return [f"Senha {forca.nivel.lower()} — o mínimo é força {rotulo}.", *forca.feedback]
    return []


def validar(senha: str, score_minimo: int = SCORE_MINIMO) -> None:
    """ValueError com a explicação quando a senha não cumpre a regra."""
    erros = problemas(senha, score_minimo)
    if erros:
        raise ValueError(" ".join(erros))


def gerar(tamanho: int = 16) -> str:
    """Senha aleatória (`secrets`) com ao menos uma maiúscula, minúscula, número e símbolo."""
    classes = [string.ascii_uppercase, string.ascii_lowercase, string.digits, SIMBOLOS]
    chars = [secrets.choice(c) for c in classes]
    todos = "".join(classes)
    chars += [secrets.choice(todos) for _ in range(max(tamanho, MIN_TAMANHO) - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)
