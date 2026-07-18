# MK Manager

Gerenciador de arquivos Markdown com suporte a **notas**, **tarefas** (task lists) e **quadro kanban**.  
Backend em **FastAPI**, frontend em HTML/JS vanilla, arquivos salvos como `.md` reais no disco — sem banco de dados.

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
| **Tasks** | Tasks com checkboxes interativas (`- [ ]` / `- [x]`), incluindo subtarefas indentadas; quando **todas** as subtarefas de uma tarefa-mãe ficam concluídas, a mãe é marcada automaticamente (cascata em múltiplos níveis de aninhamento) |
| **Pastas** | Organização em pastas/subpastas; renomear/mover move tudo que está aninhado; "deletar" uma pasta apenas move o conteúdo para a pasta pai (nunca destrói dados) |
| **Kanban** | Status (`planning`/`development`/`review`/`done`, colunas customizáveis) com `status_changed_at` preenchido/atualizado automaticamente a cada mudança de status; modal de edição rápida das tasks direto do card |
| **Lista** | Tela estilo ClickUp: tabela de notas/tasks ordenável por qualquer coluna, filtrável por tipo/status/tag/pasta/título, com status editável direto na linha e agrupamento opcional (por status, pasta, tag ou tipo) em seções recolhíveis |
| **Arquivo** | Arquivar notas/tasks tira do Kanban/Lista/Grafo sem apagar nada (fica em `_archive/`, restaurável a qualquer momento); arquivamento manual (botão no card do Kanban ou na tela Arquivo) ou em lote por idade da conclusão |
| **Grafo de notas** | Visualização das notas conectadas por `[[wikilinks]]`, filtrável por tipo/tag/pasta; links para títulos inexistentes viram nós "phantom" (fantasma) em vez de serem descartados |
| **Tags** | Tags de frontmatter + tags inline `#tag` extraídas do corpo do texto (ignorando código e URLs); filtro hierárquico (`area` também casa com `area/sub`); renomear/mesclar uma tag em todos os arquivos de uma vez |
| **Busca full-text** | Pesquisa em título, tags e conteúdo com ranking de relevância |
| **Abas de arquivos recentes** | Até 5 últimos arquivos abertos como abas acima do editor, com botão de fechar (`×`, só remove da lista — não apaga o arquivo) e atalhos de teclado para navegar entre elas |
| **Temas & CRT (Pip-Boy)** | 7 temas de cor (Verde Fósforo, Âmbar Fallout NV, Azul Fallout 4, Branco, Vermelho Enclave, Roxo Vault-Tec, Corporativo/neutro) + efeitos CRT opcionais (scanlines, flicker, estática, curvatura, transição, varredura de radar) e efeitos sonoros mecânicos, tudo persistido no navegador |
| **Auto-save** | Salvo automaticamente 800ms após parar de digitar |
| **Split view** | Editor + Preview lado a lado |
| **Preview ao vivo** | Markdown renderizado em tempo real |
| **Quick Open** | Abrir qualquer arquivo rapidamente (`Ctrl+K`) |
| **Diagram builder** | Editor visual de diagramas embutido |
| **Table builder** | Editor visual de tabelas Markdown (grade de células, edição in-place de tabelas existentes) |
| **Assets** | Upload de imagens/arquivos anexados às notas (deduplicação automática de nome) |
| **Backup** | Download de um `.zip` com todo o diretório de notas |
| **Export** | Download de arquivos `.md` individuais ou todos de uma vez |
| **Import** | Upload de arquivos `.md` com parse de frontmatter YAML |
| **Configuração em runtime** | Trocar o diretório de notas e/ou de assets sem reiniciar o servidor (via `/api/settings`, com seletor de pastas) |
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
    ├── config.py                # Settings via pydantic-settings
    ├── dependencies.py          # Providers de injeção de dependência
    ├── frontend/                 # Frontend SPA (HTML + CSS + JS vanilla)
    │   ├── index.html
    │   ├── favicon.svg
    │   ├── css/
    │   │   └── style.css
    │   └── js/
    │       ├── app.js            # Bootstrap + listener de teclado global
    │       ├── config.js         # Atalhos de teclado centralizados (ex.: abas recentes)
    │       ├── state.js          # Estado global da SPA
    │       ├── api.js            # Client HTTP
    │       ├── editor.js         # Textarea + toolbar de formatação
    │       ├── preview.js        # Renderização Markdown ao vivo + vínculo subtarefa/tarefa-mãe
    │       ├── sidebar.js        # Árvore de arquivos/pastas
    │       ├── files.js          # CRUD de arquivos no frontend + abas de recentes
    │       ├── search-filter.js  # Busca e filtros
    │       ├── graph.js          # Visualização do grafo de notas
    │       ├── kanban.js         # Quadro kanban + modal de edição rápida
    │       ├── list.js           # Tela Lista (tabela ordenável/agrupável)
    │       ├── archive.js        # Tela Arquivo (restaurar/excluir arquivadas)
    │       ├── diagram-builder.js# Editor visual de diagramas
    │       ├── table-builder.js  # Editor visual de tabelas Markdown
    │       ├── quickopen.js      # Busca rápida (Ctrl+K)
    │       ├── contextmenu.js    # Menu de contexto
    │       ├── delete-modal.js   # Modal de confirmação de exclusão
    │       ├── settings.js       # Modal de configurações
    │       ├── prefs.js          # Preferências persistidas (tema, CRT, fonte, sidebar)
    │       ├── assets.js         # Upload de assets
    │       ├── export.js         # Export de arquivos
    │       ├── format-code.js    # Formatação de blocos de código
    │       ├── sfx.js            # Efeitos sonoros
    │       ├── views.js          # Alternância entre as "telas cheias" (panes)
    │       └── utils.js
    ├── domain/                   # Camada de domínio (sem dependências externas)
    │   └── entities.py           # FileRecord, SearchResult
    ├── models/                   # Schemas Pydantic (HTTP I/O)
    │   └── schemas.py            # Request/Response models
    ├── repositories/              # Camada de acesso a dados
    │   ├── base.py                # AbstractFileRepository (interface)
    │   └── markdown.py            # MarkdownFileRepository (implementação)
    ├── services/                  # Lógica de negócio
    │   └── file_service.py        # FileService
    └── routers/                   # Handlers HTTP (adapters)
        ├── files.py                # CRUD /api/files + pastas
        ├── search.py                # GET /api/search
        ├── stats.py                 # GET /api/stats
        ├── tags.py                  # PUT /api/tags/{old_tag} (rename/merge)
        ├── graph.py                  # GET /api/graph
        ├── settings.py                # /api/settings (config em runtime + backup)
        └── assets.py                   # POST /api/assets (upload)
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
| `services/file_service.py` | Aplicar regras de negócio (busca, tags, grafo, pastas, kanban, IDs, timestamps) |
| `routers/*.py` | Traduzir HTTP → serviço → resposta JSON |
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
A camada de alto nível (`FileService`) depende da **abstração** (`AbstractFileRepository`), não da implementação concreta (`MarkdownFileRepository`). A injeção ocorre em `dependencies.py`, onde o repositório é mantido como singleton em cache (`lru_cache`) — reconstruído sob demanda via `reset_repository_cache()` quando o diretório de notas muda em runtime.

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
uv run mk
```

### Com opções customizadas

```bash
# Porta diferente
MK_PORT=9000 uv run mk

