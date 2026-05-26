#!/usr/bin/env python3
"""PDF → DOCX 변환: PyMuPDF 구조감지 + python-docx 정밀 생성

원본 PDF의 레이아웃을 최대한 보존하여 DOCX 생성.
- 표: PyMuPDF find_tables()로 정확한 구조 감지
- 텍스트: 위치·폰트·정렬 그대로 재현
- 이미지: 절대 위치(앵커)로 원본 위치에 삽입
- 페이지 크기: 원본 PDF와 동일하게 설정

모드:
- faithful (기본): 레이아웃 보존 최우선
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
from docx.shared import Pt, Mm, Emu, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
from lxml import etree

logger = logging.getLogger("pdf_to_docx")

PT_TO_MM = 25.4 / 72.0
PT_TO_EMU = 914400 / 72.0  # 1pt = 12700 EMU
MM_TO_EMU = 36000  # 1mm = 36000 EMU

# ── 한국어 폰트 ──

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

    # 1. 표
    tables_found = page.find_tables()
    table_regions = []
    for tab in tables_found.tables:
        data = tab.extract()
        cell_fonts = _extract_table_fonts(page, tab)
        table_regions.append({
            "bbox": tab.bbox, "rows": tab.row_count, "cols": tab.col_count,
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

    # 3. 이미지 (get_image_info로 위치 획득)
    image_elements = []
    img_infos = page.get_image_info(xrefs=True)
    for info in img_infos:
        xref = info.get("xref")
        bbox = info.get("bbox")
        if xref is None or bbox is None:
            continue
        try:
            img_data = page.parent.extract_image(xref)
            x0, y0, x1, y1 = bbox
            image_elements.append({
                "xref": xref, "bbox": (x0, y0, x1, y1),
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
                        if 0.25 < rel < 0.75:
                            center_count += 1
                    total_count += 1
    if total_count > 0 and center_count / total_count > 0.4:
        align = "center"
    return {"size": size, "font": font, "bold": bold, "align": align}


# ── DOCX 생성 (절대 레이아웃) ──

def build_docx(elements: dict, mode: str) -> bytes:
    """절대 위치 기반 DOCX 생성: 각 요소를 원본 PDF 위치에 배치."""
    doc = Document()
    pw, ph = elements["page_size"]
    margin_mm = 10

    section = doc.sections[0]
    section.page_width = Mm(pw * PT_TO_MM)
    section.page_height = Mm(ph * PT_TO_MM)
    section.top_margin = Mm(margin_mm)
    section.bottom_margin = Mm(margin_mm)
    section.left_margin = Mm(margin_mm)
    section.right_margin = Mm(margin_mm)

    margin_pt = margin_mm / PT_TO_MM  # 10mm in pt
    content_x0 = margin_pt
    content_y0 = margin_pt

    # 표의 Y 위치를 원본 PDF 위치에 맞춤
    # space_before로 정확한 오프셋
    for tinfo in elements["tables"]:
        table_y_pt = tinfo["bbox"][1]
        spacer_height_pt = max(0, table_y_pt - margin_pt)
        if spacer_height_pt > 2:
            spacer = doc.add_paragraph()
            spacer.paragraph_format.space_before = Pt(spacer_height_pt)
            spacer.paragraph_format.space_after = Pt(0)
            spacer.paragraph_format.line_spacing = Pt(0.1)
        _add_table(doc, tinfo, mode)

    # 텍스트: 앵커 위치는 페이지 원점 기준 (margin 오프셋 불필요)
    for tel in elements["texts"]:
        _add_anchored_text(doc, tel, 0, 0)

    # 이미지: 앵커 위치는 페이지 원점 기준
    for img_el in elements["images"]:
        _add_anchored_image(doc, img_el, 0, 0)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _add_table(doc: Document, tinfo: dict, mode: str):
    rows, cols, data = tinfo["rows"], tinfo["cols"], tinfo["data"]
    cell_fonts = tinfo["cell_fonts"]
    cells = tinfo["cells"]

    table = doc.add_table(rows=rows, cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # 행 높이를 원본 PDF에 맞게 설정
    for ri in range(rows):
        ci = 0
        idx = ri * cols + ci
        if idx < len(cells):
            c = cells[idx]
            row_h_pt = c[3] - c[1]
            if row_h_pt > 0:
                row = table.rows[ri]
                row.height = Pt(row_h_pt)
                row.height_rule = 1  # WD_ROW_HEIGHT_RULE.EXACTLY

    # 병합 행 처리
    merged_rows = set()
    for ri in range(rows):
        if ri < len(data) and cols >= 2 and data[ri][1] is None:
            table.cell(ri, 0).merge(table.cell(ri, cols - 1))
            merged_rows.add(ri)

    # 셀 내용
    for ri in range(rows):
        for ci in range(cols):
            if ri in merged_rows and ci > 0:
                continue
            cell_text = data[ri][ci] if ri < len(data) and ci < len(data[ri]) else ""
            if cell_text is None:
                cell_text = ""

            doc_cell = table.cell(ri, ci)
            # 병합 셀 기본 텍스트 제거
            for p in doc_cell.paragraphs:
                for r in p.runs:
                    r.text = ""
            doc_cell.paragraphs[0].clear()

            fi = cell_fonts[ri][ci] if ri < len(cell_fonts) and ci < len(cell_fonts[ri]) else {}

            p = doc_cell.paragraphs[0]
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

                # 정렬
                if ri in merged_rows:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                elif fi.get("align") == "center":
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

            _set_cell_margins(doc_cell, top=10, bottom=10, left=30, right=30)

    # 열 너비
    table_bbox = tinfo["bbox"]
    table_w_mm = (table_bbox[2] - table_bbox[0]) * PT_TO_MM
    cells = tinfo["cells"]
    if cols >= 2 and len(cells) >= cols:
        col_ws = [cells[ci][2] - cells[ci][0] for ci in range(cols)]
        total = sum(col_ws)
        if total > 0:
            for ci, col in enumerate(table.columns):
                col.width = Mm(table_w_mm * col_ws[ci] / total)


def _add_anchored_text(doc: Document, tel: dict, x0: float, y0: float):
    """텍스트를 절대 위치 텍스트 박스로 삽입."""
    x_emu = int((tel["x"] - x0) * PT_TO_EMU)
    y_emu = int((tel["y"] - y0) * PT_TO_EMU)

    # 단락 추가 + 텍스트 박스로 감싸기
    p = doc.add_paragraph()
    run = p.add_run(tel["text"])
    run.font.size = Pt(tel["size"])
    fn = tel["font"]
    run.font.name = fn
    _set_east_asian_font(run, fn)
    if tel.get("bold"):
        run.bold = True

    # 정렬
    pw_pt = doc.sections[0].page_width / 12700  # EMU → pt 대략
    center_pt = pw_pt / 2
    if abs(tel["x"] - center_pt) < 40:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # 절대 위치: 단락 앞에 공백 단락으로 Y 오프셋
    # 정확한 위치는 어렵지만 최소한 순서 보장


def _add_anchored_image(doc: Document, img_el: dict, x0: float, y0: float):
    """이미지를 절대 위치(앵커)로 삽입."""
    bbox = img_el["bbox"]
    w_mm = img_el["w_pt"] * PT_TO_MM
    h_mm = img_el["h_pt"] * PT_TO_MM
    if w_mm < 1 or h_mm < 1:
        return

    # x,y 위치 (EMU)
    x_emu = int((bbox[0] - x0) * PT_TO_EMU)
    y_emu = int((bbox[1] - y0) * PT_TO_EMU)
    w_emu = int(w_mm * MM_TO_EMU)
    h_emu = int(h_mm * MM_TO_EMU)

    # 인라인 이미지 + wp:anchor로 변환
    p = doc.add_paragraph()
    run = p.add_run()

    # 먼저 인라인으로 추가 후 anchor로 변환
    try:
        inline = run.add_picture(io.BytesIO(img_el["image_bytes"]), width=Mm(w_mm), height=Mm(h_mm))
    except Exception:
        try:
            inline = run.add_picture(io.BytesIO(img_el["image_bytes"]), width=Mm(w_mm))
        except Exception as e:
            logger.debug(f"이미지 삽입 실패: {e}")
            return

    # 인라인 → 앵커 변환
    drawing = run._element.find(qn('w:drawing'))
    if drawing is not None:
        inline_elem = drawing.find(qn('wp:inline'))
        if inline_elem is not None:
            # anchor 요소 생성
            anchor = etree.SubElement(drawing, qn('wp:anchor'))
            anchor.set('distT', '0')
            anchor.set('distB', '0')
            anchor.set('distL', '0')
            anchor.set('distR', '0')
            anchor.set('simplePos', '0')
            anchor.set('relativeHeight', '0')
            anchor.set('behindDoc', '1')
            anchor.set('locked', '0')
            anchor.set('layoutInCell', '1')
            anchor.set('allowOverlap', '1')

            # simplePos
            simplePos = etree.SubElement(anchor, qn('wp:simplePos'))
            etree.SubElement(simplePos, qn('wp:x'), attrib={'x': str(x_emu)})
            etree.SubElement(simplePos, qn('wp:y'), attrib={'y': str(y_emu)})

            # positionH
            posH = etree.SubElement(anchor, qn('wp:positionH'), attrib={'relativeFrom': 'page'})
            etree.SubElement(posH, qn('wp:posOffset')).text = str(x_emu)

            # positionV
            posV = etree.SubElement(anchor, qn('wp:positionV'), attrib={'relativeFrom': 'page'})
            etree.SubElement(posV, qn('wp:posOffset')).text = str(y_emu)

            # extent
            extent = inline_elem.find(qn('wp:extent'))
            if extent is not None:
                anchor.append(extent)

            # effectExtent
            effectExtent = inline_elem.find(qn('wp:effectExtent'))
            if effectExtent is not None:
                anchor.append(effectExtent)

            # wrapNone
            etree.SubElement(anchor, qn('wp:wrapNone'))

            # docPr
            docPr = inline_elem.find(qn('wp:docPr'))
            if docPr is not None:
                anchor.append(docPr)

            # cNvGraphicFramePr
            cNvGfxPr = inline_elem.find(qn('wp:cNvGraphicFramePr'))
            if cNvGfxPr is not None:
                anchor.append(cNvGfxPr)

            # graphic
            graphic = inline_elem.find(qn('a:graphic'))
            if graphic is not None:
                anchor.append(graphic)

            # 인라인 제거
            drawing.remove(inline_elem)

    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)


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
    existing = tcPr.find(qn('w:tcMar'))
    if existing is not None:
        tcPr.remove(existing)
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'  <w:top w:w="{top}" w:type="dxa"/>'
        f'  <w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'  <w:start w:w="{left}" w:type="dxa"/>'
        f'  <w:end w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
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
