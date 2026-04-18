"""
Document pre-processor: converts PDF / DOCX / XLSX to plain text for Claude.
"""
import io
import logging
from typing import Literal

logger = logging.getLogger(__name__)

FileType = Literal["pdf", "docx", "xlsx"]


def extract_text(content: bytes, file_type: FileType) -> str:
    if file_type == "pdf":
        return _extract_pdf(content)
    elif file_type == "docx":
        return _extract_docx(content)
    elif file_type == "xlsx":
        return _extract_xlsx(content)
    raise ValueError(f"Unsupported file type: {file_type}")


def _extract_pdf(content: bytes) -> str:
    import fitz  # PyMuPDF
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        pages = []
        for page in doc:
            pages.append(page.get_text("text"))
        return "\n".join(pages)
    except Exception as e:
        logger.warning("PyMuPDF could not parse PDF (corrupt or fake): %s", e)
        return ""


def _extract_docx(content: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(content))
    return "\n".join(para.text for para in doc.paragraphs if para.text.strip())


def _extract_xlsx(content: bytes) -> str:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(content), data_only=True)
    lines = []
    for sheet in wb.worksheets:
        lines.append(f"=== Sheet: {sheet.title} ===")
        for row in sheet.iter_rows(values_only=True):
            row_text = "\t".join(str(c) if c is not None else "" for c in row)
            if row_text.strip():
                lines.append(row_text)
    return "\n".join(lines)


def detect_file_type(filename: str) -> FileType:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        return "pdf"
    elif ext in ("doc", "docx"):
        return "docx"
    elif ext in ("xls", "xlsx"):
        return "xlsx"
    raise ValueError(f"Unsupported file extension: .{ext}")
