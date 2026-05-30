import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');

const routeStart = server.indexOf("app.post('/api/convert/hwp-to-pdf'");
const routeEnd = server.indexOf("app.get('/api/convert/status/:jobId'", routeStart);
assert.ok(routeStart > -1 && routeEnd > routeStart, 'server must keep the HWP→PDF route discoverable');
const route = server.slice(routeStart, routeEnd);

const helperStart = server.indexOf('async function convertHwpToPdfWithRhwpSvg');
const helperEnd = server.indexOf('function qpdfUnavailableResponse', helperStart);
assert.ok(helperStart > -1 && helperEnd > helperStart, 'server must define the rhwp SVG HWP→PDF helper near commandAvailable');
const helper = server.slice(helperStart, helperEnd);

assert.match(server, /const PDFUNITE_PATH = process\.env\.PDFUNITE_PATH \|\| 'pdfunite';/, 'server must configure pdfunite');
assert.match(helper, /fs\.mkdirSync\(svgDir, \{ recursive: true \}\);[\s\S]*fs\.mkdirSync\(pagePdfDir, \{ recursive: true \}\);/, 'rhwp SVG helper must create SVG and page-PDF output dirs');
assert.match(helper, /execFileAsync\(RHWP_PATH, \['export-svg', inputPath, '-o', svgDir, '--font-style'\]/, 'rhwp SVG helper must render original HWP pages with rhwp export-svg');
assert.match(helper, /filter\(\(name\) => name\.toLowerCase\(\)\.endsWith\('\.svg'\)\)[\s\S]*localeCompare\(b, undefined, \{ numeric: true \}\)/, 'rhwp SVG helper must read generated SVG pages in sorted order');
assert.match(helper, /execFileAsync\(IMAGEMAGICK_PATH, \['-density', '96', renderableSvgPath, pagePdfPath\]/, 'rhwp SVG helper must convert each sanitized SVG page through ImageMagick magick at 96dpi');
assert.match(helper, /execFileAsync\(PDFUNITE_PATH, \[\.\.\.pagePdfPaths, outputPath\]/, 'rhwp SVG helper must merge page PDFs with pdfunite');
assert.match(helper, /fs\.existsSync\(outputPath\)[\s\S]*fs\.statSync\(outputPath\)\.size === 0/, 'rhwp SVG helper must verify the merged PDF exists and is non-empty');

const directIndex = route.indexOf('LibreOffice direct HWP→PDF');
const rhwpIndex = route.indexOf('convertHwpToPdfWithRhwpSvg(inputPath, jobDir, pdfPath)');
const hwpforgeIndex = route.indexOf('execFileAsync(HWPFORGE_PATH');
const hwpx2htmlIndex = route.indexOf("execFileAsync('python3', [HWPX2HTML_PATH");
assert.ok(directIndex > -1, 'HWP→PDF route must keep LibreOffice direct conversion first');
assert.ok(rhwpIndex > directIndex, 'HWP→PDF route must try rhwp SVG after LibreOffice direct conversion fails');
assert.ok(hwpforgeIndex > rhwpIndex, 'HWPForge HWPX conversion must be after the rhwp SVG fallback');
assert.ok(hwpx2htmlIndex > hwpforgeIndex, 'hwpx2html.py must remain the last-resort reconstruction path');
assert.match(route.slice(0, rhwpIndex), /if \(!isHwpx\)[\s\S]*?\[METHOD2\]/, 'rhwp SVG fallback must be guarded to .hwp uploads only');

assert.match(server, /pdfunite: commandAvailable\(PDFUNITE_PATH, \['-v'\]\)/, 'health dependency status must expose pdfunite');
assert.match(server, /console\.log\(`  pdfunite: \$\{PDFUNITE_PATH\}/, 'startup dependency log must include pdfunite');

console.log('hwp-to-pdf fidelity static contract passed');
