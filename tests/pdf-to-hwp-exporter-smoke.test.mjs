import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-to-hwp-exporter-'));
const ingestPath = path.join(tmp, 'ingest.json');
const outputPath = path.join(tmp, 'out.hwp');
const textDir = path.join(tmp, 'text');
const marker = 'PDF_TO_HWP_EXPORTER_SMOKE_20260526';
const korean = '한글 본문이 HWP 안에서 다시 읽혀야 합니다.';

fs.writeFileSync(ingestPath, JSON.stringify({
  version: '1',
  page_size: { width_mm: 210, height_mm: 297 },
  default_font: '함초롬바탕',
  questions: [{
    number: 1,
    stem: `PDF to HWP exporter smoke\n${marker}\n${korean}`,
    auto_number: false,
    stem_blocks: [{ type: 'text', text: `PDF to HWP exporter smoke\n${marker}\n${korean}` }],
    choices: [],
    media: [],
  }],
}, null, 2));

execFileSync('cargo', ['build', '--manifest-path', 'tools/rhwp-ingest-exporter/Cargo.toml', '--release'], { stdio: 'inherit' });
execFileSync('tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter', [ingestPath, '-o', outputPath, '--format', 'hwp'], { stdio: 'inherit' });

const bytes = fs.readFileSync(outputPath);
assert.deepEqual([...bytes.subarray(0, 8)], [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], 'exporter must create HWP5/OLE, not HWPX/ZIP');

const info = execFileSync('rhwp', ['info', outputPath], { encoding: 'utf8' });
assert.match(info, /버전:\s*5\.0\.6\.1/, 'HWP header version should be populated');
assert.match(info, /구역0 용지:\s*(?!0×0)/, 'section page size should be populated');
assert.match(info, /폰트\(한글\): \[0\]함초롬바탕/, 'default Korean font should be registered');
assert.match(info, /ParaShape:\s*1/, 'default paragraph shape should be registered');
assert.match(info, /CharShape:\s*1/, 'default character shape should be registered');

fs.mkdirSync(textDir);
execFileSync('rhwp', ['export-text', outputPath, '-o', textDir], { stdio: 'inherit' });
const exportedText = fs.readFileSync(path.join(textDir, 'out.txt'), 'utf8');
assert.match(exportedText, new RegExp(marker), 'round-tripped HWP text should include marker');
assert.match(exportedText, new RegExp(korean), 'round-tripped HWP text should include Korean text');

console.log('pdf-to-hwp exporter smoke passed');

const imageTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-to-hwp-exporter-image-'));
const pngName = 'page-1.png';
const pngPath = path.join(imageTmp, pngName);
const imageIngestPath = path.join(imageTmp, 'ingest.json');
const imageOutputPath = path.join(imageTmp, 'out.hwp');
const imageSvgDir = path.join(imageTmp, 'svg');

// 1×1 transparent PNG. The smoke only verifies that page raster images are
// embedded as HWP BinData/Picture controls; server e2e covers real PDF pages.
fs.writeFileSync(pngPath, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
));
fs.writeFileSync(imageIngestPath, JSON.stringify({
  version: '1',
  page_size: { width_mm: 210, height_mm: 297 },
  default_font: '함초롬바탕',
  questions: [{
    number: 1,
    stem: '',
    auto_number: false,
    stem_blocks: [{ type: 'image', ref: pngName, placement: 'between' }],
    choices: [],
    media: [{ id: pngName, natural_w: 1, natural_h: 1, target_w_mm: 20, placement: 'between' }],
  }],
}, null, 2));

