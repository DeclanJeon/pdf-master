import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const landing = fs.readFileSync('src/components/layout/SeoLandingPage.tsx', 'utf8');
const home = fs.readFileSync('src/components/layout/HomePage.tsx', 'utf8');
const header = fs.readFileSync('src/components/layout/Header.tsx', 'utf8');
const footer = fs.readFileSync('src/components/layout/Footer.tsx', 'utf8');
const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
const llms = fs.readFileSync('public/llms.txt', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

for (const slug of ['hwp-to-pdf', 'pdf-rrn-mask', 'pdf-stamp']) {
  assert.match(app, /path="\/:slug"/, 'App must route slug landing pages');
  assert.match(landing, new RegExp(`'${slug}'`), `landing config must include ${slug}`);
  assert.match(sitemap, new RegExp(`https:\\/\\/pdfm\\.ponslink\\.com\\/${slug}`), `sitemap must include /${slug}`);
  assert.match(llms, new RegExp(`https:\\/\\/pdfm\\.ponslink\\.com\\/${slug}`), `llms.txt must include /${slug}`);
  assert.match(home + header + footer, new RegExp(`/${slug}`), `internal links must point to /${slug}`);
  assert.match(index, new RegExp(`https:\\/\\/pdfm\\.ponslink\\.com\\/${slug}`), `JSON-LD ItemList must include /${slug}`);
}

assert.match(landing, /한글 HWP PDF 변환 무료/, 'HWP landing must target HWP PDF conversion keyword');
assert.match(landing, /PDF 주민번호 마스킹/, 'masking landing must target resident-number masking keyword');
assert.match(landing, /PDF 도장 삽입/, 'stamp landing must target stamp insertion keyword');
assert.match(landing, /upsertCanonical/, 'landing pages must update canonical URL at runtime');
assert.match(landing, /document\.title = page\.metaTitle/, 'landing pages must set route-specific title at runtime');
assert.match(landing, /자주 묻는 질문/, 'landing pages must include visible FAQ content');

console.log('seo landing pages static contract passed');
