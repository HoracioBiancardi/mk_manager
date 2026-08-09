# MK Manager — Sistema de Notas & Kanban em Markdown

Gerenciador de notas e tarefas baseado em arquivos Markdown (.md) com frontmatter YAML, visualização Kanban, grafo de conexões, busca em texto completo e design modernizado baseado no **SwordPower Starter Kit Universal**.

---

## ⚡ Principais Recursos

- **Persistência em Disco & SQLite WAL**: Leitura direta de notas `.md` com frontmatter + banco SQLite acelerado.
- **Serviços Backend Padronizados**: `crypto_vault_service`, `db_service`, `task_runner_service`, `log_buffer_service` e `notification_service`.
- **Visão Kanban & Tags**: Transição de status de tarefas, tags hierárquicas (`#área/sub`) e wikilinks (`[[WikiLink]]`).
- **Gerenciador de Assets & Anexos**: Upload inteligente de imagens/PDFs.
- **Activity Bar & Sidebar Redimensionável**: Painéis laterais com ajuste por drag-and-drop.
- **Suporte a 3 Temas**: Corporativo (`corporate`), Verde Neutro (`green-neutral`) e Cyber Dark (`cyber-dark`).

---

## 🚀 Como Executar

```bash
# Entrar no diretório do projeto
cd /home/swordpower/Documentos/REPO/PESSOAL/mk_manager

# Iniciar o servidor web (FastAPI + Uvicorn)
python3 -m uvicorn mk_manager.main:app --reload --port 8888
```

Acesse a interface em: **`http://127.0.0.1:8888`**

---

## 🧪 Suíte de Testes Automatizados

```bash
PYTHONPATH=. /home/swordpower/snap/antigravity/5/.local/bin/pytest -v
```
