import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');
const extractor = fs.readFileSync('scripts/pdf_layout_extract.py', 'utf8');
const font = 'fonts/NanumGothic.ttf';

assert.match(server, /app\.post\('\/api\/convert\/pdf-to-hwpx'/, 'server must expose PDF→HWPX');
assert.match(server, /RHWP_INGEST_EXPORTER_PATH/, 'PDF→HWPX must route through the canonical native-table exporter');
assert.match(server, /createStructuredHwpxFromPdfLayout/, 'HWPX fallback must remain for non-hwpx/hwp formats');
assert.match(server, /from-json/, 'HwpForge JSON path remains for non-hwpx/hwp fallback formats');
assert.match(extractor, /"x": (x0|cx)/, 'layout extraction must emit cell coordinates');
assert.ok(fs.existsSync(font), 'Korean searchable-PDF font must be packaged');

console.log('pdf-to-hwpx fidelity static contract passed');
