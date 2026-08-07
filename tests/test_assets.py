"""Tests for asset uploading and serving functions."""

import io
import shutil
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from fastapi import UploadFile

from mk_manager.config import Settings
from mk_manager.dependencies import reset_repository_cache
from mk_manager.routers.assets import upload_asset


class TestAssetEndpoints(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.notes_dir = Path(self.temp_dir) / "notes"
        self.notes_dir.mkdir(parents=True, exist_ok=True)
        reset_repository_cache()

    def tearDown(self):
        reset_repository_cache()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    async def test_upload_asset_with_folder(self):
        file_bytes = b"fake image bytes"
        upload_file = UploadFile(filename="screenshot.png", file=io.BytesIO(file_bytes))

        with patch("mk_manager.routers.assets.get_settings", return_value=Settings(notes_dir=self.notes_dir)):
            res = await upload_asset(upload_file, folder="projetos/backend")

        self.assertEqual(res["filename"], "screenshot.png")
        self.assertEqual(res["folder"], "projetos/backend")
        self.assertEqual(res["url"], "/assets/projetos/backend/screenshot.png")

        # Verify physical file existence
        saved_file = self.notes_dir / "projetos" / "backend" / "screenshot.png"
        self.assertTrue(saved_file.exists())
        self.assertEqual(saved_file.read_bytes(), file_bytes)

    async def test_upload_asset_root(self):
        file_bytes = b"root file bytes"
        upload_file = UploadFile(filename="doc.pdf", file=io.BytesIO(file_bytes))

        with patch("mk_manager.routers.assets.get_settings", return_value=Settings(notes_dir=self.notes_dir)):
            res = await upload_asset(upload_file, folder="")

        self.assertEqual(res["url"], "/assets/doc.pdf")
        saved_file = self.notes_dir / "doc.pdf"
        self.assertTrue(saved_file.exists())


if __name__ == "__main__":
    unittest.main()
