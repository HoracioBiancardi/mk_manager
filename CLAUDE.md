# CLAUDE.md — Contexto e Diretrizes do MK Manager

## Visão Geral do Projeto
O **MK Manager** é o gerenciador de notas e tarefas em Markdown padronizado sob o framework **SwordPower Starter Kit Universal** (**FastAPI + Vanilla JS ES Modules + CSS Variables + Pytest**).

---

## 🛠️ Comandos de Execução e Testes

```bash
# Entrar no diretório do projeto
cd /home/swordpower/Documentos/REPO/PESSOAL/mk_manager

# Executar o Servidor de Desenvolvimento via uv run (Recomendado)
uv run uvicorn mk_manager.main:app --reload --port 8888

# Alternativa direta com python
python3 -m uvicorn mk_manager.main:app --reload --port 8888

# Executar a Suíte Completa de Testes Automatizados (Pytest)
uv run pytest -v
```

- **URL Web Local**: `http://127.0.0.1:8888`

---

## 📐 Arquitetura e Serviços Padronizados

- **`crypto_vault_service.py`**: Cifragem Fernet (AES-128) + PBKDF2 (600k iterações), Gerador de Senhas e Avaliador de Força (`evaluate_password_strength`).
- **`db_service.py`**: Persistência SQLite WAL mode para configurações do app e armazenamentos auxiliares.
- **`task_runner_service.py`**: Execução assíncrona de tarefas em segundo plano com acompanhamento de progresso e logs.
- **`log_buffer_service.py`**: Console circular de logs em memória (estilo CLI/Web), com `LogBufferHandler` anexado ao logger raiz para captura automática de `logging.getLogger(__name__)` de qualquer módulo.
- **`notification_service.py`**: Notificador de Webhooks (Teams, Discord, Slack).
- **`file_service.py`**: Gestão completa dos arquivos `.md` (Kanban, tags `#tag`, wikilinks `[[WikiLink]]`, snippets com `<mark>`).

### Rotas de sistema (paridade com o app_template, só backend — sem UI própria)
- `GET /api/system/health`, `/metrics`, `/logs`, `POST /logs/clear` — expõe `log_buffer_service`.
- `POST /api/vault/encrypt`, `/decrypt`, `/generate-password` — expõe `crypto_vault_service`.
- `POST /api/tasks/start-demo`, `GET /list`, `GET /{task_id}`, `POST /{task_id}/cancel` — expõe `task_runner_service`.

---

## 🔐 Login e usuários (modelo do app_template)
- `services/auth_service.py` (portado do app_template): tabela `users` em `data/mk_manager.db`
  (`MK_DATA_DIR`, fora do git), PBKDF2 600k, bloqueio de 5 erros **por usuário** sem enumeração,
  troca obrigatória quando a senha foi definida pelo admin. Rotas em `routers/auth.py`.
- Sessão em **cookie** HttpOnly/SameSite=Strict (o app fica aberto o dia todo; não pede login a
  cada recarregar), expira após 30 min sem uso ou 12 h. Primeiro acesso cria o admin pela tela
  (o app só escuta em 127.0.0.1).
- `auth_middleware.py`: exige sessão em `/api/*` **e `/assets/*`** (anexos também são servidos e
  apagados fora de /api), `Content-Type: application/json` nos métodos que mudam estado (upload
  multipart liberado) e recusa `Sec-Fetch-Site` de outra origem. Sem CORS (mesma origem).
- Testes: `tests/conftest.py` dá um banco em memória e sessão de admin a cada teste.

## 🎨 Design System e Temas
- **Base visual = app_template**: `css/style.css` e `css/corporate.css`, `css/blau-tokens.css` e `css/blau-spa.css` (temas, cópias de `app_template/design_system/`) são cópias de lá (não editar
  aqui — mudar no template e copiar); `css/mk.css` tem só o domínio (editor, kanban, grafo...).
- **Temas**: `corporate` (Corporativo escuro, padrão), `corporate-light` (Corporativo claro) e `blau` (design system Blau). Ícones Material Symbols.
- **Layout**: Topbar, Activity Bar com rótulos (reordenável; Usuários e Ajustes fixos no fim),
  Sidebar redimensionável, tela Usuários (admin), toasts empilhados.

---

## 🔒 Revisão de Segurança

@~/.claude/security-review-checklist.md

Decisões da 2ª rodada (2026-09-29):
- **Markdown → HTML sempre por `sanitizeHtml()`** (`js/utils.js`, DOMPurify): as notas são
  compartilhadas entre usuários, e o `marked` repassa HTML cru (`<img onerror>`). Vale para o
  preview e para a exportação (janela `about:blank` herda a origem). Links `javascript:` viram texto.
- **CDN com versão exata + `integrity` (SRI)** no `index.html`. Ao trocar versão, recalcule:
  `curl -sL URL | openssl dgst -sha384 -binary | openssl base64 -A`.
- **Lockout reserva a tentativa antes do hash** (`auth_service.verify_password`, sob `threading.Lock`).
- Pendente: CSP (194 handlers `onclick=` inline a migrar para `data-*`, como no app_template).
