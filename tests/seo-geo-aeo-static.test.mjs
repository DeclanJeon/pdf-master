import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const robots = fs.readFileSync('public/robots.txt', 'utf8');
const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
const llms = fs.readFileSync('public/llms.txt', 'utf8');
const home = fs.readFileSync('src/components/layout/HomePage.tsx', 'utf8');

assert.match(index, /https:\/\/pdfm\.ponslink\.com\//, 'canonical and social URLs must use the production domain');
assert.doesNotMatch(index, /pdfmaster\.kr/, 'old placeholder domain must not remain in index metadata');
assert.match(index, /application\/ld\+json/, 'index must include JSON-LD structured data');
assert.match(index, /"@type": "FAQPage"/, 'index must include FAQPage schema for AEO');
assert.match(index, /"@type": "SoftwareApplication"/, 'index must include SoftwareApplication schema');
assert.match(index, /"@type": "ItemList"/, 'index must include an ItemList of tools');
assert.match(index, /한글\(HWP\/HWPX\) PDF 변환/, 'metadata must target HWP/HWPX PDF conversion');
assert.match(index, /PDF 주민번호 마스킹/, 'metadata must target PDF personal-info masking');
assert.match(index, /도장·인감 삽입/, 'metadata must target Korean stamp insertion');

assert.match(robots, /Sitemap: https:\/\/pdfm\.ponslink\.com\/sitemap\.xml/, 'robots must reference production sitemap');
assert.match(sitemap, /https:\/\/pdfm\.ponslink\.com\/tool\/hwp-to-pdf/, 'sitemap must include HWP to PDF tool');
assert.match(sitemap, /https:\/\/pdfm\.ponslink\.com\/tool\/pdf-mask-rrn/, 'sitemap must include masking tool');
assert.match(sitemap, /https:\/\/pdfm\.ponslink\.com\/privacy/, 'sitemap must include privacy policy');
assert.doesNotMatch(sitemap, /pdfmaster\.kr/, 'old placeholder domain must not remain in sitemap');

assert.match(llms, /# PDF마스터/, 'llms.txt must identify the service');
assert.match(llms, /답변 엔진용 요약/, 'llms.txt must include an answer-engine summary');
assert.match(llms, /한글 HWP PDF 변환/, 'llms.txt must describe HWP conversion');
assert.match(llms, /PDF 주민번호 마스킹/, 'llms.txt must describe masking');

assert.match(home, /PDF마스터 자주 묻는 질문/, 'homepage must include visible FAQ content');
assert.match(home, /한글 HWP 파일을 PDF로 변환할 수 있나요/, 'homepage FAQ must answer HWP conversion intent');
assert.match(home, /PDF에서 주민등록번호를 자동으로 마스킹할 수 있나요/, 'homepage FAQ must answer masking intent');

console.log('seo geo aeo static contract passed');
