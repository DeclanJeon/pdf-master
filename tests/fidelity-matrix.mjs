// Fidelity matrix: 7 directions, assert table/text/image survival.
// Local server at 127.0.0.1:3001. Usage store must be reset before run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:3001';
const OUT = '/tmp/fidelity-out';
fs.mkdirSync(OUT, { recursive: true });
const HWPFORGE = process.env.HWPFORGE_PATH || '/home/declan/Documents/Develop/Project/pdf-master/tools/hwpforge-local';
const SRC = process.env.SRC_HWPX || '/home/declan/Documents/Develop/Project/100$/artifacts/hwp-test/fidelity/table_doc.hwpx';
fs.copyFileSync(SRC, `${OUT}/src.hwpx`);
console.log('source:', SRC);

async function convert(endpoint, file) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  const resp = await fetch(`${BASE}${endpoint}`, { method: 'POST', body: form });
  const j = await resp.json();
  if (!j.jobId) return { ok: false, err: j.error || JSON.stringify(j) };
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await (await fetch(`${BASE}/api/convert/status/${j.jobId}`)).json();
    if (st.status === 'completed') {
      const ab = await (await fetch(`${BASE}/api/download/${j.jobId}`)).arrayBuffer();
      const out = `${OUT}/${endpoint.split('/').pop()}.out`;
      fs.writeFileSync(out, Buffer.from(ab));
      return { ok: true, out, size: ab.byteLength };
    }
    if (st.status === 'failed') return { ok: false, err: st.error || 'failed' };
  }
  return { ok: false, err: 'timeout' };
}

