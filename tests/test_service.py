"""Tests for FileService business rules."""

import shutil
import tempfile
import unittest
from pathlib import Path

from mk_manager.models.schemas import FileCreateRequest
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

    def test_service_graph(self):
        self.service.create_file(
            FileCreateRequest(
                title="Note A",
                content="Link to [[Note B]] and [[Phantom Note]].",
            )
        )
        self.service.create_file(
            FileCreateRequest(
                title="Note B",
                content="Link back to [[Note A]].",
            )
        )

        graph = self.service.build_graph()
        self.assertEqual(len(graph.nodes), 3)  # Note A, Note B, Phantom Note
        self.assertEqual(len(graph.edges), 2)


if __name__ == "__main__":
    unittest.main()
