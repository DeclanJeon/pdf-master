# PDF→HWP/HWPX Fidelity QA Plan (Final Revision)

## Summary
Executable QA plan for complete editable PDF-to-HWP/HWPX conversion. All numeric thresholds are relative to measured source PDF metrics from pdfinfo + PyMuPDF. Browser automation uses https://edwardkim.github.io/rhwp/ with explicit file selection, waits, screenshots, and comparison manifest. PyMuPDF/layout ingest remains primary; full-page image embedding is forbidden as the delivered primary output.

## Decision Drivers
- Native editable text and native objects are mandatory.
- Fidelity claims must be measurable against the supplied PDF.
- Live viewer QA must produce real screenshot evidence.

## Options
- Option A (chosen): PyMuPDF/layout-native extraction into editable HWPX/HWP objects, followed by source-metric and live-viewer validation. Highest editability and controllable geometry.
- Option B: LibreOffice/pdf2docx intermediate conversion plus HWPX wrapping. Viable fallback for unsupported structures but weaker coordinate and font control; may be used only as an explicitly recorded per-object fallback, never as a full-page image replacement.
- Full-page raster embedding is rejected because it defeats editing.

## Scope and targets
- `scripts/pdf_layout_extract.py`: page, glyph/line, table, image, vector extraction and coordinate invariants.
- `scripts/pdf_to_docx.py`: editable native text/object generation and font/position handling.
- `scripts/convert_pipeline.py`: multi-page orchestration and output/error handling.
- `server/index.ts`: native route selection, subprocess lifecycle, temp files, error responses.
- `tools/rhwp-ingest-exporter-ponslink/src/main.rs`: native HWPX ingest/export mapping.
- Relevant static, smoke, and fidelity tests under `tests/`.

## Required sequencing
1. Collect source metrics with `pdfinfo /home/declan/Downloads/converted.pdf` and PyMuPDF: page count, non-whitespace chars per page, text blocks/lines, images, drawings, tables, fonts, and page dimensions. Persist `artifacts/fidelity/source-metrics.json`.
2. Implement/adjust native extraction and export; preserve page boundaries and page-local baseline order.
3. Generate output and an object/fidelity manifest; reject zero-byte or page-image-only output.
4. Run focused tests, then run the live viewer QA below.

## Acceptance matrix
- Pages: 100% of measured source pages represented in output.
- Text: on every text-bearing page, output non-whitespace character count >= 98% of source; missing text is a failure, not silently rasterized.
- Ordering: extracted text lines/glyph baselines are monotonic in reading order within each page; violations are reject for that page.
- Editability: native editable text objects > 0 on every text-bearing page; primary output must contain no page-sized raster object standing in for the page.
- Fonts: family substitution <= 3 families overall; every substitution recorded with source and replacement. Missing source fonts may yield partial only with a manifest entry.
- Geometry: matched anchors median text/glyph bbox displacement <= 1 mm and max <= 3 mm. >1 mm median is partial; >3 mm max is reject.
- Images, vectors, tables: represented by native objects when supported; unsupported individual objects require explicit fallback records with type, bbox, reason, and editability impact. Full-page fallback is reject.

## Exact live browser QA
Use agbrowse/browser automation against `https://edwardkim.github.io/rhwp/`:
1. Open the URL and observe the file input/control.
2. Select the generated `.hwpx`/`.hwp` file from the conversion run.
3. Wait 8000 ms for rendering; retry once on a timeout.
4. Capture first, middle, and last output pages at 100% and 200% zoom as `artifacts/fidelity/rhwp/page-{n}-{zoom}.png`.
5. Render/capture matching source PDF pages at the same viewport/zoom as `artifacts/fidelity/source/page-{n}-{zoom}.png`.
6. Write `artifacts/fidelity/rhwp/comparison-manifest.json` mapping source/output pages, zoom, screenshot paths, matched anchors, displacement statistics, and verdict.
7. Verify text can be selected/edited in the viewer or via the viewer's structural/text evidence; a screenshot alone cannot prove editability.

## Viewer verdicts
- PASS: all pages render; native editable text exists; screenshot comparisons satisfy geometry thresholds; no primary page raster fallback; all object fallbacks are explicit.
- PARTIAL: editable text exists but median displacement >1 mm, 1–2 supported objects are missing, or unavoidable font substitution is recorded within the <=3-family limit. Must be reported, not hidden.
- REJECT: crash/timeout after retry, zero-byte output, missing pages, zero native text, full-page rasterization, text <98%, baseline-order violation, or max displacement >3 mm.

## Failure handling
- Exporter non-zero exit, crash, or 0-byte result: capture command/stderr and environment manifest, clean temp output, retry once only for classified transient failure, then reject.
- Fewer output pages: preserve partial artifact for diagnosis, record missing page ids, mark partial/reject according to acceptance matrix; never claim complete.
- Viewer load failure: retry once after fresh page reload; second failure is reject with transcript/screenshot.
- Font or object mismatch: record per-object fallback and metrics; partial if within declared bounds, reject if bounds exceeded.
- Any failure response must be user-visible through the API and must not return a misleading successful download.

## Verification commands/artifacts
- `pdfinfo /home/declan/Downloads/converted.pdf`
- PyMuPDF metric script targeting `/home/declan/Downloads/converted.pdf` and writing `artifacts/fidelity/source-metrics.json`.
- Focused extraction/export tests and end-to-end conversion for the supplied PDF.
- Browser automation transcript plus screenshots and comparison manifest; no bare inline claim substitutes for live evidence.

## Pre-mortem
1. Complex multi-page ordering drifts: detect with baseline invariant and per-page manifest; fix extractor ordering before export.
2. Fonts substitute and shift geometry: collect font manifest, bundle available fonts, classify unavoidable substitutions and rerun.
3. Viewer accepts a structurally valid but visually wrong HWPX: compare first/middle/last at both zooms and reject on displacement thresholds.

## Handoff
Plan is ready for implementation after consensus approval. No product source changes are part of this plan artifact.
