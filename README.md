# MK Manager

Gerenciador de arquivos Markdown com suporte a **notas** e **tarefas** (task lists).  
Backend em **FastAPI**, frontend em HTML/JS vanilla, arquivos salvos como `.md` reais no disco.

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Arquitetura e SOLID](#arquitetura-e-solid)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Execução](#execução)
- [Configuração](#configuração)
- [API Reference](#api-reference)
- [Formato dos Arquivos](#formato-dos-arquivos)
- [Frontend](#frontend)
- [Desenvolvimento](#desenvolvimento)

---

## Funcionalidades

| Feature | Descrição |
|---|---|
| **Notas** | Criar, editar e deletar notas em Markdown |
| **Tasks** | Tasks com checkboxes interativas (`- [ ]` / `- [x]`) |
| **Busca full-text** | Pesquisa em título, tags e conteúdo com ranking de relevância |
| **Tags** | Sistema de tags com filtro na sidebar |
| **Auto-save** | Salvo automaticamente 800ms após parar de digitar |
| **Split view** | Editor + Preview lado a lado |
| **Preview ao vivo** | Markdown renderizado em tempo real |
| **Export** | Download de arquivos `.md` individuais ou todos de uma vez |
| **Import** | Upload de arquivos `.md` com parse de frontmatter YAML |
| **Arquivos reais** | Cada nota/task é um `.md` legível por qualquer editor |
| **Compatível** | Funciona com Obsidian, VSCode, Typora etc. |

---

## Estrutura do Projeto

```
mk_manager/
├── pyproject.toml              # Configuração uv + dependências
├── .python-version             # Versão Python fixada (3.11)
├── .gitignore
├── .env                        # Variáveis de ambiente (opcional)
├── notes/                      # Diretório dos arquivos .md (auto-criado)
│   └── abc123def456.md
└── mk_manager/                 # Pacote Python
    ├── __init__.py
    ├── main.py                 # App factory + CLI entry point
    ├── config.py               # Settings via pydantic-settings
    ├── dependencies.py         # Providers de injeção de dependência
    ├── static/
    │   └── app.html            # Frontend SPA (HTML + JS vanilla)
    ├── domain/                 # Camada de domínio (sem dependências externas)
    │   └── entities.py         # FileRecord, SearchResult
    ├── models/                 # Schemas Pydantic (HTTP I/O)
    │   └── schemas.py          # Request/Response models
    ├── repositories/           # Camada de acesso a dados
    │   ├── base.py             # AbstractFileRepository (interface)
    │   └── markdown.py         # MarkdownFileRepository (implementação)
    ├── services/               # Lógica de negócio
    │   └── file_service.py     # FileService
    └── routers/                # Handlers HTTP (adapters)
        ├── files.py            # CRUD /api/files
        ├── search.py           # GET /api/search
        └── stats.py            # GET /api/stats
```

---

## Arquitetura e SOLID

O projeto segue os cinco princípios SOLID:

### S — Single Responsibility Principle
Cada módulo tem **uma única razão para mudar**:

| Módulo | Responsabilidade |
|---|---|
| `domain/entities.py` | Modelar o conceito de "arquivo markdown" |
| `repositories/markdown.py` | Ler e escrever arquivos no disco |
| `services/file_service.py` | Aplicar regras de negócio (busca, IDs, timestamps) |
| `routers/files.py` | Traduzir HTTP → serviço → resposta JSON |
| `config.py` | Carregar configuração do ambiente |

### O — Open/Closed Principle
O `FileService` está **aberto para extensão** via `AbstractFileRepository`, mas **fechado para modificação**.  
Para usar SQLite, basta criar `SqliteFileRepository(AbstractFileRepository)` e injetá-lo em `dependencies.py` — sem tocar no serviço.

### L — Liskov Substitution Principle
`MarkdownFileRepository` implementa todos os métodos abstratos de `AbstractFileRepository` e pode substituí-lo em qualquer ponto do código sem quebrar comportamentos.

### I — Interface Segregation Principle
`AbstractFileRepository` expõe apenas os métodos que o serviço precisa. Clientes que só precisam listar arquivos não são forçados a implementar métodos de escrita.

### D — Dependency Inversion Principle
```
Router → FileService → AbstractFileRepository ← MarkdownFileRepository
```
A camada de alto nível (`FileService`) depende da **abstração** (`AbstractFileRepository`), não da implementação concreta (`MarkdownFileRepository`). A injeção ocorre em `dependencies.py`.

---

## Pré-requisitos

- [uv](https://docs.astral.sh/uv/) — gerenciador de pacotes Python
- Python 3.11+

```bash
# Instalar uv (caso ainda não tenha)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

## Instalação

```bash
# Clonar / entrar no diretório
cd mk_manager

# Criar o ambiente virtual e instalar dependências
uv sync

# (Opcional) instalar dependências de desenvolvimento
uv sync --group dev
```

---

## Execução

```bash
uv run mk-manager
```

### Com opções customizadas

```bash
# Porta diferente
MK_PORT=9000 uv run mk-manager

# Sem hot-reload
MK_DEBUG=false uv run mk-manager

# Diretório de notas customizado
MK_NOTES_DIR=/home/user/vault uv run mk-manager

# Usando uvicorn diretamente
uv run uvicorn mk_manager.main:app --reload --port 8888
```

### Acessar

| URL | Descrição |
|---|---|
| `http://localhost:8888` | Aplicação frontend |
| `http://localhost:8888/docs` | Swagger UI interativo |
| `http://localhost:8888/redoc` | ReDoc (documentação alternativa) |

---

## Configuração

Todas as configurações usam o prefixo `MK_` e podem ser definidas em `.env`:

```env
# .env
MK_NOTES_DIR=./notes       # Diretório dos arquivos markdown
MK_HOST=0.0.0.0            # Endereço de bind do servidor
MK_PORT=8888               # Porta TCP
MK_DEBUG=true              # Habilita hot-reload
```

| Variável | Padrão | Descrição |
|---|---|---|
| `MK_NOTES_DIR` | `./notes` | Diretório onde os `.md` são salvos |
| `MK_HOST` | `0.0.0.0` | Host do servidor |
| `MK_PORT` | `8888` | Porta do servidor |
| `MK_DEBUG` | `true` | Hot-reload automático |

---

## API Reference

Base URL: `http://localhost:8888/api`

### Arquivos

#### `GET /api/files`
Lista todos os arquivos (sem conteúdo), ordenados por data de modificação.

**Query params:**
- `type` — filtrar por `note` ou `task`

**Resposta `200`:**
```json
[
  {
    "id": "abc123def45678",
    "title": "Reunião de Sprint",
    "type": "note",
    "tags": ["trabalho", "sprint"],
    "filename": "abc123def45678.md",
    "created": "2024-01-15T10:30:00+00:00",
    "modified": "2024-01-15T11:00:00+00:00",
    "word_count": 142,
    "task_total": 0,
    "task_done": 0
  }
]
```

---

#### `POST /api/files`
Cria um novo arquivo.

**Body:**
```json
{
  "title": "Minha Nota",
  "type": "note",
  "tags": ["pessoal"],
  "content": "## Introdução\n\nConteúdo aqui..."
}
```

**Resposta `201`:** `FileDetailResponse` (inclui `content`)

---

#### `GET /api/files/{id}`
Retorna um arquivo completo com conteúdo.

**Resposta `200`:** `FileDetailResponse`  
**Resposta `404`:** arquivo não encontrado

---

#### `PUT /api/files/{id}`
Atualização parcial. Campos `null` são preservados.

**Body:**
```json
{
  "title": "Novo Título",
  "content": "Conteúdo atualizado...",
  "tags": ["trabalho", "importante"]
}
```

**Resposta `200`:** `FileDetailResponse`

---

#### `DELETE /api/files/{id}`
Remove permanentemente o arquivo do disco.

**Resposta `204`:** sem corpo  
**Resposta `404`:** arquivo não encontrado

---

### Busca

#### `GET /api/search`
Busca full-text com ranking de relevância.

**Query params:**
- `q` — termo de busca (case-insensitive)
- `type` — filtrar por `note` ou `task`

**Ranking interno:**

| Match | Pontos |
|---|---|
| Título | +20 |
| Tag | +10 |
| Conteúdo | +1 |

**Resposta `200`:**
```json
[
  {
    "id": "abc123",
    "title": "Reunião de Sprint",
    "snippet": "…discutimos o backlog do próximo **sprint**…",
    "word_count": 142,
    ...
  }
]
```

---

### Estatísticas

#### `GET /api/stats`

**Resposta `200`:**
```json
{
  "total": 12,
  "notes": 8,
  "tasks": 4,
  "size_bytes": 24576
}
```

---

## Formato dos Arquivos

Cada arquivo `.md` no diretório `notes/` segue o padrão **YAML frontmatter + Markdown**:

```markdown
---
id: abc123def45678
title: Reunião de Sprint
type: note
tags:
- trabalho
- sprint
created: '2024-01-15T10:30:00+00:00'
modified: '2024-01-15T11:00:00+00:00'
---
## Pauta

- Review do backlog
- Definição de prioridades

## Notas

Decidimos mover o item X para a próxima sprint.
```

**Tasks** usam a sintaxe padrão GFM:

```markdown
---
id: def456abc78901
title: Tarefas da Sprint 12
type: task
tags:
- trabalho
created: '2024-01-15T09:00:00+00:00'
modified: '2024-01-15T17:30:00+00:00'
---
- [x] Revisar PRs pendentes
- [x] Atualizar documentação
- [ ] Deploy em staging
- [ ] Code review da feature X
```

Os arquivos são **compatíveis** com Obsidian, VSCode (extensão Markdown), Typora e qualquer editor de texto.

---

## Frontend

O arquivo `app.html` é uma SPA (Single Page Application) com:

- Design glassmorphism dark com fundo animado (partículas + aurora)
- **Sidebar**: lista de arquivos com busca, filtros e progresso de tasks
- **Editor**: textarea monospace com toolbar de formatação Markdown
- **Preview**: renderização ao vivo via [marked.js](https://marked.js.org/)
- **Split view** / Editor only / Preview only
- **Checkboxes interativos** no preview — clicar atualiza o arquivo
- **Tags**: adicionar com Enter ou vírgula, remover com ×
- **Auto-save** com debounce de 800ms
- **Indicador de conexão** (● online / ● offline)

**Atalhos de teclado:**

| Atalho | Ação |
|---|---|
| `Ctrl+N` | Nova nota |
| `Ctrl+Shift+N` | Nova task |
| `Ctrl+S` | Forçar save |
| `Tab` | Indentar (2 espaços) |
| `Enter` | Continuar lista automaticamente |
| `Esc` | Fechar modal |

---

## Desenvolvimento

### Instalar dependências de dev

```bash
uv sync --group dev
```

### Rodar testes

```bash
uv run pytest
```

### Estrutura de testes sugerida

```
tests/
├── conftest.py              # Fixtures: tmp_path, TestClient
├── test_repository.py       # Testes unitários do MarkdownFileRepository
├── test_service.py          # Testes unitários do FileService
└── test_api.py              # Testes de integração dos endpoints
```

### Adicionar uma nova dependência

```bash
uv add <pacote>              # produção
uv add --group dev <pacote>  # desenvolvimento
```

### Trocar o backend de armazenamento

1. Criar `src/mk_manager/repositories/sqlite.py` implementando `AbstractFileRepository`
2. Em `dependencies.py`, trocar `MarkdownFileRepository` por `SqliteFileRepository`
3. Zero mudanças em `FileService` ou nos routers

---

## Licença

MIT
