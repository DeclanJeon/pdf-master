#!/usr/bin/env python3
"""PDF → DOCX 변환: PyMuPDF 구조감지 + python-docx 정밀 생성

pdf2docx의 표 파싱 한계를 극복:
1. PyMuPDF로 표 구조 정확히 감지 (find_tables + extract)
2. PyMuPDF로 텍스트 위치·폰트 추출
3. PyMuPDF로 이미지 위치·크기 추출
4. python-docx로 정밀 배치 DOCX 생성

모드:
- faithful (기본): 한국어 문서 최적화, 원본 레이아웃 최대 보존
- editable: 편집 용이성 우선
"""

from __future__ import annotations

import argparse
import io
import logging
import sys
from pathlib import Path
from typing import Any

import fitz
from docx import Document
from docx.shared import Pt, Mm, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml

logger = logging.getLogger("pdf_to_docx")

PT_TO_MM = 25.4 / 72.0

# ── 한국어 폰트 정규화 ──

KOREAN_FONT_MAP = {
    "gulim": "Gulim", "gulimche": "Gulim", "굴림": "Gulim",
    "batang": "Batang", "batangche": "Batang", "바탕": "Batang",
    "gungsuh": "Gungsuh", "gungsuhche": "Gungsuh", "궁서": "Gungsuh",
    "dotum": "Dotum", "dotumche": "Dotum", "돋움": "Dotum",
    "malgungothic": "Malgun Gothic", "malgun gothic": "Malgun Gothic", "맑은 고딕": "Malgun Gothic",
    "nanumgothic": "NanumGothic", "나눔고딕": "NanumGothic",
    "notosanskr": "Noto Sans KR", "notosanscjkkr": "Noto Sans KR",
    "pretendard": "Pretendard",
}
DEFAULT_KOREAN_FONT = "Malgun Gothic"


def normalize_font(raw_font: str) -> str:
    if not raw_font:
        return DEFAULT_KOREAN_FONT
    lower = raw_font.lower()
    for key, value in KOREAN_FONT_MAP.items():
        if key in lower:
            return value
    if "+" in raw_font:
        clean = raw_font.split("+", 1)[1].lower()
        for key, value in KOREAN_FONT_MAP.items():
            if key in clean:
                return value
    return DEFAULT_KOREAN_FONT


# ── PDF 구조 추출 ──

