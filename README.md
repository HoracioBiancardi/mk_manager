# MK Manager V2 (SwordPower)

Gerenciador moderno de notas e tarefas Markdown (`.md`) construído sobre a arquitetura padronizada **SwordPower Web Starter**.

## ✨ Destaques V2

- **UI Desenvolvedor Moderna**: Tema Corporativo (`corporate` - Padrão) e Verde Escuro Neutro (`green-neutral`), visual glassmorphism, badge SVG SwordPower e fundo animado Aurora.
- **Armazenamento Seguro em Memória (RAM)**: Autenticação cliente/servidor desacoplada com Auto-Lock por inatividade.
- **Recursos Markdown**:
  - Editor Split View com sincronização de rolagem, preview com Marked.js, Highlight.js e diagramas Mermaid.js.
  - Links de anexos estilizados (`a.asset-link`).
  - Kanban de tarefas por status (`backlog`, `todo`, `in_progress`, `done`, `archived`).
  - Visualização de Grafo de Wikilinks (`[[link]]`).
  - Busca com relevância de pontuação (título +20, tag +10, conteúdo +1).
  - Suporte a arquivo morto (`_archive/`) e lixeira (`_trash/`).

## 🚀 Como Executar

```bash
cd /home/swordpower/Documentos/REPO/PESSOAL/mk_managerV2
python3 -m uvicorn mk_manager.main:app --reload --port 8888
```

Acesse em **`http://127.0.0.1:8888`**.