execFileSync('tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter', [imageIngestPath, '--media-dir', imageTmp, '-o', imageOutputPath, '--format', 'hwp'], { stdio: 'inherit' });
const imageBytes = fs.readFileSync(imageOutputPath);
assert.deepEqual([...imageBytes.subarray(0, 8)], [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], 'image export must still be HWP5/OLE');
const imageInfo = execFileSync('rhwp', ['info', imageOutputPath], { encoding: 'utf8' });
assert.match(imageInfo, /BinData:/, 'image export should embed PNG BinData');
assert.match(imageInfo, /그림1/, 'image export should create a Picture control');
fs.mkdirSync(imageSvgDir);
execFileSync('rhwp', ['export-svg', imageOutputPath, '-o', imageSvgDir], { stdio: 'inherit' });
const svg = fs.readFileSync(path.join(imageSvgDir, 'out.svg'), 'utf8');
assert.match(svg, /<image\b/, 'image export should render as an SVG image');

console.log('pdf-to-hwp exporter image smoke passed');

const layoutTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-to-hwp-exporter-layout-'));
const layoutIngestPath = path.join(layoutTmp, 'ingest.json');
const layoutOutputPath = path.join(layoutTmp, 'out.hwp');
const layoutSvgDir = path.join(layoutTmp, 'svg');
const layoutTextDir = path.join(layoutTmp, 'text');
const layoutMarker = 'PDF_LAYOUT_EDITABLE_MARKER_20260526';
const layoutBackgroundName = 'page-1.png';
fs.copyFileSync(pngPath, path.join(layoutTmp, layoutBackgroundName));

fs.writeFileSync(layoutIngestPath, JSON.stringify({
  version: '1',
  page_size: { width_mm: 210, height_mm: 297 },
  default_font: '함초롬바탕',
  questions: [{
    number: 1,
    stem: layoutMarker,
    auto_number: false,
    stem_blocks: [{ type: 'text', text: layoutMarker }],
    choices: [],
    media: [],
  }],
  pdf_layout: {
    unit: 'pdfhtml',
    visual_mode: 'clean-background-visible-text',
    pages: [{
      width: 892,
      height: 1262,
      background: { id: layoutBackgroundName, natural_w: 1, natural_h: 1 },
      boxes: [{ x: 80, y: 95, width: 230, height: 70, stroke: '#000000' }],
      lines: [
        { text: layoutMarker, x: 85, y: 100, width: 210, height: 28, font_family: 'BAAAAA+NotoSansCJKkr', font_size: 21, bold: true, color: '#000000' },
        { text: '표 안의 편집 가능한 텍스트', x: 85, y: 135, width: 210, height: 24, font_family: 'BAAAAA+NotoSansCJKkr', font_size: 18, bold: false, color: '#000000' },
      ],
    }],
  },
}, null, 2));

execFileSync('tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter', [layoutIngestPath, '--media-dir', layoutTmp, '-o', layoutOutputPath, '--format', 'hwp'], { stdio: 'inherit' });
const layoutBytes = fs.readFileSync(layoutOutputPath);
assert.deepEqual([...layoutBytes.subarray(0, 8)], [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], 'layout export must create HWP5/OLE');
const layoutInfo = execFileSync('rhwp', ['info', layoutOutputPath], { encoding: 'utf8' });
assert.match(layoutInfo, /BinData:/, 'layout export should embed the cleaned PDF page as page-background BinData');
fs.mkdirSync(layoutTextDir);
execFileSync('rhwp', ['export-text', layoutOutputPath, '-o', layoutTextDir], { stdio: 'inherit' });
const layoutExportedText = fs.readFileSync(path.join(layoutTextDir, 'out.txt'), 'utf8');
assert.match(layoutExportedText, new RegExp(layoutMarker), 'layout text should remain extractable/editable in HWP');
fs.mkdirSync(layoutSvgDir);
execFileSync('rhwp', ['export-svg', layoutOutputPath, '-o', layoutSvgDir], { stdio: 'inherit' });
const layoutSvg = fs.readFileSync(path.join(layoutSvgDir, 'out.svg'), 'utf8');
assert.match(layoutSvg, /<image\b/, 'layout SVG should preserve original PDF page as a background image');
assert.match(layoutSvg, /font-weight="bold"/, 'layout SVG should preserve bold font styling');
assert.match(layoutSvg, />P<\/text>/, 'layout SVG should render editable body text glyphs above the page background');
assert.ok(
  layoutSvg.indexOf('<image') < layoutSvg.lastIndexOf('<text'),
  'layout page background should be painted before editable body text',
);
assert.match(layoutSvg, /<rect\b|<path\b/, 'layout SVG should render the page visual/vector geometry');

