import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const script = 'scripts/svg_to_searchable_pdf.py';
const python = fs.existsSync('.venv-pdf2docx/bin/python')
  ? '.venv-pdf2docx/bin/python'
  : 'python3';

assert.ok(fs.existsSync(script), 'svg_to_searchable_pdf.py must exist');

const fixtureSvg = fs.existsSync('artifacts/fidelity/layout-native.svg')
  ? 'artifacts/fidelity/layout-native.svg'
  : null;
assert.ok(fixtureSvg, 'layout-native.svg fixture must exist for smoke test');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-searchable-'));
const outPdf = path.join(tmpDir, 'out.pdf');

execFileSync(python, [script, fixtureSvg, '-o', outPdf], {
  stdio: 'inherit',
  timeout: 60000,
});

assert.ok(fs.existsSync(outPdf) && fs.statSync(outPdf).size > 0, 'searchable PDF must be written');

const text = execFileSync('pdftotext', ['-layout', outPdf, '-'], {
  encoding: 'utf8',
  timeout: 30000,
});

assert.match(text, /APPLICATION\s+FORM/, 'coalesced title must remain searchable as whole words');
assert.match(text, /Hong\s+Gildong/, 'name must remain searchable');
assert.doesNotMatch(text, /APPLI\s+CATI\s+ON/, 'must not emit Chrome-style per-glyph word splits');

console.log('svg-to-searchable-pdf smoke passed');
