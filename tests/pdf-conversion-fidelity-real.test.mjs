import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const inputPath = '/home/declan/Downloads/converted.pdf';
const serverUrl = process.env.PDF_FIDELITY_SERVER_URL || 'http://127.0.0.1:3001';
const enabled = process.env.RUN_REAL_PDF_FIDELITY === '1';

test('real converted.pdf fidelity across HWP/HWPX/DOCX', { skip: !enabled }, async () => {
  assert.ok(fs.existsSync(inputPath), `missing real fixture: ${inputPath}`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-fidelity-real-'));
  const outputs = {};
  for (const [format, suffix] of [['hwp', 'hwp'], ['hwpx', 'hwpx'], ['docx', 'docx']]) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(inputPath)], { type: 'application/pdf' }), 'converted.pdf');
    const response = await fetch(`${serverUrl}/api/convert/pdf-to-${format}`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': `10.244.0.${format === 'hwp' ? 41 : format === 'hwpx' ? 42 : 43}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`${format} conversion failed (${response.status}): ${await response.text()}`);
    }
    const job = await response.json();
    assert.equal(job.status, 'completed', `${format} job did not complete`);
    const download = await fetch(`${serverUrl}/api/download/${job.jobId}`);
    assert.equal(download.status, 200, `${format} download failed`);
    outputs[format] = path.join(tempDir, `converted.${suffix}`);
    fs.writeFileSync(outputs[format], Buffer.from(await download.arrayBuffer()));
  }

  const hwpTextDir = path.join(tempDir, 'hwp-text');
  fs.mkdirSync(hwpTextDir);
  execFileSync('rhwp', ['export-text', outputs.hwp, '-o', hwpTextDir], { stdio: 'ignore' });
  const extractedText = fs.readdirSync(hwpTextDir)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => fs.readFileSync(path.join(hwpTextDir, name), 'utf8'))
    .join('\n');
  assert.match(extractedText, /2026 익산 하기선교/, 'HWP must contain editable title text');
  assert.match(extractedText, /이\s+름/, 'HWP must contain editable table text');
  assert.match(extractedText, /하기선교훈련/, 'HWP must contain editable merged-cell text');
  const renderDir = path.join(tempDir, 'render');
  fs.mkdirSync(renderDir);
  const pdfs = {
    hwp: path.join(renderDir, 'hwp.pdf'),
    hwpx: path.join(renderDir, 'hwpx.pdf'),
    docx: path.join(renderDir, 'converted.pdf'),
  };
  execFileSync('rhwp', ['export-pdf', outputs.hwp, '-o', pdfs.hwp], { stdio: 'ignore' });
  execFileSync('rhwp', ['export-pdf', outputs.hwpx, '-o', pdfs.hwpx], { stdio: 'ignore' });
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', renderDir, outputs.docx], { stdio: 'ignore' });
  for (const format of ['hwp', 'hwpx', 'docx']) {
    execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-png', '-r', '120', pdfs[format], path.join(renderDir, format)], { stdio: 'ignore' });
  }
  execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-png', '-r', '120', inputPath, path.join(renderDir, 'source')], { stdio: 'ignore' });

  const metricCode = String.raw`
from PIL import Image
import fitz
import json, sys
import numpy as np
source = np.array(Image.open(sys.argv[1]).convert('L'), dtype=np.float32)
source_ink = source < 180
source_rules = np.where(source_ink.sum(axis=1) > 500)[0]
source_pdf = fitz.open(sys.argv[5])
assert len(source_pdf) == 1
source_rect = source_pdf[0].rect
assert abs(source_rect.width - 595.28) <= 1 and abs(source_rect.height - 841.89) <= 1, source_rect
for pdf_path in sys.argv[6:]:
    pdf = fitz.open(pdf_path)
    assert len(pdf) == 1, (pdf_path, len(pdf))
    rect = pdf[0].rect
    assert abs(rect.width - 595.28) <= 1 and abs(rect.height - 841.89) <= 1, (pdf_path, rect)
def runs(values):
    result=[]
    for value in values:
        if not result or value > result[-1][-1] + 1: result.append([int(value)])
        else: result[-1].append(int(value))
    return [r[0] for r in result]
source_rule_y = runs(source_rules)
report = {}
for name, image_path in zip(('hwp','hwpx','docx'), sys.argv[2:]):
    image = np.array(Image.open(image_path).convert('L'), dtype=np.float32)
    assert image.shape == source.shape, (name, image.shape, source.shape)
    mae = float(np.abs(source-image).mean())
    ink = image < 180
    rule_y = runs(np.where(ink.sum(axis=1) > 500)[0])
    trailing_rule_count = max(0, len(rule_y) - len(source_rule_y))
    assert trailing_rule_count <= 1, (name, rule_y, source_rule_y)
    if trailing_rule_count:
        assert rule_y[-1] - source_rule_y[-1] <= 30, (name, rule_y, source_rule_y)
    matched_rule_y = rule_y[:len(source_rule_y)]
    assert max(abs(a-b) for a,b in zip(matched_rule_y, source_rule_y)) <= 2, (name, rule_y, source_rule_y)
    fidelity = 100 * (1 - mae / 255)
    coverage = float(ink.sum() / max(1, source_ink.sum()))
    assert fidelity >= 95, (name, fidelity)
    assert 0.5 <= coverage <= 1.5, (name, coverage)
    report[name] = {'normalized_pixel_fidelity_pct': round(fidelity, 4), 'ink_coverage_ratio': round(coverage, 4), 'rule_y': rule_y, 'trailing_rule_count': trailing_rule_count}
print(json.dumps(report))
`;
  const report = JSON.parse(execFileSync('python3', ['-c', metricCode,
    path.join(renderDir, 'source.png'), path.join(renderDir, 'hwp.png'), path.join(renderDir, 'hwpx.png'), path.join(renderDir, 'docx.png'),
    pdfs.hwp, pdfs.hwpx, pdfs.docx], { encoding: 'utf8' }));
  assert.deepEqual(Object.keys(report).sort(), ['docx', 'hwp', 'hwpx']);
  console.log(JSON.stringify({ fixture: inputPath, report }, null, 2));
});
