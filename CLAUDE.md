# CLAUDE.md — Contexto e Diretrizes do MK Manager

## Visão Geral do Projeto
O **MK Manager** é o gerenciador de notas e tarefas em Markdown padronizado sob o framework **SwordPower Starter Kit Universal** (**FastAPI + Vanilla JS ES Modules + CSS Variables + Pytest**).

---

## 🛠️ Comandos de Execução e Testes

```bash
# Entrar no diretório do projeto
cd /home/swordpower/Documentos/REPO/PESSOAL/mk_manager

# Executar o Servidor de Desenvolvimento via uv run (Recomendado)
uv run uvicorn mk_manager.main:app --reload --port 8001

# Alternativa direta com python
python3 -m uvicorn mk_manager.main:app --reload --port 8001

# Executar a Suíte Completa de Testes Automatizados (Pytest)
uv run pytest -v
```

- **URL Web Local**: `http://127.0.0.1:8888`

---

## 📐 Arquitetura e Serviços Padronizados

- **`crypto_vault_service.py`**: Cifragem Fernet (AES-128) + PBKDF2 (600k iterações) e Gerador de Senhas.
- **`db_service.py`**: Persistência SQLite WAL mode para configurações do app e armazenamentos auxiliares.
- **`task_runner_service.py`**: Execução assíncrona de tarefas em segundo plano com acompanhamento de progresso e logs.
- **`log_buffer_service.py`**: Console circular de logs em memória (estilo CLI/Web).
- **`notification_service.py`**: Notificador de Webhooks (Teams, Discord, Slack).
- **`file_service.py`**: Gestão completa dos arquivos `.md` (Kanban, tags `#tag`, wikilinks `[[WikiLink]]`, snippets com `<mark>`).

---

## 🎨 Design System e Temas
- **Temas**: `corporate`, `green-neutral` e `cyber-dark`.
- **Layout**: Topbar animada, Activity Bar de ícones, Sidebar expansível e redimensionável com salvamento em `localStorage`.
