#!/usr/bin/env python3
"""PDF → DOCX 변환 (pdf2docx 기반)

모드:
- faithful (기본): 한국어 문서에 최적화된 레이아웃 보존 변환.
  흐르는 단락, 실제 표, 실제 이미지를 생성 — Word에서 완전 편집 가능.
- editable: 편집 용이성을 우선하는 변환. 일부 레이아웃 정확도를 희생.

이전 "absolute" 이미지 오버레이 방식(VML 텍스트박스 + 전체 페이지 배경 이미지)을
대체합니다. 해당 방식은 Word에서 편집이 불가능했습니다.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger("pdf_to_docx")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="PDF를 편집 가능한 DOCX로 변환합니다")
    parser.add_argument("input_pdf", help="입력 PDF 경로")
    parser.add_argument("output_docx", help="출력 DOCX 경로")
    parser.add_argument("--start", type=int, default=0, help="시작 페이지 (0-indexed)")
    parser.add_argument("--end", type=int, default=None, help="끝 페이지 (0-indexed, 미포함)")
    parser.add_argument(
        "--mode",
        choices=("faithful", "editable"),
        default="faithful",
        help=(
            "faithful (기본): 한국어 문서에 최적화된 레이아웃 보존 변환; "
            "editable: 편집 용이성 우선 변환"
        ),
    )
    parser.add_argument("--ocr", type=int, default=0, choices=(0, 1, 2), help="OCR: 0=미사용, 1=실행, 2=이미 OCR적용됨")
    return parser.parse_args()


def pdf2docx_korean_preset() -> dict[str, Any]:
    """한국어 공문/양식 최적화 프리셋.

    pdf2docx 기본값 대비 주요 차이:
    - page_margin_factor 0.3 (기본 0.5): 한국어 양식은 여백이 좁아
      높은 값이 본문 일부를 잘라버림
    - line_separate_threshold 3.0 (기본 5.0): 한글은 띄어쓰기가 없어
      줄 분리를 더 공격적으로 해야 서로 다른 줄이 합쳐지지 않음
    - new_paragraph_free_space_ratio 0.5 (기본 0.85): 한국어 단락 구분이
      미묘하여 높은 값이 단락을 병합해버림
    - extract_stream_table=True (기본 False): 한국어 양식의 비격자(stream)
      표를 기본값은 건너뜀
    - delete_end_line_hyphen=True (기본 False): 한국어는 하이픈 연결 안 함
    - clip_image_res_ratio 6.0 (기본 4.0): 양식 내 이미지 디테일 보존
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
    """편집 우선 프리셋 — 레이아웃 정확도를 일부 희생하여 편집 용이성 향상.

    단락 병합은 pdf2docx 기본값(더 공격적)을 사용하되
    한국어 특화 설정(표 추출, 하이픈 제거)은 유지.
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
            "pdf2docx가 설치되어 있지 않습니다. 설치: python3 -m pip install pdf2docx",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        raise

    settings = (
        pdf2docx_korean_preset()
        if args.mode == "faithful"
        else pdf2docx_editable_preset()
    )
    settings["ocr"] = args.ocr

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
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

    args = parse_args()
    input_pdf = Path(args.input_pdf)
    output_docx = Path(args.output_docx)

    if not input_pdf.exists():
        print(f"입력 PDF를 찾을 수 없습니다: {input_pdf}", file=sys.stderr)
        return 2

    output_docx.parent.mkdir(parents=True, exist_ok=True)

    try:
        convert_pdf_to_docx(input_pdf, output_docx, args)
    except Exception as exc:
        print(f"PDF→DOCX 변환 실패: {exc}", file=sys.stderr)
        return 3

    if not output_docx.exists() or output_docx.stat().st_size == 0:
        print(f"변환 결과 DOCX가 생성되지 않았습니다: {output_docx}", file=sys.stderr)
        return 4

    print(str(output_docx))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