# Sem hot-reload
MK_DEBUG=false uv run mk

# Diretório de notas customizado
MK_NOTES_DIR=/home/user/vault uv run mk

# Usando uvicorn diretamente
uv run uvicorn mk_manager.main:app --reload --port 8099
```

### Acessar

| URL | Descrição |
|---|---|
| `http://localhost:8099` | Aplicação frontend |
| `http://localhost:8099/docs` | Swagger UI interativo |
| `http://localhost:8099/redoc` | ReDoc (documentação alternativa) |

---

## Configuração

Todas as configurações usam o prefixo `MK_` e podem ser definidas em `.env`:

```env
# .env
MK_NOTES_DIR=./notes       # Diretório dos arquivos markdown
MK_ASSETS_DIR=             # Diretório de assets (vazio = {MK_NOTES_DIR}/assets)
MK_HOST=127.0.0.1           # Endereço de bind do servidor
MK_PORT=8099                 # Porta TCP
MK_DEBUG=true                 # Habilita hot-reload
```

| Variável | Padrão | Descrição |
|---|---|---|
| `MK_NOTES_DIR` | `./notes` | Diretório onde os `.md` são salvos |
| `MK_ASSETS_DIR` | `{MK_NOTES_DIR}/assets` | Diretório de uploads (imagens, PDFs etc.) |
| `MK_HOST` | `127.0.0.1` | Host do servidor |
| `MK_PORT` | `8099` | Porta do servidor |
| `MK_DEBUG` | `true` | Hot-reload automático |

