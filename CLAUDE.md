# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@~/.claude/python-code-standards.md

## Project Overview

MK Manager is a Markdown file manager with notes and task-list support. FastAPI backend, vanilla HTML/JS frontend (no build step, no bundler). There is **no database** — every note/task is a real `.md` file on disk with YAML frontmatter, stored under `notes/` (compatible with Obsidian, VSCode, Typora, etc.).

## Commands

Package manager is [uv](https://docs.astral.sh/uv/) (Python 3.11+, pinned via `.python-version`).

```bash
# Install dependencies
uv sync
uv sync --group dev          # + pytest, httpx, pytest-asyncio, playwright

# Run the dev server (entry point is `mk`, defined in pyproject.toml [project.scripts])
uv run mk

# Equivalent, with explicit uvicorn flags
uv run uvicorn mk_manager.main:app --reload --port 8888

# Add a dependency
uv add <package>              # runtime
uv add --group dev <package>  # dev-only

# Run tests
uv run pytest
```

Notes:
- There is currently no `tests/` directory in the repo, despite pytest/httpx/pytest-asyncio/playwright being present as dev dependencies — `uv run pytest` will find nothing until tests are added.
- No lint or type-check tooling (ruff, mypy, black, etc.) is configured in `pyproject.toml`. Don't assume one exists.
- Server config is env-driven, prefix `MK_`, loaded from a `.env` file via `pydantic-settings` (`mk_manager/config.py`): `MK_NOTES_DIR` (default `./notes`), `MK_ASSETS_DIR` (default `{notes_dir}/assets`), `MK_HOST` (default `127.0.0.1`), `MK_PORT` (default `8099`), `MK_DEBUG` (default `true`, enables `--reload`).

## Architecture

### Layered backend (SOLID), one-directional dependency flow

```
routers/  →  services/  →  repositories/base.py (AbstractFileRepository)  ←  repositories/markdown.py
(HTTP)       (business        (interface — DIP)                              (concrete: reads/writes
              rules)                                                          .md files on disk)
```

- `domain/entities.py` — framework-free dataclasses: `FileRecord` (the parsed state of a `.md` file) and `SearchResult`. `FileRecord` computes `word_count`, `task_total`, `task_done`, `task_items` from its `content` via regex, and also carries `folder`, `status`, `status_changed_at`, `archived_from` for the kanban-style workflow. **Gotcha:** `task_total`/`task_done` only match *top-level* (non-indented) `- [ ]`/`- [x]` lines (`_TASK_ANY_RE`/`_TASK_DONE_RE` have no leading-whitespace group) — indented subtasks never count toward these two numbers, even though they do show up in `task_items` (which does capture `indent`). This is why the Kanban card / sidebar-tree progress badges ("3/5 tasks") only move when a *top-level* task gets checked, not when a subtask does — see the subtask-linkage note below.
- `repositories/base.py` — `AbstractFileRepository` is the contract every storage backend must satisfy (create/get/update/delete/list/count/size). `services/file_service.py` depends only on this abstraction, never on `MarkdownFileRepository` directly — swapping storage (e.g. SQLite) means writing a new repository class and rewiring `dependencies.py`, with zero changes to services or routers.
- `services/file_service.py` — all business logic: CRUD orchestration, full-text search with scoring (title match +20, tag match +10, content match +1), stats aggregation, tag renaming, folder renaming/"deletion" (moves contents to the parent folder rather than destroying anything — there's no trash/undo yet), and kanban status transitions. `create_file`/`update_file` (re)stamp a single `status_changed_at` timestamp (`YYYY-MM-DDTHH:MM`) whenever `status` is set on creation or changes value on update — there's no separate `date_planning`/`date_execution`/`date_conclusion` anymore (that's a legacy three-field format some old files may still have in frontmatter; `MarkdownFileRepository` falls back to reading those keys, in `date_conclusion → date_execution → date_planning` priority order, only when `status_changed_at` itself is absent). `archive_completed_before(days)` reads `status_changed_at` (not any of the legacy date fields) to decide what's old enough to archive.
- `services/file_service.py` also owns **archiving**: `archive_file`/`unarchive_file` move a file into/out of the reserved `_archive/` folder (physically relocating it, same mechanism as a folder rename — nothing is deleted), and `archive_completed_before(days)` batch-archives every `status="done"` file whose `status_changed_at` is older than the cutoff. `list_files`/`search_files` take an `include_archived` flag (default `False`) so archived files stay out of every normal listing, Kanban, the List view, and the graph unless explicitly requested via `list_archived_files()` (the "Arquivo" screen). The repository (`MarkdownFileRepository.list_all`) skips scanning the `_archive/` subtree entirely when `include_archived=False`, rather than filtering results after a full scan — this is the actual point of archiving at scale, not just hiding rows in the UI.
- `services/file_service.py` also owns the **notes graph**: `build_graph()` scans every file's content for `[[wikilink]]` targets (`extract_wikilink_targets`) and resolves them by title (case-insensitive). Unresolved targets become "phantom" nodes rather than being dropped — mirrors Obsidian's behavior. The graph is undirected; duplicate/bidirectional links collapse to one edge.
- `services/file_service.py` also extracts inline `#tags` from prose (`extract_inline_tags`), skipping fenced code, inline code, and URLs so code samples/hex tokens/URL fragments aren't mistaken for tags. Tag filtering in search is hierarchical: filtering by `area` also matches `area/sub`.
- `dependencies.py` — FastAPI DI providers. `MarkdownFileRepository` is cached as a process-wide singleton via `lru_cache` (it holds an in-memory parse cache, so it must survive across requests). When the notes directory changes at runtime (via the settings endpoint), `reset_repository_cache()` drops the cached singleton so the next request rebuilds it against the new path.
- `config.py` — `Settings(BaseSettings)`, singleton via `lru_cache`, prefix `MK_`, reads `.env`.
- `main.py` — `create_app()` factory (used directly by tests to get a fresh app with dependency overrides); registers all routers, CORS (wide open), the frontend static mount, and a custom per-request `/assets/{path}` handler (deliberately *not* a static mount, so it keeps resolving correctly after `assets_dir` changes at runtime).

### Routers (all under `/api`)

| Router | Prefix | Responsibility |
|---|---|---|
| `files.py` | `/api/files` | File/folder CRUD + archive/unarchive/batch-archive |
| `search.py` | `/api/search` | Full-text search |
| `stats.py` | `/api` | Aggregate stats |
| `tags.py` | `/api/tags` | Tag rename |
| `graph.py` | `/api/graph` | Wikilink graph |
| `settings.py` | `/api/settings` | Runtime settings (notes dir, etc.) |
| `assets.py` | `/api/assets` | Upload images/files pasted or attached to notes |

### Frontend

`mk_manager/frontend/` — vanilla JS SPA, no bundler/build step, served as static files by FastAPI (mounted at `/static`, with `index.html` and `favicon` served explicitly at `/`). Split into one module per concern under `js/`: `app.js` (bootstrap + global keydown listener), `config.js` (centralized keyboard-shortcut definitions), `state.js`, `api.js`, `editor.js`, `preview.js`, `sidebar.js`, `files.js`, `search-filter.js`, `graph.js`, `kanban.js`, `list.js`, `archive.js`, `diagram-builder.js`, `table-builder.js`, `quickopen.js`, `contextmenu.js`, `delete-modal.js`, `settings.js`, `prefs.js` (localStorage-persisted editor/CRT/theme preferences), `assets.js`, `export.js`, `format-code.js`, `sfx.js`, `views.js` (pane-switching), `utils.js`. Markdown rendering uses [marked.js](https://marked.js.org/).

Six full-screen "panes" beyond the editor share one pattern (see `views.js`'s `PANES` map + `setMainView`): Kanban, Tags, Busca, Grafo, Lista, and Arquivo each get an activity-bar icon, a `<div id="*-pane">`, and a `render*()` called on entry. `graph.js`, `list.js`, and `archive.js` additionally expose a `refresh*IfActive()` (e.g. `refreshListIfActive`) called from every file-mutating function in `files.js` (and from `moveTaskStatus` in `kanban.js`) so a pane that's already open stays in sync instead of only refreshing the next time you switch into it. `list.js` keeps its own module-private filter/sort/group-by state (not `st.filter`) so it doesn't cross-pollute the Explorer/Busca tabs — same reasoning as `graph.js`'s private tag/folder filters. Circular imports between these modules and `files.js`/`kanban.js` are intentional and safe (functions are only invoked inside later event handlers, never at module top-level) — `kanban.js` specifically avoids importing `files.js` directly and instead receives `openFile`/`archiveFile` via `initKanban({...})`, called once from `app.js`.

**Keyboard shortcuts (`config.js`)** — new shortcuts should be defined as data (`{ key, ctrlKey, shiftKey, altKey }`) in `config.js` and matched via its `matchesShortcut`/`matchesJumpShortcut` helpers from `app.js`'s single global `keydown` listener, rather than hardcoding modifier checks inline — this is the pattern the recent-files-tab shortcuts (`RECENT_TABS_SHORTCUTS.next`/`prev`/`jump`) follow. Note `Ctrl+Tab`/`Ctrl+Shift+Tab` are reserved by most browsers for actual browser-tab switching and can't be `preventDefault()`'d from a normal browser tab — they work when embedded (Electron, etc.) but the `Alt+1`..`Alt+9` jump shortcuts are the reliable fallback in a plain browser tab.

**Recent-files bar** (`files.js`'s `addToRecentFiles`/`renderRecentFiles`/`closeRecentTab`/`cycleRecentTab`/`jumpToRecentTab`, `state.js`'s `st.recentFiles`) — tracks up to 5 most-recently-opened files as browser-like tabs above the editor. Opening a file always moves it to the front (dedup + unshift); closing a tab only drops it from this list (never touches the file on disk) and, if it was the active tab, opens its nearest neighbor or falls back to the empty panel.

**Subtask completion linkage** (`preview.js`'s `findAutoCompleteParents`) — when a checkbox is toggled and ends up checked, this walks *up* the list's indentation levels (nearest previous task line with smaller indent = parent) and auto-checks each ancestor whose full descendant block (found the same way, one level down) is now entirely checked, cascading through multiple nesting levels in one call. It's forward-only by design: unchecking a subtask never auto-unchecks an already-completed parent. Both checkbox-toggle call sites reuse it — the editor preview's `onCheckboxChange` (via `checkboxCharIndex` + `replaceRange`, to preserve textarea undo) and `kanban.js`'s `toggleKanbanQEditItem` (via `toggleCheckboxAt`) — so any future third call site should route through this same function rather than reimplementing the indentation walk.

**Retro-theme gotcha**: the six non-`corporate` themes (`theme-green`/`amber`/`blue`/`white`/`red`/`purple`, toggled via `prefs.js`'s `setCrtTheme` adding a `body.theme-*` class) apply a blanket `input[type="text"] { border: 1px solid ... !important }` rule (`style.css`, ~line 2323) on top of every text input's own styling. `.title-input` in particular relies on `box-sizing: border-box` + an explicit `height` (shared with the topbar buttons via the `--topbar-ctrl-h` custom property on `.editor-topbar`) specifically to stay aligned once that themed border kicks in — don't restyle `.title-input`'s box model without checking all seven themes, not just the default `theme-green`.

### File format on disk

Each `.md` under `notes/` (or wherever `MK_NOTES_DIR` points) is YAML frontmatter + Markdown body:

```markdown
---
id: abc123def45678
title: Sprint Meeting
type: note        # or "task"
tags: [work, sprint]
folder: projects/backend
status: development
status_changed_at: '2024-01-15T10:45'
created: '2024-01-15T10:30:00+00:00'
modified: '2024-01-15T11:00:00+00:00'
---
Body content here. Task lists use standard GFM `- [ ]` / `- [x]` syntax, including
nested subtasks (indented `- [ ]`) — see the subtask-linkage note above.
Inline `#tags` and `[[wikilinks]]` in the body are also picked up (see file_service.py).
```

`_archive/` is a reserved top-level folder under `notes/` (same idea as `assets/`) — archiving a file physically moves it there and stamps `archived_from` in its frontmatter with the folder it came from, so unarchiving restores it exactly. Don't create a user folder named `_archive`.
