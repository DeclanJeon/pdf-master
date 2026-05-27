import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');

// WORK-01: Google OAuth + session endpoints
assert.match(server, /app\.get\('\/api\/auth\/google'/, 'server must expose Google OAuth redirect endpoint');
assert.match(server, /app\.get\('\/api\/auth\/callback'/, 'server must expose Google OAuth callback endpoint');
assert.match(server, /app\.get\('\/api\/auth\/me'/, 'server must expose auth/me endpoint');
assert.match(server, /app\.post\('\/api\/auth\/logout'/, 'server must expose logout endpoint');
assert.match(server, /HttpOnly/, 'session cookies must be httpOnly');
assert.match(server, /credentials:\s*true/, 'CORS must allow credentialed auth requests');
assert.match(server, /GOOGLE_CLIENT_ID/, 'Google OAuth must be env-driven');
assert.match(server, /GOOGLE_CLIENT_SECRET/, 'Google OAuth must be env-driven');
assert.match(server, /GOOGLE_OAUTH_NOT_CONFIGURED/, 'OAuth endpoints must fail safely without real credentials');
assert.match(server, /FRONTEND_URL/, 'OAuth callback must redirect back to the frontend origin');
assert.match(server, /res\.redirect\(getFrontendRedirectUrl\(req,\s*redirectTo\)\)/, 'OAuth callback must not redirect relative paths on the API origin');

// WORK-02: Polar webhook HMAC verification + premium persistence
assert.match(server, /app\.post\('\/api\/polar\/webhook'/, 'server must expose Polar webhook endpoint');
assert.match(server, /POLAR_WEBHOOK_SECRET/, 'Polar webhook verification must be env-driven');
assert.match(server, /webhook-id/, 'Polar webhook verification must use the Standard Webhooks id header');
assert.match(server, /webhook-timestamp/, 'Polar webhook verification must use the Standard Webhooks timestamp header');
assert.match(server, /Buffer\.from\(`\$\{webhookId\}\.\$\{webhookTimestamp\}\.`\)/, 'Polar webhook must sign id.timestamp.payload');
assert.match(server, /crypto\.createHmac\('sha256',\s*polarWebhookSecretBytes\(\)\)/, 'Polar webhook must use HMAC-SHA256 with decoded Standard Webhooks secret');
assert.match(server, /crypto\.timingSafeEqual/, 'signature compare must be timing-safe');
assert.match(server, /POLAR_SIGNATURE_INVALID/, 'invalid webhook signatures must be rejected');
assert.match(server, /order\.paid/, 'one-time Polar purchases must be granted on paid order events');
assert.doesNotMatch(server, /order\.created', 'checkout\.created/, 'Polar webhook must not grant premium on pre-payment created events');
assert.match(server, /subscription\.canceled/, 'Polar subscription cancellation events must be handled');
assert.match(server, /premiumByEmail/, 'premium state must be stored server-side by email');
assert.match(server, /subscriptionExpiresAt/, 'monthly premium must have an expiry');
assert.match(server, /oneTimePasses/, 'one-time premium passes must be tracked');

// WORK-08: reusable server-side premium enforcement
assert.match(server, /function requirePremium/, 'premium check must be reusable middleware');
assert.match(server, /const isAdmin = isAdminEmail\(session\?\.user\.email\)/, 'admin users must bypass premium checks server-side');
assert.match(server, /!isAdmin && !premium\.isPremium/, 'premium middleware must allow ADMIN_EMAILS users');
assert.match(server, /if \(isAdminEmail\(email\)\) return;/, 'admin users must not consume one-time passes');
assert.match(server, /app\.post\('\/api\/encrypt',\s*requirePremium/, 'encrypt endpoint must enforce premium server-side');
assert.match(server, /app\.post\('\/api\/decrypt',\s*requirePremium/, 'decrypt endpoint must enforce premium server-side');
assert.match(server, /app\.post\('\/api\/convert\/pdf-to-hwp',\s*requirePremium/, 'pdf-to-hwp endpoint must enforce premium server-side');
assert.match(server, /PREMIUM_REQUIRED/, 'unpaid users must get a deterministic 403 code');
assert.match(server, /consumeOneTimePassForRequest/, 'one-time premium passes must be consumed after successful premium use');

console.log('backend auth/premium static contract passed');
