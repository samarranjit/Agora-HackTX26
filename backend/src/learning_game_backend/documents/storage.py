"""PDF upload checks and safe on-disk storage.

The file is judged by its bytes, not its name or declared content type. It
must be within the size limit, start with a PDF header, open with pypdf, not
be encrypted, and have at least one page. Files are stored as
<documents_dir>/<server-generated id>.pdf, so the uploaded filename never
becomes part of a path. The original name is kept only as display text.
"""

import hashlib
import io
import os
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

PDF_HEADER = b"%PDF-"
MAX_DISPLAY_NAME = 120


class DocumentError(ValueError):
    """The upload is not an acceptable PDF. code is a stable machine-readable reason."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class CheckedPdf:
    data: bytes
    page_count: int
    sha256: str


def check_pdf(data: bytes, max_bytes: int) -> CheckedPdf:
    """Validate PDF bytes. Raises DocumentError with code too_large, empty_file,
    not_a_pdf, malformed_pdf, encrypted_pdf, or empty_pdf."""
    if len(data) > max_bytes:
        raise DocumentError("too_large", f"PDFs are limited to {max_bytes} bytes.")
    if not data:
        raise DocumentError("empty_file", "The uploaded file is empty.")
    if not data.startswith(PDF_HEADER):
        raise DocumentError("not_a_pdf", "The file is not a PDF.")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise DocumentError(
                "encrypted_pdf",
                "Encrypted or password-protected PDFs are not supported.",
            )
        page_count = len(reader.pages)
    except DocumentError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError, OSError):
        # pypdf reports damaged files through several exception types.
        raise DocumentError("malformed_pdf", "The PDF could not be read.") from None
    if page_count == 0:
        raise DocumentError("empty_pdf", "The PDF has no pages.")
    return CheckedPdf(data, page_count, hashlib.sha256(data).hexdigest())


def display_name(filename: str | None) -> str:
    """A safe label for the upload: no directories, no control characters."""
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in name if unicodedata.category(ch)[0] != "C").strip()
    return name[:MAX_DISPLAY_NAME] or "document.pdf"


def document_path(documents_dir: Path, document_id: str) -> Path:
    if not document_id.isalnum():
        raise ValueError("document IDs are server-generated hex strings")
    return documents_dir / f"{document_id}.pdf"


def store_pdf(documents_dir: Path, document_id: str, data: bytes) -> None:
    """Write the PDF atomically under its server-generated ID."""
    documents_dir.mkdir(parents=True, exist_ok=True)
    target = document_path(documents_dir, document_id)
    fd, temp_name = tempfile.mkstemp(dir=documents_dir, suffix=".tmp")
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "wb") as file:
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_path, target)
    finally:
        temp_path.unlink(missing_ok=True)


def read_pdf(documents_dir: Path, document_id: str) -> bytes:
    return document_path(documents_dir, document_id).read_bytes()
