#!/usr/bin/env python3
"""PDF → absolute layout JSON for native HWP ingest.

Extracts text (font/size/color/position), vector boxes (fill + stroke),
and images so PDF→HWP can preserve layout without DOCX/ODT multi-hop loss.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    print("PyMuPDF 미설치", file=sys.stderr)
    sys.exit(2)


def color_to_hex(color):
    if color is None:
        return None
    if isinstance(color, int):
        return f"#{color & 0xFFFFFF:06X}"
    try:
        r, g, b = color[:3]
        return (
            f"#{round(max(0, min(1, float(r))) * 255):02X}"
            f"{round(max(0, min(1, float(g))) * 255):02X}"
            f"{round(max(0, min(1, float(b))) * 255):02X}"
        )
    except Exception:
        return None


def normalize_font(raw_font: str) -> str:
    if not raw_font:
        return "함초롬바탕"
    name = raw_font
    if "+" in name:
        name = name.split("+", 1)[1]
    lower = name.lower()
    if "gungsuh" in lower or "궁서" in lower:
        return "Gungsuh"
    if "gulim" in lower or "굴림" in lower:
        return "Gulim"
    if "batang" in lower or "바탕" in lower:
        return "Batang"
    if "dotum" in lower or "돋움" in lower:
        return "Dotum"
    if "malgun" in lower or "맑은" in lower:
        return "Malgun Gothic"
    if "noto" in lower and "cjk" in lower:
        return "Noto Sans CJK KR"
    if "arial" in lower or "helv" in lower or "helvetica" in lower or "nimbus sans" in lower:
        # URW Nimbus Sans is the metric-compatible Helvetica clone (better than Liberation here).
        return "Nimbus Sans"
    if "times" in lower or "nimbus roman" in lower:
        return "Nimbus Roman"
    if "courier" in lower or "nimbus mono" in lower:
        return "Nimbus Mono PS"
    return name


def keep_box(width: float, height: float) -> bool:
    if width <= 0 or height <= 0:
        return False
    # Keep thin horizontal/vertical rules as well as normal rectangles.
    if width >= 5 and height >= 0.3:
        return True
    if height >= 5 and width >= 0.3:
        return True
    return width >= 1 and height >= 1



def _cluster_values(values: list[float], tol: float = 3.0) -> list[float]:
    if not values:
        return []
    ordered = sorted(values)
    clusters: list[list[float]] = [[ordered[0]]]
    for v in ordered[1:]:
        if abs(v - clusters[-1][-1]) <= tol:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [sum(c) / len(c) for c in clusters]

def _detect_tables_from_lines(lines: list[dict]) -> list[dict]:
    """Group text lines into a table by aligned column x-positions.

    Used when a PDF has no explicit table border boxes but aligns cell text in
    a grid (common for HWP→PDF vector output). Every line whose text sits on a
    shared column grid is treated as a table row, including single-column rows
    (e.g. a merged '총매출 1,200만원 목표 달성' cell). Returns [] when no grid.
    """
    if len(lines) < 4:
        return []
    # Cluster lines into rows by baseline (y), tolerance 3pt.
    rows_by_y: dict[float, list[dict]] = {}
    for line in lines:
        y = round(float(line.get("baseline", line.get("y", 0))), 1)
        rows_by_y.setdefault(y, []).append(line)
    grid_rows = sorted(rows_by_y.items(), key=lambda kv: kv[0])
    if len(grid_rows) < 2:
        return []
    # Collect all distinct column x-starts across every row.
    all_xs = sorted({round(float(l.get("x", 0)), 1) for _, ls in grid_rows for l in ls})
    col_edges = _cluster_values(all_xs, tol=14.0)
    if len(col_edges) < 2:
        col_edges = [min(all_xs), max(all_xs)]
    columns = [col_edges[k + 1] - col_edges[k] for k in range(len(col_edges) - 1)]

    def col_index(x: float) -> int:
        for k in range(len(col_edges) - 1):
            if col_edges[k] - 2 <= x < col_edges[k + 1] - 0.5:
                return k
        return max(0, len(columns) - 1)

    table_y = min(y for y, _ in grid_rows)
    table_b = max(float(l.get("baseline", l.get("y", 0)) + l.get("height", 12)) for _, ls in grid_rows for l in ls)
    table_x = min(all_xs)
    table_r = max(float(l.get("x", 0) + l.get("width", 0)) for _, ls in grid_rows for l in ls)
    row_heights = []
    for _, ls in grid_rows:
        tops = [float(l.get("baseline", l.get("y", 0))) for l in ls]
        bots = [float(l.get("baseline", l.get("y", 0)) + l.get("height", 12)) for l in ls]
        row_heights.append(max(bots, default=12) - min(tops, default=0))
    cells_map: dict[tuple[int, int], dict] = {}
    for r, (y, ls) in enumerate(grid_rows):
        for line in ls:
            c = col_index(float(line.get("x", 0)) + 0.1)
            key = (r, c)
            text = line.get("text", "")
            cx = col_edges[c]
            cw = columns[c] if c < len(columns) else (table_r - cx)
            cy = y
            ch = row_heights[r] if r < len(row_heights) else 12.0
            if key not in cells_map:
                cells_map[key] = {
                    "row": r, "col": c, "row_span": 1, "col_span": 1,
                    "x": cx, "y": cy, "width": cw, "height": ch,
                    "text": text,
                    "font_family": line.get("font_family"),
                    "font_size": line.get("font_size"),
                    "bold": bool(line.get("bold")),
                    "color": line.get("color"),
                    "style": {"stroke": "#000000", "fill": None},
                }
            else:
                cells_map[key]["text"] = (cells_map[key]["text"] + " " + text).strip()
    # Fill empty grid cells so the HWP table grid is complete.
    for r in range(len(grid_rows)):
        for c in range(len(columns)):
            if (r, c) not in cells_map:
                cells_map[(r, c)] = {
                    "row": r, "col": c, "row_span": 1, "col_span": 1,
                    "x": col_edges[c],
                    "y": grid_rows[r][0],
                    "width": columns[c] if c < len(columns) else (table_r - col_edges[c]),
                    "height": row_heights[r] if r < len(row_heights) else 12.0,
                    "text": "", "style": {"stroke": "#000000", "fill": None},
                }
    return [{
        "x": table_x, "y": table_y,
        "width": table_r - table_x, "height": table_b - table_y,
        "columns": columns, "row_heights": row_heights,
        "cells": [cells_map[k] for k in sorted(cells_map.keys())],
    }]

def _similar_columns(a: list[float], b: list[float], tol: float = 14.0) -> bool:
    """True when two column-x lists align within tolerance.

    Relaxed: allows different column counts (e.g. 3-col header vs 2-col body)
    as long as the shared leading columns align. This lets asymmetric tables
    (header wider than body) still be detected as one table.
    """
    if not a or not b:
        return False
    n = min(len(a), len(b))
    if n == 0:
        return False
    # Require first column to align (table left edge) and most others to align.
    aligned = sum(1 for x, y in zip(a[:n], b[:n]) if abs(x - y) <= tol)
    return aligned >= max(1, n - 1)


def _detect_vector_grid_tables(boxes: list[dict], lines: list[dict]) -> list[dict]:
    """Build a table from explicit PDF border lines before text heuristics."""
    horizontal = [
        b for b in boxes
        if float(b.get("width", 0)) >= 100 and float(b.get("height", 0)) <= 3
        and b.get("stroke")
    ]
    vertical = [
        b for b in boxes
        if float(b.get("height", 0)) >= 20 and float(b.get("width", 0)) <= 3
        and b.get("stroke")
    ]
    if len(horizontal) < 3 or len(vertical) < 3:
        return []
    x_edges = _cluster_values(
        [float(b["x"]) for b in vertical] + [float(b["x"]) + float(b["width"]) for b in vertical],
        tol=3.0,
    )
    y_edges = _cluster_values(
        [float(b["y"]) for b in horizontal] + [float(b["y"]) + float(b["height"]) for b in horizontal],
        tol=3.0,
    )
    if len(x_edges) < 2 or len(y_edges) < 2:
        return []
    table_x, table_r = min(x_edges), max(x_edges)
    table_y, table_b = min(y_edges), max(y_edges)
    columns = [x_edges[i + 1] - x_edges[i] for i in range(len(x_edges) - 1)]
    row_heights = [y_edges[i + 1] - y_edges[i] for i in range(len(y_edges) - 1)]
    if any(width < 10 for width in columns) or any(height < 5 for height in row_heights):
        return []
    fills = [
        b for b in boxes
        if b.get("fill")
        and float(b.get("x", 0)) >= table_x - 2
        and float(b.get("y", 0)) >= table_y - 2
        and float(b.get("x", 0)) + float(b.get("width", 0)) <= table_r + 2
        and float(b.get("y", 0)) + float(b.get("height", 0)) <= table_b + 2
    ]
    cells = []
    for box in fills:
        x0 = float(box["x"])
        y0 = float(box["y"])
        x1 = x0 + float(box["width"])
        y1 = y0 + float(box["height"])
        col = min(range(len(x_edges) - 1), key=lambda index: abs(x_edges[index] - x0))
        row = min(range(len(y_edges) - 1), key=lambda index: abs(y_edges[index] - y0))
        col_end = min(range(1, len(x_edges)), key=lambda index: abs(x_edges[index] - x1))
        row_end = min(range(1, len(y_edges)), key=lambda index: abs(y_edges[index] - y1))
        inside = [
            line for line in lines
            if x0 - 1 <= float(line.get("x", 0)) + float(line.get("width", 0)) / 2 <= x1 + 1
            and y0 - 1 <= float(line.get("baseline", line.get("y", 0))) <= y1 + 1
        ]
        text = "\n".join(str(line.get("text", "")).strip() for line in sorted(inside, key=lambda item: (float(item.get("baseline", item.get("y", 0))), float(item.get("x", 0)))) if str(line.get("text", "")).strip())
        sample = inside[0] if inside else {}
        cells.append({
            "row": row, "col": col,
            "row_span": max(1, row_end - row), "col_span": max(1, col_end - col),
            "x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0,
            "text": text,
            "font_family": sample.get("font_family"),
            "font_size": sample.get("font_size"),
            "bold": bool(sample.get("bold")),
            "color": sample.get("color"),
            "style": {"stroke": "#000000", "fill": box.get("fill")},
        })
    if not cells:
        for row, (y0, y1) in enumerate(zip(y_edges, y_edges[1:])):
            for col, (x0, x1) in enumerate(zip(x_edges, x_edges[1:])):
                cells.append({
                    "row": row, "col": col, "row_span": 1, "col_span": 1,
                    "x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0,
                    "text": "", "style": {"stroke": "#000000", "fill": None},
                })
    if fills:
        active_row_count = max((cell["row"] + cell["row_span"] for cell in cells), default=0)
        if 0 < active_row_count < len(row_heights):
            row_heights = row_heights[:active_row_count]
            table_b = y_edges[active_row_count]
    return [{
        "x": table_x, "y": table_y, "width": table_r - table_x, "height": table_b - table_y,
        "columns": columns, "row_heights": row_heights, "cells": cells,
    }]


def detect_tables(boxes: list[dict], lines: list[dict]) -> list[dict]:
    """Detect stacked equal-width row rectangles as a lattice table.

    Falls back to line-alignment detection when the PDF has no explicit table
    border boxes (e.g. HWP→PDF vector output where cells are text only).
    """
    # --- Explicit vector borders are authoritative; use them before text heuristics. ---
    vector_tables = _detect_vector_grid_tables(boxes, lines)
    if vector_tables:
        return vector_tables
    # --- Line-alignment fallback: group lines sharing the same baseline (row)
    #     with 2+ distinct x-start columns into a table. ---
    line_tables = _detect_tables_from_lines(lines)
    if line_tables and any(len(table.get("columns", [])) >= 2 for table in line_tables):
        return line_tables

    if len(boxes) < 2:
        return []

    # Candidate row boxes: stroke-only or lightly filled, not tiny.
    rows = [
        b for b in boxes
        if b["width"] >= 40 and b["height"] >= 12 and b["height"] <= 80
    ]
    if len(rows) < 2:
        return []
    rows = sorted(rows, key=lambda b: (b["y"], b["x"]))
    used = set()
    tables: list[dict] = []

    for i, seed in enumerate(rows):
        if i in used:
            continue
        group = [seed]
        used.add(i)
        for j in range(i + 1, len(rows)):
            if j in used:
                continue
            cand = rows[j]
            prev = group[-1]
            same_x = abs(cand["x"] - seed["x"]) <= 2.0
            same_w = abs(cand["width"] - seed["width"]) <= 4.0
            gap = cand["y"] - (prev["y"] + prev["height"])
            # adjacent or slightly overlapping stacked rows
            if same_x and same_w and -1.0 <= gap <= 8.0:
                group.append(cand)
                used.add(j)
            elif cand["y"] > prev["y"] + prev["height"] + 8.0:
                break
        if len(group) < 2:
            # release seed so it can join another group later (already only seed)
            used.discard(i)
            continue

        table_x = min(b["x"] for b in group)
        table_y = min(b["y"] for b in group)
        table_r = max(b["x"] + b["width"] for b in group)
        table_b = max(b["y"] + b["height"] for b in group)
        table_w = table_r - table_x
        table_h = table_b - table_y
        row_heights = [b["height"] for b in group]

        # Collect text lines whose centers fall inside the table band.
        inside = []
        for line in lines:
            cx = line["x"] + line["width"] / 2.0
            cy = line.get("baseline", line["y"] + line["height"] * 0.8)
            if table_x - 1 <= cx <= table_r + 1 and table_y - 1 <= cy <= table_b + 1:
                inside.append(line)
        if not inside:
            continue

        # Infer columns from distinct text left edges (padding ignored).
        # Cluster text starts; first column begins at table left, not at text indent.
        text_xs = _cluster_values([line["x"] for line in inside], tol=12.0)
        if not text_xs:
            col_edges = [table_x, table_r]
        elif len(text_xs) == 1:
            # Single text column — still emit full-width one-col table.
            col_edges = [table_x, table_r]
        else:
            # Column k starts at text cluster k (except col0 at table left).
            col_edges = [table_x] + text_xs[1:] + [table_r]
            col_edges = _cluster_values(col_edges, tol=2.0)
            if col_edges[-1] < table_r - 1:
                col_edges.append(table_r)
        columns = [col_edges[k + 1] - col_edges[k] for k in range(len(col_edges) - 1)]
        # Drop tiny leading/trailing slivers caused by padding noise.
        while len(columns) > 1 and columns[0] < 18:
            columns[1] += columns[0]
            columns = columns[1:]
            col_edges = [col_edges[0]] + col_edges[2:]
        while len(columns) > 1 and columns[-1] < 18:
            columns[-2] += columns[-1]
            columns = columns[:-1]
            col_edges = col_edges[:-2] + [col_edges[-1]]
        if not columns:
            columns = [table_w]
            col_edges = [table_x, table_r]

        def col_index(x: float) -> int:
            for k in range(len(col_edges) - 1):
                if col_edges[k] - 1 <= x < col_edges[k + 1] - 0.5:
                    return k
            return max(0, len(columns) - 1)

        def row_index(y: float) -> int:
            acc = table_y
            for r, h in enumerate(row_heights):
                if y < acc + h + 0.5:
                    return r
                acc += h
            return len(row_heights) - 1

        cells_map: dict[tuple[int, int], dict] = {}
        for line in inside:
            r = row_index(float(line.get("baseline", line["y"] + line["height"] * 0.8)))
            c = col_index(line["x"] + 0.1)
            key = (r, c)
            if key not in cells_map:
                cells_map[key] = {
                    "row": r,
                    "col": c,
                    "row_span": 1,
                    "col_span": 1,
                    "text": line["text"],
                    "font_family": line.get("font_family"),
                    "font_size": line.get("font_size"),
                    "bold": bool(line.get("bold")),
                    "color": line.get("color"),
                    "style": {
                        "stroke": group[min(r, len(group) - 1)].get("stroke") or "#000000",
                        "fill": group[min(r, len(group) - 1)].get("fill"),
                    },
                }
            else:
                cells_map[key]["text"] = (cells_map[key]["text"] + " " + line["text"]).strip()

        # Ensure empty cells exist for full grid so borders render.
        for r in range(len(row_heights)):
            for c in range(len(columns)):
                key = (r, c)
                if key not in cells_map:
                    cells_map[key] = {
                        "row": r,
                        "col": c,
                        "row_span": 1,
                        "col_span": 1,
                        "text": "",
                        "style": {
                            "stroke": group[min(r, len(group) - 1)].get("stroke") or "#000000",
                            "fill": group[min(r, len(group) - 1)].get("fill"),
                        },
                    }

        tables.append(
            {
                "x": table_x,
                "y": table_y,
                "width": table_w,
                "height": table_h,
                "columns": columns,
                "row_heights": row_heights,
                "cells": [cells_map[k] for k in sorted(cells_map.keys())],
            }
        )

    return tables


def filter_items_outside_tables(items: list[dict], tables: list[dict], y_key: str = "baseline") -> list[dict]:
    if not tables:
        return items
    out = []
    for item in items:
        cx = float(item["x"]) + float(item.get("width", 0)) / 2.0
        if y_key == "y" and item.get("height") is not None:
            cy = float(item["y"]) + float(item["height"]) / 2.0
        else:
            cy = float(item.get(y_key) or item.get("y") or 0)
        inside = False
        for table in tables:
            if (
                table["x"] - 1 <= cx <= table["x"] + table["width"] + 1
                and table["y"] - 1 <= cy <= table["y"] + table["height"] + 1
            ):
                inside = True
                break
        if not inside:
            out.append(item)
    return out



def _is_axis_aligned_line(p1, p2, tol: float = 0.75) -> tuple[str, float, float, float, float] | None:
    """Return (orientation, x, y, w, h) for a thin stroke box, or None."""
    x0, y0 = float(p1.x), float(p1.y)
    x1, y1 = float(p2.x), float(p2.y)
    if abs(y0 - y1) <= tol and abs(x1 - x0) >= 0.5:
        x = min(x0, x1)
        y = min(y0, y1)
        return ("h", x, y, abs(x1 - x0), max(abs(y1 - y0), 0.4))
    if abs(x0 - x1) <= tol and abs(y1 - y0) >= 0.5:
        x = min(x0, x1)
        y = min(y0, y1)
        return ("v", x, y, max(abs(x1 - x0), 0.4), abs(y1 - y0))
    return None


def expand_drawing_to_boxes(drawing: dict) -> list[dict]:
    """Expand a PyMuPDF drawing into rect/line boxes.

    - pure/item `re` → fill/stroke rectangle
    - axis-aligned `l` segments → thin stroke boxes
    - curves / diagonals → empty list (caller may rasterize)
    """
    items = drawing.get("items") or []
    fill = color_to_hex(drawing.get("fill"))
    stroke = color_to_hex(drawing.get("color"))
    if not fill and not stroke:
        stroke = "#000000"
    stroke_width = drawing.get("width")
    try:
        stroke_width_pt = float(stroke_width) if stroke_width is not None else None
    except (TypeError, ValueError):
        stroke_width_pt = None

    boxes: list[dict] = []
    has_curve = False
    has_diagonal = False
    for it in items:
        if not it:
            continue
        op = it[0]
        if op == "re":
            rect = it[1]
            try:
                x0, y0, x1, y1 = float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1)
            except Exception:
                continue
            w, h = x1 - x0, y1 - y0
            if keep_box(w, h):
                boxes.append(
                    {
                        "x": x0,
                        "y": y0,
                        "width": w,
                        "height": h,
                        "stroke": stroke,
                        "fill": fill,
                        "stroke_width": stroke_width_pt,
                    }
                )
        elif op == "l" and len(it) >= 3:
            aligned = _is_axis_aligned_line(it[1], it[2])
            if aligned is None:
                has_diagonal = True
                continue
            _ori, x, y, w, h = aligned
            # Ensure stroke-visible thickness for HWP border rendering.
            thickness = max(stroke_width_pt or 0.5, 0.4)
            if _ori == "h":
                h = max(h, thickness)
                y = y - thickness / 2.0
            else:
                w = max(w, thickness)
                x = x - thickness / 2.0
            if keep_box(w, h):
                boxes.append(
                    {
                        "x": x,
                        "y": y,
                        "width": w,
                        "height": h,
                        "stroke": stroke or "#000000",
                        "fill": None,
                        "stroke_width": stroke_width_pt or thickness,
                    }
                )
        elif op in ("c", "qu", "v", "y"):
            has_curve = True
        # ignore move/close ops

    # If the drawing had only a bounding rect and no item detail, fall back.
    if not boxes and not has_curve and not has_diagonal:
        rect = drawing.get("rect")
        if rect is not None:
            try:
                w = float(rect.x1 - rect.x0)
                h = float(rect.y1 - rect.y0)
            except Exception:
                return []
            if keep_box(w, h):
                boxes.append(
                    {
                        "x": float(rect.x0),
                        "y": float(rect.y0),
                        "width": w,
                        "height": h,
                        "stroke": stroke,
                        "fill": fill,
                        "stroke_width": stroke_width_pt,
                    }
                )
    # Signal complex path by returning empty when curves/diagonals dominate.
    if not boxes and (has_curve or has_diagonal):
        return []
    return boxes


def rasterize_drawing(page, drawing: dict, media_dir: Path | None, page_index: int, draw_index: int) -> dict | None:
    """Rasterize a non-rect drawing into a PNG image element for visual fidelity."""
    if media_dir is None:
        return None
    rect = drawing.get("rect")
    if rect is None:
        return None
    try:
        clip = fitz.Rect(rect)
    except Exception:
        return None
    if clip.width < 0.5 or clip.height < 0.5:
        return None
    # Pad slightly so strokes at the edge are not clipped.
    pad = max(1.0, float(drawing.get("width") or 1.0))
    clip = fitz.Rect(clip.x0 - pad, clip.y0 - pad, clip.x1 + pad, clip.y1 + pad) & page.rect
    if clip.is_empty or clip.width < 0.5 or clip.height < 0.5:
        return None
    try:
        # Transparent-ish white background; keep high enough DPI for strokes.
        mat = fitz.Matrix(2, 2)  # 144 dpi equivalent
        pix = page.get_pixmap(matrix=mat, clip=clip, alpha=False)
        image_id = f"page{page_index}-path{draw_index}.png"
        media_dir.mkdir(parents=True, exist_ok=True)
        (media_dir / image_id).write_bytes(pix.tobytes("png"))
    except Exception:
        return None
    return {
        "id": image_id,
        "x": float(clip.x0),
        "y": float(clip.y0),
        "width": float(clip.width),
        "height": float(clip.height),
        "natural_w": int(pix.width),
        "natural_h": int(pix.height),
        "kind": "vector-path",
    }


def extract_page(page, page_index: int, media_dir: Path | None) -> dict:
    width = float(page.rect.width)
    height = float(page.rect.height)

    lines = []
    # rawdict gives per-glyph bboxes; dict gives origin/ascender for baseline.
    raw = page.get_text("rawdict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
    text = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)

    # Build origin/ascender lookup by approximate line identity (y rounded + text).
    origin_by_key: dict[tuple, dict] = {}
    for block in text.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            content = "".join(span.get("text", "") for span in spans)
            if not content.strip() or not spans:
                continue
            dominant = max(spans, key=lambda s: len(s.get("text", "")), default={})
            key = (round(float(line.get("bbox", [0, 0, 0, 0])[1]), 1), content.strip())
            origin = dominant.get("origin") or (0.0, float(line.get("bbox", [0, 0, 0, 0])[1]))
            origin_by_key[key] = {
                "origin_x": float(origin[0]),
                "origin_y": float(origin[1]),
                "ascender": float(dominant.get("ascender") or 0.8),
                "descender": float(dominant.get("descender") or -0.2),
                "size": float(dominant.get("size") or 0.0),
                "font": dominant.get("font") or "Helvetica",
                "flags": int(dominant.get("flags") or 0),
                "color": dominant.get("color"),
            }

    for block in text.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            content = "".join(span.get("text", "") for span in spans)
            if not content.strip():
                continue
            bbox = line.get("bbox") or spans[0].get("bbox")
            if not bbox:
                continue
            dominant = max(spans, key=lambda s: len(s.get("text", "")), default={})
            key = (round(float(bbox[1]), 1), content.strip())
            meta = origin_by_key.get(key, {})
            font_size = float(dominant.get("size") or meta.get("size") or max(1.0, bbox[3] - bbox[1]))
            origin_y = float(meta.get("origin_y") or (bbox[1] + font_size * 0.8))
            # Prefer PDF text origin baseline; top is derived from ascender metrics.
            ascender = float(meta.get("ascender") or 0.8)
            top = float(bbox[1])
            if meta.get("origin_y") is not None and ascender:
                top = origin_y - font_size * ascender
            lines.append(
                {
                    "text": content.strip(),
                    "x": float(bbox[0]),
                    "y": top,
                    "width": float(bbox[2] - bbox[0]),
                    "height": float(max(font_size * (ascender - float(meta.get("descender") or -0.2)), bbox[3] - bbox[1], font_size)),
                    "baseline": origin_y,
                    "font_family": normalize_font(dominant.get("font") or meta.get("font") or "Helvetica"),
                    "font_size": font_size,
                    "bold": bool(dominant.get("flags", 0) & 16)
                    or "bold" in str(dominant.get("font", "")).lower(),
                    "color": color_to_hex(dominant.get("color")) or "#000000",
                }
            )

    # Optional glyph stream for exact advance control (unit=pdfglyph consumers).
    glyphs = []
    for block in raw.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                font = normalize_font(span.get("font") or "Helvetica")
                size = float(span.get("size") or 1.0)
                bold = bool(span.get("flags", 0) & 16) or "bold" in str(span.get("font", "")).lower()
                color = color_to_hex(span.get("color")) or "#000000"
                origin = span.get("origin") or (0.0, 0.0)
                asc = float(span.get("ascender") or 0.8)
                for ch in span.get("chars", []):
                    c = ch.get("c") or ""
                    if c == "\n" or c == "":
                        continue
                    bb = ch.get("bbox")
                    if not bb:
                        continue
                    # Spaces keep width for advance fidelity even when invisible.
                    glyphs.append(
                        {
                            "text": c,
                            "x": float(bb[0]),
                            "y": float(origin[1]) - size * asc if origin else float(bb[1]),
                            "width": float(max(0.4, bb[2] - bb[0])),
                            "height": float(max(size * 1.2, bb[3] - bb[1])),
                            "baseline": float(origin[1]) if origin else float(bb[3] - size * 0.2),
                            "font_family": font,
                            "font_size": size,
                            "bold": bold,
                            "color": color,
                        }
                    )

    boxes = []
    path_images = []
    for di, drawing in enumerate(page.get_drawings(), start=1):
        expanded = expand_drawing_to_boxes(drawing)
        if expanded:
            boxes.extend(expanded)
            continue
        # Curves / diagonal paths: keep visual via clipped raster.
        raster = rasterize_drawing(page, drawing, media_dir, page_index, di)
        if raster is not None:
            path_images.append(raster)

    images = []
    for img_index, info in enumerate(page.get_image_info(xrefs=True), start=1):
        xref = info.get("xref")
        if xref is None:
            continue
        ir = fitz.Rect(info["bbox"])
        img_w = float(ir.x1 - ir.x0)
        img_h = float(ir.y1 - ir.y0)
        if img_w < 1 or img_h < 1:
            continue
        image_id = f"page{page_index}-img{img_index}"
        try:
            img_data = page.parent.extract_image(xref)
            if not img_data or not img_data.get("image"):
                continue
            ext = img_data.get("ext") or "png"
            image_id = f"{image_id}.{ext}"
            if media_dir is not None:
                media_dir.mkdir(parents=True, exist_ok=True)
                target = media_dir / image_id
                target.write_bytes(img_data["image"])
        except Exception:
            continue
        images.append(
            {
                "id": image_id,
                "x": float(ir.x0),
                "y": float(ir.y0),
                "width": img_w,
                "height": img_h,
                "natural_w": int(img_data.get("width") or max(1, round(img_w))),
                "natural_h": int(img_data.get("height") or max(1, round(img_h))),
            }
        )

    if path_images:
        images.extend(path_images)

    tables = detect_tables(boxes, lines)
    # Keep free-layout lines/glyphs/boxes even when tables are detected.
    # Glyph-level visual fidelity depends on absolute positions; native HWP
    # tables introduce cell padding that shifts text relative to the PDF.
    # Consumers may choose tables (structure) or free layout (visual).

    return {
        "width": width,
        "height": height,
        "lines": lines,
        "glyphs": glyphs,
        "boxes": boxes,
        "tables": tables,
        "images": images,
    }


def extract_pdf(pdf_path: str, media_dir: str | None = None) -> dict:
    doc = fitz.open(pdf_path)
    media = Path(media_dir) if media_dir else None
    pages = [extract_page(doc[i], i + 1, media) for i in range(len(doc))]
    doc.close()
    return {"unit": "pdfpt", "pages": pages, "glyph_unit": "pdfglyph"}


def main():
    parser = argparse.ArgumentParser(description="PDF absolute layout extractor for HWP ingest")
    parser.add_argument("input")
    parser.add_argument("--media-dir", default=None)
    parser.add_argument("-o", "--output", default="-")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"입력 PDF를 찾을 수 없습니다: {args.input}", file=sys.stderr)
        sys.exit(3)

    payload = extract_pdf(args.input, args.media_dir)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output == "-" or not args.output:
        sys.stdout.write(text)
        if not text.endswith("\n"):
            sys.stdout.write("\n")
    else:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text, encoding="utf-8")
        print(str(out_path))


if __name__ == "__main__":
    main()
