"""Tests for FileService business rules."""

import shutil
import tempfile
import unittest
from pathlib import Path

from mk_manager.models.schemas import FileCreateRequest, FileUpdateRequest
from mk_manager.repositories.markdown import MarkdownFileRepository
from mk_manager.services.file_service import (
    FileService,
    extract_inline_tags,
    extract_wikilink_targets,
)


class TestFileService(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.notes_dir = Path(self.temp_dir) / "notes"
        self.repo = MarkdownFileRepository(self.notes_dir)
        self.service = FileService(self.repo)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_extract_inline_tags(self):
        content = """
# Heading Title (Not a tag)
Here is some text with #python and #fastapi/api tags.
```python
# This is a comment in code, not a tag
```
`#inline_code_tag` is ignored.
See https://example.com/#section (ignored).
"""
        tags = extract_inline_tags(content)
        self.assertIn("python", tags)
        self.assertIn("fastapi/api", tags)
        self.assertNotIn("inline_code_tag", tags)

    def test_extract_wikilink_targets(self):
        content = "Check [[Project Alpha]] and [[Sprint 1|First Sprint]] or [[Notes#heading]]."
        targets = extract_wikilink_targets(content)
        self.assertIn("Project Alpha", targets)
        self.assertIn("Sprint 1", targets)
        self.assertIn("Notes", targets)

    def test_service_create_and_search(self):
        created = self.service.create_file(
            FileCreateRequest(
                title="Backend Architecture",
                type="note",
                tags=["dev"],
                content="Building a clean FastAPI service with markdown files.",
            )
        )
        self.assertEqual(created.id, "backend-architecture")
        self.assertEqual(created.title, "Backend Architecture")

        results = self.service.search_files("FastAPI")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].record.id, created.id)

    def test_due_date_and_snippet_highlight(self):
        created = self.service.create_file(
            FileCreateRequest(
                title="Task com Prazo",
                type="task",
                due_date="2026-08-15",
                content="Entregar relatório de vendas urgente.",
            )
        )
        self.assertEqual(created.due_date, "2026-08-15")

        results = self.service.search_files("relatório")
        self.assertEqual(len(results), 1)
        self.assertIn("<mark>relatório</mark>", results[0].snippet)

    def test_kanban_order_persiste_no_frontmatter(self):
        created = self.service.create_file(FileCreateRequest(title="Card", type="task"))
        self.assertIsNone(created.kanban_order)

        self.service.update_file(created.id, FileUpdateRequest(kanban_order=1500.5))

        # Outro repositório lê do disco, sem o cache do primeiro.
        reloaded = MarkdownFileRepository(self.notes_dir).get_by_id(created.id)
        self.assertEqual(reloaded.kanban_order, 1500.5)
        self.assertIn("kanban_order: 1500.5", (self.notes_dir / reloaded.filename).read_text("utf-8"))

    def test_kanban_order_sobrevive_a_outras_edicoes(self):
        created = self.service.create_file(FileCreateRequest(title="Card", type="task"))
        self.service.update_file(created.id, FileUpdateRequest(kanban_order=2000))
        updated = self.service.update_file(created.id, FileUpdateRequest(status="done", content="x"))
        self.assertEqual(updated.kanban_order, 2000)
        self.assertEqual(updated.status, "done")

    def test_reordenar_nao_muda_data_de_modificacao(self):
        created = self.service.create_file(FileCreateRequest(title="Card", type="task"))
        reordered = self.service.update_file(created.id, FileUpdateRequest(kanban_order=1000))
        self.assertEqual(reordered.modified, created.modified)

        moved = self.service.update_file(
            created.id, FileUpdateRequest(status="done", kanban_order=500)
        )
        self.assertNotEqual(moved.modified, created.modified)

    def test_kanban_order_invalido_no_frontmatter_vira_none(self):
        self.notes_dir.mkdir(parents=True, exist_ok=True)
        (self.notes_dir / "solto.md").write_text(
            "---\nid: solto\ntitle: Solto\ntype: task\nkanban_order: abc\n---\nx", "utf-8"
        )
        self.assertIsNone(MarkdownFileRepository(self.notes_dir).get_by_id("solto").kanban_order)


if __name__ == "__main__":
    unittest.main()
