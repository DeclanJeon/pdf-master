import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const python = fs.existsSync('.venv-pdf2docx/bin/python') ? '.venv-pdf2docx/bin/python' : 'python3';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-layout-extract-'));
const pdfPath = path.join(tmp, 'fixture.pdf');
const mediaDir = path.join(tmp, 'media');
const jsonPath = path.join(tmp, 'layout.json');

// Minimal PDF fixture via PyMuPDF
execFileSync(python, ['-c', `
import fitz
doc = fitz.open()
page = doc.new_page(width=595, height=842)
page.insert_text((50, 80), "FIDELITY_SMOKE_MARKER", fontsize=14, fontname="helv", color=(0.8, 0, 0))
page.draw_rect(fitz.Rect(40, 100, 300, 160), color=(0, 0, 0), width=1)
page.draw_rect(fitz.Rect(40, 100, 300, 130), color=(0, 0, 0), fill=(0.2, 0.45, 0.7), width=0.5)
# Two stacked equal-width row rects → lattice table
page.draw_rect(fitz.Rect(40, 200, 300, 240), color=(0, 0, 0), width=0.8)
page.draw_rect(fitz.Rect(40, 240, 300, 280), color=(0, 0, 0), width=0.8)
page.insert_text((50, 225), "CellA", fontsize=11, fontname="helv", color=(0, 0, 0))
page.insert_text((180, 225), "CellB", fontsize=11, fontname="helv", color=(0, 0.4, 0))
page.insert_text((50, 265), "CellC", fontsize=11, fontname="helv", color=(0, 0, 0))
page.insert_text((180, 265), "CellD", fontsize=11, fontname="helv", color=(0, 0.4, 0))
# Axis-aligned stroke line → thin box
page.draw_line(fitz.Point(40, 320), fitz.Point(260, 320), color=(1, 0, 0), width=2)
# Diagonal path → rasterized vector-path image
page.draw_line(fitz.Point(40, 360), fitz.Point(200, 420), color=(0, 0, 1), width=1.5)
doc.save(${JSON.stringify(pdfPath)})
doc.close()
`]);

execFileSync(python, [
  'scripts/pdf_layout_extract.py',
  pdfPath,
  '--media-dir', mediaDir,
  '-o', jsonPath,
], { stdio: 'inherit' });

const layout = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
assert.equal(layout.unit, 'pdfpt');
assert.equal(layout.glyph_unit, 'pdfglyph');
assert.ok(Array.isArray(layout.pages) && layout.pages.length === 1, 'one page expected');
const page = layout.pages[0];
assert.ok(page.lines.some((line) => line.text.includes('FIDELITY_SMOKE_MARKER')), 'text line preserved');
const marker = page.lines.find((line) => line.text.includes('FIDELITY_SMOKE_MARKER'));
assert.equal(marker.color.toUpperCase(), '#CC0000');
assert.ok(Math.abs(marker.x - 50) < 2, `marker x near 50, got ${marker.x}`);
assert.ok(marker.baseline !== undefined, 'line baseline present');
assert.ok(page.boxes.length >= 2, 'stroke and fill boxes preserved');
assert.ok(page.boxes.some((box) => !box.fill && box.stroke), 'stroke-only box preserved');
assert.ok(page.boxes.some((box) => box.fill && box.fill.toUpperCase() === '#3373B2'), 'fill color preserved');
assert.ok(Array.isArray(page.glyphs) && page.glyphs.length > 5, 'per-glyph stream emitted');
assert.ok(page.glyphs.some((g) => g.text === 'F' && g.baseline !== undefined), 'glyph baseline present');
assert.ok(
  page.lines.some((line) => /Nimbus Sans|Liberation Sans/i.test(line.font_family || '')),
  'Helvetica maps to metric-compatible sans',
);
assert.ok(Array.isArray(page.tables) && page.tables.length >= 1, 'stacked row rects detected as table');
const table = page.tables[0];
assert.ok(table.columns.length >= 2, 'table has ≥2 columns');
assert.equal(table.row_heights.length, 2, 'table has 2 rows');
assert.ok(table.cells.some((c) => c.text.includes('CellA')), 'table cell text preserved');
assert.ok(table.cells.some((c) => c.text.includes('CellD')), 'table cell text preserved');
// Free layout retained for visual glyph path
assert.ok(page.lines.some((line) => line.text.includes('CellA')), 'free-layout lines kept alongside tables');


assert.ok(page.boxes.some((box) => box.width > 100 && box.height < 5), 'axis-aligned stroke expands to thin box');
assert.ok(
  (page.images || []).some((img) => String(img.id).includes('path') || img.kind === 'vector-path'),
  'diagonal/curve drawings rasterize to path images',
);

console.log('pdf-layout-extract smoke passed');
