import assert from 'node:assert/strict';
import fs from 'node:fs';

const tools = fs.readFileSync('src/lib/tools.ts', 'utf8');
const generic = fs.readFileSync('src/components/tools/GenericPdfTool.tsx', 'utf8');
const server = fs.readFileSync('server/index.ts', 'utf8');
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
const script = fs.readFileSync('scripts/pdf_to_docx.py', 'utf8');

assert.match(tools, /id:\s*'pdf-to-docx'/, 'tool list must expose PDF→DOCX');
assert.match(tools, /PDF → Word\(DOCX\)|PDF → DOCX/, 'tool name must make DOCX/Word output clear');
assert.match(tools, /편집 가능한/, 'PDF→DOCX description must emphasize editable output');

assert.match(generic, /'pdf-to-docx'/, 'GenericPdfTool must handle pdf-to-docx');
assert.match(generic, /\/api\/convert\/pdf-to-docx/, 'frontend must call the pdf-to-docx endpoint');
assert.match(generic, /\.docx/, 'PDF→DOCX flow should download a .docx file');
assert.match(generic, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/, 'frontend must preserve DOCX MIME type');
assert.doesNotMatch(generic, /pdf-to-docx[\s\S]{0,600}\.hwp/, 'PDF→DOCX flow must not reuse HWP output naming');

assert.match(server, /app\.post\('\/api\/convert\/pdf-to-docx'/, 'server must expose PDF→DOCX endpoint');
assert.match(server, /convertPdfToDocxWithPdf2docx/, 'server endpoint must use the pdf2docx engine');
assert.match(server, /PDF2DOCX_LAYOUT_MODE/, 'server must expose a configurable PDF→DOCX layout mode');
assert.match(server, /--layout-mode[\s\S]*PDF2DOCX_LAYOUT_MODE/, 'server must pass the layout mode into the converter script');
assert.match(server, /const PDF2DOCX_MODE_CANDIDATE = process\.env\.PDF2DOCX_LAYOUT_MODE \|\| process\.env\.PDF2DOCX_MODE \|\| 'faithful';/, 'PDF→DOCX must default to faithful layout preservation; absolute mode makes Korean forms spill and misalign');
assert.match(server, /isDocxFile/, 'server must verify generated DOCX containers');
assert.match(server, /word\/document\.xml/, 'DOCX validation must check word/document.xml exists');
assert.match(server, /\[Content_Types\]\.xml/, 'DOCX validation must check [Content_Types].xml exists');
assert.match(server, /format:\s*'docx'/, 'server response must report docx output');
assert.match(server, /resultFilename:[\s\S]*\.docx/, 'download filename must be .docx');
assert.doesNotMatch(server, /app\.post\('\/api\/convert\/pdf-to-docx'[\s\S]*--convert-to', 'odt:writer8'/, 'PDF→DOCX endpoint must not route through LibreOffice ODT');

assert.match(script, /from pdf2docx import Converter/, 'pdf_to_docx.py must use the open-source pdf2docx Converter API');
assert.match(script, /--layout-mode/, 'pdf_to_docx.py must accept an explicit layout mode');
assert.match(script, /absolute/, 'pdf_to_docx.py must support absolute-coordinate DOCX generation');
assert.match(script, /create_absolute_layout_docx/, 'absolute mode must use a dedicated coordinate-preserving generator');
assert.match(script, /_place_text_paragraph/, 'absolute mode must place text with explicit horizontal indent helper');
assert.match(script, /left_indent = Pt\(x_pt\)/, 'absolute mode must set paragraph left indent from PDF x');
assert.match(script, /margin_mm = 0\.0 if mode == "absolute"/, 'absolute mode must use zero page margins for 1:1 page coords');
assert.match(script, /w:tblInd/, 'absolute mode must indent tables to PDF bbox x');

assert.match(script, /wp:positionH relativeFrom="page"/, 'absolute/editable mode must anchor images relative to the original page');
assert.match(script, /wp:positionV relativeFrom="page"/, 'absolute/editable mode must preserve original vertical image placement');
assert.match(script, /behindDoc="\{behind\}"/, 'absolute/editable mode must control image layering so overlapping text remains selectable');
assert.match(script, /page_margin_factor_top[\s\S]*0\.0/, 'faithful mode must keep original page margins instead of inferred margin cropping');
assert.match(script, /page_margin_factor_bottom[\s\S]*0\.0/, 'faithful mode must also keep bottom page margins');
assert.match(script, /float_image_ignorable_gap[\s\S]*0\.0/, 'faithful mode must not drop near-overlapping image fragments');
assert.match(script, /clip_image_res_ratio[\s\S]*8\.0/, 'faithful mode must preserve embedded/raster image detail at high resolution');
assert.match(script, /extract_stream_table[\s\S]*True/, 'faithful mode should enable stream table extraction');
assert.match(script, /shape_min_dimension[\s\S]*0\.5/, 'faithful mode must keep thin vector shapes');
assert.match(script, /min_svg_w[\s\S]*0\.5/, 'faithful mode must keep thin SVG vector widths');
assert.match(script, /min_svg_h[\s\S]*0\.5/, 'faithful mode must keep thin SVG vector heights');
assert.match(script, /RGBColor/, 'absolute/editable mode must preserve text color');
assert.match(script, /_color_to_hex/, 'PDF text color must be normalized for DOCX runs');
assert.match(script, /vector-fill/, 'absolute/editable path must preserve filled vector shapes for color box fidelity');
assert.match(script, /_inject_vector_fill_shapes_into_docx/, 'faithful pdf2docx path must inject missing filled vector shapes into DOCX');
assert.match(script, /_add_anchored_vector_shape_to_para/, 'filled vectors must be emitted as native DrawingML shapes');
assert.match(script, /wordprocessingShape/, 'DrawingML vector shapes must use the WordprocessingShape graphicData URI');
assert.match(script, /wps:wsp/, 'DrawingML vector shapes must use wps:wsp elements');
assert.match(dockerfile, /pdf2docx==0\.5\.13|pdf2docx/, 'Docker image must install pdf2docx for PDF→DOCX conversion');

console.log('pdf-to-docx static contract passed');
