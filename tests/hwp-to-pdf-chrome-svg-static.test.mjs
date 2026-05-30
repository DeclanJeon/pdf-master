import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');

assert.match(server, /const CHROME_PATH = process\.env\.CHROME_PATH/, 'server must allow CHROME_PATH override for SVG→PDF fidelity renderer');
assert.match(server, /function getSvgDimensions\(svgPath: string\)/, 'server must parse SVG page dimensions for exact PDF page size');
assert.match(server, /function createSvgPrintWrapperHtml\(svgPath: string, width: number, height: number\)/, 'server must wrap SVG in print HTML');
assert.match(server, /@page\{size:\$\{width\}px \$\{height\}px;margin:0\}/, 'print wrapper must force exact source page size and zero margins');
assert.match(server, /--print-to-pdf-no-header/, 'Chrome SVG renderer must suppress header/footer');
assert.match(server, /pathToFileURL\(svgPath\)\.href/, 'Chrome wrapper must use file URL for local SVG');
assert.match(server, /await renderSvgPageToPdfWithChrome\(svgPath, pagePdfPath, svgAssetDir\)/, 'rhwp SVG path must try Chrome wrapper on raw SVG first so embedded data images stay visible');
assert.match(server, /catch \(chromeErr\)[\s\S]*IMAGEMAGICK_PATH/, 'ImageMagick must remain as fallback if Chrome rendering fails');

console.log('hwp-to-pdf Chrome SVG static contract passed');