O diretório de notas e o de assets também podem ser trocados **em runtime**, sem reiniciar o servidor, via `PUT /api/settings/` — a mudança é persistida de volta no `.env`.

---

## API Reference

Base URL: `http://localhost:8099/api`

### Arquivos

#### `GET /api/files/`
Lista todos os arquivos (sem conteúdo), ordenados por data de modificação.

**Query params:**
- `type` — filtrar por `note` ou `task`
- `include_archived` — `true` para incluir arquivadas junto das ativas (padrão `false`)

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
    "task_done": 0,
    "task_items": [],
    "folder": "projetos/backend",
    "status": "development",
    "status_changed_at": "2024-01-12T09:00"
  }
]
```

> `tags` nesta resposta é a *união* das tags de frontmatter com as tags inline `#tag` encontradas no corpo (para exibição na sidebar). Na resposta de detalhe (`GET`/edição) só vêm as tags de frontmatter, para não promover tags inline ao salvar.

---

#### `POST /api/files/`
Cria um novo arquivo. Todos os campos têm default, então `{}` já cria um rascunho em branco.

**Body:**
```json
{
  "title": "Minha Nota",
  "type": "note",
  "tags": ["pessoal"],
  "content": "## Introdução\n\nConteúdo aqui...",
  "folder": "pessoal",
  "status": "",
  "status_changed_at": ""
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
Atualização parcial. Campos `null`/omitidos são preservados.

**Body:**
```json
{
  "title": "Novo Título",
  "content": "Conteúdo atualizado...",
  "tags": ["trabalho", "importante"],
  "status": "done"
}
```

**Resposta `200`:** `FileDetailResponse`

---

#### `DELETE /api/files/{id}`
Remove permanentemente o arquivo do disco.

**Resposta `204`:** sem corpo  
**Resposta `404`:** arquivo não encontrado

---

#### `PUT /api/files/folder`
Renomeia/move uma pasta e tudo que está aninhado nela.

**Body:** `{"old_path": "projetos", "new_path": "arquivados/projetos"}`

**Resposta `200`:** `{"updated_count": 3}`

---

#### `DELETE /api/files/folder?path=...`
"Deleta" uma pasta movendo seu conteúdo para a pasta pai — nunca destrói arquivos.

**Resposta `200`:** `{"updated_count": 3}`

---

#### `GET /api/files/archived`
Lista apenas os arquivos arquivados, ordenados por data de modificação.

**Resposta `200`:** mesmo formato de `GET /api/files/`

---

#### `POST /api/files/{id}/archive`
Move o arquivo para a pasta de arquivamento (`_archive/`), guardando a pasta original em `archived_from` para restaurar depois. Não apaga nada; some do Kanban, da Lista, da Busca e do Grafo por padrão.

**Resposta `200`:** `FileMetaResponse`
**Resposta `404`:** arquivo não encontrado

---

#### `POST /api/files/{id}/unarchive`
Restaura um arquivo arquivado para a pasta em que estava antes.

**Resposta `200`:** `FileMetaResponse`
**Resposta `404`:** arquivo não encontrado

---

#### `POST /api/files/archive-completed?days=30`
Arquiva em lote toda task com `status=done` cujo `status_changed_at` seja mais antigo que `days` dias.

**Resposta `200`:** `{"archived_count": 4}`

---

### Busca

#### `GET /api/search/`
Busca full-text com ranking de relevância.

**Query params:**
- `q` — termo de busca (case-insensitive)
- `type` — filtrar por `note` ou `task`
- `tag` — filtrar por tag exata; repita o parâmetro para casamento AND (`?tag=area&tag=urgente`). O filtro é hierárquico: `area` também casa com arquivos marcados `area/sub`.

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

### Tags

#### `PUT /api/tags/{old_tag}`
Renomeia (ou mescla, se a tag nova já existir) uma tag em todos os arquivos que a possuem.

**Body:** `{"new_tag": "trabalho-urgente"}`

**Resposta `200`:** `{"updated_count": 5}`

---

### Grafo

#### `GET /api/graph/`
Constrói o grafo de notas a partir das referências `[[wikilink]]` em todos os arquivos.

- **Nós**: um por arquivo, mais um nó "phantom" por link `[[Alvo]]` que não resolve a nenhum arquivo existente.
- **Arestas**: uma por link resolvido único entre duas notas (grafo não-direcionado; links duplicados/bidirecionais colapsam numa só aresta).

**Resposta `200`:**
```json
{
  "nodes": [{"id": "abc123", "title": "Reunião", "type": "note", "tags": [], "folder": ""}],
  "edges": [{"source": "abc123", "target": "phantom:projeto-x"}]
}
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

