#!/usr/bin/env python3
"""Convert PDF to editable DOCX using pdf2docx.

Modes:
- faithful (default): layout-preserving conversion tuned for Korean documents.
  Produces flowing paragraphs, real tables, and real images — fully editable in Word.
- editable: looser paragraph merging for easier content editing at the cost of
  some layout fidelity.

This replaces the old "absolute" image-overlay approach which produced VML text
boxes over a full-page background image — not truly editable in Word.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert a PDF file to editable DOCX")
    parser.add_argument("input_pdf", help="Input PDF path")
    parser.add_argument("output_docx", help="Output DOCX path")
    parser.add_argument("--start", type=int, default=0, help="Zero-based first page index")
    parser.add_argument("--end", type=int, default=None, help="Zero-based exclusive end page index")
    parser.add_argument(
        "--mode",
        choices=("faithful", "editable"),
        default="faithful",
        help=(
            "faithful (default): layout-preserving conversion tuned for Korean documents; "
            "editable: looser paragraph merging for easier content editing"
        ),
    )
    return parser.parse_args()


def pdf2docx_korean_preset() -> dict[str, Any]:
    """Layout-faithful preset tuned for Korean official forms and documents.

    Key differences from pdf2docx defaults:
    - Lower page_margin_factor (0.3 vs 0.5): Korean forms have narrow margins;
      a high factor discards edge-positioned content that is actually part of the body.
    - Tighter line_separate_threshold (3.0 vs 5.0): Korean text has no inter-word
      spaces, so lines must be separated more aggressively to avoid merging distinct lines.
    - Lower new_paragraph_free_space_ratio (0.5 vs 0.85): Korean paragraph breaks
      are more subtle; a high ratio merges paragraphs that should stay distinct.
    - extract_stream_table=True (default False): Korean forms often use
      non-lattice (stream) tables that the default skips.
    - delete_end_line_hyphen=True (default False): Korean doesn't use hyphenation.
    - Higher clip_image_res_ratio (6.0 vs 4.0): Preserve more image detail in forms.
    """
    return {
        "page_margin_factor_top": 0.3,
        "page_margin_factor_bottom": 0.3,
        "float_image_ignorable_gap": 3.0,
        "shape_min_dimension": 1.5,
        "max_line_spacing_ratio": 1.5,
        "line_separate_threshold": 3.0,
        "new_paragraph_free_space_ratio": 0.5,
        "lines_left_aligned_threshold": 1.0,
        "lines_right_aligned_threshold": 1.0,
        "lines_center_aligned_threshold": 2.0,
        "extract_stream_table": True,
        "parse_lattice_table": True,
        "parse_stream_table": True,
        "delete_end_line_hyphen": True,
        "list_not_table": True,
        "ignore_page_error": True,
        "clip_image_res_ratio": 6.0,
        "multi_processing": False,
    }


def pdf2docx_editable_preset() -> dict[str, Any]:
    """Editable-priority preset — easier content editing at the cost of layout fidelity.

    Uses pdf2docx defaults for paragraph merging (which are more aggressive)
    while keeping Korean-specific tweaks (stream table extraction, no hyphenation).
    """
    return {
        "page_margin_factor_top": 0.3,
        "page_margin_factor_bottom": 0.3,
        "line_separate_threshold": 5.0,
        "new_paragraph_free_space_ratio": 0.85,
        "extract_stream_table": True,
        "parse_lattice_table": True,
        "parse_stream_table": True,
        "delete_end_line_hyphen": True,
        "list_not_table": True,
        "ignore_page_error": True,
        "multi_processing": False,
    }


def convert_pdf_to_docx(input_pdf: Path, output_docx: Path, args: argparse.Namespace) -> None:
    try:
        from pdf2docx import Converter
    except ImportError as exc:
        print(
            "pdf2docx is not installed. Install with: python3 -m pip install pdf2docx",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        raise

    settings = (
        pdf2docx_korean_preset()
        if args.mode == "faithful"
        else pdf2docx_editable_preset()
    )

    converter = Converter(str(input_pdf))
    try:
        converter.convert(
            str(output_docx),
            start=args.start,
            end=args.end,
            **settings,
        )
    finally:
        converter.close()


def main() -> int:
    args = parse_args()
    input_pdf = Path(args.input_pdf)
    output_docx = Path(args.output_docx)

    if not input_pdf.exists():
        print(f"input PDF not found: {input_pdf}", file=sys.stderr)
        return 2

    output_docx.parent.mkdir(parents=True, exist_ok=True)

    try:
        convert_pdf_to_docx(input_pdf, output_docx, args)
    except Exception as exc:
        print(f"PDF→DOCX conversion failed: {exc}", file=sys.stderr)
        return 3

    if not output_docx.exists() or output_docx.stat().st_size == 0:
        print(f"converter did not create a usable DOCX: {output_docx}", file=sys.stderr)
        return 4

    print(str(output_docx))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