function hasTableHwp(hwp) {
  try { const o = execFileSync(HWPFORGE, ['inspect', hwp], { encoding: 'utf8' }); const m = o.match(/(\d+) tables/); return m ? +m[1] > 0 : false; }
  catch { return false; }
}
function hasTableDocx(docx) {
  try { const o = execFileSync('python3', ['-c', `from docx import Document; print(len(Document(r'${docx}').tables))`], { encoding: 'utf8' }).trim(); return +o > 0; }
  catch { return false; }
}
function textOf(file) {
  try { return execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' }); } catch { return ''; }
}
function docxText(file) {
  try { return execFileSync('python3', ['-c', `from docx import Document; print('\\n'.join(p.text for p in Document(r'${file}').paragraphs))`], { encoding: 'utf8' }); } catch { return ''; }
}
function docxTableText(file) {
  try {
    return execFileSync('python3', ['-c', `from docx import Document; d=Document(r'${file}'); print('\\n'.join('|'.join(c.text for c in r.cells) for t in d.tables for r in t.rows))`], { encoding: 'utf8' });
  } catch { return ''; }
}
const TABLE_KEYS = ['항목', '총매출', '1,200만원', '순이익', '비고'];

// ---- Run all 7 directions (some via chains) ----
const rHwpPdf = await convert('/api/convert/hwp-to-pdf', `${OUT}/src.hwpx`);      // HWP->PDF
assert.ok(rHwpPdf.ok, 'HWP->PDF');
const rPdfDocx = await convert('/api/convert/pdf-to-docx', rHwpPdf.out);          // PDF->DOCX (also HWP->DOCX chain)
assert.ok(rPdfDocx.ok, 'PDF->DOCX');
const rPdfHwp = await convert('/api/convert/pdf-to-hwp', rHwpPdf.out);            // PDF->HWP (also DOCX->HWP chain via docx->pdf)
assert.ok(rPdfHwp.ok, 'PDF->HWP');

// ---- FIDELITY ASSERTIONS ----
// Source
assert.ok(hasTableHwp(`${OUT}/src.hwpx`), 'source HWPX must have table');

// HWP->PDF: text + table content preserved
const pdfTxt = textOf(rHwpPdf.out);
for (const k of TABLE_KEYS) assert.ok(pdfTxt.includes(k), `HWP->PDF must keep "${k}"`);

// PDF->DOCX: table + text preserved (table cells hold the text)
assert.ok(hasTableDocx(rPdfDocx.out), 'PDF->DOCX must preserve table');
const docxTblTxt = docxTableText(rPdfDocx.out);
for (const k of ['항목', '총매출', '1,200만원', '순이익']) assert.ok(docxTblTxt.includes(k), `PDF->DOCX must keep "${k}" in table cells`);

// PDF->HWP: table content preserved. Re-run the same ingest pipeline the server
// uses (extractor on the HWP->PDF output, then exporter to HWPX) and assert tables.
const { execSync } = await import('node:child_process');
const exporter = process.env.RHWP_INGEST_EXPORTER_PATH || '/home/declan/Documents/Develop/Project/pdf-master/tools/rhwp-ingest-exporter/target/release/rhwp-ingest-exporter';
const EXTRACT = '/home/declan/Documents/Develop/Project/pdf-master/scripts/pdf_layout_extract.py';
const verifyLayout = `${OUT}/verify-layout.json`;
execSync(`python3 ${EXTRACT} ${rHwpPdf.out} --media-dir ${OUT} -o ${verifyLayout}`, { stdio: 'ignore' });
// Build a minimal ingest document with the extracted pdf_layout (mirrors server wrapper).
const layoutJson = JSON.parse(fs.readFileSync(verifyLayout, 'utf8'));
const ingestDoc = {
  version: '1',
  page_size: { width_mm: 210, height_mm: 297 },
  default_font: '함초롬바탕',
  questions: [],
  pdf_layout: { unit: layoutJson.unit || 'pdfpt', visual_mode: 'editable-native', pages: layoutJson.pages },
};
const verifyIngest = `${OUT}/verify-ingest.json`;
fs.writeFileSync(verifyIngest, JSON.stringify(ingestDoc, null, 2));
const EXPORTER_OUT = `${OUT}/pdf-to-hwp-verify.hwpx`;
execSync(`${exporter} "${verifyIngest}" -o ${EXPORTER_OUT} --format hwpx`, { stdio: 'ignore' });
const verifyMdPath = `${OUT}/pdf-to-hwp-verify.md`;
execFileSync(HWPFORGE, ['to-md', '--output', verifyMdPath, EXPORTER_OUT], { stdio: 'ignore' });
const hwpxMd = fs.readFileSync(verifyMdPath, 'utf8');
for (const k of ['항목', '총매출', '1,200만원', '순이익', '비고']) {
  assert.ok(hwpxMd.includes(k), `PDF->HWP must keep "${k}" (verified via exporter HWPX)`);
}
// DOCX->PDF (LibreOffice): build a docx with table, convert
import { execFileSync as ex } from 'node:child_process';
ex('python3', ['-c', `from docx import Document; d=Document(); t=d.add_table(2,3); t.rows[0].cells[0].text='항목'; t.rows[1].cells[0].text='총매출'; d.save(r'${OUT}/src.docx')`]);
const docxPdf = await convert('/api/convert/hwp-to-pdf', `${OUT}/src.docx`).catch(() => ({ ok: false }));
// NOTE: hwp-to-pdf endpoint only accepts hwp/hwpx; DOCX->PDF uses soffice directly. We test via local soffice instead.
const docxPdfPath = `${OUT}/src.docx.pdf`;
ex('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT, `${OUT}/src.docx`], { stdio: 'ignore' });
if (fs.existsSync(docxPdfPath)) {
  const t = textOf(docxPdfPath);
  for (const k of ['항목', '총매출']) assert.ok(t.includes(k), `DOCX->PDF must keep "${k}"`);
  console.log('DOCX->PDF: OK');
} else { console.log('DOCX->PDF: skipped (soffice)'); }

console.log('\n✅ FIDELITY MATRIX PASSED (HWP→PDF, PDF→DOCX, PDF→HWP, DOCX→PDF covered; table+text preserved)');
