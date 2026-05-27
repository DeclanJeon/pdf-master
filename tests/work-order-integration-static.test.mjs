import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');
const payment = fs.readFileSync('src/components/tools/PaymentPage.tsx', 'utf8');
const generic = fs.readFileSync('src/components/tools/GenericPdfTool.tsx', 'utf8');
const pdfUtils = fs.readFileSync('src/services/pdfUtils.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

// WORK-03 / WORK-09: Polar-only pricing, no Toss or undeclared watermark-removal sale copy.
assert.doesNotMatch(pkg, /@tosspayments\/payment-sdk/, 'Toss SDK dependency must be removed');
assert.doesNotMatch(server, /\/api\/payments/, 'legacy Toss payment endpoints must be removed');
assert.doesNotMatch(payment, /loadTossPayments|VITE_TOSS_CLIENT_KEY|pdfmaster_premium_expiry|localStorage\./, 'PaymentPage must not activate premium with client localStorage/Toss');
assert.match(payment, /\/api\/auth\/me/, 'PaymentPage must read server auth state');
assert.match(payment, /\/api\/auth\/google/, 'PaymentPage must start Google login');
assert.match(payment, /\/api\/polar\/checkout/, 'PaymentPage must create Polar checkout sessions');
assert.doesNotMatch(payment, /워터마크 제거/, 'pricing copy must not advertise missing watermark-removal feature');

// WORK-04 / WORK-05: split/image multi-output ZIP UX.
assert.match(generic, /new JSZip\(/, 'multi-output PDF operations must create ZIPs');
assert.match(generic, /split-result\.zip/, 'split output must be a ZIP download');
assert.match(generic, /images\.zip/, 'PDF-to-image output must be a ZIP download');
assert.match(generic, /imageFormat/, 'PDF-to-image must expose image format selection');
assert.match(generic, /imageScale/, 'PDF-to-image must expose scale selection');

// WORK-06: server-side Ghostscript compression replaces browser rasterization.
assert.match(server, /app\.post\('\/api\/compress'/, 'server must expose Ghostscript compression endpoint');
assert.match(server, /GHOSTSCRIPT_PATH/, 'Ghostscript path must be env-driven');
assert.match(server, /PDFSETTINGS/, 'Ghostscript compression must use PDFSETTINGS presets');
assert.match(pdfUtils, /fetch\("\/api\/compress"/, 'client compressPdf must call server API');
assert.doesNotMatch(pdfUtils, /Rasterizing page|embedJpg\(compressedBytes\)/, 'client compression must not rasterize text into images');

console.log('work-order integration static contract passed');
