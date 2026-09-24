# PDF→HWP/HWPX Editable Fidelity Plan

## Decision
Implement PyMuPDF/layout-native extraction into editable HWPX/HWP structures as the primary path for `/home/declan/Downloads/converted.pdf`. Full-page image embedding is forbidden as the delivered primary result. Unsupported individual objects may use explicitly recorded fallbacks only.

## Drivers
- Preserve editable text and document semantics.
- Preserve page layout, fonts, sections, images, vectors, tables, and positions as far as measurable.
- Prove results through source metrics and live rhwp viewer screenshots.

## Alternatives
- Chosen native PyMuPDF/layout ingest: best editability and geometry control.
- LibreOffice/pdf2docx intermediate: retained only for explicitly recorded per-object fallback; weaker font/coordinate control.
- Full-page raster: rejected because it is not editable.

## Targets and execution
- `scripts/pdf_layout_extract.py`: extract pages, glyphs/lines, tables, images, vectors, coordinates and invariants.
- `scripts/pdf_to_docx.py`: native editable text/object generation and font/position handling.
- `scripts/convert_pipeline.py`: multi-page orchestration and error handling.
- `server/index.ts`: native route selection, subprocess lifecycle, temp files, error responses.
- `tools/rhwp-ingest-exporter-ponslink/src/main.rs`: HWPX mapping/export.
- `tests/`: focused extraction, exporter, fidelity, and live-surface evidence tests.

Collect `pdfinfo` and PyMuPDF source metrics first and persist `artifacts/fidelity/source-metrics.json`: page count, non-whitespace chars/page, text blocks/lines, images, drawings, tables, fonts, dimensions. Preserve page boundaries and monotonic page-local baseline order.

## Acceptance gates
- 100% source pages represented.
- Text-bearing pages retain >=98% source non-whitespace characters.
- Native editable text objects >0 on every text-bearing page; no page-sized raster primary output.
- Font substitutions <=3 families, each recorded.
- Matched-anchor bbox displacement: median <=1 mm and max <=3 mm.
- Images/vectors/tables native where supported; every individual fallback records type, bbox, reason, and editability impact.
- Baseline order violations, missing pages, zero native text, full-page rasterization, <98% text, or >3 mm max displacement reject the run.

## Live rhwp QA
At `https://edwardkim.github.io/rhwp/`, open the page, select generated `.hwpx`/`.hwp`, wait 8000 ms (one retry on timeout), and capture first/middle/last pages at 100% and 200% zoom. Store source/output screenshots under `artifacts/fidelity/{source,rhwp}/page-{n}-{zoom}.png` and a comparison manifest at `artifacts/fidelity/rhwp/comparison-manifest.json` with page mappings, anchors, displacement, and verdict. Verify text is selectable/editable; screenshots alone do not prove editability.

PASS requires all pages render, native text exists, thresholds hold, and fallbacks are explicit. PARTIAL permits declared font/object limitations within bounds. REJECT covers crash after retry, zero-byte output, missing pages, no native text, page rasterization, text below 98%, ordering violations, or >3 mm displacement.

## Failure handling and verification
Capture stderr/transcripts and preserve diagnostic manifests on non-zero exit/crash; clean temporary outputs; retry only classified transient failures once. Never return misleading success for failed/partial output. Run focused tests and the actual conversion, then the live browser transcript/screenshots and comparison manifest.

## ADR
Alternatives were rejected or constrained because they either defeat editability or lose geometry/font control. Consequences: native extraction requires per-object unsupported-feature records and may produce PARTIAL rather than overclaim fidelity. Follow-up is to implement the bounded targets and verify against the supplied PDF.

## Intent Reconciliation
The plan directly preserves the user's requirements: editable output, no image-only conversion, maximum fidelity for layout/fonts/sections/images/positions, and direct screenshot comparison in rhwp using the supplied PDF. No unresolved conflicts remain.
