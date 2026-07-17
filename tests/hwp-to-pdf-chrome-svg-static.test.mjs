import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');

assert.match(server, /const CHROME_PATH = process\.env\.CHROME_PATH/, 'server must allow CHROME_PATH override for SVG→PDF fidelity renderer');
assert.match(server, /function getSvgDimensions\(svgPath: string\)/, 'server must parse SVG page dimensions for exact PDF page size');
assert.match(server, /function createSvgPrintWrapperHtml\(svgPath: string, width: number, height: number\)/, 'server must wrap SVG in print HTML');
assert.match(server, /fs\.readFileSync\(svgPath, 'utf8'\)/, 'Chrome wrapper must inline the SVG, not embed it as an image');
assert.doesNotMatch(server, /<img src=\"\$\{svgUrl\}\"/, 'Chrome wrapper must not rasterize the SVG through an img tag');
assert.match(server, /@page\{size:\$\{width\}px \$\{height\}px;margin:0\}/, 'print wrapper must force exact source page size and zero margins');
assert.match(server, /svg\{display:block;width:\$\{width\}px!important;height:\$\{height\}px!important\}/, 'inline SVG must be forced to the original page box');
assert.match(server, /--print-to-pdf-no-header/, 'Chrome SVG renderer must suppress header/footer');
assert.match(server, /await renderSvgPageToPdfWithChrome\(renderableSvgPath, pagePdfPath, svgAssetDir\)/, 'rhwp SVG path must render the sanitized inline SVG so externalized images and text stay visible');
assert.match(server, /SVG_TO_SEARCHABLE_PDF_SCRIPT_PATH/, 'server must configure searchable SVG→PDF script path');
assert.match(server, /Trying searchable SVG→PDF via PyMuPDF/, 'rhwp SVG path must try searchable reconstruction before Chrome print-to-pdf');
assert.match(server, /countSvgTextElements/, 'rhwp SVG path must know when source SVG contains text');
assert.match(server, /countPdfExtractableTextChars/, 'rhwp SVG path must validate that output PDF still has extractable text');
assert.match(server, /이미지-only PDF/, 'image-only rhwp fallback PDFs must be rejected instead of reported as successful conversions');
assert.match(server, /catch \(chromeErr\)[\s\S]*IMAGEMAGICK_PATH/, 'ImageMagick must remain as fallback if Chrome rendering fails');

console.log('hwp-to-pdf Chrome SVG static contract passed');
