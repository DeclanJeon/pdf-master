import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');

const sanitizerStart = server.indexOf('function materializeSvgDataUriImages');
const helperStart = server.indexOf('async function convertHwpToPdfWithRhwpSvg');
const helperEnd = server.indexOf('function qpdfUnavailableResponse', helperStart);

assert.ok(sanitizerStart > -1, 'server must define materializeSvgDataUriImages before rendering rhwp SVG pages');
assert.ok(helperStart > -1 && helperEnd > helperStart, 'server must define convertHwpToPdfWithRhwpSvg helper');

const sanitizer = server.slice(sanitizerStart, helperStart);
const helper = server.slice(helperStart, helperEnd);

assert.ok(
  sanitizer.includes('data:image\\/(png|jpe?g|gif|webp);base64,'),
  'SVG sanitizer must recognize embedded data:image base64 hrefs from rhwp export-svg',
);
assert.ok(
  sanitizer.includes('Buffer.from(base64Data') && sanitizer.includes("'base64'"),
  'SVG sanitizer must decode embedded base64 image data to files',
);
assert.match(
  sanitizer,
  /fs\.writeFileSync\([^,]+, imageBuffer\)/,
  'SVG sanitizer must write decoded image bytes to an asset file',
);
assert.match(
  helper,
  /const svgAssetDir = path\.join\(pagePdfDir, `page_\$\{String\(index \+ 1\)\.padStart\(3, '0'\)\}_assets`\);[\s\S]*materializeSvgDataUriImages\(svgPath, svgAssetDir\)/,
  'rhwp SVG helper must materialize SVG data URI images before passing SVG to ImageMagick',
);
assert.match(
  helper,
  /execFileAsync\(IMAGEMAGICK_PATH, \['-density', '96', renderableSvgPath, pagePdfPath\]/,
  'ImageMagick must render the sanitized SVG path at 96dpi so CSS px map to A4 PDF points',
);

console.log('hwp-to-pdf SVG data URI static contract passed');