def extract_page_elements(page: fitz.Page, mode: str) -> dict:
    pw, ph = page.rect.width, page.rect.height

    # 1. 표 감지
    tables_found = page.find_tables()
    table_regions = []
    for tab in tables_found.tables:
        data = tab.extract()
        bbox = tab.bbox
        cell_fonts = _extract_table_fonts(page, tab)
        table_regions.append({
            "bbox": bbox, "rows": tab.row_count, "cols": tab.col_count,
            "data": data, "cell_fonts": cell_fonts, "cells": tab.cells,
        })

    table_bboxes = [fitz.Rect(t["bbox"]) for t in table_regions]

    # 2. 텍스트 (표 내부 제외)
    text_elements = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        if any(fitz.Rect(b["bbox"]).intersects(tb) for tb in table_bboxes):
            continue
        for line in b["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()
                if not text:
                    continue
                text_elements.append({
                    "text": text, "x": span["origin"][0], "y": span["origin"][1],
                    "size": span["size"], "font": normalize_font(span["font"]),
                    "bold": "bold" in span["font"].lower(),
                })

    # 3. 이미지
    image_elements = []
    img_infos = page.get_image_info(xrefs=True)
    for info in img_infos:
        xref = info.get("xref")
        if xref is None:
            continue
        bbox = info.get("bbox")
        if bbox is None:
            continue
        try:
            img_data = page.parent.extract_image(xref)
            x0, y0, x1, y1 = bbox
            image_elements.append({
                "xref": xref,
                "bbox": (x0, y0, x1, y1),
                "w_pt": x1 - x0, "h_pt": y1 - y0,
                "image_bytes": img_data["image"], "ext": img_data["ext"],
            })
        except Exception as e:
            logger.debug(f"이미지 xref={xref} 스킵: {e}")

    return {"page_size": (pw, ph), "tables": table_regions,
            "texts": text_elements, "images": image_elements}


def _extract_table_fonts(page: fitz.Page, tab) -> list:
    cell_fonts = []
    for ri in range(tab.row_count):
        row_fonts = []
        for ci in range(tab.col_count):
            idx = ri * tab.col_count + ci
            if idx < len(tab.cells):
                cell = tab.cells[idx]
                cell_rect = fitz.Rect(cell)
                row_fonts.append(_extract_cell_font(page, cell_rect))
            else:
                row_fonts.append({"size": 11, "font": DEFAULT_KOREAN_FONT, "bold": False, "align": "left"})
        cell_fonts.append(row_fonts)
    return cell_fonts


def _extract_cell_font(page: fitz.Page, cell_rect: fitz.Rect) -> dict:
    size, font, bold, align = 11.0, DEFAULT_KOREAN_FONT, False, "left"
    center_count, total_count = 0, 0
    for b in page.get_text("dict", clip=cell_rect)["blocks"]:
        if b["type"] != 0:
            continue
        for line in b["lines"]:
            for span in line["spans"]:
                if span["text"].strip():
                    size = span["size"]
                    font = normalize_font(span["font"])
                    if "bold" in span["font"].lower():
                        bold = True
                    x = span["origin"][0]
                    cw = cell_rect.x1 - cell_rect.x0
                    if cw > 0:
                        rel = (x - cell_rect.x0) / cw
                        if 0.3 < rel < 0.7:
                            center_count += 1
                    total_count += 1
    if total_count > 0 and center_count / total_count > 0.5:
        align = "center"
    return {"size": size, "font": font, "bold": bold, "align": align}


# ── DOCX 생성 ──

def build_docx(elements: dict, mode: str) -> bytes:
    doc = Document()
    pw, ph = elements["page_size"]

    section = doc.sections[0]
    section.page_width = Mm(pw * PT_TO_MM)
    section.page_height = Mm(ph * PT_TO_MM)
    section.top_margin = Mm(10)
    section.bottom_margin = Mm(10)
    section.left_margin = Mm(10)
    section.right_margin = Mm(10)

    content_width_pt = pw - 20 / PT_TO_MM

    # 모든 요소를 Y순 정렬
    all_els = []
    for t in elements["tables"]:
        all_els.append(("table", t["bbox"][1], t))
    for t in elements["texts"]:
        all_els.append(("text", t["y"], t))
    for t in elements["images"]:
        all_els.append(("image", t["bbox"][1], t))
    all_els.sort(key=lambda x: x[1])

    prev_y = 0
    for etype, ypos, edata in all_els:
        # 수직 간격
        gap_pt = ypos - prev_y
        if gap_pt > 3:
            spacer = doc.add_paragraph()
            spacer.paragraph_format.space_before = Pt(gap_pt * 0.6)
            spacer.paragraph_format.space_after = Pt(0)
            spacer.paragraph_format.line_spacing = Pt(1)

        if etype == "table":
            _add_table(doc, edata, mode)
            prev_y = edata["bbox"][3]
        elif etype == "text":
            _add_text(doc, edata, content_width_pt)
            prev_y = ypos + edata["size"]
        elif etype == "image":
            _add_image(doc, edata)
            prev_y = edata["bbox"][3]

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _add_table(doc: Document, tinfo: dict, mode: str):
    rows, cols, data = tinfo["rows"], tinfo["cols"], tinfo["data"]
    cell_fonts = tinfo["cell_fonts"]

    table = doc.add_table(rows=rows, cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # 병합 행 감지: data[ri][1]이 None이면 전체 열 병합
    # 병합을 내용 채우기 전에 수행
    merged_rows = set()
    for ri in range(rows):
        if ri < len(data) and cols >= 2 and data[ri][1] is None:
            # 병합 전에 두 번째 셀 이후 내용 비우기
            for ci2 in range(1, cols):
                cell2 = table.cell(ri, ci2)
                for p2 in cell2.paragraphs:
                    for r2 in p2.runs:
                        r2.text = ""
                    p2.text = ""
            table.cell(ri, 0).merge(table.cell(ri, cols - 1))
            merged_rows.add(ri)

    # 셀 내용
    for ri in range(rows):
        for ci in range(cols):
            # 병합 행의 두 번째 이후 셀은 스킵
            if ri in merged_rows and ci > 0:
                continue

            cell_text = data[ri][ci] if ri < len(data) and ci < len(data[ri]) else ""
            if cell_text is None:
                cell_text = ""

            doc_cell = table.cell(ri, ci)
            p = doc_cell.paragraphs[0]

            fi = cell_fonts[ri][ci] if ri < len(cell_fonts) and ci < len(cell_fonts[ri]) else {}

            for li, line in enumerate(str(cell_text).split("\n")):
                if li > 0:
                    p = doc_cell.add_paragraph()
                run = p.add_run(line)
                run.font.size = Pt(fi.get("size", 11))
                fn = fi.get("font", DEFAULT_KOREAN_FONT)
                run.font.name = fn
                _set_east_asian_font(run, fn)
                if fi.get("bold"):
                    run.bold = True

                # 정렬: 병합 행은 중앙, 그 외는 감지값
                if ri < len(data) and cols >= 2 and data[ri][1] is None:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                elif fi.get("align") == "center":
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

            _set_cell_margins(doc_cell, top=20, bottom=20, left=40, right=40)

    # 열 너비
    pw_mm = tinfo["bbox"][2] * PT_TO_MM  # 표 전체 너비 mm
    cells = tinfo["cells"]
    if cols >= 2 and len(cells) >= cols:
        col_ws = [cells[ci][2] - cells[ci][0] for ci in range(cols)]
        total = sum(col_ws)
        if total > 0:
            for ci, col in enumerate(table.columns):
                col.width = Mm(pw_mm * col_ws[ci] / total)


def _add_text(doc: Document, tel: dict, content_width_pt: float):
    p = doc.add_paragraph()
    run = p.add_run(tel["text"])
    run.font.size = Pt(tel["size"])
    fn = tel["font"]
    run.font.name = fn
    _set_east_asian_font(run, fn)
    if tel.get("bold"):
        run.bold = True

    center_pt = content_width_pt / 2 + 35  # 대략 페이지 중앙
    if abs(tel["x"] - center_pt) < 40:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif tel["x"] > content_width_pt * 0.7 + 35:
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    else:
        indent_mm = max(0, (tel["x"] - 35) * PT_TO_MM)
        if indent_mm > 1:
            p.paragraph_format.left_indent = Mm(indent_mm)

    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = Pt(tel["size"] * 1.3)


def _add_image(doc: Document, img_el: dict):
    bbox = img_el["bbox"]
    w_mm = img_el["w_pt"] * PT_TO_MM
    h_mm = img_el["h_pt"] * PT_TO_MM
    if w_mm < 1 or h_mm < 1:
        return
    try:
        doc.add_picture(io.BytesIO(img_el["image_bytes"]), width=Mm(w_mm), height=Mm(h_mm))
    except Exception as e:
        logger.debug(f"이미지 삽입 실패: {e}")


def _set_east_asian_font(run, font_name: str):
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="{font_name}" w:hAnsi="{font_name}" w:eastAsia="{font_name}" w:cs="{font_name}"/>')
        rPr.insert(0, rFonts)
    else:
        rFonts.set(qn('w:eastAsia'), font_name)
        rFonts.set(qn('w:ascii'), font_name)
        rFonts.set(qn('w:hAnsi'), font_name)


def _set_cell_margins(cell, top=0, bottom=0, left=0, right=0):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'  <w:top w:w="{top}" w:type="dxa"/>'
        f'  <w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'  <w:start w:w="{left}" w:type="dxa"/>'
        f'  <w:end w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    existing = tcPr.find(qn('w:tcMar'))
    if existing is not None:
        tcPr.remove(existing)
    tcPr.append(tcMar)


# ── 메인 ──

def convert_pdf_to_docx(input_pdf: Path, output_docx: Path, args: argparse.Namespace):
    doc_pdf = fitz.open(str(input_pdf))
    end = args.end if args.end is not None else len(doc_pdf) - 1

    all_elements = []
    for pi in range(args.start, min(end + 1, len(doc_pdf))):
        elements = extract_page_elements(doc_pdf[pi], args.mode)
        all_elements.append(elements)
    doc_pdf.close()

    docx_bytes = build_docx(all_elements[0] if all_elements else {}, args.mode)
    with open(output_docx, 'wb') as f:
        f.write(docx_bytes)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="PDF를 편집 가능한 DOCX로 변환합니다")
    parser.add_argument("input_pdf", help="입력 PDF 경로")
    parser.add_argument("output_docx", help="출력 DOCX 경로")
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int, default=None)
    parser.add_argument("--mode", choices=("faithful", "editable"), default="faithful")
    parser.add_argument("--ocr", type=int, default=0, choices=(0, 1, 2))
    args = parser.parse_args()

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
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 3

    if not output_docx.exists() or output_docx.stat().st_size == 0:
        print(f"DOCX가 생성되지 않았습니다: {output_docx}", file=sys.stderr)
        return 4

    print(str(output_docx))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
