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
assert.match(extractor, /"x": (x0|cx)/, 'layout extraction must emit cell coordinates');
assert.ok(fs.existsSync(font), 'Korean searchable-PDF font must be packaged');

console.log('pdf-to-hwpx fidelity static contract passed');
