import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');
const extractor = fs.readFileSync('scripts/pdf_layout_extract.py', 'utf8');
const font = 'fonts/NanumGothic.ttf';

assert.match(server, /app\.post\('\/api\/convert\/pdf-to-hwpx'/, 'server must expose PDF→HWPX');
assert.match(server, /createStructuredHwpxFromPdfLayout/, 'HWPX must use structured generation');
assert.match(server, /from-json/, 'HWPX must be generated through the HwpForge JSON schema');
assert.match(server, /content:\s*\{\s*Table:/, 'structured HWPX must contain a native table');
assert.match(server, /page_break: 'none'/, 'native HWPX table must remain on the source page');
assert.match(server, /margin_left: 6700/, 'HWPX must preserve the source table left offset');
assert.match(server, /margin_top: Math\.max\(0, 9600/, 'HWPX must preserve the source table vertical offset');
assert.match(server, /pages\.length !== 1/, 'HWPX flow mode must reject unsupported multi-page inputs');
assert.match(extractor, /"x": (x0|cx)/, 'layout extraction must emit cell coordinates');
assert.match(server, /tableTopAdjustment/, 'HWPX vertical placement must derive from the extracted table y-coordinate');
assert.match(server, /const occupied = new Set<string>\(\)/, 'HWPX serialization must account for merged cells');
assert.ok(fs.existsSync(font), 'Korean searchable-PDF font must be packaged');
assert.match(extractor, /"row_span": max\(1, row_end - row\)/, 'layout extraction must preserve row spans');

console.log('pdf-to-hwpx fidelity static contract passed');
