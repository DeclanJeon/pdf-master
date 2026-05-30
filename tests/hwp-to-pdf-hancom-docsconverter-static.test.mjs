import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');

assert.match(server, /const HANCOM_DOCSCONVERTER_BASE_URL = process\.env\.HANCOM_DOCSCONVERTER_BASE_URL \|\| 'https:\/\/docsconverter-example\.cloud\.hancom\.com'/, 'server must define Hancom docsconverter base URL');
assert.match(server, /async function convertHwpToPdfWithHancomDocsconverter/, 'server must implement Hancom docsconverter HWP→PDF pipeline');
assert.match(server, /\/rest\/upload_file/, 'Hancom pipeline must upload source HWP');
assert.match(server, /\/hwp\/doc2pdf\?file_path=/, 'Hancom pipeline must call doc2pdf endpoint');
assert.match(server, /application\/pdf/, 'Hancom pipeline must validate downloaded PDF content type');
assert.match(server, /Trying Hancom docsconverter HWP→PDF/, 'HWP route must try Hancom docsconverter before generic local fallbacks');
assert.match(server, /convertHwpToPdfWithHancomDocsconverter\(inputPath, pdfPath\)/, 'HWP route must call Hancom pipeline with source and output PDF paths');

console.log('hwp-to-pdf Hancom docsconverter static contract passed');