console.log('pdf-to-hwp exporter editable layout smoke passed');

const filledBoxTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-to-hwp-exporter-filled-box-'));
const filledBoxIngestPath = path.join(filledBoxTmp, 'ingest.json');
const filledBoxOutputPath = path.join(filledBoxTmp, 'out.hwp');
const filledBoxSvgDir = path.join(filledBoxTmp, 'svg');
const filledBoxTextDir = path.join(filledBoxTmp, 'text');
const filledBoxMarker = 'IMAGE AREA';

fs.writeFileSync(filledBoxIngestPath, JSON.stringify({
  version: '1',
  page_size: { width_mm: 210, height_mm: 297 },
  default_font: '함초롬바탕',
  questions: [{
    number: 1,
    stem: filledBoxMarker,
    auto_number: false,
    stem_blocks: [{ type: 'text', text: filledBoxMarker }],
    choices: [],
    media: [],
  }],
  pdf_layout: {
    unit: 'odt',
    visual_mode: 'editable-native',
    pages: [{
      width: 793.7376,
      height: 1122.5184,
      images: [],
      boxes: [{ x: 430, y: 128, width: 180, height: 90, stroke: '#2F75B5', fill: '#2F75B5' }],
      lines: [{ text: filledBoxMarker, x: 462, y: 162, width: 120, height: 22, font_family: 'Arial', font_size: 14, bold: true, color: '#FFFFFF' }],
    }],
  },
}, null, 2));

execFileSync('tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter', [filledBoxIngestPath, '-o', filledBoxOutputPath, '--format', 'hwp'], { stdio: 'inherit' });
fs.mkdirSync(filledBoxTextDir);
execFileSync('rhwp', ['export-text', filledBoxOutputPath, '-o', filledBoxTextDir], { stdio: 'inherit' });
const filledBoxText = fs.readFileSync(path.join(filledBoxTextDir, 'out.txt'), 'utf8');
assert.match(filledBoxText, /IMAGE AREA/, 'filled box text should remain extractable/editable');
fs.mkdirSync(filledBoxSvgDir);
execFileSync('rhwp', ['export-svg', filledBoxOutputPath, '-o', filledBoxSvgDir], { stdio: 'inherit' });
const filledBoxSvg = fs.readFileSync(path.join(filledBoxSvgDir, 'out.svg'), 'utf8');
assert.match(filledBoxSvg, /fill="#2F75B5"|fill="#2f75b5"/, 'filled native box should render with the source fill color');
assert.doesNotMatch(filledBoxSvg, /fill="#2F75B5"[^>]*opacity="0\.000"|fill="#2f75b5"[^>]*opacity="0\.000"/, 'filled native box must not render fully transparent');
assert.match(filledBoxSvg, />I<\/text>/, 'filled native box should render editable text glyphs above the fill');

console.log('pdf-to-hwp exporter filled box smoke passed');

const odtLayoutTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-to-hwp-exporter-odt-layout-'));
const odtLayoutIngestPath = path.join(odtLayoutTmp, 'ingest.json');
const odtLayoutOutputPath = path.join(odtLayoutTmp, 'out.hwp');
const odtLayoutTextDir = path.join(odtLayoutTmp, 'text');
const odtMarker = 'PDF_ODT_NATIVE_LAYOUT_ONE_PAGE_20260526';
for (let i = 1; i <= 6; i += 1) {
  fs.copyFileSync(pngPath, path.join(odtLayoutTmp, `odt-image-${i}.png`));
}

