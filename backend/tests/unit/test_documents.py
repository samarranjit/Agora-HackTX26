"""PDF checks and safe file naming."""

import unittest
from pathlib import Path

from api_helpers import make_encrypted_pdf, make_pdf

from learning_game_backend.documents.storage import (
    DocumentError,
    check_pdf,
    display_name,
    document_path,
)


class DocumentCheckTests(unittest.TestCase):
    def test_valid_pdf(self) -> None:
        checked = check_pdf(make_pdf(2), 10_000)
        self.assertEqual(checked.page_count, 2)
        self.assertEqual(len(checked.sha256), 64)

    def test_rejections_carry_stable_codes(self) -> None:
        cases = {
            "too_large": make_pdf(),
            "empty_file": b"",
            "not_a_pdf": b"GIF89a",
            "malformed_pdf": b"%PDF-1.4\n garbage",
            "encrypted_pdf": make_encrypted_pdf(),
        }
        limits = {"too_large": 10}
        for code, data in cases.items():
            with self.subTest(code=code), self.assertRaises(DocumentError) as raised:
                check_pdf(data, limits.get(code, 100_000))
            self.assertEqual(raised.exception.code, code)

    def test_display_names_are_sanitized(self) -> None:
        self.assertEqual(display_name("../../etc/passwd"), "passwd")
        self.assertEqual(display_name("C:\\Users\\me\\notes.pdf"), "notes.pdf")
        self.assertEqual(display_name("a\x00b\n.pdf"), "ab.pdf")
        self.assertEqual(display_name(None), "document.pdf")
        self.assertEqual(display_name("   "), "document.pdf")
        self.assertEqual(len(display_name("x" * 500)), 120)

    def test_storage_paths_only_accept_generated_ids(self) -> None:
        folder = Path("/data/docs")
        self.assertEqual(document_path(folder, "abc123"), folder / "abc123.pdf")
        for bad in ("../x", "a/b", "a.b", ""):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                document_path(folder, bad)


if __name__ == "__main__":
    unittest.main()
