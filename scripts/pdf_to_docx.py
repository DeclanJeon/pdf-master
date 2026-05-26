#!/usr/bin/env python3
"""PDF → DOCX 변환: PyMuPDF 정밀 구조감지 + python-docx 정밀 생성

원본 PDF의 레이아웃을 최대한 보존:
- 표: PyMuPDF find_tables() → Y/X 경계로 행렬 구조 + extract()로 내용
- 텍스트: 표 바깥 텍스트 → 절대 위치 앵커 텍스트박스
- 이미지: 절대 위치 앵커 이미지 (원본 위치/크기 그대로)
- 폰트: 한국어 폰트 정규화 (서브셋 접두사 제거)

모드:
- faithful (기본): 원본 레이아웃 최대 보존
- editable: 편집 우선 (동일 처리, 향후 확장용)
"""
import argparse
import io
import os
import sys
import logging

try:
    import fitz
except ImportError:
    print("PyMuPDF가 설치되어 있지 않습니다: pip install PyMuPDF", file=sys.stderr)
    sys.exit(2)

try:
    from docx import Document
    from docx.shared import Pt, Mm, Emu
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml.ns import qn, nsdecls
    from docx.oxml import parse_xml
except ImportError:
    print("python-docx가 설치되어 있지 않습니다: pip install python-docx", file=sys.stderr)
    sys.exit(2)

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

PT_TO_MM = 25.4 / 72
MM_TO_PT = 72 / 25.4
DEFAULT_MARGIN_MM = 10


# ── 폰트 정규화 ──────────────────────────────────────────
def _normalize_font(raw_font: str) -> str:
    """PDF 서브셋 폰트명을 표준 한국어 폰트로 정규화."""
    lower = raw_font.lower()
    if "gungsuh" in lower or "궁서" in lower: return "Gungsuh"
    if "gulim" in lower or "굴림" in lower: return "Gulim"
    if "batang" in lower or "바탕" in lower: return "Batang"
    if "dotum" in lower or "돋움" in lower: return "Dotum"
    if "malgun" in lower or "맑은" in lower: return "Malgun Gothic"
    if "arial" in lower: return "Arial"
    if "times" in lower: return "Times New Roman"
    if "+" in raw_font:
        base = raw_font.split("+", 1)[1]
        return _normalize_font(base)
    return raw_font