fs.writeFileSync(odtLayoutIngestPath, JSON.stringify({
  version: '1',
  page_size: { width_mm: 210, height_mm: 297 },
  default_font: '함초롬바탕',
  questions: [{
    number: 1,
    stem: odtMarker,
    auto_number: false,
    stem_blocks: [{ type: 'text', text: odtMarker }],
    choices: [],
    media: [],
  }],
  pdf_layout: {
    unit: 'odt',
    visual_mode: 'editable-native',
    pages: [{
      width: 793.7376,
      height: 1122.5184,
      boxes: [
        { x: 72, y: 128, width: 210, height: 36, stroke: '#000000' },
        { x: 282, y: 128, width: 210, height: 36, stroke: '#000000' },
        { x: 72, y: 164, width: 420, height: 36, stroke: '#000000' },
      ],
      images: [
        { id: 'odt-image-2.png', x: 0, y: 0, width: 72.26456692913385, height: 32.54173228346457 },
        { id: 'odt-image-3.png', x: 0, y: 0, width: 100.38425196850393, height: 100.38425196850393 },
        { id: 'odt-image-4.png', x: 0, y: 0, width: 100.38425196850393, height: 100.38425196850393 },
        { id: 'odt-image-5.png', x: 0, y: 0, width: 91.19999999999999, height: 45.46771653543307 },
        { id: 'odt-image-6.png', x: 0, y: 0, width: 636.5480314960629, height: 87.0803149606299 },
        { id: 'odt-image-1.png', x: 100.38425196850393, y: 278.1354330708661, width: 593.7259842519684, height: 621.3921259842518 },
      ],
      lines: [
        {"text": "출력일자 : 2026-05-22 17:53:38", "x": 72, "y": 80, "width": 649.7376, "height": 14, "font_family": "Gulim", "font_size": 9, "bold": false, "color": "#000000"},
        {"text": "발급번호 : 15011002026WKNT130270316", "x": 72, "y": 98, "width": 649.7376, "height": 14.850000000000001, "font_family": "Gulim", "font_size": 11, "bold": false, "color": "#000000"},
        {"text": "구직등록 확인증", "x": 72, "y": 116.85, "width": 649.7376, "height": 35.1, "font_family": "GungsuhChe", "font_size": 26, "bold": false, "color": "#000000"},
        {"text": "등 록   기 관 명", "x": 72, "y": 155.95, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "인천북부고용센터", "x": 72, "y": 180.2, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "구 직 등 록 번 호", "x": 72, "y": 204.45, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "K150112605130136", "x": 72, "y": 228.7, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "성            명", "x": 72, "y": 252.95, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "전형동", "x": 72, "y": 277.2, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "발 급   담 당 자\t온라인 발급", "x": 72, "y": 301.45, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "연     락     처\t032-540-5641", "x": 72, "y": 325.7, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "구직등록 유효기간\t2026년 05월 13일 ~ 2026년 11월 12일", "x": 72, "y": 349.95, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "「직업안정법 시행규칙」  제2조제5항에 따라 구직등록 확인증", "x": 72, "y": 374.2, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "을 발급합니다.", "x": 72, "y": 398.45, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "2026 년   05 월  22 일", "x": 72, "y": 422.7, "width": 649.7376, "height": 20.25, "font_family": "GungsuhChe", "font_size": 15, "bold": false, "color": "#000000"},
        {"text": "인천북부고용노동지청장", "x": 72, "y": 446.95, "width": 649.7376, "height": 27, "font_family": "GungsuhChe", "font_size": 20, "bold": false, "color": "#000000"},
        {"text": "본 출력물은 고용24(WWW.WORK24.GO.KR)를 통해 출력 되었습니다.", "x": 72, "y": 477.95, "width": 649.7376, "height": 14, "font_family": "BatangChe", "font_size": 8, "bold": false, "color": "#000000"}
      ],
    }],
  },
}, null, 2));