### Configurações (runtime)

#### `GET /api/settings/`
Retorna o diretório de notas/assets em uso e o endereço do servidor.

#### `PUT /api/settings/`
Troca o diretório de notas e/ou de assets **sem reiniciar o servidor**. A mudança é aplicada imediatamente e persistida no `.env`.

**Body:** `{"notes_dir": "/home/user/vault", "assets_dir": null}`

#### `GET /api/settings/browse?path=...`
Lista subdiretórios de `path` (usado pelo seletor de pastas na UI de configurações). Sem `path`, lista a partir do pai do diretório de notas atual.

#### `GET /api/settings/backup`
Baixa um `.zip` com todo o diretório de notas atual.

---

### Assets

#### `POST /api/assets/`
Upload de um arquivo (multipart/form-data) para o diretório de assets configurado. Em caso de colisão de nome, um sufixo numérico é adicionado automaticamente.

**Resposta `201`:** `{"url": "/assets/imagem.png", "filename": "imagem.png"}`

Os arquivos enviados ficam acessíveis em `GET /assets/{nome}`.

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
folder: projetos/backend
status: development
status_changed_at: '2024-01-12T09:00'
created: '2024-01-15T10:30:00+00:00'
modified: '2024-01-15T11:00:00+00:00'
---
## Pauta

- Review do backlog
- Definição de prioridades

## Notas

Decidimos mover o item X para a próxima sprint. Relacionado a [[Projeto X]] #sprint-atual
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
  - [ ] Aprovação do time de backend
  - [ ] Aprovação do time de frontend
```

> Subtarefas indentadas (como as duas acima) contam para o vínculo automático de conclusão — quando "Aprovação do time de backend" e "Aprovação do time de frontend" ficarem marcadas, "Code review da feature X" é marcada sozinha. Só as tasks de primeiro nível (sem indentação) entram na contagem `task_total`/`task_done` usada nos badges de progresso do Kanban e da sidebar; subtarefas só "contam" indiretamente, completando a mãe.

`folder`, `status` e `status_changed_at` são opcionais — ficam vazios (`""`) quando o arquivo não participa do quadro kanban. `status_changed_at` é preenchido/atualizado automaticamente pelo backend a cada mudança de status (não precisa ser setado manualmente). `#tags` inline no corpo e links `[[Nota]]` também são reconhecidos automaticamente, sem precisar declarar no frontmatter.

`_archive/` é uma pasta reservada na raiz de `notes/` (não use esse nome para suas próprias pastas). Arquivar um arquivo o move fisicamente para lá e preenche `archived_from` com a pasta de origem; restaurar move de volta e limpa o campo. Arquivos arquivados ficam fora de toda listagem por padrão (Kanban, Lista, Grafo, Busca) até serem restaurados pela tela Arquivo.

Os arquivos são **compatíveis** com Obsidian, VSCode (extensão Markdown), Typora e qualquer editor de texto.