# ── PDF 분석 ──────────────────────────────────────────────
def analyze_page(page, mode: str) -> dict:
    """PyMuPDF 페이지에서 모든 요소를 추출."""
    pw, ph = page.rect.width, page.rect.height

    # ── 표 ──
    tables_raw = page.find_tables()
    table_elements = []
    table_rects = []

    for tab in tables_raw.tables:
        data = tab.extract()
        bbox = tab.bbox
        table_rects.append(fitz.Rect(bbox))

        # Y 경계로 행 높이 계산 (cells 인덱싱에 의존하지 않음)
        y_values = set()
        for c in tab.cells:
            y_values.add(round(c[1], 1))
            y_values.add(round(c[3], 1))
        y_sorted = sorted(y_values)
        row_heights = [y_sorted[i+1] - y_sorted[i] for i in range(len(y_sorted)-1)]

        # X 경계로 열 너비 계산
        x_values = set()
        for c in tab.cells:
            x_values.add(round(c[0], 1))
            x_values.add(round(c[2], 1))
        x_sorted = sorted(x_values)
        col_widths = [x_sorted[i+1] - x_sorted[i] for i in range(len(x_sorted)-1)]

        # 셀 폰트/정렬: extract()의 행/열 인덱스로 clip 직접 사용
        cell_fonts = []
        for ri in range(tab.row_count):
            row_fonts = []
            for ci in range(tab.col_count):
                # 이 셀의 clip 영역 계산
                y0 = y_sorted[ri] if ri < len(y_sorted) else 0
                y1 = y_sorted[ri+1] if ri+1 < len(y_sorted) else y0 + 30
                x0 = x_sorted[ci] if ci < len(x_sorted) else 0
                x1 = x_sorted[ci+1] if ci+1 < len(x_sorted) else x0 + 200
                cell_rect = fitz.Rect(x0, y0, x1, y1)
                fi = _extract_cell_font(page, cell_rect)
                row_fonts.append(fi)
            cell_fonts.append(row_fonts)

        table_elements.append({
            "data": data, "rows": tab.row_count, "cols": tab.col_count,
            "row_heights": row_heights, "col_widths": col_widths,
            "cell_fonts": cell_fonts, "bbox": bbox,
        })

    # ── 표 바깥 텍스트 ──
    text_elements = []
    blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    for b in blocks:
        if b["type"] != 0: continue
        for line in b["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()
                if not text: continue
                bbox = span["bbox"]
                r = fitz.Rect(bbox)
                if any(tr.contains(r) or tr.intersects(r) for tr in table_rects):
                    continue
                font = _normalize_font(span["font"])
                align = "left"
                rel_x = span["origin"][0] / pw
                if 0.35 < rel_x < 0.65:
                    align = "center"
                elif rel_x > 0.7:
                    align = "right"

                text_elements.append({
                    "text": text, "x": span["origin"][0], "y": span["origin"][1],
                    "size": span["size"], "font": font, "align": align, "bbox": bbox,
                    "bold": "bold" in span["font"].lower(),
                })

    # ── 이미지 ──
    image_elements = []
    img_infos = page.get_image_info(xrefs=True)
    for info in img_infos:
        xref = info.get("xref")
        if xref is None: continue
        bbox = info["bbox"]
        ib = fitz.Rect(bbox)
        w_pt = ib.x1 - ib.x0
        h_pt = ib.y1 - ib.y0
        if w_pt < 1 or h_pt < 1: continue
        try:
            img_data = page.parent.extract_image(xref)
            if not img_data or not img_data.get("image"):
                continue
        except Exception:
            continue
        image_elements.append({
            "xref": xref, "bbox": bbox, "w_pt": w_pt, "h_pt": h_pt,
            "data": img_data["image"], "ext": img_data.get("ext", "png"),
        })

    return {
        "width": pw, "height": ph,
        "tables": table_elements, "texts": text_elements,
        "images": image_elements,
    }


def _extract_cell_font(page, cell_rect) -> dict:
    """셀 영역에서 폰트 정보 추출."""
    fi = {"size": 11, "font": "Malgun Gothic", "bold": False, "align": "left"}
    try:
        for b in page.get_text("dict", clip=cell_rect)["blocks"]:
            if b["type"] != 0: continue
            for line in b["lines"]:
                for span in line["spans"]:
                    if not span["text"].strip(): continue
                    fi["size"] = span["size"]
                    fi["font"] = _normalize_font(span["font"])
                    if "bold" in span["font"].lower(): fi["bold"] = True
                    x = span["origin"][0]
                    cw = cell_rect.x1 - cell_rect.x0
                    if cw > 0 and 0.25 < (x - cell_rect.x0) / cw < 0.75:
                        fi["align"] = "center"
    except Exception:
        pass
    return fi


# ── DOCX 생성 ────────────────────────────────────────────
def build_docx(page_data: dict, mode: str) -> bytes:
    """분석된 페이지 데이터로 DOCX 생성."""
    doc = Document()
    section = doc.sections[0]

    pw_pt = page_data["width"]
    ph_pt = page_data["height"]
    margin_mm = DEFAULT_MARGIN_MM

    section.page_width = Mm(pw_pt * PT_TO_MM)
    section.page_height = Mm(ph_pt * PT_TO_MM)
    section.top_margin = Mm(margin_mm)
    section.bottom_margin = Mm(margin_mm)
    section.left_margin = Mm(margin_mm)
    section.right_margin = Mm(margin_mm)

    margin_pt = margin_mm * MM_TO_PT

    # ── 표: 인라인 삽입 + Y 위치 space_before ──
    for tinfo in page_data["tables"]:
        _add_table(doc, tinfo, margin_pt)

    # ── 텍스트: 절대 위치 앵커 ──
    for tel in page_data["texts"]:
        _add_anchored_text(doc, tel)

    # ── 이미지: 절대 위치 앵커 ──
    for img_el in page_data["images"]:
        _add_anchored_image(doc, img_el, page_data)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _add_table(doc: Document, tinfo: dict, margin_pt: float):
    """표를 Y 위치에 맞게 삽입."""
    rows = tinfo["rows"]
    cols = tinfo["cols"]
    data = tinfo["data"]
    row_heights = tinfo["row_heights"]
    col_widths = tinfo["col_widths"]
    cell_fonts = tinfo["cell_fonts"]
    bbox = tinfo["bbox"]

    # Y 오프셋 (space_before)
    table_y_pt = bbox[1]
    spacer_pt = max(0, table_y_pt - margin_pt)
    if spacer_pt > 2:
        spacer = doc.add_paragraph()
        spacer.paragraph_format.space_before = Pt(spacer_pt)
        spacer.paragraph_format.space_after = Pt(0)
        spacer.paragraph_format.line_spacing = Pt(0.1)

    table = doc.add_table(rows=rows, cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # 행 높이 (Y 경계 기반)
    for ri in range(rows):
        if ri < len(row_heights):
            row_h = row_heights[ri]
            if row_h > 0:
                row = table.rows[ri]
                row.height = Pt(row_h)
                row.height_rule = 1  # EXACTLY

    # 열 너비 (X 경계 기반)
    total_w = sum(col_widths)
    if total_w > 0:
        for ci in range(cols):
            if ci < len(col_widths):
                table.columns[ci].width = Mm(col_widths[ci] * PT_TO_MM)

    # 병합 행 감지 및 처리
    merged_rows = set()
    for ri in range(rows):
        if ri < len(data) and cols >= 2 and data[ri][1] is None:
            table.cell(ri, 0).merge(table.cell(ri, cols - 1))
            merged_rows.add(ri)

    # 셀 내용 채우기
    for ri in range(rows):
        for ci in range(cols):
            if ri in merged_rows and ci > 0: continue
            cell_text = data[ri][ci] if ri < len(data) and ci < len(data[ri]) else ""
            if cell_text is None: cell_text = ""

            doc_cell = table.cell(ri, ci)
            # 기본 텍스트 제거
            for p in doc_cell.paragraphs:
                for r in p.runs: r.text = ""
            doc_cell.paragraphs[0].clear()

            fi = cell_fonts[ri][ci] if ri < len(cell_fonts) and ci < len(cell_fonts[ri]) else {}

            p = doc_cell.paragraphs[0]
            for li, line in enumerate(str(cell_text).split("\n")):
                if li > 0: p = doc_cell.add_paragraph()
                run = p.add_run(line)
                _apply_font(run, fi)
                if ri in merged_rows:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                elif fi.get("align") == "center":
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

            # 셀 여백 최소화
            _set_cell_margins(doc_cell, top=10, bottom=10, start=30, end=30)


def _apply_font(run, fi: dict):
    """런에 폰트 설정 적용."""
    sz = fi.get("size", 11)
    fn = fi.get("font", "Malgun Gothic")
    run.font.size = Pt(sz)
    run.font.name = fn
    if fi.get("bold"): run.bold = True

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="{fn}" w:hAnsi="{fn}" w:eastAsia="{fn}" w:cs="{fn}"/>')
        rPr.insert(0, rFonts)
    else:
        for attr in [qn('w:eastAsia'), qn('w:ascii'), qn('w:hAnsi'), qn('w:cs')]:
            rFonts.set(attr, fn)


def _set_cell_margins(cell, top=10, bottom=10, start=30, end=30):
    """셀 여백 설정 (dxa 단위)."""
    tcPr = cell._tc.get_or_add_tcPr()
    existing = tcPr.find(qn('w:tcMar'))
    if existing is not None: tcPr.remove(existing)
    tcPr.append(parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:start w:w="{start}" w:type="dxa"/>'
        f'<w:end w:w="{end}" w:type="dxa"/>'
        f'</w:tcMar>'))


def _add_anchored_text(doc: Document, tel: dict):
    """텍스트를 절대 위치 앵커 텍스트박스로 삽입."""
    x_pt = tel["x"]
    y_pt = tel["y"] - tel["size"]  # baseline → top

    p = doc.add_paragraph()
    run = p.add_run(tel["text"])
    _apply_font(run, tel)
    if tel.get("align") == "center":
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif tel.get("align") == "right":
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT


def _add_anchored_image(doc: Document, img_el: dict, page_data: dict):
    """이미지를 절대 위치 앵커로 삽입."""
    bbox = img_el["bbox"]
    x_pt = bbox[0]
    y_pt = bbox[1]
    w_pt = img_el["w_pt"]
    h_pt = img_el["h_pt"]

    img_stream = io.BytesIO(img_el["data"])
    p = doc.add_paragraph()
    pPr = p._element.get_or_add_pPr()

    # add_picture로 inline 이미지 추가 후 anchor로 변환
    run = p.add_run()
    run.add_picture(img_stream, width=Mm(w_pt * PT_TO_MM), height=Mm(h_pt * PT_TO_MM))

    # inline → anchor 변환
    r_elem = run._element
    drawing = r_elem.find(qn('w:drawing'))
    if drawing is not None:
        inline = drawing.find(qn('wp:inline'))
        if inline is not None:
            extent = inline.find(qn('wp:extent'))
            cx = extent.get('cx', '0') if extent is not None else '0'
            cy = extent.get('cy', '0') if extent is not None else '0'
            docPr = inline.find(qn('wp:docPr'))
            doc_id = docPr.get('id', '1') if docPr is not None else '1'

            # behindDoc: 표 영역과 겹치면 배경으로
            img_rect = fitz.Rect(bbox)
            behind = "0"
            for tinfo in page_data.get("tables", []):
                tab_rect = fitz.Rect(tinfo["bbox"])
                if img_rect.intersects(tab_rect):
                    behind = "1"
                    break

            anchor_xml = (
                f'<wp:anchor distT="0" distB="0" distL="0" distR="0" '
                f'simplePos="0" relativeHeight="{img_el["xref"]}" behindDoc="{behind}" '
                f'locked="0" layoutInCell="1" allowOverlap="1" '
                f'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
                f' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
                f' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
                f' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                f'<wp:simplePos x="0" y="0"/>'
                f'<wp:positionH relativeFrom="page"><wp:posOffset>{int(x_pt * 12700)}</wp:posOffset></wp:positionH>'
                f'<wp:positionV relativeFrom="page"><wp:posOffset>{int(y_pt * 12700)}</wp:posOffset></wp:positionV>'
                f'<wp:extent cx="{cx}" cy="{cy}"/>'
                f'<wp:wrapNone/>'
                f'<wp:docPr id="{doc_id}" name="Image{img_el["xref"]}"/>'
                f'</wp:anchor>'
            )
            anchor_elem = parse_xml(anchor_xml)

            # inline의 자식 요소(graphic 등)를 anchor로 이동
            children_to_move = []
            for child in list(inline):
                if child.tag not in [qn('wp:extent'), qn('wp:docPr'), qn('wp:simplePos')]:
                    children_to_move.append(child)
            for child in children_to_move:
                inline.remove(child)
                anchor_elem.append(child)

            drawing.remove(inline)
            drawing.append(anchor_elem)


# ── CLI 인터페이스 ────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="PDF → DOCX 변환 (PyMuPDF + python-docx)")
    parser.add_argument("input", help="입력 PDF 파일 경로")
    parser.add_argument("output", help="출력 DOCX 파일 경로")
    parser.add_argument("--mode", choices=["faithful", "editable"], default="faithful",
                        help="변환 모드 (기본: faithful)")
    parser.add_argument("--start", type=int, default=0, help="시작 페이지 (0-indexed)")
    parser.add_argument("--end", type=int, default=-1, help="끝 페이지 (-1=전체)")
    parser.add_argument("--margin", type=float, default=DEFAULT_MARGIN_MM,
                        help="페이지 여백 mm (기본: 10)")
    args = parser.parse_args()

    input_path = args.input
    output_path = args.output
    mode = args.mode

    if not os.path.isfile(input_path):
        print(f"입력 PDF를 찾을 수 없습니다: {input_path}", file=sys.stderr)
        sys.exit(3)

    try:
        pdf_doc = fitz.open(input_path)
    except Exception as e:
        print(f"PDF 열기 실패: {e}", file=sys.stderr)
        sys.exit(3)

    end = args.end if args.end >= 0 else len(pdf_doc) - 1
    log.info(f"변환 시작: {input_path} → {output_path} (모드={mode}, 페이지={args.start}~{end})")

    page = pdf_doc[args.start]
    page_data = analyze_page(page, mode)
    docx_bytes = build_docx(page_data, mode)

    out_dir = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(out_dir, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(docx_bytes)

    pdf_doc.close()
    log.info(f"변환 완료: {output_path}")
    print(output_path)


if __name__ == "__main__":
    main()