execFileSync('tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter', [odtLayoutIngestPath, '--media-dir', odtLayoutTmp, '-o', odtLayoutOutputPath, '--format', 'hwp'], { stdio: 'inherit' });
const odtLayoutInfo = execFileSync('rhwp', ['info', odtLayoutOutputPath], { encoding: 'utf8' });
assert.match(odtLayoutInfo, /페이지 수:\s*1\b/, 'single-page ODT native layout with absolute images should not overflow into page 2');
fs.mkdirSync(odtLayoutTextDir);
execFileSync('rhwp', ['export-text', odtLayoutOutputPath, '-o', odtLayoutTextDir], { stdio: 'inherit' });
const odtLayoutText = fs.readFileSync(path.join(odtLayoutTextDir, 'out.txt'), 'utf8');
assert.match(odtLayoutText, /전형동/, 'ODT native layout text should remain extractable/editable');

console.log('pdf-to-hwp exporter ODT native one-page layout smoke passed');

const tableLayoutTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-to-hwp-exporter-structured-table-'));
const tableLayoutIngestPath = path.join(tableLayoutTmp, 'ingest.json');
const tableLayoutOutputPath = path.join(tableLayoutTmp, 'out.hwp');
const tableLayoutTextDir = path.join(tableLayoutTmp, 'text');
const tableLayoutSvgDir = path.join(tableLayoutTmp, 'svg');
const tableMarkerA = 'TABLE_STRUCTURED_CELL_A_20260527';
const tableMarkerB = 'TABLE_STRUCTURED_CELL_B_20260527';

fs.writeFileSync(tableLayoutIngestPath, JSON.stringify({
  version: '1',
  page_size: { width_mm: 210, height_mm: 297 },
  default_font: '함초롬바탕',
  questions: [{
    number: 1,
    stem: `${tableMarkerA}\n${tableMarkerB}`,
    auto_number: false,
    stem_blocks: [{ type: 'text', text: `${tableMarkerA}\n${tableMarkerB}` }],
    choices: [],
    media: [],
  }],
  pdf_layout: {
    unit: 'odt',
    visual_mode: 'editable-native',
    pages: [{
      width: 793.7376,
      height: 1122.5184,
      boxes: [],
      images: [],
      lines: [
        { text: tableMarkerA, x: 72, y: 140, width: 180, height: 18, font_family: 'Gulim', font_size: 11, bold: false, color: '#000000' },
        { text: tableMarkerB, x: 260, y: 140, width: 180, height: 18, font_family: 'Gulim', font_size: 11, bold: false, color: '#000000' },
      ],
      tables: [{
        x: 72,
        y: 128,
        width: 420,
        height: 72,
        columns: [210, 210],
        row_heights: [36, 36],
        cells: [
          { row: 0, col: 0, row_span: 1, col_span: 1, text: tableMarkerA, font_family: 'Courier', font_size: 11, bold: false, color: '#000000', style: { stroke: '#000000' } },
          { row: 0, col: 1, row_span: 1, col_span: 1, text: tableMarkerB, font_family: 'Courier', font_size: 11, bold: false, color: '#000000', style: { stroke: '#000000' } },
          { row: 1, col: 0, row_span: 1, col_span: 2, text: '합계', style: { stroke: '#000000' } },
        ],
      }],
    }],
  },
}, null, 2));

