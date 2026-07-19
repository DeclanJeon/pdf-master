#!/usr/bin/env python3
"""Convert rhwp per-glyph SVG pages into searchable PDFs via PyMuPDF.

rhwp export-svg emits one <text> node per glyph. Chrome print-to-pdf keeps the
visual layout but splits extractable words (e.g. APPLICATION -> APPLI CATI ON).
This script coalesces same-line glyphs, draws rects/images, and writes real PDF
text so copy/search works while preserving approximate layout and colors.
"""

from __future__ import annotations

import argparse
import base64
import re
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    print("PyMuPDF(fitz) is required", file=sys.stderr)
    sys.exit(2)


CSS_PX_TO_PDF_PT = 72.0 / 96.0


def _attr(attrs: str, name: str, default: str | None = None) -> str | None:
    match = re.search(rf"(?:xlink:)?{re.escape(name)}=\"([^\"]*)\"", attrs)
    return match.group(1) if match else default


def _hex_to_rgb(value: str | None) -> tuple[float, float, float] | None:
    if not value or value.lower() == "none":
        return None
    value = value.strip().lstrip("#")
    if len(value) != 6:
        return None
    try:
        return tuple(int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return None


def _page_size_px(svg: str) -> tuple[float, float]:
    width_match = re.search(r"<svg[^>]*\bwidth=\"([0-9.]+)(?:px)?\"", svg, re.I)
    height_match = re.search(r"<svg[^>]*\bheight=\"([0-9.]+)(?:px)?\"", svg, re.I)
    if width_match and height_match:
        return float(width_match.group(1)), float(height_match.group(1))
    view_box = re.search(
        r"<svg[^>]*\bviewBox=\"\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*\"",
        svg,
        re.I,
    )
    if view_box:
        return float(view_box.group(1)), float(view_box.group(2))
    return 793.7066666666667, 1122.5066666666667


def _parse_rects(svg: str) -> list[tuple[float, float, float, float, str | None, str | None, float]]:
    rects: list[tuple[float, float, float, float, str | None, str | None, float]] = []
    for match in re.finditer(r"<rect\b([^>]*)/?>", svg, re.I):
        attrs = match.group(1)
        x = float(_attr(attrs, "x", "0") or 0)
        y = float(_attr(attrs, "y", "0") or 0)
        width = float(_attr(attrs, "width", "0") or 0)
        height = float(_attr(attrs, "height", "0") or 0)
        if width <= 0 or height <= 0:
            continue
        fill = _attr(attrs, "fill")
        stroke = _attr(attrs, "stroke")
        stroke_width = float(_attr(attrs, "stroke-width", "0") or 0)
        rects.append((x, y, width, height, fill, stroke, stroke_width))
    return rects


def _parse_images(svg: str) -> list[tuple[float, float, float, float, bytes]]:
    images: list[tuple[float, float, float, float, bytes]] = []
    for match in re.finditer(r"<image\b([^>]*)/?>", svg, re.I):
        attrs = match.group(1)
        href = _attr(attrs, "href")
        if not href:
            continue
        x = float(_attr(attrs, "x", "0") or 0)
        y = float(_attr(attrs, "y", "0") or 0)
        width = float(_attr(attrs, "width", "0") or 0)
        height = float(_attr(attrs, "height", "0") or 0)
        if width <= 0 or height <= 0:
            continue
        data_match = re.match(r"data:image/[^;]+;base64,(.+)$", href, re.I | re.S)
        if not data_match:
            # file: or relative paths are not used by rhwp export-svg in our pipeline
            continue
        raw = re.sub(r"\s+", "", data_match.group(1))
        try:
            images.append((x, y, width, height, base64.b64decode(raw)))
        except Exception:
            continue
    return images


def _parse_glyphs(svg: str) -> list[dict]:
    glyphs: list[dict] = []
    for match in re.finditer(r"<text\b([^>]*)>(.*?)</text>", svg, re.I | re.S):
        attrs = match.group(1)
        content = match.group(2)
        if content is None:
            continue
        glyphs.append(
            {
                "x": float(_attr(attrs, "x", "0") or 0),
                "y": float(_attr(attrs, "y", "0") or 0),
                "font_size": float(_attr(attrs, "font-size", "12") or 12),
                "fill": _attr(attrs, "fill", "#000000") or "#000000",
                "font_family": _attr(attrs, "font-family", "Helvetica") or "Helvetica",
                "font_weight": _attr(attrs, "font-weight", "") or "",
                "content": content,
            }
        )
    return glyphs


def _coalesce_lines(glyphs: list[dict], rects: list[tuple[float, float, float, float, str | None, str | None, float]] | None = None) -> list[dict]:
    """Group per-glyph SVG text into lines.

    When ``rects`` (cell borders from the source SVG) are supplied, a glyph that
    falls outside the current line's cell is forced onto a new line so table
    cells stay separated instead of merging into one run
    (e.g. '총매출1,200만원목표 달성' must stay per-cell).
    """
    if not glyphs:
        return []

    def cell_of(x: float, y: float):
        if not rects:
            return None
        best = None
        for (rx, ry, rw, rh, *_rest) in rects:
            # Rect y is the cell top; glyph baseline sits lower inside the cell.
            # Allow a generous vertical band so cell text is matched to its cell.
            if rx - 1.0 <= x <= rx + rw + 1.0 and ry - 40.0 <= y <= ry + rh + 40.0:
                if best is None or rw * rh < best[2] * best[3]:
                    best = (rx, ry, rw, rh)
        return best
    groups: list[list[dict]] = []
    current: list[dict] | None = None
    current_key = None
    current_cell = None
    for glyph in glyphs:
        key = (
            glyph["font_family"],
            glyph["font_size"],
            glyph["fill"],
            glyph["font_weight"],
        )
        gcell = cell_of(glyph["x"], glyph["y"])
        same_cell = (
            current_cell is not None
            and gcell is not None
            and abs(gcell[0] - current_cell[0]) < 1.0
            and abs(gcell[1] - current_cell[1]) < 1.0
        )
        if (
            current is not None
            # Prefer cell continuity: if the glyph is in the same cell as the
            # current run, keep it regardless of tiny y drift (rhwp emits
            # per-glyph baselines that vary within a cell).
            and (same_cell or (
                current_key == key
                and glyph["x"] >= current[-1]["x"] - 0.01
            ))
        ):
            current.append(glyph)
            continue
        current = [glyph]
        current_key = key
        current_cell = gcell
        groups.append(current)

    lines: list[dict] = []
    for items in groups:
        advances = [
            items[i + 1]["x"] - items[i]["x"]
            for i in range(len(items) - 1)
            if items[i + 1]["x"] - items[i]["x"] > 0
        ]
        if advances:
            ordered = sorted(advances)
            median = ordered[len(ordered) // 2]
        else:
            median = items[0]["font_size"] * 0.55
        space_threshold = max(median * 1.35, items[0]["font_size"] * 0.45)

        text = ""
        for index, item in enumerate(items):
            if index > 0:
                gap = items[index]["x"] - items[index - 1]["x"]
                prev = items[index - 1]["content"]
                if gap >= space_threshold:
                    text += " "
                elif prev in {",", ";", ":"} and gap >= median * 0.9:
                    text += " "
            text += item["content"]

        first = items[0]
        lines.append(
            {
                "x": first["x"],
                "y": first["y"],
                "size": first["font_size"],
                "fill": first["fill"],
                "text": text,
                "bold": "bold" in first["font_weight"].lower(),
                "font_family": first["font_family"],
            }
        )
    return lines


def _pick_font(font_family: str, bold: bool) -> str:
    lower = font_family.lower()
    if "courier" in lower:
        return "cobo" if bold else "cour"
    if "times" in lower:
        return "tibo" if bold else "tiro"
    # Korean / CJK fonts: map to a system TTF so glyphs render instead of tofu.
    if any(k in lower for k in ("nanum", "malgun", "gothic", "batang", "dotum", "cjk", "hangul", "noto", "hypp", "함초롬", "맑은", "한", "웅", "궁")):
        import glob
        candidates = [
            str(Path(__file__).resolve().parent.parent / "fonts" / "NanumGothic.ttf"),
            f"/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else f"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            f"/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc" if bold else f"/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
        ]
        for c in candidates:
            if glob.glob(c):
                return c
    return "hebo" if bold else "helv"


def convert_svg_file(svg_path: Path, pdf_path: Path) -> dict:
    svg = svg_path.read_text(encoding="utf-8")
    width_px, height_px = _page_size_px(svg)
    scale = CSS_PX_TO_PDF_PT
    width_pt = width_px * scale
    height_pt = height_px * scale

    rects = _parse_rects(svg)
    images = _parse_images(svg)
    lines = _coalesce_lines(_parse_glyphs(svg), rects)

    document = fitz.open()
    page = document.new_page(width=width_pt, height=height_pt)

    for x, y, width, height, fill, stroke, stroke_width in rects:
        rect = fitz.Rect(x * scale, y * scale, (x + width) * scale, (y + height) * scale)
        shape = page.new_shape()
        shape.draw_rect(rect)
        fill_color = _hex_to_rgb(fill)
        stroke_color = _hex_to_rgb(stroke)
        if fill_color is not None:
            shape.finish(
                color=stroke_color,
                fill=fill_color,
                width=(stroke_width or 0) * scale,
            )
        else:
            shape.finish(
                color=stroke_color or (0, 0, 0),
                width=(stroke_width or 0.5) * scale,
            )
        shape.commit()

    for x, y, width, height, data in images:
        rect = fitz.Rect(x * scale, y * scale, (x + width) * scale, (y + height) * scale)
        page.insert_image(rect, stream=data)

    for line in lines:
        color = _hex_to_rgb(line["fill"]) or (0, 0, 0)
        fontname = _pick_font(line["font_family"], line["bold"])
        tw = fitz.TextWriter(page.rect)
        if fontname.endswith((".ttf", ".ttc", ".otf")):
            try:
                font = fitz.Font(fontfile=fontname)
            except Exception:
                font = None
            tw.append(fitz.Point(line["x"] * scale, line["y"] * scale), line["text"], font=font, fontsize=line["size"] * scale)
        else:
            tw.append(fitz.Point(line["x"] * scale, line["y"] * scale), line["text"], font=fitz.Font(fontname), fontsize=line["size"] * scale)
        tw.write_text(page, color=color)

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    document.save(pdf_path)
    document.close()

    return {
        "width_pt": width_pt,
        "height_pt": height_pt,
        "lines": len(lines),
        "rects": len(rects),
        "images": len(images),
        "text_preview": " | ".join(line["text"] for line in lines[:12]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert rhwp SVG page(s) to searchable PDF")
    parser.add_argument("input", help="SVG file or directory of SVG pages")
    parser.add_argument("-o", "--output", required=True, help="Output PDF path")
    args = parser.parse_args()

    source = Path(args.input)
    output = Path(args.output)
    if not source.exists():
        print(f"input not found: {source}", file=sys.stderr)
        return 3

    if source.is_dir():
        svg_files = sorted(
            [path for path in source.iterdir() if path.suffix.lower() == ".svg"],
            key=lambda path: path.name,
        )
        if not svg_files:
            print(f"no SVG pages in {source}", file=sys.stderr)
            return 4
        if len(svg_files) == 1:
            info = convert_svg_file(svg_files[0], output)
            print(output)
            print(info["text_preview"], file=sys.stderr)
            return 0

        # multipage: convert each then merge
        temp_dir = output.parent / f".{output.stem}-pages"
        temp_dir.mkdir(parents=True, exist_ok=True)
        page_pdfs: list[Path] = []
        merged = fitz.open()
        try:
            for index, svg_file in enumerate(svg_files, start=1):
                page_pdf = temp_dir / f"page_{index:03d}.pdf"
                convert_svg_file(svg_file, page_pdf)
                page_pdfs.append(page_pdf)
                with fitz.open(page_pdf) as page_doc:
                    merged.insert_pdf(page_doc)
            output.parent.mkdir(parents=True, exist_ok=True)
            merged.save(output)
        finally:
            merged.close()
        print(output)
        return 0

    info = convert_svg_file(source, output)
    print(output)
    print(info["text_preview"], file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