---

## Frontend

O diretório `frontend/` é uma SPA (Single Page Application) sem build step, com:

- Design glassmorphism dark com fundo animado (partículas + aurora)
- **Sidebar**: árvore de arquivos/pastas com busca, filtros e progresso de tasks
- **Editor**: textarea monospace com toolbar de formatação Markdown
- **Preview**: renderização ao vivo via [marked.js](https://marked.js.org/)
- **Split view** / Editor only / Preview only
- **Checkboxes interativos** no preview — clicar atualiza o arquivo; marcar todas as subtarefas de uma tarefa conclui a mãe automaticamente (também funciona no modal de edição rápida do Kanban)
- **Abas de arquivos recentes**: até 5 abas acima do editor, com botão `×` para fechar (só remove da lista, não apaga o arquivo) e navegação por atalho de teclado
- **Kanban**: quadro com colunas de status customizáveis, drag-and-drop entre etapas, modal de edição rápida de checkboxes direto no card, botão de arquivar por card
- **Lista**: tabela ordenável/filtrável de notas e tasks, com agrupamento por status/pasta/tag/tipo em seções recolhíveis
- **Arquivo**: tela de itens arquivados, com restaurar ou excluir definitivamente
- **Grafo de notas**: visualização interativa dos links `[[wikilink]]`, filtrável por tipo/tag/pasta
- **Diagram builder**: editor visual de diagramas embutido no app
- **Table builder**: editor visual de tabelas Markdown (grade de células, edição in-place)
- **Quick Open**: busca rápida de arquivos por título (`Ctrl+K`)
- **Menu de contexto** na árvore de arquivos/pastas
- **Tags**: adicionar com Enter ou vírgula, remover com ×
- **Auto-save** com debounce de 800ms
- **Indicador de conexão** (● online / ● offline)
- **Temas Pip-Boy**: 7 temas de cor + efeitos CRT (scanlines, flicker, estática, curvatura, transição, varredura de radar), todos configuráveis e persistidos no navegador
- **Efeitos sonoros** (opcionais, configuráveis)

**Atalhos de teclado:**

| Atalho | Ação |
|---|---|
| `Ctrl+N` | Nova nota |
| `Ctrl+Shift+N` | Nova task |
| `Ctrl+K` | Busca rápida (Quick Open) — ou inserir link `[texto](url)` quando o foco está no editor |
| `Ctrl+S` | Forçar save |
| `Ctrl+B` | Negrito (no editor) |
| `Ctrl+I` | Itálico (no editor) |
| `Tab` | Indentar (2 espaços) |
| `Enter` | Continuar lista/tabela automaticamente |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Alternar para a próxima/anterior aba de arquivo recente |
| `Alt+1` … `Alt+9` | Pular direto para a N-ésima aba de arquivo recente |
| `Esc` | Fechar modal (delete, settings, quick open, edição rápida do kanban) |

> Os atalhos das abas de arquivos recentes são definidos centralmente em `frontend/js/config.js` (`RECENT_TABS_SHORTCUTS`) — troque a combinação ali para remapear em todo o app. `Ctrl+Tab`/`Ctrl+Shift+Tab` são reservados pela maioria dos navegadores para trocar de aba do próprio navegador (não dá pra interceptar em uma aba comum); `Alt+1`…`Alt+9` são a alternativa que sempre funciona.

---

## Desenvolvimento

### Instalar dependências de dev

```bash
uv sync --group dev
```

Isso instala `pytest`, `httpx`, `pytest-asyncio` e `playwright` — usados para os testes automatizados do projeto.

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

> Ainda não há uma pasta `tests/` no repositório — a estrutura acima é a sugerida para quando os testes forem adicionados.

### Adicionar uma nova dependência

```bash
uv add <pacote>              # produção
uv add --group dev <pacote>  # desenvolvimento
```

### Trocar o backend de armazenamento

1. Criar `mk_manager/repositories/sqlite.py` implementando `AbstractFileRepository`
2. Em `dependencies.py`, trocar `MarkdownFileRepository` por `SqliteFileRepository`
3. Zero mudanças em `FileService` ou nos routers

---

## Licença

MIT
