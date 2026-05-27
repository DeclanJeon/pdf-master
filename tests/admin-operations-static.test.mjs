import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');
const adminPage = fs.readFileSync('src/components/tools/AdminPage.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const header = fs.readFileSync('src/components/layout/Header.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const authProvider = fs.readFileSync('src/auth/AuthProvider.tsx', 'utf8');
const toolPage = fs.readFileSync('src/components/tools/ToolPage.tsx', 'utf8');
const paymentPage = fs.readFileSync('src/components/tools/PaymentPage.tsx', 'utf8');
const env = fs.readFileSync('.env.example', 'utf8');
const compose = fs.readFileSync('docker-compose.yml', 'utf8');
const checklist = fs.readFileSync('docs/WORK_CHECKLIST_20250525.md', 'utf8');

assert.match(server, /ADMIN_EMAILS/, 'server must parse ADMIN_EMAILS allowlist');
assert.match(server, /ADMIN_AUDIT_LOG_PATH/, 'server must configure admin audit log path');
assert.match(server, /function requireAdmin/, 'server must expose requireAdmin middleware');
assert.match(server, /getSessionFromRequest\(req\)/, 'admin auth must use server session');
assert.match(server, /ADMIN_REQUIRED/, 'non-admin users must be rejected deterministically');
assert.match(server, /app\.get\('\/api\/admin\/summary',\s*requireAdmin/, 'admin summary must require admin');
assert.match(server, /app\.get\('\/api\/admin\/users',\s*requireAdmin/, 'admin users list must require admin');
assert.match(server, /app\.post\('\/api\/admin\/grant-premium',\s*requireAdmin/, 'admin grant endpoint must require admin');
assert.match(server, /app\.post\('\/api\/admin\/revoke-premium',\s*requireAdmin/, 'admin revoke endpoint must require admin');
assert.match(server, /app\.get\('\/api\/admin\/audit-logs',\s*requireAdmin/, 'admin audit logs endpoint must require admin');
assert.match(server, /isAdmin:\s*isAdminEmail\(session\.user\.email\)/, 'auth/me must expose isAdmin based on ADMIN_EMAILS');
assert.match(server, /REASON_REQUIRED/, 'grant/revoke must require a reason');
assert.match(server, /appendAdminAudit/, 'grant/revoke must write audit logs');
assert.match(server, /before,\n\s*after,\n\s*reason/, 'audit logs must include before/after/reason');

assert.match(app, /path="\/admin"/, 'frontend must expose /admin route');
assert.match(main, /<AuthProvider>/, 'app must be wrapped in AuthProvider');
assert.match(authProvider, /\/api\/auth\/me/, 'AuthProvider must load server auth status');
assert.match(authProvider, /isAdmin/, 'AuthProvider must expose isAdmin');
assert.match(authProvider, /setPremiumUnlocked\(nextIsAdmin \|\| Boolean\(nextPremium\.isPremium\)\)/, 'AuthProvider must unlock premium UX for admin users');
assert.match(header, /Google 로그인/, 'Header must show Google login UI');
assert.match(header, /로그아웃/, 'Header must show logout UI');
assert.match(header, /isAdmin &&/, 'Header must only show admin link to admin users');
assert.match(header, /isAdmin \? '관리자'/, 'Header must display admin status distinctly');
assert.match(toolPage, /프리미엄 기능입니다/, 'Premium tools must render a login/payment gate');
assert.match(toolPage, /tool\.isPremium && !isAdmin && !premium\.isPremium/, 'Premium tools must open for admin users');
assert.match(paymentPage, /checkoutSuccess/, 'Pricing page must handle checkout success return');
assert.match(paymentPage, /checkoutCanceled/, 'Pricing page must handle checkout cancellation return');
assert.match(paymentPage, /auth\.isAdmin \|\| auth\.premium\.isPremium/, 'Pricing page must treat admin users as unlocked');
assert.match(adminPage, /\/api\/admin\/summary/, 'AdminPage must load admin summary');
assert.match(adminPage, /\/api\/admin\/users/, 'AdminPage must load users');
assert.match(adminPage, /\/api\/admin\/grant-premium/, 'AdminPage must grant premium');
assert.match(adminPage, /\/api\/admin\/revoke-premium/, 'AdminPage must revoke premium');
assert.match(adminPage, /\/api\/admin\/audit-logs/, 'AdminPage must display audit logs');
assert.match(adminPage, /\/api\/auth\/google\?redirect=.*\/admin/, 'AdminPage must keep Google login flow product-wide');
assert.match(header, /to="\/admin"/, 'Header must link admin page');

assert.match(env, /ADMIN_EMAILS=/, '.env.example must document ADMIN_EMAILS');
assert.match(env, /ADMIN_AUDIT_LOG_PATH=/, '.env.example must document ADMIN_AUDIT_LOG_PATH');
assert.match(compose, /ADMIN_EMAILS/, 'docker-compose must pass ADMIN_EMAILS');
assert.match(compose, /ADMIN_AUDIT_LOG_PATH/, 'docker-compose must pass ADMIN_AUDIT_LOG_PATH');
assert.match(checklist, /14-12 \| 관리자 API static\/runtime smoke 테스트 추가 \| \[x\]/, 'WORK-14 implementation checklist must mark admin tests added');

console.log('admin operations static contract passed');
