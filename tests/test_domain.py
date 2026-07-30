"""Tests for core domain entities (FileRecord and SearchResult)."""

import unittest
from mk_manager.domain.entities import FileRecord, SearchResult


class TestDomainEntities(unittest.TestCase):
    def test_file_record_word_count(self):
        record = FileRecord(
            id="test-1",
            title="Test Note",
            type="note",
            tags=["test"],
            content="This is a simple markdown body with seven words.",
            filename="test-1.md",
            created="2026-07-30T10:00:00",
            modified="2026-07-30T10:00:00",
        )
        self.assertEqual(record.word_count, 9)

    def test_file_record_task_counts_including_subtasks(self):
        content = """
# Project Tasks
- [x] Root completed task
- [ ] Root pending task
  - [x] Subtask level 1 done
  - [ ] Subtask level 1 pending
    - [x] Subtask level 2 done
"""
        record = FileRecord(
            id="task-1",
            title="Tasks",
            type="task",
            tags=[],
            content=content,
            filename="task-1.md",
            created="2026-07-30T10:00:00",
            modified="2026-07-30T10:00:00",
        )

        # 5 total task checkboxes (2 root, 3 subtasks)
        self.assertEqual(record.task_total, 5)
        # 3 done (1 root, 2 subtasks)
        self.assertEqual(record.task_done, 3)

        items = record.task_items
        self.assertEqual(len(items), 5)
        self.assertEqual(items[0]["text"], "Root completed task")
        self.assertEqual(items[0]["indent"], 0)
        self.assertTrue(items[0]["done"])
        self.assertEqual(items[2]["text"], "Subtask level 1 done")
        self.assertEqual(items[2]["indent"], 2)
        self.assertTrue(items[2]["done"])

    def test_search_result_dataclass(self):
        record = FileRecord(
            id="res-1",
            title="Sample",
            type="note",
            tags=[],
            content="Some content",
            filename="res-1.md",
            created="",
            modified="",
        )
        sr = SearchResult(record=record, snippet="matched content", score=25)
        self.assertEqual(sr.record.id, "res-1")
        self.assertEqual(sr.score, 25)


if __name__ == "__main__":
    unittest.main()
