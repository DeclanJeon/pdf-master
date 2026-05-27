#!/usr/bin/env python3
"""Erase visible PDF text from a rendered page image while preserving nearby background color.

Input rectangles are JSON objects with pixel coordinates: x0, y0, x1, y1.
The script samples side bands around each text rectangle and fills the rectangle
with the median local background color. This removes duplicate source text before
editable HWP text is overlaid.
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw


def usage() -> None:
    print("Usage: erase_pdf_text_background.py <input.png> <rects.json> <output.png>", file=sys.stderr)


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(value, high))


def sample_region(image: Image.Image, box: tuple[int, int, int, int], max_stride: int = 3) -> list[tuple[int, int, int]]:
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return []
    pixels = image.load()
    width = max(1, x1 - x0)
    height = max(1, y1 - y0)
    stride = max(1, min(max_stride, int((width * height / 2500) ** 0.5) + 1))
    values: list[tuple[int, int, int]] = []
    for y in range(y0, y1, stride):
        for x in range(x0, x1, stride):
            r, g, b = pixels[x, y][:3]
            # Ignore very dark pixels; they are usually glyph strokes or borders,
            # not the local paper/fill color we want to reconstruct.
            if r + g + b < 90:
                continue
            values.append((r, g, b))
    return values


def median_color(samples: Sequence[tuple[int, int, int]]) -> tuple[int, int, int]:
    if not samples:
        return (255, 255, 255)
    return tuple(int(statistics.median(channel)) for channel in zip(*samples))  # type: ignore[return-value]


def local_background_color(image: Image.Image, rect: tuple[int, int, int, int]) -> tuple[int, int, int]:
    image_w, image_h = image.size
    x0, y0, x1, y1 = rect
    w = max(1, x1 - x0)
    h = max(1, y1 - y0)
    band = max(3, min(16, max(w, h) // 5))

    samples: list[tuple[int, int, int]] = []
    # Prefer left/right bands at the same vertical range. They usually share the
    # same cell fill/background even when top/bottom cross row boundaries.
    side_boxes = [
        (clamp(x0 - band, 0, image_w), y0, x0, y1),
        (x1, y0, clamp(x1 + band, 0, image_w), y1),
    ]
    for box in side_boxes:
        samples.extend(sample_region(image, box))

    if len(samples) < 12:
        vertical_boxes = [
            (x0, clamp(y0 - band, 0, image_h), x1, y0),
            (x0, y1, x1, clamp(y1 + band, 0, image_h)),
        ]
        for box in vertical_boxes:
            samples.extend(sample_region(image, box))

    return median_color(samples)


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        usage()
        return 2
    source = Path(argv[1])
    rects_path = Path(argv[2])
    output = Path(argv[3])

    image = Image.open(source).convert("RGB")
    image_w, image_h = image.size
    rects = json.loads(rects_path.read_text(encoding="utf-8"))
    draw = ImageDraw.Draw(image)

    for item in rects:
        x0 = clamp(int(round(float(item.get("x0", 0)))), 0, image_w)
        y0 = clamp(int(round(float(item.get("y0", 0)))), 0, image_h)
        x1 = clamp(int(round(float(item.get("x1", 0)))), 0, image_w)
        y1 = clamp(int(round(float(item.get("y1", 0)))), 0, image_h)
        if x1 <= x0 or y1 <= y0:
            continue
        fill = local_background_color(image, (x0, y0, x1, y1))
        draw.rectangle((x0, y0, x1, y1), fill=fill)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
