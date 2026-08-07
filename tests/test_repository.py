"""Tests for MarkdownFileRepository storage backend."""

import shutil
import tempfile
import unittest
from pathlib import Path
from mk_manager.domain.entities import FileRecord
from mk_manager.repositories.markdown import MarkdownFileRepository


class TestMarkdownFileRepository(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.notes_dir = Path(self.temp_dir) / "notes"
        self.notes_dir.mkdir()
        self.repo = MarkdownFileRepository(self.notes_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_repository_save_and_get(self):
        saved = self.repo.create(
            file_id="note-1",
            title="First Note",
            file_type="note",
            tags=["work"],
            content="Hello world",
            created="2026-07-30T10:00:00",
            modified="2026-07-30T10:00:00",
            folder="projects",
        )
        self.assertEqual(saved.id, "note-1")
        self.assertTrue((self.notes_dir / "projects" / "note-1.md").exists())

        retrieved = self.repo.get_by_id("note-1")
        self.assertEqual(retrieved.title, "First Note")
        self.assertEqual(retrieved.tags, ["work"])
        self.assertEqual(retrieved.content, "Hello world")
        self.assertEqual(retrieved.folder, "projects")

    def test_repository_list_all_and_folders(self):
        self.repo.create(
            file_id="a",
            title="A",
            file_type="note",
            tags=[],
            content="A content",
            created="2026-07-30T10:00:00",
            modified="2026-07-30T10:00:00",
            folder="f1",
        )
        self.repo.create(
            file_id="b",
            title="B",
            file_type="task",
            tags=[],
            content="B content",
            created="2026-07-30T10:00:00",
            modified="2026-07-30T10:00:00",
            folder="f2/sub",
        )

        all_files = self.repo.list_all()
        self.assertEqual(len(all_files), 2)

        folders = self.repo.list_folders()
        self.assertIn("f1", folders)
        self.assertIn("f2/sub", folders)


    def test_repository_trash_and_untrash(self):
        created = self.repo.create(
            file_id="del-1",
            title="To Delete",
            file_type="note",
            tags=[],
            content="Content to trash",
            created="2026-07-30T10:00:00",
            modified="2026-07-30T10:00:00",
            folder="work",
        )
        self.assertEqual(len(self.repo.list_all()), 1)

        # Trash
        trashed = self.repo.trash("del-1")
        self.assertEqual(trashed.folder, "_trash")
        self.assertEqual(trashed.trashed_from, "work")
        self.assertEqual(len(self.repo.list_all()), 0)
        self.assertEqual(len(self.repo.list_trash()), 1)

        # Untrash
        restored = self.repo.untrash("del-1")
        self.assertEqual(restored.folder, "work")
        self.assertEqual(restored.trashed_from, "")
        self.assertEqual(len(self.repo.list_all()), 1)
        self.assertEqual(len(self.repo.list_trash()), 0)

        # Trash and Purge
        self.repo.trash("del-1")
        self.repo.purge_trash("del-1")
        self.assertEqual(len(self.repo.list_trash()), 0)

    def test_repository_non_markdown_files(self):
        img_dir = self.notes_dir / "projetos"
        img_dir.mkdir(parents=True, exist_ok=True)
        img_path = img_dir / "diagrama.png"
        img_path.write_bytes(b"fake png content")

        all_files = self.repo.list_all()
        self.assertTrue(any(f.type == "other" and f.title == "diagrama.png" for f in all_files))

        non_md_record = next(f for f in all_files if f.type == "other")
        self.assertEqual(non_md_record.folder, "projetos")
        self.assertEqual(non_md_record.filename, "projetos/diagrama.png")

        updated = self.repo.update(non_md_record.id, title=None, tags=None, content=None, modified="2026-08-07T12:00:00", folder="estudos")
        self.assertEqual(updated.folder, "estudos")
        self.assertEqual(updated.id, "estudos/diagrama.png")
        self.assertTrue((self.notes_dir / "estudos" / "diagrama.png").exists())
        self.assertFalse(img_path.exists())

        # Check get_by_id after move
        retrieved = self.repo.get_by_id("estudos/diagrama.png")
        self.assertEqual(retrieved.title, "diagrama.png")
        self.assertEqual(retrieved.folder, "estudos")


if __name__ == "__main__":
    unittest.main()
