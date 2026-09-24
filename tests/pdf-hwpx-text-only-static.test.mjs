import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const exporter = fs.readFileSync(
  path.join(root, 'tools/rhwp-ingest-exporter-ponslink/src/main.rs'),
  'utf8',
);

assert.doesNotMatch(exporter, /make_textbox_shape|TextBox/, 'PDF table labels must not use textboxes');
assert.match(
  exporter,
  /paragraphs: vec!\[text_paragraph\(&src_cell\.text/,
  'table labels must be emitted as native table-cell paragraphs',
);
assert.match(exporter, /is_table_label_line\(/, 'table labels must not be duplicated as body paragraphs');

const output = path.join(root, 'artifacts/fidelity/converted/production-table.hwpx');
assert.ok(fs.existsSync(output), 'production QA HWPX fixture must exist');

const metrics = execFileSync('python', ['-c', `
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import sys
ns = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
labels = ['이     름', '성     별', '나이(또래)', '직업(전공)', '팀 내 사역', '하기선교훈련', '지 원  동 기', '기대함/소망함', '기 도  제 목']
with ZipFile(sys.argv[1]) as z:
    root = ET.fromstring(z.read('Contents/section0.xml'))
cell_text = [''.join(tc.itertext()).strip() for tc in root.iter(ns + 'tc')]
all_text = ''.join(root.itertext())
print(len(cell_text), sum(label in all_text for label in labels), sum(label in ''.join(cell_text) for label in labels), len([e for e in root.iter() if e.tag.endswith('drawText') or e.tag.endswith('textBox')]))
`, output], { encoding: 'utf8' }).trim();

assert.equal(metrics, '17 9 9 0', 'production fixture must retain labels in native cells without text-bearing shapes');
console.log('PDF HWPX native table text contract passed');