execFileSync('tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter', [tableLayoutIngestPath, '--media-dir', tableLayoutTmp, '-o', tableLayoutOutputPath, '--format', 'hwp'], { stdio: 'inherit' });
const tableInfo = execFileSync('rhwp', ['info', tableLayoutOutputPath], { encoding: 'utf8' });
assert.match(tableInfo, /페이지 수:\s*1\b/, 'structured table fixture should remain one page');
fs.mkdirSync(tableLayoutTextDir);
execFileSync('rhwp', ['export-text', tableLayoutOutputPath, '-o', tableLayoutTextDir], { stdio: 'inherit' });
const tableText = fs.readFileSync(path.join(tableLayoutTextDir, 'out.txt'), 'utf8');
assert.equal((tableText.match(new RegExp(tableMarkerA, 'g')) || []).length, 1, 'table cell text A should be emitted once');
assert.equal((tableText.match(new RegExp(tableMarkerB, 'g')) || []).length, 1, 'table cell text B should be emitted once');

const dumpProbe = execFileSync('rhwp', ['dump', tableLayoutOutputPath], { encoding: 'utf8' });
assert.match(dumpProbe, /표:\s*2행×2열|\[\d+\]\s+표:/, 'rhwp dump should show a table control for structured table ingest');
assert.match(dumpProbe, /treat_as_char=false/, 'structured table should be positioned as a layout object, not inline text');
assert.match(dumpProbe, /size=(?!0×0)\d+×\d+/, 'structured table common size should preserve source table geometry');
assert.match(dumpProbe, /vert=용지\([^0]|horz=용지\([^0]/, 'structured table common offset should preserve source table position');
fs.mkdirSync(tableLayoutSvgDir);
execFileSync('rhwp', ['export-svg', tableLayoutOutputPath, '-o', tableLayoutSvgDir], { stdio: 'inherit' });
const tableSvg = fs.readFileSync(path.join(tableLayoutSvgDir, 'out.svg'), 'utf8');
assert.match(tableSvg, /font-family=\"Courier,/, 'table-only cell font family should be registered and used by native table text');
assert.match(tableSvg, /font-size=\"11\"/, 'table cell text should preserve source font size instead of expanding to cell height');

console.log('pdf-to-hwp exporter structured table smoke passed');

const pageSizeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-to-hwp-exporter-page-size-'));
const pageSizeIngestPath = path.join(pageSizeTmp, 'ingest.json');
const pageSizeOutputPath = path.join(pageSizeTmp, 'out.hwp');
fs.writeFileSync(pageSizeIngestPath, JSON.stringify({
  version: '1',
  page_size: { width_mm: 148, height_mm: 210 },
  default_font: '함초롬바탕',
  questions: [{
    number: 1,
    stem: 'NON_A4_PAGE_SIZE_NATIVE_LAYOUT_20260527',
    auto_number: false,
    stem_blocks: [{ type: 'text', text: 'NON_A4_PAGE_SIZE_NATIVE_LAYOUT_20260527' }],
    choices: [],
    media: [],
  }],
  pdf_layout: {
    unit: 'odt',
    visual_mode: 'editable-native',
    pages: [{
      width: 559.3700787401575,
      height: 793.7007874015749,
      images: [],
      boxes: [{ x: 40, y: 50, width: 120, height: 40, stroke: '#000000' }],
      lines: [{ text: 'NON_A4_PAGE_SIZE_NATIVE_LAYOUT_20260527', x: 44, y: 58, width: 200, height: 18, font_family: 'Gulim', font_size: 11, bold: false, color: '#000000' }],
    }],
  },
}, null, 2));
execFileSync('tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter', [pageSizeIngestPath, '-o', pageSizeOutputPath, '--format', 'hwp'], { stdio: 'inherit' });
const pageSizeDump = execFileSync('rhwp', ['dump', pageSizeOutputPath], { encoding: 'utf8' });
assert.match(pageSizeDump, /용지:\s*148\.0mm × 210\.0mm/, 'exporter should preserve non-A4 source page size');
assert.match(pageSizeDump, /크기:\s*(?!0\.0mm × 0\.0mm)/, 'non-A4 layout vector geometry should remain native and non-zero');

console.log('pdf-to-hwp exporter non-A4 page size smoke passed');
