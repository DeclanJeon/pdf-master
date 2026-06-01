import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const footer = fs.readFileSync('src/components/layout/Footer.tsx', 'utf8');
const policy = fs.readFileSync('src/components/layout/PrivacyPolicyPage.tsx', 'utf8');

assert.match(app, /PrivacyPolicyPage/, 'App must import the privacy policy page');
assert.match(app, /path="\/privacy"/, 'App must expose /privacy route');
assert.match(footer, /to="\/privacy"/, 'Footer must link to /privacy');
assert.match(footer, /개인정보처리방침/, 'Footer link text must be visible in Korean');

assert.match(policy, /Google OAuth/, 'Policy must disclose Google OAuth login');
assert.match(policy, /Google 계정 식별자/, 'Policy must disclose Google account identifier');
assert.match(policy, /이메일 주소/, 'Policy must disclose email collection');
assert.match(policy, /표시 이름/, 'Policy must disclose display name collection');
assert.match(policy, /프로필 이미지 URL/, 'Policy must disclose profile image URL collection');
assert.match(policy, /IP 주소/, 'Policy must disclose IP handling for quota/security');
assert.match(policy, /Polar\.sh/, 'Policy must disclose payment processor');
assert.match(policy, /문서 파일/, 'Policy must disclose temporary document file processing');
assert.match(policy, /10분 이내 자동 삭제/, 'Policy must disclose current temporary file retention');
assert.match(policy, /refund@pdfm\.ponslink\.com/, 'Policy must include a contact address');

console.log('privacy policy static contract passed');
